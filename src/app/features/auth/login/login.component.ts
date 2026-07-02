import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, EMPTY } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { AuthResponse } from '../../../shared/models';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  styleUrl: './login.component.scss',
  template: `
    <div class="login">
      <aside class="login__brand">
        <div class="brand-decor" aria-hidden="true">
          <span class="brand-decor__bubble brand-decor__bubble--lg"></span>
          <span class="brand-decor__bubble brand-decor__bubble--md"></span>
          <span class="brand-decor__bubble brand-decor__bubble--sm"></span>
          <span class="brand-decor__ring"></span>
        </div>

        <header class="brand-logo">
          <div class="brand-logo__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 3h6v5l4 9a2 2 0 0 1-1.8 2.9H5.8A2 2 0 0 1 4 17l4-9V3z" />
              <path d="M9 3h6" />
            </svg>
          </div>
          <div>
            <p class="brand-logo__title">QuímicaLab</p>
            <p class="brand-logo__sub">Laboratorio digital</p>
          </div>
        </header>

        <div class="brand-body">
          <h2 class="brand-body__headline">
            Experimenta sin riesgo,<br />aprende sin límites.
          </h2>
          <p class="brand-body__desc">
            Un laboratorio interactivo para secundaria: simula reacciones, registra
            observaciones y comparte tus resultados con tu docente.
          </p>

          <div class="brand-card">
            <div class="brand-card__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 2v6L4 18a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-10V2" />
                <path d="M9 2h6" />
              </svg>
            </div>
            <div>
              <p class="brand-card__title">+120 experimentos guiados</p>
              <p class="brand-card__desc">
                Diseñados con docentes de secundaria, alineados al currículum oficial.
              </p>
            </div>
          </div>
        </div>

        <footer class="brand-footer">
          <span>© 2026 QuímicaLab</span>
          <span class="brand-footer__links">
            <a href="#">Soporte</a>
            <a href="#">Privacidad</a>
          </span>
        </footer>
      </aside>

      <section class="login__form-wrap">
        <div class="login__form">
          <div class="login__heading">
            <h1>¡Hola de nuevo!</h1>
            <p>Inicia sesión para entrar al laboratorio.</p>
          </div>

          @if (errorMessage(); as msg) {
            <div class="alert" role="alert">
              <span class="alert__icon" aria-hidden="true">!</span>
              <div>
                <p class="alert__title">No pudimos iniciar sesión</p>
                <p class="alert__msg">{{ msg }}</p>
              </div>
            </div>
          }

          <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate>
            <div class="field">
              <label class="field__label" for="usernameOrEmail">Usuario o código</label>
              <div class="field__control">
                <span class="field__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3 7 9 6 9-6" />
                  </svg>
                </span>
                <input
                  id="usernameOrEmail"
                  class="field__input"
                  type="text"
                  autocomplete="username"
                  placeholder="ej. ana.mendoza  o  EST-00428"
                  formControlName="usernameOrEmail"
                />
              </div>
            </div>

            <div class="field">
              <div class="field__row">
                <label class="field__label" for="password">Contraseña</label>
                <a class="field__link" href="#">¿Olvidaste tu contraseña?</a>
              </div>
              <div class="field__control">
                <span class="field__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V8a4 4 0 1 1 8 0v3" />
                  </svg>
                </span>
                <input
                  id="password"
                  class="field__input field__input--with-action"
                  [type]="showPassword() ? 'text' : 'password'"
                  autocomplete="current-password"
                  placeholder="••••••••"
                  formControlName="password"
                />
                <button
                  type="button"
                  class="field__action"
                  (click)="togglePasswordVisibility()"
                  [attr.aria-label]="showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                >
                  @if (showPassword()) {
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M2 2l20 20" />
                      <path d="M6.7 6.7C4.6 8.1 3 10 2 12c2 4 6 7 10 7 2 0 3.8-.6 5.3-1.6" />
                      <path d="M14.1 14.1A3 3 0 0 1 9.9 9.9" />
                      <path d="M22 12c-1-2-2.6-3.9-4.7-5.3" />
                    </svg>
                  } @else {
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  }
                </button>
              </div>
            </div>

            <button
              type="submit"
              class="btn-primary"
              [disabled]="isLoading() || form.invalid"
            >
              @if (isLoading()) {
                <span>Ingresando…</span>
              } @else {
                <span>Ingresar</span>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              }
            </button>
          </form>

          <div class="hint">
            <span class="hint__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5l-8-3z" />
              </svg>
            </span>
            <span>
              Usa las credenciales proporcionadas por tu docente o administrador.
            </span>
          </div>
        </div>
      </section>
    </div>
  `,
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly form: FormGroup = this.fb.nonNullable.group({
    usernameOrEmail: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  readonly showPassword = signal<boolean>(false);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    if (this.authService.hasValidSession()) {
      void this.router.navigate(['/dashboard']);
      return;
    }

    if (this.authService.isAuthenticated()) {
      this.authService.logout();
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  onSubmit(): void {
    if (this.form.invalid || this.isLoading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.isLoading.set(true);

    const { usernameOrEmail, password } = this.form.getRawValue() as {
      usernameOrEmail: string;
      password: string;
    };

    this.authService
      .login({ usernameOrEmail, password })
      .pipe(
        catchError((error: unknown) => {
          this.handleError(error);
          return EMPTY;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response: AuthResponse) => {
        this.isLoading.set(false);
        if (response.temporaryPassword) {
          void this.router.navigate(['/auth/change-password']);
        } else {
          void this.router.navigate(['/dashboard']);
        }
      });
  }

  private handleError(error: unknown): void {
    this.isLoading.set(false);
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) {
        this.errorMessage.set('Usuario o contraseña incorrectos');
        return;
      }
      if (error.status === 400) {
        this.errorMessage.set('Datos inválidos');
        return;
      }
    }
    this.errorMessage.set('Error del servidor, intenta nuevamente');
  }
}
