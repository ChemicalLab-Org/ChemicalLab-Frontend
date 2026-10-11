import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, HttpHeaders, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FormControl } from '@angular/forms';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { AuthRetryService, retrySeconds } from './auth-retry.service';
import { SessionCleanupService } from './session-cleanup.service';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { environment } from '../../../environments/environment';
import { LoginComponent } from '../../features/auth/login/login.component';
import { ChangePasswordComponent } from '../../features/auth/change-password/change-password.component';
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

  function signedIn() {
    const token = `h.${btoa(JSON.stringify({ exp: Date.now()/1000+600 }))}.s`;
    auth.login({ usernameOrEmail: 'fixture', password: 'old' }).subscribe();
    http.expectOne(`${base}/auth/login`).flush({ token, tokenType: 'Bearer', userId: 1, username: 'fixture', role: 'ESTUDIANTE', active: true, temporaryPassword: true });
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
    expect(TestBed.inject(AuthRetryService).remaining()).toBe(0);
  });
});
