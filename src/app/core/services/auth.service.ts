import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ExamSessionService } from './exam-session.service';
import {
  AuthResponse,
  ChangePasswordRequest,
  LoginRequest,
  PasswordChangeResponse,
  UserRole,
} from '../../shared/models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly examSession = inject(ExamSessionService);
  private readonly baseUrl = `${environment.apiUrl}/auth`;

  private readonly _currentUser = signal<AuthResponse | null>(null);
  private readonly _isLoading = signal<boolean>(false);

  readonly currentUser = computed<AuthResponse | null>(() => this._currentUser());
  readonly isAuthenticated = computed(() => this._currentUser() !== null);
  readonly currentRole = computed<UserRole | null>(() => this._currentUser()?.role ?? null);
  readonly requiresPasswordChange = computed<boolean>(
    () => this._currentUser()?.temporaryPassword ?? false
  );

  constructor() {
    this.loadUserFromStorage();
  }

  login(request: LoginRequest): Observable<AuthResponse> {
    this._isLoading.set(true);
    return this.http.post<AuthResponse>(`${this.baseUrl}/login`, request).pipe(
      tap((response) => {
        localStorage.setItem('auth_token', response.token);
        localStorage.setItem('auth_user', JSON.stringify(response));
        this._currentUser.set(response);
        this._isLoading.set(false);
      }),
      catchError((error: unknown) => {
        this._isLoading.set(false);
        return throwError(() => error);
      })
    );
  }

  changePassword(request: ChangePasswordRequest): Observable<PasswordChangeResponse> {
    this._isLoading.set(true);
    return this.http
      .patch<PasswordChangeResponse>(`${this.baseUrl}/change-temporary-password`, request)
      .pipe(
        tap(() => {
          const current = this._currentUser();
          if (current !== null) {
            const updated: AuthResponse = { ...current, temporaryPassword: false };
            this._currentUser.set(updated);
            localStorage.setItem('auth_user', JSON.stringify(updated));
          }
          this._isLoading.set(false);
        }),
        catchError((error: unknown) => {
          this._isLoading.set(false);
          return throwError(() => error);
        })
      );
  }

  logout(): void {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    this._currentUser.set(null);
    // Cerrar sesión termina cualquier modo examen pendiente para no dejar bloqueada la
    // navegación tras un nuevo inicio de sesión.
    this.examSession.end();
  }

  private loadUserFromStorage(): void {
    const raw = localStorage.getItem('auth_user');
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw) as AuthResponse;
        this._currentUser.set(parsed);
      } catch {
        localStorage.removeItem('auth_user');
        localStorage.removeItem('auth_token');
      }
    }
  }
}
