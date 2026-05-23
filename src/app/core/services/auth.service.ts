import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AuthResponse,
  ChangePasswordRequest,
  LoginRequest,
  PasswordChangeResponse,
  UserRole,
} from '../../shared/models';

interface AuthState {
  token: string | null;
  role: UserRole | null;
  requiresPasswordChange: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _state = signal<AuthState>(this.loadInitialState());

  readonly isAuthenticated = computed(() => this._state().token !== null);
  readonly currentRole = computed(() => this._state().role);
  readonly requiresPasswordChange = computed(() => this._state().requiresPasswordChange);

  constructor(private readonly http: HttpClient, private readonly router: Router) {}

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/login`, request)
      .pipe(tap((response) => this.applyAuthResponse(response)));
  }

  changePassword(request: ChangePasswordRequest): Observable<PasswordChangeResponse> {
    return this.http
      .post<PasswordChangeResponse>(`${environment.apiUrl}/auth/change-password`, request)
      .pipe(
        tap((response) => {
          this._state.update((s) => ({
            ...s,
            requiresPasswordChange: response.temporaryPassword,
          }));
          if (!response.temporaryPassword) {
            localStorage.setItem('requires_password_change', 'false');
          }
        })
      );
  }

  logout(): void {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_role');
    localStorage.removeItem('requires_password_change');
    this._state.set({ token: null, role: null, requiresPasswordChange: false });
    this.router.navigate(['/auth/login']);
  }

  getToken(): string | null {
    return this._state().token;
  }

  private applyAuthResponse(response: AuthResponse): void {
    localStorage.setItem('auth_token', response.token);
    localStorage.setItem('auth_role', response.role);
    localStorage.setItem(
      'requires_password_change',
      String(response.temporaryPassword)
    );
    this._state.set({
      token: response.token,
      role: response.role,
      requiresPasswordChange: response.temporaryPassword,
    });
  }

  private loadInitialState(): AuthState {
    const token = localStorage.getItem('auth_token');
    const role = localStorage.getItem('auth_role') as UserRole | null;
    const requiresPasswordChange =
      localStorage.getItem('requires_password_change') === 'true';
    return { token, role, requiresPasswordChange };
  }
}
