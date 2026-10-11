import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';

export function retrySeconds(error: HttpErrorResponse, now = Date.now()): number {
  const header = error.headers.get('Retry-After');
  let seconds = header && /^\d+$/.test(header) ? Number(header)
    : header ? Math.ceil((Date.parse(header) - now) / 1000) : Number(error.error?.retryAfterSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) seconds = 30;
  return Math.min(86400, Math.ceil(seconds));
}

@Injectable({ providedIn: 'root' })
export class AuthRetryService {
  readonly remaining = signal(0);
  private deadline = 0;
  private timer?: ReturnType<typeof setInterval>;
  constructor() { inject(DestroyRef).onDestroy(() => clearInterval(this.timer)); }

  start(error: HttpErrorResponse): HttpErrorResponse {
    this.deadline = Math.max(this.deadline, Date.now() + retrySeconds(error) * 1000);
    this.tick();
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 250);
    return this.error(error.status);
  }

  error(status = 429): HttpErrorResponse {
    return new HttpErrorResponse({ status, statusText: 'Espera antes de reintentar',
      headers: new HttpHeaders({ 'Retry-After': String(this.remaining()) }),
      error: { code: status === 429 ? 'AUTH_RATE_LIMITED' : 'AUTH_LIMITS_UNAVAILABLE',
        message: `Espera ${this.remaining()} segundos y vuelve a intentarlo.`, retryAfterSeconds: this.remaining() } });
  }

  private tick(): void {
    this.remaining.set(Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000)));
    if (!this.remaining()) clearInterval(this.timer);
  }
}
