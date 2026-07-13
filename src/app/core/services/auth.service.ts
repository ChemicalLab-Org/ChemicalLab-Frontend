import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ExamSessionService } from './exam-session.service';
import { SessionCleanupService } from './session-cleanup.service';
import {
  AuthResponse,
  ChangePasswordRequest,
  CurrentUser,
  LoginRequest,
  PasswordChangeResponse,
  UserRole,
} from '../../shared/models';

/**
 * Claves de almacenamiento de la sesión. Se guardan en sessionStorage para que la sesión
 * NO sobreviva al cierre de la pestaña o del navegador: en los equipos compartidos del
 * colegio, reabrir la web debe exigir un nuevo inicio de sesión. Se conservan los mismos
 * nombres de clave que usaba localStorage para no romper a los consumidores existentes.
 */
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly examSession = inject(ExamSessionService);
  private readonly sessionCleanup = inject(SessionCleanupService);
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
    // Al arrancar la app se eliminan tokens antiguos que hayan quedado en localStorage de
    // versiones previas: ya no se aceptan como sesión válida. La sesión vigente vive solo en
    // sessionStorage.
    this.clearLegacyLocalStorage();
    this.loadUserFromStorage();
  }

  login(request: LoginRequest): Observable<AuthResponse> {
    this._isLoading.set(true);
    return this.http.post<AuthResponse>(`${this.baseUrl}/login`, request).pipe(
      tap((response) => {
        this.persistSession(response);
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
            this.persistSession(updated);
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
    this.clearSession();
  }

  /**
   * Valida contra el backend que la sesión almacenada sigue siendo válida y vigente. Se usa al
   * arrancar la app (ver provideAppInitializer en app.config): si el token expiró, el backend se
   * reinició con otra clave, la cuenta quedó inactiva o el servidor no responde, se limpia la
   * sesión local para no dejar un panel privado abierto con datos antiguos. Nunca falla el
   * observable: siempre completa para no bloquear el arranque de la aplicación.
   */
  verifySession(): Observable<void> {
    const token = this.getToken();
    if (token === null || token.trim() === '') {
      // Sin token no hay nada que validar; los guards llevarán al login.
      this.clearSession();
      return of(void 0);
    }

    return this.http.get<CurrentUser>(`${this.baseUrl}/me`).pipe(
      tap((me) => {
        if (!me.active) {
          this.clearSession();
          return;
        }
        // Se refresca el usuario con los datos frescos del backend conservando el token vigente.
        const current = this._currentUser();
        const merged: AuthResponse = {
          token,
          tokenType: current?.tokenType ?? 'Bearer',
          userId: me.userId,
          username: me.username,
          email: me.email,
          names: me.names,
          lastNames: me.lastNames,
          role: me.role,
          active: me.active,
          temporaryPassword: me.temporaryPassword,
        };
        this._currentUser.set(merged);
        this.persistSession(merged);
      }),
      map(() => void 0),
      catchError(() => {
        // 401, cuenta inactiva o backend caído (error de red): por seguridad en el entorno
        // compartido del colegio se limpia la sesión local en lugar de mantenerla activa.
        this.clearSession();
        return of(void 0);
      })
    );
  }

  hasValidSession(): boolean {
    const user = this._currentUser();
    const token = this.getToken() ?? user?.token ?? null;

    if (user === null || token === null || token.trim() === '') {
      return false;
    }

    return !this.isJwtExpired(token);
  }

  /** Token JWT vigente de la sesión (sessionStorage), o null si no hay sesión. */
  getToken(): string | null {
    if (typeof sessionStorage === 'undefined') {
      return null;
    }
    return sessionStorage.getItem(TOKEN_KEY);
  }

  /** Persiste el token y los datos de usuario de la sesión activa en sessionStorage. */
  private persistSession(response: AuthResponse): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }
    sessionStorage.setItem(TOKEN_KEY, response.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(response));
  }

  /**
   * Limpieza completa de la sesión: borra token y usuario de sessionStorage, elimina cualquier
   * resto antiguo en localStorage, reinicia el estado observable, finaliza el modo examen y
   * cierra las conexiones WebSocket/STOMP de la pizarra para no dejarlas vivas tras el logout.
   */
  private clearSession(): void {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    }
    this.clearLegacyLocalStorage();
    this._currentUser.set(null);
    // Cerrar sesión termina cualquier modo examen pendiente para no dejar bloqueada la
    // navegación tras un nuevo inicio de sesión.
    this.examSession.end();
    // Ejecuta las limpiezas registradas (p. ej. cerrar las conexiones STOMP de la pizarra) sin
    // acoplar AuthService a esos servicios pesados. No deben quedar WebSockets vivos tras logout.
    this.sessionCleanup.runAll();
  }

  /** Elimina credenciales antiguas que hubieran quedado en localStorage. */
  private clearLegacyLocalStorage(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  private loadUserFromStorage(): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }
    const raw = sessionStorage.getItem(USER_KEY);
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw) as AuthResponse;
        this._currentUser.set(parsed);
      } catch {
        sessionStorage.removeItem(USER_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
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
