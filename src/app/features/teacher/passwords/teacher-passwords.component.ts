import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { UserManagementService } from '../../../core/services/user-management.service';
import {
  SidebarComponent,
  SidebarNavItem,
} from '../../../shared/components/sidebar/sidebar.component';
import {
  ApiError,
  ResetPasswordRequest,
  StudentResponse,
} from '../../../shared/models';

type StatusFilter = 'all' | 'active' | 'inactive';

@Component({
  selector: 'app-teacher-passwords',
  standalone: true,
  imports: [ReactiveFormsModule, SidebarComponent],
  styleUrls: ['./teacher-passwords.component.scss'],
  template: `
    <div class="layout">
      <app-sidebar
        [navItems]="navItems"
        [userName]="userName()"
        [userRole]="userRole"
        [userInitials]="userInitials()"
        (onLogout)="handleLogout()"
      />

      <main class="main">
        <header class="page-header">
          <div>
            <h1 class="page-title">Restablecer contraseñas</h1>
            <p class="page-description">
              Asigna una nueva contraseña temporal a un estudiante. Deberás comunicársela
              personalmente; el estudiante la cambiará en su próximo ingreso.
            </p>
          </div>
        </header>

        @if (successMessage()) {
          <div class="alert alert-success page-alert">
            <span class="material-icons">check_circle</span>
            {{ successMessage() }}
          </div>
        }

        <!-- Toolbar de búsqueda y filtros -->
        <div class="toolbar">
          <div class="input-group toolbar__search">
            <span class="material-icons input-group__icon">search</span>
            <input
              class="input"
              type="search"
              placeholder="Buscar por nombre, apellido o código…"
              [value]="searchTerm()"
              (input)="onSearch($event)"
            />
          </div>

          <div class="toolbar__filters">
            <select class="select toolbar__select" [value]="statusFilter()" (change)="onStatusFilter($event)">
              <option value="all">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </div>
        </div>

        <!-- Estados de carga / error / vacío / tabla -->
        @if (loading()) {
          <div class="loading-state">
            <div class="loading-state__spinner"></div>
            <div class="loading-state__label">Cargando estudiantes…</div>
          </div>
        } @else if (error()) {
          <div class="error-state">
            <div class="error-state__icon"><span class="material-icons">error_outline</span></div>
            <h2 class="error-state__title">No se pudieron cargar los estudiantes</h2>
            <p class="error-state__desc">{{ error() }}</p>
            <button type="button" class="btn btn-secondary" (click)="loadStudents()">Reintentar</button>
          </div>
        } @else if (students().length === 0) {
          <div class="empty-state">
            <div class="empty-state__icon"><span class="material-icons">group</span></div>
            <h2 class="empty-state__title">Aún no tienes estudiantes</h2>
            <p class="empty-state__desc">Registra estudiantes desde «Mis estudiantes» para poder gestionar sus contraseñas.</p>
            <button type="button" class="btn btn-primary" (click)="goToStudents()">
              <span class="material-icons">group</span>
              Ir a mis estudiantes
            </button>
          </div>
        } @else {
          <div class="table-container">
            <table class="table">
              <thead>
                <tr>
                  <th>Estudiante</th>
                  <th>Código</th>
                  <th>Grado</th>
                  <th>Sección</th>
                  <th>Estado</th>
                  <th style="text-align: right;">Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (s of filteredStudents(); track s.id) {
                  <tr>
                    <td>
                      <div class="student-cell">
                        <div class="student-cell__avatar">{{ initials(s) }}</div>
                        <div class="student-cell__name">{{ s.names }} {{ s.lastNames }}</div>
                      </div>
                    </td>
                    <td class="text-mono code-cell">{{ s.studentCode }}</td>
                    <td>{{ s.grade }}°</td>
                    <td><span class="badge badge-neutral">{{ s.section }}</span></td>
                    <td>
                      @if (s.active) {
                        <span class="badge badge-success"><span class="status-dot"></span>Activo</span>
                      } @else {
                        <span class="badge badge-neutral"><span class="status-dot"></span>Inactivo</span>
                      }
                    </td>
                    <td>
                      <div class="row-actions">
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          title="Restablecer contraseña"
                          (click)="openReset(s)"
                        >
                          <span class="material-icons">lock_reset</span>
                          Restablecer
                        </button>
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6" class="table__empty">
                      Ningún estudiante coincide con la búsqueda o los filtros.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <div class="table-summary">
            Mostrando <strong>{{ filteredStudents().length }}</strong> de
            <strong>{{ students().length }}</strong> estudiantes
          </div>
        }
      </main>
    </div>

    <!-- Modal: restablecer contraseña -->
    @if (resetTarget(); as target) {
      <div class="modal-overlay" (click)="closeReset()">
        <div class="modal modal--form" (click)="$event.stopPropagation()">
          <header class="modal__header">
            <h2 class="modal__title">Restablecer contraseña</h2>
            <button type="button" class="modal__close" aria-label="Cerrar" (click)="closeReset()">
              <span class="material-icons">close</span>
            </button>
          </header>

          <form [formGroup]="form" (ngSubmit)="submitReset()" class="modal__body">
            <!-- Identificación del estudiante -->
            <div class="student-card">
              <div class="student-card__avatar">{{ initials(target) }}</div>
              <div class="student-card__info">
                <div class="student-card__name">{{ target.names }} {{ target.lastNames }}</div>
                <div class="student-card__meta">
                  <span class="text-mono">{{ target.studentCode }}</span>
                  <span class="student-card__dot"></span>
                  <span>{{ target.grade }}° de secundaria — Sección {{ target.section }}</span>
                </div>
              </div>
            </div>

            <div class="form-grid">
              <div class="form-group form-group--full">
                <label class="form-label" for="newTemporaryPassword">Nueva contraseña temporal</label>
                <input id="newTemporaryPassword" class="input" type="text" formControlName="newTemporaryPassword"
                  placeholder="Mín. 6 caracteres" [class.input-error]="isInvalid('newTemporaryPassword')" />
                @if (isInvalid('newTemporaryPassword')) {
                  <span class="form-error">La contraseña debe tener entre 6 y 100 caracteres.</span>
                }
              </div>

              <div class="form-group form-group--full">
                <label class="form-label" for="confirmTemporaryPassword">Confirmar contraseña</label>
                <input id="confirmTemporaryPassword" class="input" type="text" formControlName="confirmTemporaryPassword"
                  placeholder="Repite la contraseña" [class.input-error]="isInvalid('confirmTemporaryPassword') || mismatch()" />
                @if (isInvalid('confirmTemporaryPassword')) {
                  <span class="form-error">Confirma la contraseña (entre 6 y 100 caracteres).</span>
                } @else if (mismatch()) {
                  <span class="form-error">La contraseña y su confirmación no coinciden.</span>
                }
              </div>
            </div>

            <div class="alert alert-info modal__note">
              <span class="material-icons">info</span>
              El estudiante deberá cambiar esta contraseña al iniciar sesión. Comunícasela personalmente.
            </div>

            @if (formError()) {
              <div class="alert alert-danger modal__note">
                <span class="material-icons">error_outline</span>
                {{ formError() }}
              </div>
            }

            <div class="modal__actions">
              <button type="button" class="btn btn-secondary" (click)="closeReset()" [disabled]="saving()">
                Cancelar
              </button>
              <button type="submit" class="btn btn-primary" [disabled]="saving()">
                {{ saving() ? 'Restableciendo…' : 'Confirmar restablecimiento' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class TeacherPasswordsComponent {
  private readonly authService = inject(AuthService);
  private readonly userManagementService = inject(UserManagementService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly navItems: readonly SidebarNavItem[] = [
    { label: 'Inicio', icon: 'home', route: '/teacher-dashboard' },
    { label: 'Mis estudiantes', icon: 'group', route: '/teacher/students' },
    { label: 'Evaluaciones', icon: 'quiz', route: '/teacher-dashboard/evaluations', disabled: true },
    { label: 'Resultados', icon: 'analytics', route: '/teacher-dashboard/results', disabled: true },
    { label: 'Restablecer contraseñas', icon: 'lock_reset', route: '/teacher/passwords' },
  ];

  readonly userRole = 'Docente';

  // Estado de datos
  readonly students = signal<StudentResponse[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Búsqueda y filtros locales
  readonly searchTerm = signal<string>('');
  readonly statusFilter = signal<StatusFilter>('all');

  // Restablecimiento
  readonly resetTarget = signal<StudentResponse | null>(null);
  readonly saving = signal<boolean>(false);
  readonly formError = signal<string | null>(null);

  readonly form: FormGroup = this.fb.group({
    newTemporaryPassword: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(100)]],
    confirmTemporaryPassword: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(100)]],
  });

  // Usuario autenticado
  private readonly currentUser = this.authService.currentUser;
  readonly userName = computed<string>(() => this.currentUser()?.username ?? 'Docente');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));
  private readonly teacherUserId = computed<number | null>(() => this.currentUser()?.userId ?? null);

  readonly filteredStudents = computed<StudentResponse[]>(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const status = this.statusFilter();

    return this.students().filter((s) => {
      const matchesTerm =
        term === '' ||
        `${s.names} ${s.lastNames}`.toLowerCase().includes(term) ||
        s.studentCode.toLowerCase().includes(term);
      const matchesStatus =
        status === 'all' || (status === 'active' ? s.active : !s.active);
      return matchesTerm && matchesStatus;
    });
  });

  constructor() {
    this.loadStudents();
  }

  loadStudents(): void {
    const teacherId = this.teacherUserId();
    if (teacherId === null) {
      this.error.set('No se pudo identificar al docente autenticado. Vuelve a iniciar sesión.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.userManagementService.listStudentsByTeacher(teacherId).subscribe({
      next: (students) => {
        this.students.set(students);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(this.extractError(err, 'Ocurrió un error al cargar los estudiantes.'));
        this.loading.set(false);
      },
    });
  }

  onSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  onStatusFilter(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value as StatusFilter);
  }

  openReset(student: StudentResponse): void {
    this.formError.set(null);
    this.form.reset({ newTemporaryPassword: '', confirmTemporaryPassword: '' });
    this.resetTarget.set(student);
  }

  closeReset(): void {
    this.resetTarget.set(null);
    this.formError.set(null);
  }

  submitReset(): void {
    const teacherId = this.teacherUserId();
    const target = this.resetTarget();
    if (teacherId === null || target === null) {
      this.formError.set('No se pudo identificar al docente o al estudiante.');
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.mismatch()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.formError.set(null);
    const raw = this.form.getRawValue();
    const request: ResetPasswordRequest = {
      newTemporaryPassword: raw.newTemporaryPassword,
      confirmTemporaryPassword: raw.confirmTemporaryPassword,
    };

    this.userManagementService.resetStudentPassword(teacherId, target.id, request).subscribe({
      next: () => {
        this.saving.set(false);
        this.resetTarget.set(null);
        this.flashSuccess(
          `Contraseña de ${target.names} ${target.lastNames} restablecida. ` +
            'Deberá cambiarla al iniciar sesión.'
        );
        this.loadStudents();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.formError.set(this.extractError(err, 'No se pudo restablecer la contraseña.'));
      },
    });
  }

  goToStudents(): void {
    void this.router.navigateByUrl('/teacher/students');
  }

  handleLogout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
  }

  isInvalid(controlName: string): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.touched || control.dirty);
  }

  mismatch(): boolean {
    const pwd = this.form.controls['newTemporaryPassword'];
    const confirm = this.form.controls['confirmTemporaryPassword'];
    return (
      confirm.value !== '' &&
      pwd.value !== confirm.value &&
      (confirm.touched || confirm.dirty)
    );
  }

  initials(student: StudentResponse): string {
    return buildInitials(`${student.names} ${student.lastNames}`);
  }

  private flashSuccess(message: string): void {
    this.successMessage.set(message);
    setTimeout(() => this.successMessage.set(null), 5000);
  }

  private extractError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const apiError = err.error as ApiError | null;
      if (apiError?.message) {
        return apiError.message;
      }
      if (err.status === 0) {
        return 'No se pudo conectar con el servidor.';
      }
    }
    return fallback;
  }
}

function buildInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) {
    return '??';
  }
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
