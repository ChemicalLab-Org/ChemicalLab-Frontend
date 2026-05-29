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
  CreateTeacherRequest,
  TeacherResponse,
} from '../../../shared/models';

type StatusFilter = 'all' | 'active' | 'inactive';

@Component({
  selector: 'app-teacher-management',
  standalone: true,
  imports: [ReactiveFormsModule, SidebarComponent],
  styleUrls: ['./teacher-management.component.scss'],
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
            <h1 class="page-title">Gestión de docentes</h1>
            <p class="page-description">Registra y administra los docentes del sistema.</p>
          </div>
          <button type="button" class="btn btn-primary" (click)="openCreate()">
            <span class="material-icons">add</span>
            Registrar docente
          </button>
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
              placeholder="Buscar por nombre, apellido, usuario o correo…"
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
            <div class="loading-state__label">Cargando docentes…</div>
          </div>
        } @else if (error()) {
          <div class="error-state">
            <div class="error-state__icon"><span class="material-icons">error_outline</span></div>
            <h2 class="error-state__title">No se pudieron cargar los docentes</h2>
            <p class="error-state__desc">{{ error() }}</p>
            <button type="button" class="btn btn-secondary" (click)="loadTeachers()">Reintentar</button>
          </div>
        } @else if (teachers().length === 0) {
          <div class="empty-state">
            <div class="empty-state__icon"><span class="material-icons">badge</span></div>
            <h2 class="empty-state__title">Aún no hay docentes</h2>
            <p class="empty-state__desc">Registra al primer docente para empezar a gestionar el sistema.</p>
            <button type="button" class="btn btn-primary" (click)="openCreate()">
              <span class="material-icons">add</span>
              Registrar docente
            </button>
          </div>
        } @else {
          <div class="table-container">
            <table class="table">
              <thead>
                <tr>
                  <th>Docente</th>
                  <th>Usuario</th>
                  <th>Correo</th>
                  <th>Estado</th>
                  <th style="text-align: right;">Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (t of filteredTeachers(); track t.id) {
                  <tr>
                    <td>
                      <div class="teacher-cell">
                        <div class="teacher-cell__avatar">{{ initials(t) }}</div>
                        <div class="teacher-cell__name">{{ t.names }} {{ t.lastNames }}</div>
                      </div>
                    </td>
                    <td class="text-mono user-cell">{{ t.username }}</td>
                    <td class="email-cell">{{ t.email }}</td>
                    <td>
                      @if (t.active) {
                        <span class="badge badge-success"><span class="status-dot"></span>Activo</span>
                      } @else {
                        <span class="badge badge-neutral"><span class="status-dot"></span>Inactivo</span>
                      }
                    </td>
                    <td>
                      <div class="row-actions">
                        <button
                          type="button"
                          class="row-action row-action--danger"
                          title="Desactivar"
                          aria-label="Desactivar"
                          [disabled]="!t.active"
                          (click)="askDeactivate(t)"
                        >
                          <span class="material-icons">power_settings_new</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5" class="table__empty">
                      Ningún docente coincide con la búsqueda o los filtros.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <div class="table-summary">
            Mostrando <strong>{{ filteredTeachers().length }}</strong> de
            <strong>{{ teachers().length }}</strong> docentes
          </div>
        }
      </main>
    </div>

    <!-- Modal: formulario registrar docente -->
    @if (formOpen()) {
      <div class="modal-overlay" (click)="closeForm()">
        <div class="modal modal--form" (click)="$event.stopPropagation()">
          <header class="modal__header">
            <h2 class="modal__title">Registrar docente</h2>
            <button type="button" class="modal__close" aria-label="Cerrar" (click)="closeForm()">
              <span class="material-icons">close</span>
            </button>
          </header>

          <form [formGroup]="form" (ngSubmit)="submitForm()" class="modal__body">
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label" for="names">Nombres</label>
                <input id="names" class="input" formControlName="names" placeholder="ej. Pedro"
                  [class.input-error]="isInvalid('names')" />
                @if (isInvalid('names')) {
                  <span class="form-error">Ingresa los nombres (máx. 100 caracteres).</span>
                }
              </div>

              <div class="form-group">
                <label class="form-label" for="lastNames">Apellidos</label>
                <input id="lastNames" class="input" formControlName="lastNames" placeholder="ej. Martínez"
                  [class.input-error]="isInvalid('lastNames')" />
                @if (isInvalid('lastNames')) {
                  <span class="form-error">Ingresa los apellidos (máx. 100 caracteres).</span>
                }
              </div>

              <div class="form-group form-group--full">
                <label class="form-label" for="username">Usuario</label>
                <input id="username" class="input text-mono" formControlName="username" placeholder="ej. pedro.martinez"
                  [class.input-error]="isInvalid('username')" />
                @if (isInvalid('username')) {
                  <span class="form-error">El usuario debe tener entre 4 y 50 caracteres.</span>
                } @else {
                  <span class="form-hint">Se usará para iniciar sesión.</span>
                }
              </div>

              <div class="form-group form-group--full">
                <label class="form-label" for="email">Correo</label>
                <input id="email" class="input" type="email" formControlName="email" placeholder="ej. pedro.martinez@correo.com"
                  [class.input-error]="isInvalid('email')" />
                @if (isInvalid('email')) {
                  <span class="form-error">Ingresa un correo con formato válido (máx. 100 caracteres).</span>
                }
              </div>

              <div class="form-group form-group--full">
                <label class="form-label" for="temporaryPassword">Contraseña temporal</label>
                <input id="temporaryPassword" class="input" formControlName="temporaryPassword"
                  placeholder="Mín. 6 caracteres" [class.input-error]="isInvalid('temporaryPassword')" />
                @if (isInvalid('temporaryPassword')) {
                  <span class="form-error">La contraseña debe tener entre 6 y 100 caracteres.</span>
                }
              </div>
            </div>

            <div class="alert alert-info modal__note">
              <span class="material-icons">info</span>
              El docente deberá cambiar su contraseña en el primer ingreso.
            </div>

            @if (formError()) {
              <div class="alert alert-danger modal__note">
                <span class="material-icons">error_outline</span>
                {{ formError() }}
              </div>
            }

            <div class="modal__actions">
              <button type="button" class="btn btn-secondary" (click)="closeForm()" [disabled]="saving()">
                Cancelar
              </button>
              <button type="submit" class="btn btn-primary" [disabled]="saving()">
                {{ saving() ? 'Guardando…' : 'Guardar docente' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Modal: confirmación de desactivación -->
    @if (deactivateTarget(); as target) {
      <div class="modal-overlay" (click)="cancelDeactivate()">
        <div class="modal modal--confirm" (click)="$event.stopPropagation()">
          <div class="modal__warn-icon"><span class="material-icons">warning</span></div>
          <h2 class="modal__title">¿Desactivar a {{ target.names }} {{ target.lastNames }}?</h2>
          <p class="modal__text">
            El docente no podrá iniciar sesión. Su información se conservará y no se eliminará del sistema.
          </p>
          @if (formError()) {
            <div class="alert alert-danger modal__note">
              <span class="material-icons">error_outline</span>
              {{ formError() }}
            </div>
          }
          <div class="modal__actions">
            <button type="button" class="btn btn-secondary" (click)="cancelDeactivate()" [disabled]="deactivating()">
              Cancelar
            </button>
            <button type="button" class="btn btn-danger" (click)="confirmDeactivate()" [disabled]="deactivating()">
              {{ deactivating() ? 'Desactivando…' : 'Confirmar desactivación' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class TeacherManagementComponent {
  private readonly authService = inject(AuthService);
  private readonly userManagementService = inject(UserManagementService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly navItems: readonly SidebarNavItem[] = [
    { label: 'Inicio', icon: 'home', route: '/admin-dashboard' },
    { label: 'Gestión de docentes', icon: 'badge', route: '/admin/teachers' },
    { label: 'Usuarios y roles', icon: 'manage_accounts', route: '/admin-dashboard/users', disabled: true },
    { label: 'Contenidos químicos', icon: 'auto_stories', route: '/admin-dashboard/content', disabled: true },
    { label: 'Elementos químicos', icon: 'table_chart', route: '/admin-dashboard/elements', disabled: true },
    { label: 'Grupos químicos', icon: 'hub', route: '/admin-dashboard/groups', disabled: true },
    { label: 'Logs del sistema', icon: 'terminal', route: '/admin-dashboard/logs', disabled: true },
    { label: 'Estado del sistema', icon: 'monitor_heart', route: '/admin-dashboard/system', disabled: true },
  ];

  readonly userRole = 'Admin';

  // Estado de datos
  readonly teachers = signal<TeacherResponse[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Búsqueda y filtros locales
  readonly searchTerm = signal<string>('');
  readonly statusFilter = signal<StatusFilter>('all');

  // Formulario de registro
  readonly formOpen = signal<boolean>(false);
  readonly saving = signal<boolean>(false);
  readonly formError = signal<string | null>(null);

  // Desactivación
  readonly deactivateTarget = signal<TeacherResponse | null>(null);
  readonly deactivating = signal<boolean>(false);

  readonly form: FormGroup = this.fb.group({
    names: ['', [Validators.required, Validators.maxLength(100)]],
    lastNames: ['', [Validators.required, Validators.maxLength(100)]],
    username: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(50)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(100)]],
    temporaryPassword: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(100)]],
  });

  // Usuario autenticado
  private readonly currentUser = this.authService.currentUser;
  readonly userName = computed<string>(() => this.currentUser()?.username ?? 'Administrador');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  readonly filteredTeachers = computed<TeacherResponse[]>(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const status = this.statusFilter();

    return this.teachers().filter((t) => {
      const matchesTerm =
        term === '' ||
        `${t.names} ${t.lastNames}`.toLowerCase().includes(term) ||
        t.username.toLowerCase().includes(term) ||
        t.email.toLowerCase().includes(term);
      const matchesStatus =
        status === 'all' || (status === 'active' ? t.active : !t.active);
      return matchesTerm && matchesStatus;
    });
  });

  constructor() {
    this.loadTeachers();
  }

  loadTeachers(): void {
    this.loading.set(true);
    this.error.set(null);
    this.userManagementService.listTeachers().subscribe({
      next: (teachers) => {
        this.teachers.set(teachers);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(this.extractError(err, 'Ocurrió un error al cargar los docentes.'));
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

  openCreate(): void {
    this.formError.set(null);
    this.form.reset({
      names: '',
      lastNames: '',
      username: '',
      email: '',
      temporaryPassword: '',
    });
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.formError.set(null);
  }

  submitForm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.formError.set(null);
    const raw = this.form.getRawValue();
    const request: CreateTeacherRequest = {
      names: raw.names.trim(),
      lastNames: raw.lastNames.trim(),
      username: raw.username.trim(),
      email: raw.email.trim(),
      temporaryPassword: raw.temporaryPassword,
    };

    this.userManagementService.createTeacher(request).subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.flashSuccess('Docente registrado correctamente.');
        this.loadTeachers();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.formError.set(this.extractError(err, 'No se pudo registrar el docente.'));
      },
    });
  }

  askDeactivate(teacher: TeacherResponse): void {
    this.formError.set(null);
    this.deactivateTarget.set(teacher);
  }

  cancelDeactivate(): void {
    this.deactivateTarget.set(null);
    this.formError.set(null);
  }

  confirmDeactivate(): void {
    const target = this.deactivateTarget();
    if (target === null) {
      return;
    }

    this.deactivating.set(true);
    this.formError.set(null);
    this.userManagementService.deactivateTeacher(target.userId).subscribe({
      next: () => {
        this.deactivating.set(false);
        this.deactivateTarget.set(null);
        this.flashSuccess(`${target.names} ${target.lastNames} fue desactivado.`);
        this.loadTeachers();
      },
      error: (err: unknown) => {
        this.deactivating.set(false);
        this.formError.set(this.extractError(err, 'No se pudo desactivar el docente.'));
      },
    });
  }

  handleLogout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
  }

  isInvalid(controlName: string): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.touched || control.dirty);
  }

  initials(teacher: TeacherResponse): string {
    return buildInitials(`${teacher.names} ${teacher.lastNames}`);
  }

  private flashSuccess(message: string): void {
    this.successMessage.set(message);
    setTimeout(() => this.successMessage.set(null), 4000);
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
