import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, EMPTY } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';

type PasswordStrength = 'weak' | 'medium' | 'strong' | null;

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [ReactiveFormsModule],
  styleUrl: './change-password.component.scss',
  template: `
    <div class="reset">
      <aside class="reset__brand">
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
          <span class="brand-pill">
            <span class="brand-pill__dot" aria-hidden="true"></span>
            Paso de seguridad
          </span>
          <h2 class="brand-body__headline">Antes de continuar…</h2>
          <p class="brand-body__desc">
            Por seguridad, debes crear tu propia contraseña antes de acceder al
            laboratorio.
          </p>
        </div>

        <footer class="brand-footer">
          <span>© 2026 QuímicaLab</span>
          <span class="brand-footer__links">
            <a href="#">Soporte</a>
            <a href="#">Privacidad</a>
          </span>
        </footer>
      </aside>

      <section class="reset__form-wrap">
        <div class="reset__form">
          <div class="reset__heading">
            <h1>Crea tu contraseña</h1>
            <p>Solo se te pedirá esta vez.</p>
          </div>

          @if (errorMessage(); as msg) {
            <div class="alert" role="alert">
              <span class="alert__icon" aria-hidden="true">!</span>
              <div>
                <p class="alert__title">No se pudo guardar la contraseña</p>
                <p class="alert__msg">{{ msg }}</p>
              </div>
            </div>
          }

          <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate>
            <!-- Contraseña temporal -->
            <div class="field">
              <label class="field__label" for="currentPassword">Contraseña temporal</label>
              <div class="field__control">
                <span class="field__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V8a4 4 0 1 1 8 0v3" />
                  </svg>
                </span>
                <input
                  id="currentPassword"
                  class="field__input field__input--with-action"
                  [type]="showCurrent() ? 'text' : 'password'"
                  placeholder="La que te dio tu docente o admin"
                  formControlName="currentPassword"
                />
                <button
                  type="button"
                  class="field__action"
                  (click)="toggle('current')"
                  [attr.aria-label]="showCurrent() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                >
                  @if (showCurrent()) {
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

            <!-- Nueva contraseña -->
            <div class="field">
              <label class="field__label" for="newPassword">Nueva contraseña</label>
              <div class="field__control">
                <span class="field__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V8a4 4 0 1 1 8 0v3" />
                  </svg>
                </span>
                <input
                  id="newPassword"
                  class="field__input field__input--with-action"
                  [type]="showNew() ? 'text' : 'password'"
                  placeholder="Crea una nueva contraseña"
                  formControlName="newPassword"
                />
                <button
                  type="button"
                  class="field__action"
                  (click)="toggle('new')"
                  [attr.aria-label]="showNew() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                >
                  @if (showNew()) {
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

              <!-- Indicador de fortaleza -->
              <div class="strength">
                <div class="strength__bars" [attr.data-level]="passwordStrength() ?? 'empty'">
                  <span class="strength__bar"></span>
                  <span class="strength__bar"></span>
                  <span class="strength__bar"></span>
                </div>
                <span class="strength__label" [attr.data-level]="passwordStrength() ?? 'empty'">
                  {{ strengthLabel() }}
                </span>
              </div>
            </div>

            <!-- Confirmar -->
            <div class="field">
              <label class="field__label" for="confirmPassword">Confirmar nueva contraseña</label>
              <div class="field__control">
                <span class="field__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V8a4 4 0 1 1 8 0v3" />
                  </svg>
                </span>
                <input
                  id="confirmPassword"
                  class="field__input field__input--with-action"
                  [class.is-error]="showMismatch()"
                  [type]="showConfirm() ? 'text' : 'password'"
                  placeholder="Repítela para confirmar"
                  formControlName="confirmPassword"
                />
                <button
                  type="button"
                  class="field__action"
                  (click)="toggle('confirm')"
                  [attr.aria-label]="showConfirm() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                >
                  @if (showConfirm()) {
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

              @if (showMismatch()) {
                <div class="field__error">
                  <span class="field__error-icon" aria-hidden="true">!</span>
                  Las contraseñas no coinciden
                </div>
              } @else if (showMatch()) {
                <div class="field__ok">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                  Las contraseñas coinciden
                </div>
              }
            </div>

            <!-- Texto de ayuda -->
            <div class="hint">
              <span class="hint__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5l-8-3z" />
                </svg>
              </span>
              <span><strong>Mínimo 6 caracteres.</strong> Combina letras y números.</span>
            </div>

            <button
              type="submit"
              class="btn-primary"
              [disabled]="isLoading() || form.invalid"
            >
              @if (isLoading()) {
                <span>Guardando…</span>
              } @else {
                <span>Guardar y continuar</span>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              }
            </button>
          </form>
        </div>
      </section>
    </div>
  `,
})
export class ChangePasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly form: FormGroup = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: [passwordsMatchValidator] },
  );

  readonly showCurrent = signal<boolean>(false);
  readonly showNew = signal<boolean>(false);
  readonly showConfirm = signal<boolean>(false);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly passwordStrength = signal<PasswordStrength>(null);

  private readonly newValue = signal<string>('');
  private readonly confirmValue = signal<string>('');
  private readonly confirmTouched = signal<boolean>(false);

  readonly strengthLabel = computed<string>(() => {
    const s = this.passwordStrength();
    if (s === 'weak') return 'Débil';
    if (s === 'medium') return 'Regular';
    if (s === 'strong') return 'Fuerte';
    return 'Empieza a escribir…';
  });

  readonly showMismatch = computed<boolean>(() => {
    const newVal = this.newValue();
    const confirmVal = this.confirmValue();
    return (
      this.confirmTouched() &&
      newVal.length > 0 &&
      confirmVal.length > 0 &&
      newVal !== confirmVal
    );
  });

  readonly showMatch = computed<boolean>(() => {
    const newVal = this.newValue();
    const confirmVal = this.confirmValue();
    return confirmVal.length > 0 && newVal === confirmVal;
  });

  ngOnInit(): void {
    if (!this.authService.requiresPasswordChange()) {
      void this.router.navigate(['/dashboard']);
      return;
    }

    this.form
      .get('newPassword')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value: string) => {
        const v = value ?? '';
        this.newValue.set(v);
        this.passwordStrength.set(this.computeStrength(v));
      });

    this.form
      .get('confirmPassword')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value: string) => {
        const v = value ?? '';
        this.confirmValue.set(v);
        if (v.length > 0) {
          this.confirmTouched.set(true);
        }
      });
  }

  toggle(field: 'current' | 'new' | 'confirm'): void {
    if (field === 'current') this.showCurrent.update((v) => !v);
    if (field === 'new') this.showNew.update((v) => !v);
    if (field === 'confirm') this.showConfirm.update((v) => !v);
  }

  onSubmit(): void {
    this.confirmTouched.set(true);

    if (this.form.invalid || this.isLoading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.isLoading.set(true);

    const { currentPassword, newPassword, confirmPassword } =
      this.form.getRawValue() as {
        currentPassword: string;
        newPassword: string;
        confirmPassword: string;
      };

    this.authService
      .changePassword({ currentPassword, newPassword, confirmPassword })
      .pipe(
        catchError((error: unknown) => {
          this.handleError(error);
          return EMPTY;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.isLoading.set(false);
        void this.router.navigate(['/dashboard']);
      });
  }

  private computeStrength(value: string): PasswordStrength {
    if (value.length === 0) return null;
    if (value.length < 6) return 'weak';
    const hasLetters = /[A-Za-z]/.test(value);
    const hasDigits = /\d/.test(value);
    if (hasLetters && hasDigits) return 'strong';
    return 'medium';
  }

  private handleError(error: unknown): void {
    this.isLoading.set(false);
    if (error instanceof HttpErrorResponse) {
      if (error.status === 400) {
        this.errorMessage.set(
          'La contraseña actual es incorrecta o los datos no son válidos',
        );
        return;
      }
      if (error.status === 401) {
        this.errorMessage.set('Tu sesión ha expirado, vuelve a iniciar sesión');
        return;
      }
    }
    this.errorMessage.set('Error del servidor, intenta nuevamente');
  }
}

function passwordsMatchValidator(
  group: AbstractControl,
): ValidationErrors | null {
  const newPassword = group.get('newPassword')?.value as string | undefined;
  const confirmPassword = group.get('confirmPassword')?.value as
    | string
    | undefined;
  if (
    typeof newPassword !== 'string' ||
    typeof confirmPassword !== 'string' ||
    confirmPassword.length === 0
  ) {
    return null;
  }
  return newPassword === confirmPassword ? null : { passwordMismatch: true };
}
