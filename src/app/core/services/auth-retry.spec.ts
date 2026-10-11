import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, HttpHeaders, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FormControl } from '@angular/forms';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { AuthRetryService, authRetryKey, retrySeconds } from './auth-retry.service';
import { SessionCleanupService } from './session-cleanup.service';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { environment } from '../../../environments/environment';
import { LoginComponent } from '../../features/auth/login/login.component';
import { ChangePasswordComponent } from '../../features/auth/change-password/change-password.component';
import { TeacherPasswordsComponent } from '../../features/teacher/passwords/teacher-passwords.component';
import { StudentResponse } from '../../shared/models';
import { passwordPolicyValidator } from '../../shared/utils/password-policy';

describe('T04 password policy and retry flows', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let client: HttpClient;
  const base = environment.apiUrl;
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(), provideRouter([])] });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); vi.useRealTimers(); vi.restoreAllMocks(); sessionStorage.clear(); });

  function signedIn(userId = 1, role = 'ESTUDIANTE') {
    const token = `h.${btoa(JSON.stringify({ exp: Date.now()/1000+600, userId }))}.s`;
    auth.login({ usernameOrEmail: 'fixture', password: 'old' }).subscribe();
    http.expectOne(`${base}/auth/login`).flush({ token, tokenType: 'Bearer', userId, username: 'fixture', role, active: true, temporaryPassword: true });
    return token;
  }

  it('uses Unicode code points without changing spaces or combining characters', () => {
    for (const value of ['abcd efgh ijklm', '  Árboles y océanos  ', '🧪🌊🌲🌙🔬'.repeat(25)+'🌊🌲🌙']) {
      const control = new FormControl(value, passwordPolicyValidator);
      expect(control.valid).toBe(true); expect(control.value).toBe(value);
    }
    for (const value of ['abcd efgh ijkl', '🧪'.repeat(129), 'x'.repeat(129), 'MalformedUnicode\uD800']) {
      expect(new FormControl(value, passwordPolicyValidator).invalid).toBe(true);
    }
  });

  it('parses seconds, HTTP dates and conservative fallback', () => {
    const error = (header?: string) => new HttpErrorResponse({ status: 429, headers: new HttpHeaders(header ? {'Retry-After':header}: {}) });
    expect(retrySeconds(error('7'))).toBe(7);
    expect(retrySeconds(error('Thu, 01 Jan 1970 00:01:00 GMT'),0)).toBe(60);
    expect(retrySeconds(error('bad'))).toBe(30);
    expect(retrySeconds(error())).toBe(30);
  });

  it('shows login countdown, blocks early retry, then permits successful temporary login', async () => {
    const fixture = TestBed.createComponent(LoginComponent);
    await fixture.whenStable();
    vi.useFakeTimers();
    fixture.componentInstance.form.setValue({usernameOrEmail:'fixture', password:'legacy'});
    fixture.componentInstance.onSubmit();
    http.expectOne(`${base}/auth/login`).flush({ code:'AUTH_RATE_LIMITED' },{status:429,statusText:'Too Many Requests',headers:{'Retry-After':'2'}});
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('2 segundos');
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
    fixture.componentInstance.onSubmit(); http.expectNone(`${base}/auth/login`);
    vi.advanceTimersByTime(2000); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(false);
    fixture.componentInstance.onSubmit();
    http.expectOne(`${base}/auth/login`).flush({ token:'fixture-token', role:'ESTUDIANTE', active:true, temporaryPassword:true });
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/auth/change-password']);
  });

  it('keeps the session and password form through 429 then renews normally', async () => {
    const token = signedIn();
    const cleanup = vi.spyOn(TestBed.inject(SessionCleanupService),'runAll');
    const fixture=TestBed.createComponent(ChangePasswordComponent);
    await fixture.whenStable();
    vi.useFakeTimers();
    fixture.componentInstance.form.setValue({currentPassword:'old',newPassword:'A new fictitious phrase',confirmPassword:'A new fictitious phrase'});
    fixture.componentInstance.onSubmit();
    http.expectOne(`${base}/auth/change-temporary-password`).flush({code:'AUTH_RATE_LIMITED',retryAfterSeconds:3},{status:429,statusText:'Too Many Requests'});
    fixture.detectChanges();
    expect(auth.getToken()).toBe(token); expect(auth.requiresPasswordChange()).toBe(true);
    expect(cleanup).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
    vi.advanceTimersByTime(3000); fixture.detectChanges();
    fixture.componentInstance.onSubmit();
    http.expectOne(`${base}/auth/change-temporary-password`).flush({token:'replacement',tokenType:'Bearer',temporaryPassword:false});
    expect(auth.getToken()).toBe('replacement'); expect(cleanup).toHaveBeenCalledOnce();
  });

  it('allows resetting student B while student A is waiting', () => {
    signedIn();
    const resetA = `${base}/users/teachers/1/students/2/reset-password`;
    const resetB = `${base}/users/teachers/1/students/3/reset-password`;
    client.patch(resetA, {}).subscribe({ error: () => {} });
    http.expectOne(resetA).flush({}, { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '60' } });
    client.patch(resetA, { newTemporaryPassword: 'A different password' }).subscribe({ error: () => {} });
    http.expectNone(resetA);
    client.patch(resetB, {}).subscribe({ error: () => {} });
    http.expectOne(resetB).flush({});
    client.patch(`${base}/auth/change-temporary-password`, {}).subscribe();
    http.expectOne(`${base}/auth/change-temporary-password`).flush({});
  });

  it('associates login countdown and messages with the current identifier only', async () => {
    const fixture = TestBed.createComponent(LoginComponent);
    await fixture.whenStable();
    vi.useFakeTimers();
    fixture.componentInstance.form.setValue({ usernameOrEmail: 'accountA', password: 'legacy' });
    fixture.componentInstance.onSubmit();
    http.expectOne(`${base}/auth/login`).flush({}, { status: 429, statusText: 'Limited', headers: { 'Retry-After': '20' } });
    fixture.detectChanges();
    expect(fixture.componentInstance.retryRemaining()).toBe(20);
    fixture.componentInstance.form.get('usernameOrEmail')!.setValue('accountB');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
    expect(fixture.componentInstance.errorMessage()).toBeNull();
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(false);
    fixture.componentInstance.onSubmit();
    http.expectOne(`${base}/auth/login`).flush({}, { status: 401, statusText: 'Unauthorized' });
    fixture.componentInstance.form.get('usernameOrEmail')!.setValue('accountA');
    fixture.detectChanges();
    expect(fixture.componentInstance.retryRemaining()).toBe(20);
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
    expect(authRetryKey('POST', '/auth/login', { usernameOrEmail: ' accountA ', password: 'secret' }))
      .toBe(authRetryKey('POST', '/auth/login', { usernameOrEmail: 'accountA', password: 'different' }));
  });

  it('does not show a late login error for an identifier no longer displayed', async () => {
    const fixture = TestBed.createComponent(LoginComponent);
    await fixture.whenStable();
    fixture.componentInstance.form.setValue({ usernameOrEmail: 'accountA', password: 'legacy' });
    fixture.componentInstance.onSubmit();
    const pending = http.expectOne(`${base}/auth/login`);
    fixture.componentInstance.form.get('usernameOrEmail')!.setValue('accountB');
    pending.flush({}, { status: 429, statusText: 'Limited', headers: { 'Retry-After': '20' } });
    fixture.detectChanges();
    expect(fixture.componentInstance.errorMessage()).toBeNull();
    expect(fixture.componentInstance.retryRemaining()).toBe(0);
  });

  it.each([true, false])('clears actor waits and ignores late limits when switching users (logout=%s)', logout => {
    signedIn();
    const path = '/admin/users/2/password/reset';
    client.patch(base+path, {}).subscribe({ error: () => {} });
    http.expectOne(base+path).flush({}, { status: 429, statusText: 'Limited', headers: { 'Retry-After': '60' } });
    const pendingPath = '/admin/users/3/password/reset';
    client.patch(base+pendingPath, {}).subscribe({ error: () => {} });
    const pending = http.expectOne(base+pendingPath);
    if (logout) { auth.logout(); http.expectOne(`${base}/auth/logout`).flush(null); }
    const newToken = signedIn(2, 'ADMINISTRADOR');
    pending.flush({ code: 'AUTH_LIMITS_UNAVAILABLE' }, { status: 503, statusText: 'Unavailable', headers: { 'Retry-After': '30' } });
    for (const target of [path, pendingPath]) {
      client.patch(base+target, {}).subscribe();
      http.expectOne(base+target).flush({});
    }
    expect(auth.getToken()).toBe(newToken);
  });

  it.each([429,503])('retains the session on %s and still clears it on a real 401', status => {
    const token = signedIn();
    const cleanup = vi.spyOn(TestBed.inject(SessionCleanupService), 'runAll');
    const path = '/admin/users/2/password/reset';
    client.patch(base+path, {}).subscribe({ error: () => {} });
    http.expectOne(base+path).flush({ code: status===503 ? 'AUTH_LIMITS_UNAVAILABLE' : 'AUTH_RATE_LIMITED' },
      { status, statusText: 'Wait', headers: { 'Retry-After': '30' } });
    expect(auth.getToken()).toBe(token);
    expect(cleanup).not.toHaveBeenCalled();
    client.patch(base+path, {}).subscribe({ error: error => expect(error.status).toBe(status) });
    http.expectNone(base+path);
    client.get(`${base}/protected`).subscribe({ error: () => {} });
    http.expectOne(`${base}/protected`).flush({}, { status:401, statusText:'Unauthorized' });
    expect(auth.getToken()).toBeNull();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(TestBed.inject(AuthRetryService).remaining(authRetryKey('PATCH',path))).toBe(0);
  });

  it('keeps the student reset countdown and error on the selected target', async () => {
    signedIn(1, 'DOCENTE');
    const fixture = TestBed.createComponent(TeacherPasswordsComponent);
    const students = [2,3].map(id => ({ id, names: 'Fictitious', lastNames: `Student ${id}`, studentCode: `ST${id}`,
      active:true, grade:'3', section:'A' } as StudentResponse));
    http.expectOne(`${base}/users/teachers/1/students`).flush(students);
    await fixture.whenStable();
    vi.useFakeTimers();
    const component = fixture.componentInstance;
    component.openReset(students[0]);
    component.form.setValue({newTemporaryPassword:'A new fictitious phrase',confirmTemporaryPassword:'A new fictitious phrase'});
    component.submitReset();
    http.expectOne(`${base}/users/teachers/1/students/2/reset-password`).flush({},
      {status:429,statusText:'Limited',headers:{'Retry-After':'5'}});
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('5 segundos');
    component.openReset(students[1]); fixture.detectChanges();
    expect(component.formError()).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(false);
    component.openReset(students[0]); fixture.detectChanges();
    expect(component.resetRemaining()).toBe(5);
    vi.advanceTimersByTime(5000); fixture.detectChanges();
    expect(component.resetRemaining()).toBe(0);
  });

  it('communicates wait on reset and does not block logout or turn 429 into session loss', () => {
    const token=signedIn();
    vi.useFakeTimers();
    let message='';
    const reset=()=>client.patch(`${base}/admin/users/2/password/reset`,{}).subscribe({error:e=>message=e.error.message});
    reset();
    http.expectOne(`${base}/admin/users/2/password/reset`).flush({}, {status:429,statusText:'Too Many Requests',headers:{'Retry-After':'5'}});
    expect(message).toContain('5 segundos'); expect(auth.getToken()).toBe(token);
    reset(); http.expectNone(`${base}/admin/users/2/password/reset`);
    client.get(`${base}/auth/me`).subscribe(); http.expectOne(`${base}/auth/me`).flush({});
    vi.advanceTimersByTime(5000); reset(); http.expectOne(`${base}/admin/users/2/password/reset`).flush({});
    expect(TestBed.inject(AuthRetryService).remaining(authRetryKey('PATCH','/admin/users/2/password/reset'))).toBe(0);
  });
});
