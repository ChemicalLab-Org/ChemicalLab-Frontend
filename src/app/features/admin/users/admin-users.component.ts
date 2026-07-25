import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { AdminService } from '../../../core/services/admin.service';
import { SidebarComponent, SidebarNavItem } from '../../../shared/components/sidebar/sidebar.component';
import { ADMIN_NAV_ITEMS } from '../../../shared/components/sidebar/admin-nav';
import {
  AdminActivity,
  AdminSummary,
  AdminUser,
  ApiError,
  CreateUserRequest,
  TeacherOption,
  UpdateUserRequest,
  UserRole,
} from '../../../shared/models';
import {
  INSTITUTIONAL_IDENTIFIER_PATTERN,
  PERSON_NAME_PATTERN,
  normalizeInstitutionalIdentifier,
  normalizePersonName,
  normalizeStudentCode,
  sanitizeInstitutionalIdentifierInput,
  sanitizePersonNameInput,
} from '../../../shared/utils/institutional-input.util';

type UserFilter = 'all' | UserRole | 'active' | 'inactive';
type FormMode = 'create' | 'edit';

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

interface RoleOption {
  readonly id: UserRole;
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
            <span class="material-icons">person_add</span>
            Crear usuario
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
              <p class="empty-state__desc">Crea el primer usuario para comenzar.</p>
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
                          <button
                            type="button"
                            class="row-action"
                            title="Editar datos básicos"
                            aria-label="Editar datos básicos"
                            (click)="openEdit(u)"
                          >
                            <span class="material-icons">edit</span>
                          </button>

