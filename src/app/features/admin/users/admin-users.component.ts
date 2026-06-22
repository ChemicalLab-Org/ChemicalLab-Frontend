import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { AdminService } from '../../../core/services/admin.service';
import { UserManagementService } from '../../../core/services/user-management.service';
import { SidebarComponent, SidebarNavItem } from '../../../shared/components/sidebar/sidebar.component';
import {
  AdminActivity,
  AdminSummary,
  AdminUser,
  ApiError,
  CreateTeacherRequest,
  ResetPasswordRequest,
  UserRole,
} from '../../../shared/models';

type UserFilter = 'all' | UserRole | 'active' | 'inactive';

interface MetricCard {
  readonly id: string;
  readonly label: string;
  readonly value: number | string;
  readonly icon: string;
}

interface FilterTab {
  readonly id: UserFilter;
  readonly label: string;
}

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [ReactiveFormsModule, SidebarComponent],
  styleUrls: ['./admin-users.component.scss'],
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
            <h1 class="page-title">Panel administrativo</h1>
            <p class="page-description">
              Gestiona usuarios, roles y supervisa el estado general del sistema.
            </p>
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

        <!-- ===================== MÉTRICAS ===================== -->
        <section class="metrics-grid" aria-label="Resumen general">
          @for (m of metrics(); track m.id) {
            <div class="metric">
              <div class="metric__icon"><span class="material-icons">{{ m.icon }}</span></div>
              <div class="metric__body">
                <div class="metric__label">{{ m.label }}</div>
                <div class="metric__value">{{ m.value }}</div>
              </div>
            </div>
          }
        </section>

        <!-- ===================== GESTIÓN DE USUARIOS ===================== -->
        <section class="panel-section">
          <h2 class="section-heading">Usuarios y roles</h2>

          <!-- Filtros por rol/estado -->
          <div class="filter-tabs">
            @for (tab of filterTabs; track tab.id) {
              <button
                type="button"
                class="filter-pill"
                [class.filter-pill--active]="activeFilter() === tab.id"
                (click)="setFilter(tab.id)"
              >
                {{ tab.label }}
              </button>
            }
          </div>

          <!-- Buscador -->
          <div class="input-group toolbar-search">
            <span class="material-icons input-group__icon">search</span>
            <input
              class="input"
              type="search"
              placeholder="Buscar por nombre, usuario, código, correo o rol…"
              [value]="searchTerm()"
              (input)="onSearch($event)"
            />
          </div>

          @if (loading()) {
            <div class="loading-state">
              <div class="loading-state__spinner"></div>
              <div class="loading-state__label">Cargando usuarios…</div>
            </div>
          } @else if (error()) {
            <div class="error-state">
              <div class="error-state__icon"><span class="material-icons">error_outline</span></div>
              <h2 class="error-state__title">No se pudieron cargar los usuarios</h2>
              <p class="error-state__desc">{{ error() }}</p>
              <button type="button" class="btn btn-secondary" (click)="loadAll()">Reintentar</button>
            </div>
          } @else if (users().length === 0) {
            <div class="empty-state">
              <div class="empty-state__icon"><span class="material-icons">group</span></div>
              <h2 class="empty-state__title">No hay usuarios registrados.</h2>
              <p class="empty-state__desc">Registra al primer docente para comenzar.</p>
            </div>
          } @else {
            <div class="table-container">
              <table class="table">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Usuario / código</th>
                    <th>Correo</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>Registro</th>
                    <th style="text-align: right;">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  @for (u of filteredUsers(); track u.userId) {
                    <tr>
                      <td>
                        <div class="user-cell">
                          <div class="user-cell__avatar" [attr.data-role]="u.role">{{ initials(u.fullName) }}</div>
                          <div class="user-cell__name">
                            {{ u.fullName }}
                            @if (isSelf(u)) { <span class="self-tag">Tú</span> }
                          </div>
                        </div>
                      </td>
                      <td class="text-mono mono-cell">{{ u.code ?? u.username }}</td>
                      <td class="email-cell">{{ u.email ?? '—' }}</td>
                      <td><span class="role-badge" [attr.data-role]="u.role">{{ roleLabel(u.role) }}</span></td>
                      <td>
                        @if (u.active) {
                          <span class="badge badge-success"><span class="status-dot"></span>Activo</span>
                        } @else {
                          <span class="badge badge-neutral"><span class="status-dot"></span>Inactivo</span>
                        }
                      </td>
                      <td class="date-cell">{{ formatDate(u.createdAt) }}</td>
                      <td>
                        <div class="row-actions">
                          @if (u.role === 'DOCENTE') {
                            <button
                              type="button"
                              class="row-action"
                              title="Restablecer contraseña"
                              aria-label="Restablecer contraseña"
                              (click)="openReset(u)"
                            >
                              <span class="material-icons">lock_reset</span>
                            </button>
                          }

                          @if (isSelf(u)) {
                            <span class="protected-tag" title="No puedes desactivar tu propia cuenta">
                              <span class="material-icons">shield</span>
                              Protegido
                            </span>
                          } @else if (u.active) {
                            <button
                              type="button"
                              class="row-action row-action--danger"
                              title="Desactivar"
                              aria-label="Desactivar"
                              [disabled]="busyUserId() === u.userId"
                              (click)="askDeactivate(u)"
                            >
                              <span class="material-icons">power_settings_new</span>
                            </button>
                          } @else {
                            <button
                              type="button"
                              class="row-action row-action--success"
                              title="Reactivar"
                              aria-label="Reactivar"
                              [disabled]="busyUserId() === u.userId"
                              (click)="reactivate(u)"
                            >
                              <span class="material-icons">restart_alt</span>
                            </button>
                          }
                        </div>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="7" class="table__empty">
                        No se encontraron usuarios con los filtros seleccionados.
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <div class="table-summary">
              Mostrando <strong>{{ filteredUsers().length }}</strong> de
              <strong>{{ users().length }}</strong> usuarios
            </div>
          }
        </section>

        <!-- ===================== ACTIVIDAD RECIENTE ===================== -->
        <section class="panel-section">
          <h2 class="section-heading">Actividad reciente</h2>

          @if (activityLoading()) {
            <div class="loading-state loading-state--inline">
              <div class="loading-state__spinner"></div>
              <div class="loading-state__label">Cargando actividad…</div>
            </div>
          } @else if (!hasActivity()) {
            <div class="empty-state empty-state--soft">
              <div class="empty-state__icon"><span class="material-icons">history</span></div>
              <p class="empty-state__desc">
                La actividad reciente se habilitará con el módulo de trazabilidad.
              </p>
            </div>
          } @else {
            <div class="activity-grid">
              <article class="activity-card">
                <header class="activity-card__head">
                  <span class="material-icons">person_add</span>
                  Últimos usuarios creados
                </header>
                @for (item of activity()?.recentUsers ?? []; track $index) {
                  <div class="activity-item">
                    <div class="activity-item__main">{{ item.title }}</div>
                    <div class="activity-item__meta">{{ item.subtitle }} · {{ formatDate(item.timestamp) }}</div>
                  </div>
                } @empty {
                  <div class="activity-empty">Sin registros recientes.</div>
                }
              </article>

              <article class="activity-card">
                <header class="activity-card__head">
                  <span class="material-icons">quiz</span>
                  Últimas evaluaciones creadas
                </header>
                @for (item of activity()?.recentEvaluations ?? []; track $index) {
                  <div class="activity-item">
                    <div class="activity-item__main">{{ item.title }}</div>
                    <div class="activity-item__meta">{{ item.subtitle }} · {{ formatDate(item.timestamp) }}</div>
                  </div>
                } @empty {
                  <div class="activity-empty">Sin registros recientes.</div>
                }
              </article>

              <article class="activity-card">
                <header class="activity-card__head">
                  <span class="material-icons">auto_stories</span>
                  Últimos contenidos creados
                </header>
                @for (item of activity()?.recentConcepts ?? []; track $index) {
                  <div class="activity-item">
                    <div class="activity-item__main">{{ item.title }}</div>
                    <div class="activity-item__meta">{{ item.subtitle }} · {{ formatDate(item.timestamp) }}</div>
                  </div>
                } @empty {
                  <div class="activity-empty">Sin registros recientes.</div>
                }
              </article>
            </div>
          }
        </section>
      </main>
    </div>

    <!-- Modal: registrar docente -->
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
              <button type="button" class="btn btn-secondary" (click)="closeForm()" [disabled]="saving()">Cancelar</button>
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
          <h2 class="modal__title">¿Desactivar a {{ target.fullName }}?</h2>
          <p class="modal__text">
            El usuario no podrá iniciar sesión. Su información se conservará y no se eliminará del sistema.
          </p>
          @if (formError()) {
            <div class="alert alert-danger modal__note">
              <span class="material-icons">error_outline</span>
              {{ formError() }}
            </div>
          }
          <div class="modal__actions">
            <button type="button" class="btn btn-secondary" (click)="cancelDeactivate()" [disabled]="busyUserId() !== null">
              Cancelar
            </button>
            <button type="button" class="btn btn-danger" (click)="confirmDeactivate()" [disabled]="busyUserId() !== null">
              {{ busyUserId() !== null ? 'Desactivando…' : 'Confirmar desactivación' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Modal: restablecer contraseña de docente -->
    @if (resetTarget(); as target) {
      <div class="modal-overlay" (click)="closeReset()">
        <div class="modal modal--form" (click)="$event.stopPropagation()">
          <header class="modal__header">
            <h2 class="modal__title">Restablecer contraseña</h2>
            <button type="button" class="modal__close" aria-label="Cerrar" (click)="closeReset()">
              <span class="material-icons">close</span>
            </button>
          </header>

          <form [formGroup]="resetForm" (ngSubmit)="submitReset()" class="modal__body">
            <p class="modal__text" style="margin-bottom: 1rem;">
              Asigna una nueva contraseña temporal para
              <strong>{{ target.fullName }}</strong> ({{ target.username }}).
            </p>

            <div class="form-grid">
              <div class="form-group form-group--full">
                <label class="form-label" for="resetPassword">Nueva contraseña temporal</label>
                <input id="resetPassword" class="input" type="text" formControlName="newTemporaryPassword"
                  placeholder="Mín. 6 caracteres" [class.input-error]="isResetInvalid('newTemporaryPassword')" />
                @if (isResetInvalid('newTemporaryPassword')) {
                  <span class="form-error">La contraseña debe tener entre 6 y 100 caracteres.</span>
                }
              </div>
              <div class="form-group form-group--full">
                <label class="form-label" for="resetConfirm">Confirmar contraseña</label>
                <input id="resetConfirm" class="input" type="text" formControlName="confirmTemporaryPassword"
                  placeholder="Repite la contraseña" [class.input-error]="isResetInvalid('confirmTemporaryPassword') || resetMismatch()" />
                @if (isResetInvalid('confirmTemporaryPassword')) {
                  <span class="form-error">Confirma la contraseña (entre 6 y 100 caracteres).</span>
                } @else if (resetMismatch()) {
                  <span class="form-error">La contraseña y su confirmación no coinciden.</span>
                }
              </div>
            </div>

            <div class="alert alert-info modal__note">
              <span class="material-icons">info</span>
              La contraseña temporal debe ser entregada al usuario. Deberá cambiarla al iniciar sesión.
            </div>

            @if (resetError()) {
              <div class="alert alert-danger modal__note">
                <span class="material-icons">error_outline</span>
                {{ resetError() }}
              </div>
            }

            <div class="modal__actions">
              <button type="button" class="btn btn-secondary" (click)="closeReset()" [disabled]="resetSaving()">Cancelar</button>
              <button type="submit" class="btn btn-primary" [disabled]="resetSaving()">
                {{ resetSaving() ? 'Restableciendo…' : 'Confirmar restablecimiento' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Modal: contraseña temporal establecida -->
    @if (resetResult(); as result) {
      <div class="modal-overlay" (click)="closeResetResult()">
        <div class="modal modal--confirm" (click)="$event.stopPropagation()">
          <div class="modal__success-icon"><span class="material-icons">key</span></div>
          <h2 class="modal__title">Contraseña restablecida</h2>
          <p class="modal__text">
            La contraseña temporal de <strong>{{ result.name }}</strong> se estableció correctamente.
            Entrégala personalmente al usuario:
          </p>
          <div class="temp-password">{{ result.password }}</div>
          <p class="modal__text">El usuario deberá cambiarla en su próximo ingreso.</p>
          <div class="modal__actions">
            <button type="button" class="btn btn-primary" (click)="closeResetResult()">Listo</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AdminUsersComponent {
  private readonly authService = inject(AuthService);
  private readonly adminService = inject(AdminService);
  private readonly userManagementService = inject(UserManagementService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly navItems: readonly SidebarNavItem[] = [
    { label: 'Inicio', icon: 'home', route: '/admin-dashboard' },
    { label: 'Gestión de docentes', icon: 'badge', route: '/admin/teachers' },
    { label: 'Usuarios y roles', icon: 'manage_accounts', route: '/admin/users' },
    { label: 'Contenidos químicos', icon: 'auto_stories', route: '/admin-dashboard/content', disabled: true },
    { label: 'Elementos químicos', icon: 'table_chart', route: '/periodic-table' },
    { label: 'Grupos químicos', icon: 'hub', route: '/admin-dashboard/groups', disabled: true },
    { label: 'Logs del sistema', icon: 'terminal', route: '/admin-dashboard/logs', disabled: true },
    { label: 'Estado del sistema', icon: 'monitor_heart', route: '/admin-dashboard/system', disabled: true },
  ];

  readonly userRole = 'Admin';

  readonly filterTabs: readonly FilterTab[] = [
    { id: 'all', label: 'Todos' },
    { id: 'ADMINISTRADOR', label: 'Administradores' },
    { id: 'DOCENTE', label: 'Docentes' },
    { id: 'ESTUDIANTE', label: 'Estudiantes' },
    { id: 'active', label: 'Activos' },
    { id: 'inactive', label: 'Inactivos' },
  ];

  // Datos
  readonly users = signal<AdminUser[]>([]);
  readonly summary = signal<AdminSummary | null>(null);
  readonly activity = signal<AdminActivity | null>(null);
  readonly loading = signal<boolean>(false);
  readonly activityLoading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Filtros y búsqueda
  readonly activeFilter = signal<UserFilter>('all');
  readonly searchTerm = signal<string>('');

  // Acciones
  readonly busyUserId = signal<number | null>(null);
  readonly deactivateTarget = signal<AdminUser | null>(null);

  // Registro de docente
  readonly formOpen = signal<boolean>(false);
  readonly saving = signal<boolean>(false);
  readonly formError = signal<string | null>(null);

  // Restablecimiento de contraseña
  readonly resetTarget = signal<AdminUser | null>(null);
  readonly resetSaving = signal<boolean>(false);
  readonly resetError = signal<string | null>(null);
  readonly resetResult = signal<{ name: string; password: string } | null>(null);

  private readonly currentUser = this.authService.currentUser;
  readonly userName = computed<string>(() => this.currentUser()?.username ?? 'Administrador');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  readonly form: FormGroup = this.fb.group({
    names: ['', [Validators.required, Validators.maxLength(100)]],
    lastNames: ['', [Validators.required, Validators.maxLength(100)]],
    username: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(50)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(100)]],
    temporaryPassword: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(100)]],
  });

  readonly resetForm: FormGroup = this.fb.group({
    newTemporaryPassword: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(100)]],
    confirmTemporaryPassword: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(100)]],
  });

  readonly metrics = computed<readonly MetricCard[]>(() => {
    const s = this.summary();
    const v = (n: number | undefined): number | string => (s ? n ?? 0 : '—');
    return [
      { id: 'total', label: 'Total usuarios', value: v(s?.totalUsers), icon: 'group' },
      { id: 'admins', label: 'Administradores', value: v(s?.totalAdmins), icon: 'admin_panel_settings' },
      { id: 'teachers', label: 'Docentes', value: v(s?.totalTeachers), icon: 'badge' },
      { id: 'students', label: 'Estudiantes', value: v(s?.totalStudents), icon: 'school' },
      { id: 'active', label: 'Activos', value: v(s?.activeUsers), icon: 'check_circle' },
      { id: 'inactive', label: 'Inactivos', value: v(s?.inactiveUsers), icon: 'do_not_disturb_on' },
      { id: 'concepts', label: 'Contenidos conceptuales', value: v(s?.totalConcepts), icon: 'auto_stories' },
      { id: 'evaluations', label: 'Evaluaciones', value: v(s?.totalEvaluations), icon: 'quiz' },
      { id: 'attempts', label: 'Intentos enviados', value: v(s?.submittedAttempts), icon: 'task_alt' },
    ];
  });

  readonly filteredUsers = computed<AdminUser[]>(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const filter = this.activeFilter();

    return this.users().filter((u) => {
      const matchesFilter =
        filter === 'all'
          ? true
          : filter === 'active'
            ? u.active
            : filter === 'inactive'
              ? !u.active
              : u.role === filter;

      const matchesTerm =
        term === '' ||
        u.fullName.toLowerCase().includes(term) ||
        u.username.toLowerCase().includes(term) ||
        (u.code ?? '').toLowerCase().includes(term) ||
        (u.email ?? '').toLowerCase().includes(term) ||
        this.roleLabel(u.role).toLowerCase().includes(term);

      return matchesFilter && matchesTerm;
    });
  });

  readonly hasActivity = computed<boolean>(() => {
    const a = this.activity();
    if (a === null) {
      return false;
    }
    return (
      a.recentUsers.length > 0 ||
      a.recentEvaluations.length > 0 ||
      a.recentConcepts.length > 0
    );
  });

  constructor() {
    this.loadAll();
  }

  loadAll(): void {
    this.loadUsers();
    this.loadSummary();
    this.loadActivity();
  }

  private loadUsers(): void {
    this.loading.set(true);
    this.error.set(null);
    this.adminService.listUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(this.extractError(err, 'Ocurrió un error al cargar los usuarios.'));
        this.loading.set(false);
      },
    });
  }

  private loadSummary(): void {
    this.adminService.getSummary().subscribe({
      next: (summary) => this.summary.set(summary),
      // Si falla, las métricas se muestran como «—»; el panel sigue siendo usable.
      error: () => this.summary.set(null),
    });
  }

  private loadActivity(): void {
    this.activityLoading.set(true);
    this.adminService.getActivity().subscribe({
      next: (activity) => {
        this.activity.set(activity);
        this.activityLoading.set(false);
      },
      error: () => {
        this.activity.set(null);
        this.activityLoading.set(false);
      },
    });
  }

  // ===================== Filtros / búsqueda =====================

  setFilter(filter: UserFilter): void {
    this.activeFilter.set(filter);
  }

  onSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  // ===================== Registro de docente =====================

  openCreate(): void {
    this.formError.set(null);
    this.form.reset({ names: '', lastNames: '', username: '', email: '', temporaryPassword: '' });
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
        this.loadAll();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.formError.set(this.extractError(err, 'No se pudo registrar el docente.'));
      },
    });
  }

  // ===================== Desactivar / reactivar =====================

  askDeactivate(user: AdminUser): void {
    this.formError.set(null);
    this.deactivateTarget.set(user);
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
    this.busyUserId.set(target.userId);
    this.formError.set(null);
    this.adminService.deactivateUser(target.userId).subscribe({
      next: () => {
        this.busyUserId.set(null);
        this.deactivateTarget.set(null);
        this.flashSuccess(`${target.fullName} fue desactivado.`);
        this.loadAll();
      },
      error: (err: unknown) => {
        this.busyUserId.set(null);
        this.formError.set(this.extractError(err, 'No se pudo desactivar el usuario.'));
      },
    });
  }

  reactivate(user: AdminUser): void {
    this.busyUserId.set(user.userId);
    this.adminService.activateUser(user.userId).subscribe({
      next: () => {
        this.busyUserId.set(null);
        this.flashSuccess(`${user.fullName} fue reactivado.`);
        this.loadAll();
      },
      error: (err: unknown) => {
        this.busyUserId.set(null);
        this.error.set(this.extractError(err, 'No se pudo reactivar el usuario.'));
      },
    });
  }

  // ===================== Restablecer contraseña =====================

  openReset(user: AdminUser): void {
    this.resetError.set(null);
    this.resetForm.reset({ newTemporaryPassword: '', confirmTemporaryPassword: '' });
    this.resetTarget.set(user);
  }

  closeReset(): void {
    this.resetTarget.set(null);
    this.resetError.set(null);
  }

  submitReset(): void {
    const target = this.resetTarget();
    if (target === null) {
      return;
    }
    if (this.resetForm.invalid || this.resetMismatch()) {
      this.resetForm.markAllAsTouched();
      return;
    }
    this.resetSaving.set(true);
    this.resetError.set(null);
    const raw = this.resetForm.getRawValue();
    const request: ResetPasswordRequest = {
      newTemporaryPassword: raw.newTemporaryPassword,
      confirmTemporaryPassword: raw.confirmTemporaryPassword,
    };
    this.userManagementService.resetTeacherPassword(target.userId, request).subscribe({
      next: () => {
        this.resetSaving.set(false);
        this.resetTarget.set(null);
        this.resetResult.set({ name: target.fullName, password: request.newTemporaryPassword });
        this.loadAll();
      },
      error: (err: unknown) => {
        this.resetSaving.set(false);
        this.resetError.set(this.extractError(err, 'No se pudo restablecer la contraseña.'));
      },
    });
  }

  closeResetResult(): void {
    this.resetResult.set(null);
  }

  isResetInvalid(controlName: string): boolean {
    const control = this.resetForm.controls[controlName];
    return control.invalid && (control.touched || control.dirty);
  }

  resetMismatch(): boolean {
    const pwd = this.resetForm.controls['newTemporaryPassword'];
    const confirm = this.resetForm.controls['confirmTemporaryPassword'];
    return confirm.value !== '' && pwd.value !== confirm.value && (confirm.touched || confirm.dirty);
  }

  // ===================== Utilidades =====================

  handleLogout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
  }

  isInvalid(controlName: string): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.touched || control.dirty);
  }

  isSelf(user: AdminUser): boolean {
    return this.currentUser()?.userId === user.userId;
  }

  roleLabel(role: UserRole): string {
    const labels: Record<UserRole, string> = {
      ADMINISTRADOR: 'Administrador',
      DOCENTE: 'Docente',
      ESTUDIANTE: 'Estudiante',
    };
    return labels[role] ?? role;
  }

  initials(name: string): string {
    return buildInitials(name);
  }

  formatDate(value: string | null): string {
    if (value === null) {
      return '—';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    return date.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
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
