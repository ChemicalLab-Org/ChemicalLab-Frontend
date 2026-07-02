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

  hasValidSession(): boolean {
    const user = this._currentUser();
    const token = localStorage.getItem('auth_token') ?? user?.token ?? null;

    if (user === null || token === null || token.trim() === '') {
      return false;
    }

    return !this.isJwtExpired(token);
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

  private isJwtExpired(token: string): boolean {
    const payload = this.decodeJwtPayload(token);
    if (payload === null || typeof payload.exp !== 'number') {
      return true;
    }

    return payload.exp * 1000 <= Date.now();
  }

  private decodeJwtPayload(token: string): JwtPayload | null {
    const [, payload] = token.split('.');
    if (!payload) {
      return null;
    }

    try {
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(
        normalized.length + ((4 - (normalized.length % 4)) % 4),
        '='
      );
      const parsed: unknown = JSON.parse(atob(padded));
      return isJwtPayload(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

interface JwtPayload {
  readonly exp?: number;
}

function isJwtPayload(value: unknown): value is JwtPayload {
  return typeof value === 'object' && value !== null;
}
