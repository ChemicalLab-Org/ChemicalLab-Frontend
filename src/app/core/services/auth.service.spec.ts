import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { SessionCleanupService } from './session-cleanup.service';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { temporaryPasswordGuard } from '../guards/temporary-password.guard';
import { UserRole, AuthResponse } from '../../shared/models';
import { SessionControlsComponent } from '../../shared/session-controls.component';
import { environment } from '../../../environments/environment';
import { ChangePasswordComponent } from '../../features/auth/change-password/change-password.component';

describe('T02 persisted authentication client', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let client: HttpClient;
  let router: Router;
  let navigate: ReturnType<typeof vi.spyOn>;
  let cleanup: ReturnType<typeof vi.spyOn>;
  const base = environment.apiUrl;
  const token = (id: string) => `header.${btoa(JSON.stringify({ exp: Date.now() / 1000 + 600, jti: id, cv: 0 }))}.signature`;
  const session = (role: UserRole = 'DOCENTE', temporaryPassword = false): AuthResponse => ({
    token: token('first'), tokenType: 'Bearer', userId: 1, username: 'fixture', email: null,
    names: null, lastNames: null, role, active: true, temporaryPassword,
  });

  beforeEach(() => {
    sessionStorage.clear(); localStorage.clear();
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), provideRouter([]),
    ] });
    auth = TestBed.inject(AuthService);
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    cleanup = vi.spyOn(TestBed.inject(SessionCleanupService), 'runAll');
  });
  afterEach(() => { http.verify(); vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear(); });

  function login(role: UserRole = 'DOCENTE', temporary = false) {
    const response = session(role, temporary);
    auth.login({ usernameOrEmail: 'fixture', password: 'Fictitious123' }).subscribe();
    const request = http.expectOne(`${base}/auth/login`);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush(response);
    return response;
  }

  it.each(['ADMINISTRADOR', 'DOCENTE', 'ESTUDIANTE'] as const)(
    'replaces the token and releases the temporary guard for %s', (role) => {
      const old = login(role, true);
      const guardNavigation = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      expect(TestBed.runInInjectionContext(() => temporaryPasswordGuard({} as never, {} as never))).toBe(false);
      expect(guardNavigation).toHaveBeenCalledWith(['/auth/change-password']);
      const replacement = token('replacement');
      auth.changePassword({ currentPassword: 'Fictitious123', newPassword: 'NewFixture123', confirmPassword: 'NewFixture123' }).subscribe();
      const request = http.expectOne(`${base}/auth/change-temporary-password`);
      expect(request.request.headers.get('Authorization')).toBe(`Bearer ${old.token}`);
      request.flush({ message: 'Changed', temporaryPassword: false, token: replacement, tokenType: 'Bearer' });
      expect(auth.getToken()).toBe(replacement);
      expect(JSON.parse(sessionStorage.getItem('auth_user')!).token).toBe(replacement);
      expect(auth.currentRole()).toBe(role);
      expect(auth.requiresPasswordChange()).toBe(false);
      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(cleanup).toHaveBeenCalledOnce();
      expect(TestBed.runInInjectionContext(() => temporaryPasswordGuard({} as never, {} as never))).toBe(true);
    });

  it.each([false, true])('revokes server session (all=%s), clears local state and connections immediately', (all) => {
    const old = login();
    auth.logout(all);
    expect(auth.getToken()).toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
    expect(cleanup).toHaveBeenCalledOnce();
    const request = http.expectOne(`${base}/auth/${all ? 'logout-all' : 'logout'}`);
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${old.token}`);
    expect(request.request.body).toEqual({});
    expect(auth.sessionNotice()).not.toContain('fueron revocadas');
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(auth.sessionNotice()).toContain(all ? 'Todas tus sesiones fueron revocadas' : 'La sesión fue revocada');
  });

  it.each(['ADMINISTRADOR', 'DOCENTE', 'ESTUDIANTE'] as const)('submits the actual password screen for %s', async (role) => {
    login(role, true);
    const navigation = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(ChangePasswordComponent);
    await fixture.whenStable();
    fixture.componentInstance.form.setValue({ currentPassword: 'Fixture123', newPassword: 'Replacement123', confirmPassword: 'Replacement123' });
    fixture.componentInstance.onSubmit();
    const replacement = token('replacement');
    http.expectOne(`${base}/auth/change-temporary-password`).flush({
      token: replacement, tokenType: 'Bearer', temporaryPassword: false,
    });
    expect(auth.getToken()).toBe(replacement);
    expect(navigation).toHaveBeenCalledWith(['/dashboard']);
  });

  it.each([0, 401, 500])('does not claim remote revocation or recurse on logout error %s', (status) => {
    login(); auth.logout();
    const request = http.expectOne(`${base}/auth/logout`);
    if (status === 0) request.error(new ProgressEvent('error'));
    else request.flush({}, { status, statusText: 'Failure' });
    expect(auth.getToken()).toBeNull();
    expect(auth.sessionNotice()).toContain('No se pudo confirmar');
    expect(navigate).not.toHaveBeenCalled();
    http.expectNone(`${base}/auth/logout`);
  });

  it('cleans and navigates only once for simultaneous 401s without calling logout', () => {
    login();
    for (let i = 0; i < 2; i++) client.get(`${base}/concepts/teacher`).subscribe({ error: () => {} });
    http.match(`${base}/concepts/teacher`).forEach(r => r.flush({}, { status: 401, statusText: 'Unauthorized' }));
    expect(auth.getToken()).toBeNull();
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/auth/login');
    expect(cleanup).toHaveBeenCalledOnce();
    http.expectNone(`${base}/auth/logout`);
  });

  it('handles PASSWORD_CHANGE_REQUIRED once, retaining the temporary session without retry', () => {
    const old = login();
    for (let i = 0; i < 2; i++) client.get(`${base}/concepts/teacher`).subscribe({ error: () => {} });
    http.match(`${base}/concepts/teacher`).forEach(r => r.flush({ code: 'PASSWORD_CHANGE_REQUIRED' }, { status: 403, statusText: 'Forbidden' }));
    expect(auth.getToken()).toBe(old.token);
    expect(auth.requiresPasswordChange()).toBe(true);
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/auth/change-password');
    expect(cleanup).toHaveBeenCalledOnce();
    http.expectNone(`${base}/auth/logout`);
  });

  it('does not discard a valid session on ordinary 403', () => {
    const old = login();
    client.get(`${base}/admin/users`).subscribe({ error: () => {} });
    http.expectOne(`${base}/admin/users`).flush({}, { status: 403, statusText: 'Forbidden' });
    expect(auth.getToken()).toBe(old.token); expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores late 401 for an old token after password replacement', () => {
    login();
    client.get(`${base}/concepts/teacher`).subscribe({ error: () => {} });
    const oldRequest = http.expectOne(`${base}/concepts/teacher`);
    auth.changePassword({ currentPassword: 'a', newPassword: 'b', confirmPassword: 'b' }).subscribe();
    const replacement = token('replacement');
    http.expectOne(`${base}/auth/change-temporary-password`).flush({ token: replacement, tokenType: 'Bearer', temporaryPassword: false });
    oldRequest.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.getToken()).toBe(replacement); expect(navigate).not.toHaveBeenCalled();
  });

  it('does not resurrect a session from a late login or verification after logout', () => {
    login(); auth.verifySession().subscribe();
    const check = http.expectOne(`${base}/auth/me`);
    auth.login({ usernameOrEmail: 'fixture', password: 'a' }).subscribe();
    const pending = http.expectOne(`${base}/auth/login`);
    auth.logout(); http.expectOne(`${base}/auth/logout`).flush(null);
    check.flush(session()); pending.flush(session());
    expect(auth.isAuthenticated()).toBe(false); expect(auth.getToken()).toBeNull();
  });

  it('rejects an old backend password response without retaining the previous token', () => {
    login(); let failed = false;
    auth.changePassword({ currentPassword: 'a', newPassword: 'b', confirmPassword: 'b' }).subscribe({ error: () => { failed = true; } });
    http.expectOne(`${base}/auth/change-temporary-password`).flush({ temporaryPassword: false });
    expect(failed).toBe(true); expect(auth.getToken()).toBeNull();
  });

  it('cleans startup 401 without navigation or logout loops', () => {
    login(); auth.verifySession().subscribe();
    http.expectOne(`${base}/auth/me`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.getToken()).toBeNull(); expect(navigate).not.toHaveBeenCalled();
    http.expectNone(`${base}/auth/logout`);
  });

  it.each(['ADMINISTRADOR', 'DOCENTE', 'ESTUDIANTE'] as const)('offers global logout to temporary %s', async (role) => {
    login(role, true);
    const fixture = TestBed.createComponent(SessionControlsComponent);
    await fixture.whenStable();
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const global = buttons.find(button => button.textContent?.includes('todas'))!;
    expect(global).toBeDefined(); global.click();
    http.expectOne(`${base}/auth/logout-all`).flush(null);
    expect(navigate).toHaveBeenCalledWith('/auth/login');
  });
});
