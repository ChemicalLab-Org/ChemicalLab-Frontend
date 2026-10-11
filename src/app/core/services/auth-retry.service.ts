import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { SessionCleanupService } from './session-cleanup.service';

/** Only public routing/identity fields are used. Never retain request bodies or passwords. */
export function authRetryKey(method: string, path: string, requestBody?: unknown): string | null {
  const body = requestBody as { usernameOrEmail?: unknown; username?: unknown; studentCode?: unknown } | null;
  let identity: unknown;
  if (method === 'POST' && path === '/auth/login') {
    identity = body?.usernameOrEmail;
    if (typeof identity === 'string') identity = identity.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '');
  } else if (method === 'POST' && /^\/(?:admin\/users|users\/teachers(?:\/\d+\/students)?)$/.test(path)) {
    identity = body?.username ?? body?.studentCode;
  } else if (!(method === 'PATCH' && /^\/(?:auth\/change-temporary-password|admin\/users\/\d+\/password\/reset|users\/teachers\/\d+(?:\/students\/\d+)?\/reset-password)$/.test(path))) return null;
  return `${method} ${path} ${typeof identity === 'string' ? identity : ''}`;
}

export function retrySeconds(error: HttpErrorResponse, now = Date.now()): number {
  const header = error.headers.get('Retry-After');
  let seconds = header && /^\d+$/.test(header) ? Number(header)
    : header ? Math.ceil((Date.parse(header) - now) / 1000) : Number(error.error?.retryAfterSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) seconds = 30;
  return Math.min(86400, Math.ceil(seconds));
}

@Injectable({ providedIn: 'root' })
export class AuthRetryService {
  private readonly waits = signal(new Map<string, { deadline: number; status: number }>());
  private epoch = 0;
  private timer?: ReturnType<typeof setInterval>;
  constructor() {
    inject(SessionCleanupService).register(() => this.clear());
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }

  remaining(key: string | null): number {
    const wait = this.waits().get(key ?? '');
    return wait ? Math.max(0, Math.ceil((wait.deadline - Date.now()) / 1000)) : 0;
  }

  context(): number { return this.epoch; }

  clear(): void {
    clearInterval(this.timer);
    this.waits.set(new Map());
    this.epoch++;
  }

  start(key: string, error: HttpErrorResponse, context: number): HttpErrorResponse {
    if (context !== this.epoch) return error; // Late response from an ended/replaced session.
    this.tick();
    const waits = new Map(this.waits());
    const deadline = Math.max(waits.get(key)?.deadline ?? 0, Date.now() + retrySeconds(error) * 1000);
    // This is only a UX cache; the server remains authoritative even after eviction/reload.
    if (!waits.has(key) && waits.size >= 128) waits.delete(waits.keys().next().value!);
    waits.set(key, { deadline, status: error.status });
    this.waits.set(waits);
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 250);
    return this.error(key);
  }

  error(key: string): HttpErrorResponse {
    const seconds = this.remaining(key);
    const status = this.waits().get(key)?.status ?? 429;
    return new HttpErrorResponse({ status,
      error: { code: status === 429 ? 'AUTH_RATE_LIMITED' : 'AUTH_LIMITS_UNAVAILABLE',
        message: `Espera ${seconds} segundos y vuelve a intentarlo.`, retryAfterSeconds: seconds } });
  }

  private tick(): void {
    const now = Date.now();
    const waits = new Map([...this.waits()].filter(([, wait]) => wait.deadline > now));
    this.waits.set(waits); // Refresh countdown signals, including while entries remain valid.
    if (!waits.size) clearInterval(this.timer);
  }
}