                          @if (!isProtected(u)) {
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

                          @if (isProtected(u)) {
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
                  <span class="material-icons">grading</span>
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

    <!-- Modal: crear / editar usuario -->
    @if (formOpen()) {
      <div class="modal-overlay" (click)="closeForm()">
        <div class="modal modal--form" (click)="$event.stopPropagation()">
          <header class="modal__header">
            <h2 class="modal__title">{{ formMode() === 'create' ? 'Crear usuario' : 'Editar usuario' }}</h2>
            <button type="button" class="modal__close" aria-label="Cerrar" (click)="closeForm()">
              <span class="material-icons">close</span>
            </button>
          </header>

          <form [formGroup]="form" (ngSubmit)="submitForm()" class="modal__body">
            <!-- Selector de rol (solo al crear) -->
            @if (formMode() === 'create') {
              <div class="form-group form-group--full">
                <label class="form-label">Rol</label>
                <div class="filter-tabs role-tabs">
                  @for (r of roleOptions; track r.id) {
                    <button
                      type="button"
                      class="filter-pill"
                      [class.filter-pill--active]="selectedRole() === r.id"
                      (click)="selectRole(r.id)"
                    >
                      {{ r.label }}
                    </button>
                  }
                </div>
              </div>
            } @else {
              <div class="form-group form-group--full">
                <label class="form-label">Rol</label>
                <div><span class="role-badge" [attr.data-role]="selectedRole()">{{ roleLabel(selectedRole()) }}</span></div>
                <span class="form-hint">El rol no se modifica en la edición.</span>
              </div>
            }

            <div class="form-grid">
              <!-- Nombres / apellidos: docente y estudiante -->
              @if (showNames()) {
                <div class="form-group">
                  <label class="form-label" for="names">Nombres</label>
                  <input id="names" class="input" formControlName="names" placeholder="ej. Pedro"
                    maxlength="100" (input)="onPersonNameInput($event, 'names')"
                    [class.input-error]="isInvalid('names')" />
                  @if (isInvalid('names')) {
                    <span class="form-error">Usa solo letras, espacios, apóstrofes o guiones (máx. 100).</span>
                  }
                </div>
                <div class="form-group">
                  <label class="form-label" for="lastNames">Apellidos</label>
                  <input id="lastNames" class="input" formControlName="lastNames" placeholder="ej. Martínez"
                    maxlength="100" (input)="onPersonNameInput($event, 'lastNames')"
                    [class.input-error]="isInvalid('lastNames')" />
                  @if (isInvalid('lastNames')) {
                    <span class="form-error">Usa solo letras, espacios, apóstrofes o guiones (máx. 100).</span>
                  }
                </div>
              }

              <!-- Usuario: administrador y docente, solo al crear (es inmutable) -->
              @if (showUsername()) {
                <div class="form-group form-group--full">
                  <label class="form-label" for="username">Usuario</label>
                  <input id="username" class="input text-mono" formControlName="username" placeholder="ej. pedromartinez"
                    minlength="4" maxlength="50" (input)="onInstitutionalIdInput($event, 'username')"
                    [class.input-error]="isInvalid('username')" />
                  @if (isInvalid('username')) {
                    <span class="form-error">Usa entre 4 y 50 letras o números, sin espacios ni símbolos.</span>
                  } @else {
                    <span class="form-hint">Se usará para iniciar sesión.</span>
                  }
                </div>
              }

              <!-- Correo: administrador y docente -->
              @if (showEmail()) {
                <div class="form-group form-group--full">
                  <label class="form-label" for="email">Correo (opcional)</label>
                  <input id="email" class="input" type="email" formControlName="email"
                    placeholder="ej. pedro.martinez@correo.com" [class.input-error]="isInvalid('email')" />
                  @if (isInvalid('email')) {
                    <span class="form-error">Ingresa un correo con formato válido (máx. 100 caracteres).</span>
                  }
                </div>
              }

              <!-- Campos de estudiante -->
              @if (selectedRole() === 'ESTUDIANTE') {
                @if (formMode() === 'create') {
                  <div class="form-group form-group--full">
                    <label class="form-label" for="studentCode">Código de estudiante (opcional)</label>
                    <input id="studentCode" class="input text-mono" formControlName="studentCode"
                      minlength="4" maxlength="20" (input)="onInstitutionalIdInput($event, 'studentCode')"
                      placeholder="Se genera automáticamente si lo dejas vacío" [class.input-error]="isInvalid('studentCode')" />
                    @if (isInvalid('studentCode')) {
                      <span class="form-error">Usa entre 4 y 20 letras o números, sin espacios ni símbolos.</span>
                    } @else {
                      <span class="form-hint">También será su usuario de inicio de sesión.</span>
                    }
                  </div>
                }
                <div class="form-group">
                  <label class="form-label" for="grade">Grado</label>
                  <select id="grade" class="select" formControlName="grade"
                    [class.input-error]="isInvalid('grade')">
                    <option value="" disabled>Selecciona…</option>
                    @for (g of gradeOptions; track g) {
                      <option [value]="g">{{ g }}° de secundaria</option>
                    }
                  </select>
                  @if (isInvalid('grade')) {
                    <span class="form-error">Selecciona un grado del 1 al 5.</span>
                  }
                </div>
                <div class="form-group">
                  <label class="form-label" for="section">Sección</label>
                  <input id="section" class="input text-mono" formControlName="section" placeholder="ej. A"
                    maxlength="1" autocapitalize="characters" (input)="onSectionInput($event)"
                    [class.input-error]="isInvalid('section')" />
                  @if (isInvalid('section')) {
                    <span class="form-error">La sección debe ser una sola letra (A-Z).</span>
                  } @else {
                    <span class="form-hint">Una sola letra; se guarda en mayúscula.</span>
                  }
                </div>
                <div class="form-group form-group--full">
                  <label class="form-label" for="teacherUserId">Docente responsable</label>
                  <select id="teacherUserId" class="select" formControlName="teacherUserId"
                    [class.input-error]="isInvalid('teacherUserId')">
                    <option [ngValue]="null" disabled>Selecciona un docente…</option>
                    @for (t of teacherOptions(); track t.userId) {
                      <option [ngValue]="t.userId">{{ t.fullName }} ({{ t.username }})</option>
                    }
                  </select>
                  @if (teacherOptions().length === 0) {
                    <span class="form-hint">No hay docentes activos. Crea o activa un docente primero.</span>
                  } @else if (isInvalid('teacherUserId')) {
                    <span class="form-error">Selecciona un docente responsable activo.</span>
                  }
                </div>
              }
            </div>

            @if (formMode() === 'create') {
              <div class="alert alert-info modal__note">
                <span class="material-icons">info</span>
                Se generará una contraseña temporal que verás una sola vez. El usuario deberá
                cambiarla en su primer ingreso.
              </div>
            } @else {
              <div class="alert alert-info modal__note">
                <span class="material-icons">info</span>
                La edición no cambia la contraseña ni el usuario/código. Usa «Restablecer contraseña»
                para generar una nueva.
              </div>
            }

            @if (formError()) {
              <div class="alert alert-danger modal__note">
                <span class="material-icons">error_outline</span>
                {{ formError() }}
              </div>
            }

            <div class="modal__actions">
              <button type="button" class="btn btn-secondary" (click)="closeForm()" [disabled]="saving()">Cancelar</button>
              <button type="submit" class="btn btn-primary" [disabled]="saving()">
                {{ saving() ? 'Guardando…' : (formMode() === 'create' ? 'Crear usuario' : 'Guardar cambios') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Modal: confirmar creación de administrador (acción sensible) -->
    @if (adminConfirmOpen()) {
      <div class="modal-overlay" (click)="cancelAdminConfirm()">
        <div class="modal modal--confirm" (click)="$event.stopPropagation()">
          <div class="modal__warn-icon"><span class="material-icons">admin_panel_settings</span></div>
          <h2 class="modal__title">¿Crear un nuevo administrador?</h2>
          <p class="modal__text">
            Los administradores tienen acceso total a la gestión de usuarios y del sistema.
            Asegúrate de que esta persona deba tener ese nivel de acceso.
          </p>
          <div class="modal__actions">
            <button type="button" class="btn btn-secondary" (click)="cancelAdminConfirm()" [disabled]="saving()">Cancelar</button>
            <button type="button" class="btn btn-primary" (click)="confirmAdminCreate()" [disabled]="saving()">
              {{ saving() ? 'Creando…' : 'Crear administrador' }}
            </button>
          </div>
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

    <!-- Modal: confirmar restablecimiento de contraseña -->
    @if (resetTarget(); as target) {
      <div class="modal-overlay" (click)="closeReset()">
        <div class="modal modal--confirm" (click)="$event.stopPropagation()">
          <div class="modal__key-icon"><span class="material-icons">lock_reset</span></div>
          <h2 class="modal__title">¿Restablecer la contraseña de {{ target.fullName }}?</h2>
          <p class="modal__text">
            Se generará una contraseña temporal para
            <strong>{{ target.code ?? target.username }}</strong> ({{ roleLabel(target.role) }}).
            El usuario deberá cambiarla en su próximo ingreso. No depende de que tenga correo registrado.
          </p>
          @if (resetError()) {
            <div class="alert alert-danger modal__note">
              <span class="material-icons">error_outline</span>
              {{ resetError() }}
            </div>
          }
          <div class="modal__actions">
            <button type="button" class="btn btn-secondary" (click)="closeReset()" [disabled]="resetSaving()">Cancelar</button>
            <button type="button" class="btn btn-primary" (click)="confirmReset()" [disabled]="resetSaving()">
              {{ resetSaving() ? 'Restableciendo…' : 'Generar contraseña temporal' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Modal: contraseña temporal generada (creación o reset) -->
    @if (tempPasswordResult(); as result) {
      <div class="modal-overlay" (click)="closeTempPasswordResult()">
        <div class="modal modal--confirm" (click)="$event.stopPropagation()">
          <div class="modal__success-icon"><span class="material-icons">key</span></div>
          <h2 class="modal__title">{{ result.title }}</h2>
          <p class="modal__text">
            La contraseña temporal de <strong>{{ result.name }}</strong> se generó correctamente.
            Entrégala personalmente al usuario:
          </p>
          <div class="temp-password">{{ result.password }}</div>
          <p class="modal__text">El usuario deberá cambiarla en su próximo ingreso.</p>
          <div class="modal__actions">
            <button type="button" class="btn btn-primary" (click)="closeTempPasswordResult()">Listo</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AdminUsersComponent {
  private readonly authService = inject(AuthService);
  private readonly adminService = inject(AdminService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly navItems: readonly SidebarNavItem[] = ADMIN_NAV_ITEMS;

  readonly userRole = 'Admin';

  readonly filterTabs: readonly FilterTab[] = [
    { id: 'all', label: 'Todos' },
    { id: 'ADMINISTRADOR', label: 'Administradores' },
    { id: 'DOCENTE', label: 'Docentes' },
    { id: 'ESTUDIANTE', label: 'Estudiantes' },
    { id: 'active', label: 'Activos' },
    { id: 'inactive', label: 'Inactivos' },
  ];

  readonly roleOptions: readonly RoleOption[] = [
    { id: 'DOCENTE', label: 'Docente' },
    { id: 'ESTUDIANTE', label: 'Estudiante' },
    { id: 'ADMINISTRADOR', label: 'Administrador' },
  ];

  /** Grados válidos para estudiantes (1 a 5), alineados con la validación del backend. */
  readonly gradeOptions: readonly string[] = ['1', '2', '3', '4', '5'];

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

  // Formulario crear/editar
  readonly formOpen = signal<boolean>(false);
  readonly formMode = signal<FormMode>('create');
  readonly editingUser = signal<AdminUser | null>(null);
  readonly selectedRole = signal<UserRole>('DOCENTE');
  readonly saving = signal<boolean>(false);
  readonly formError = signal<string | null>(null);
  readonly teacherOptions = signal<TeacherOption[]>([]);
  readonly adminConfirmOpen = signal<boolean>(false);

  // Restablecimiento de contraseña
  readonly resetTarget = signal<AdminUser | null>(null);
  readonly resetSaving = signal<boolean>(false);
  readonly resetError = signal<string | null>(null);

  // Modal de contraseña temporal generada (creación o reset)
  readonly tempPasswordResult = signal<{ title: string; name: string; password: string } | null>(null);

  private readonly currentUser = this.authService.currentUser;
  readonly userName = computed<string>(() => this.currentUser()?.username ?? 'Administrador');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  readonly form: FormGroup = this.fb.group({
    role: ['DOCENTE' as UserRole, [Validators.required]],
    names: ['', [Validators.maxLength(100)]],
    lastNames: ['', [Validators.maxLength(100)]],
    username: ['', [Validators.maxLength(50)]],
    email: ['', [Validators.email, Validators.maxLength(100)]],
    studentCode: ['', [Validators.maxLength(20)]],
    grade: ['', [Validators.maxLength(20)]],
    section: ['', [Validators.maxLength(20)]],
    teacherUserId: [null as number | null],
  });

  // Visibilidad de campos según rol y modo
  readonly showNames = computed<boolean>(() => this.selectedRole() !== 'ADMINISTRADOR');
  readonly showUsername = computed<boolean>(
    () => this.formMode() === 'create' && this.selectedRole() !== 'ESTUDIANTE'
  );
  readonly showEmail = computed<boolean>(() => this.selectedRole() !== 'ESTUDIANTE');

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
      { id: 'evaluations', label: 'Evaluaciones', value: v(s?.totalEvaluations), icon: 'grading' },
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

  private loadTeacherOptions(): void {
    this.adminService.getTeacherOptions().subscribe({
      next: (options) => this.teacherOptions.set(options),
      error: () => this.teacherOptions.set([]),
    });
  }

  // ===================== Filtros / búsqueda =====================

  setFilter(filter: UserFilter): void {
    this.activeFilter.set(filter);
  }

  onSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  /** Normaliza la sección a una sola letra en mayúscula mientras el usuario escribe. */
  onSectionInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const normalized = input.value.toUpperCase().slice(0, 1);
    if (input.value !== normalized) {
      input.value = normalized;
    }
    this.form.controls['section'].setValue(normalized);
  }

  onPersonNameInput(event: Event, controlName: 'names' | 'lastNames'): void {
    this.applySanitizedValue(event, controlName, sanitizePersonNameInput);
  }

  onInstitutionalIdInput(event: Event, controlName: 'username' | 'studentCode'): void {
    this.applySanitizedValue(event, controlName, sanitizeInstitutionalIdentifierInput);
  }

  // ===================== Crear / editar usuario =====================

  openCreate(): void {
    this.formMode.set('create');
    this.editingUser.set(null);
    this.selectedRole.set('DOCENTE');
    this.formError.set(null);
    this.form.reset({
      role: 'DOCENTE',
      names: '',
      lastNames: '',
      username: '',
      email: '',
      studentCode: '',
      grade: '',
      section: '',
      teacherUserId: null,
    });
    this.configureValidators('DOCENTE', 'create');
    this.loadTeacherOptions();
    this.formOpen.set(true);
  }

  openEdit(user: AdminUser): void {
    this.formMode.set('edit');
    this.editingUser.set(user);
    this.selectedRole.set(user.role);
    this.formError.set(null);
    this.form.reset({
      role: user.role,
      names: user.names ?? '',
      lastNames: user.lastNames ?? '',
      username: user.username,
      email: user.email ?? '',
      studentCode: user.code ?? '',
      grade: user.grade ?? '',
      section: user.section ?? '',
      teacherUserId: user.teacherUserId ?? null,
    });
    this.configureValidators(user.role, 'edit');
    if (user.role === 'ESTUDIANTE') {
      this.loadTeacherOptions();
    }
    this.formOpen.set(true);
  }

  selectRole(role: UserRole): void {
    if (this.formMode() !== 'create') {
      return;
    }
    this.selectedRole.set(role);
    this.form.controls['role'].setValue(role);
    this.configureValidators(role, 'create');
    if (role === 'ESTUDIANTE') {
      this.loadTeacherOptions();
    }
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.adminConfirmOpen.set(false);
    this.formError.set(null);
  }

  submitForm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    // Confirmación adicional para una acción sensible: crear un administrador.
    if (this.formMode() === 'create' && this.selectedRole() === 'ADMINISTRADOR') {
      this.adminConfirmOpen.set(true);
      return;
    }
    this.persist();
  }

  confirmAdminCreate(): void {
    this.persist();
  }

  cancelAdminConfirm(): void {
    if (this.saving()) {
      return;
    }
    this.adminConfirmOpen.set(false);
  }

  private persist(): void {
    if (this.formMode() === 'create') {
      this.performCreate();
    } else {
      this.performUpdate();
    }
  }

  private performCreate(): void {
    this.saving.set(true);
    this.formError.set(null);
    const request = this.buildCreateRequest();
    this.adminService.createUser(request).subscribe({
      next: (response) => {
        this.saving.set(false);
        this.adminConfirmOpen.set(false);
        this.formOpen.set(false);
        this.flashSuccess(`${this.roleLabel(request.role)} creado correctamente.`);
        this.tempPasswordResult.set({
          title: 'Usuario creado',
          name: response.user.fullName,
          password: response.temporaryPassword,
        });
        this.loadAll();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.adminConfirmOpen.set(false);
        this.formError.set(this.extractError(err, 'No se pudo crear el usuario.'));
      },
    });
  }

  private performUpdate(): void {
    const user = this.editingUser();
    if (user === null) {
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    const request = this.buildUpdateRequest(user.role);
    this.adminService.updateUser(user.userId, request).subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.flashSuccess('Datos actualizados correctamente.');
        this.loadAll();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.formError.set(this.extractError(err, 'No se pudieron actualizar los datos.'));
      },
    });
  }

  private buildCreateRequest(): CreateUserRequest {
    const v = this.form.getRawValue();
    const role = v.role as UserRole;
    if (role === 'ADMINISTRADOR') {
      return {
        role,
        username: normalizeInstitutionalIdentifier(v.username ?? ''),
        email: trimToUndefined(v.email),
      };
    }
    if (role === 'DOCENTE') {
      return {
        role,
        names: normalizePersonName(v.names ?? ''),
        lastNames: normalizePersonName(v.lastNames ?? ''),
        username: normalizeInstitutionalIdentifier(v.username ?? ''),
        email: trimToUndefined(v.email),
      };
    }
    return {
      role,
      names: normalizePersonName(v.names ?? ''),
      lastNames: normalizePersonName(v.lastNames ?? ''),
      grade: (v.grade ?? '').trim(),
      section: (v.section ?? '').trim().toUpperCase(),
      studentCode: trimToUndefined(normalizeStudentCode(v.studentCode ?? '')),
      teacherUserId: v.teacherUserId ?? undefined,
    };
  }

  private buildUpdateRequest(role: UserRole): UpdateUserRequest {
    const v = this.form.getRawValue();
    if (role === 'ADMINISTRADOR') {
      return { email: trimToUndefined(v.email) };
    }
    if (role === 'DOCENTE') {
      return {
        names: normalizePersonName(v.names ?? ''),
        lastNames: normalizePersonName(v.lastNames ?? ''),
        email: trimToUndefined(v.email),
      };
    }
    return {
      names: normalizePersonName(v.names ?? ''),
      lastNames: normalizePersonName(v.lastNames ?? ''),
      grade: (v.grade ?? '').trim(),
      section: (v.section ?? '').trim().toUpperCase(),
      teacherUserId: v.teacherUserId ?? undefined,
    };
  }

  /** Ajusta los validadores requeridos según el rol y el modo (crear/editar). */
  private configureValidators(role: UserRole, mode: FormMode): void {
    const required: Record<string, ValidatorFn[]> = {
      names: [Validators.maxLength(100), Validators.pattern(PERSON_NAME_PATTERN)],
      lastNames: [Validators.maxLength(100), Validators.pattern(PERSON_NAME_PATTERN)],
      username: [Validators.maxLength(50), Validators.pattern(INSTITUTIONAL_IDENTIFIER_PATTERN)],
      email: [Validators.email, Validators.maxLength(100)],
      studentCode: [
        Validators.minLength(4),
        Validators.maxLength(20),
        Validators.pattern(INSTITUTIONAL_IDENTIFIER_PATTERN),
      ],
      grade: [Validators.maxLength(20)],
      section: [Validators.maxLength(20)],
      teacherUserId: [],
    };

    if (role === 'ADMINISTRADOR') {
      if (mode === 'create') {
        required['username'] = [
          Validators.required,
          Validators.minLength(4),
          Validators.maxLength(50),
          Validators.pattern(INSTITUTIONAL_IDENTIFIER_PATTERN),
        ];
      }
    } else if (role === 'DOCENTE') {
      required['names'] = [
        Validators.required,
        Validators.maxLength(100),
        Validators.pattern(PERSON_NAME_PATTERN),
      ];
      required['lastNames'] = [
        Validators.required,
        Validators.maxLength(100),
        Validators.pattern(PERSON_NAME_PATTERN),
      ];
      if (mode === 'create') {
        required['username'] = [
          Validators.required,
          Validators.minLength(4),
          Validators.maxLength(50),
          Validators.pattern(INSTITUTIONAL_IDENTIFIER_PATTERN),
        ];
      }
    } else {
      required['names'] = [
        Validators.required,
        Validators.maxLength(100),
        Validators.pattern(PERSON_NAME_PATTERN),
      ];
      required['lastNames'] = [
        Validators.required,
        Validators.maxLength(100),
        Validators.pattern(PERSON_NAME_PATTERN),
      ];
      // Grado: entero del 1 al 5. Sección: exactamente una letra (A-Z).
      required['grade'] = [Validators.required, Validators.pattern(/^[1-5]$/)];
      required['section'] = [Validators.required, Validators.pattern(/^[A-Za-z]$/)];
      required['teacherUserId'] = [Validators.required];
    }

    for (const [name, validators] of Object.entries(required)) {
      const control = this.form.controls[name] as AbstractControl;
      control.setValidators(validators);
      control.updateValueAndValidity({ emitEvent: false });
    }
  }

  private applySanitizedValue(
    event: Event,
    controlName: 'names' | 'lastNames' | 'username' | 'studentCode',
    sanitizer: (value: string) => string
  ): void {
    const input = event.target as HTMLInputElement;
    const sanitized = sanitizer(input.value);
    if (sanitized === input.value) {
      return;
    }
    input.value = sanitized;
    this.form.controls[controlName].setValue(sanitized);
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
    this.resetTarget.set(user);
  }

  closeReset(): void {
    this.resetTarget.set(null);
    this.resetError.set(null);
  }

  confirmReset(): void {
    const target = this.resetTarget();
    if (target === null) {
      return;
    }
    this.resetSaving.set(true);
    this.resetError.set(null);
    // El backend genera la contraseña temporal y la devuelve una sola vez.
    this.adminService.resetUserPassword(target.userId).subscribe({
      next: (response) => {
        this.resetSaving.set(false);
        this.resetTarget.set(null);
        this.tempPasswordResult.set({
          title: 'Contraseña restablecida',
          name: target.fullName,
          password: response.temporaryPassword,
        });
        this.loadAll();
      },
      error: (err: unknown) => {
        this.resetSaving.set(false);
        this.resetError.set(this.extractError(err, 'No se pudo restablecer la contraseña.'));
      },
    });
  }

  closeTempPasswordResult(): void {
    this.tempPasswordResult.set(null);
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

  /** Cuenta protegida: la marca el backend (propio admin) con respaldo en el usuario autenticado. */
  isProtected(user: AdminUser): boolean {
    return user.protectedAccount || this.isSelf(user);
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

/** Convierte un texto en su versión recortada o `undefined` si queda vacío. */
function trimToUndefined(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
