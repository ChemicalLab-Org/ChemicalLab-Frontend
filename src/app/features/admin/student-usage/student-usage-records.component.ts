import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { StudentUsageService } from '../../../core/services/student-usage.service';
import { SidebarComponent, SidebarNavItem } from '../../../shared/components/sidebar/sidebar.component';
import { ADMIN_NAV_ITEMS } from '../../../shared/components/sidebar/admin-nav';
import {
  AuthResponse,
  StudentUsageDetailResponse,
  StudentUsageFilters,
  StudentUsageRecord,
  StudentUsageRecordsResponse,
  USAGE_EVENT_TYPE_LABELS,
  USAGE_MODULE_LABELS,
  USAGE_ROLE_LABELS,
  UsageEventType,
  UsageModule,
  UserRole,
} from '../../../shared/models';

const NOT_AVAILABLE = 'No disponible';

/**
 * Registro de uso por estudiante (Instrumento 3: «Ficha de registro automático de uso del
 * sistema ChemicalLab»). Panel administrativo, separado de «Métricas de uso», que
 * consolida por usuario los indicadores del instrumento: sesiones, módulos visitados,
 * actividades asignadas/completadas, avance, intentos, aciertos/errores, tasa de acierto,
 * retroalimentaciones e incidencias técnicas.
 *
 * <p>El tiempo total de uso es una estimación con regla declarada (sesiones de actividad
 * registrada con corte de inactividad de 30 minutos, calculadas en el backend) y se
 * presenta con «≈» y tooltip explicativo. Los indicadores que no pueden calcularse con
 * datos reales llegan como null y se muestran como «No disponible»: nunca se presentan
 * valores inventados.</p>
 */
@Component({
  selector: 'app-admin-student-usage-records',
  standalone: true,
  imports: [FormsModule, SidebarComponent],
  styleUrls: ['./student-usage-records.component.scss'],
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
        <header class="main__header">
          <div>
            <h1 class="main__title">Registro de uso por estudiante</h1>
            <p class="main__subtitle">
              Indicadores consolidados del uso de ChemicalLab según la ficha de registro
              automático del sistema. Cada fila resume la actividad real de un usuario;
              lo que aún no se mide aparece como «No disponible».
            </p>
          </div>
          <button type="button" class="btn-refresh" (click)="reload()" [disabled]="loading()">
            <span class="material-icons">{{ loading() ? 'hourglass_empty' : 'refresh' }}</span>
            {{ loading() ? 'Cargando…' : 'Actualizar' }}
          </button>
        </header>

        <!-- Filtros -->
        <section class="filters">
          <div class="filters__row">
            <div class="field">
              <label class="field__label">Tipo de usuario</label>
              <select class="field__control" [ngModel]="roleFilter()" (ngModelChange)="roleFilter.set($event)">
                <option value="">Todos</option>
                <option value="ESTUDIANTE">Estudiante</option>
                <option value="DOCENTE">Docente</option>
                <option value="ADMINISTRADOR">Administrador</option>
              </select>
            </div>
            <div class="field field--wide">
              <label class="field__label">Buscar</label>
              <input
                class="field__control"
                type="text"
                placeholder="Nombre, usuario o código"
                [ngModel]="searchFilter()"
                (ngModelChange)="searchFilter.set($event)"
                (keyup.enter)="applyFilters()"
              />
            </div>
            <div class="field field--compact">
              <label class="field__label">Grado</label>
              <select class="field__control" [ngModel]="gradeFilter()" (ngModelChange)="gradeFilter.set($event)">
                <option value="">Todos</option>
                @for (g of gradeOptions; track g) {
                  <option [value]="g">{{ g }}°</option>
                }
              </select>
            </div>
            <div class="field field--compact">
              <label class="field__label">Sección</label>
              <select class="field__control" [ngModel]="sectionFilter()" (ngModelChange)="sectionFilter.set($event)">
                <option value="">Todas</option>
                @for (s of sectionOptions; track s) {
                  <option [value]="s">{{ s }}</option>
                }
              </select>
            </div>
            <div class="field field--compact">
              <label class="field__label">Desde</label>
              <input class="field__control" type="date" [ngModel]="fromFilter()" (ngModelChange)="fromFilter.set($event)" />
            </div>
            <div class="field field--compact">
              <label class="field__label">Hasta</label>
              <input class="field__control" type="date" [ngModel]="toFilter()" (ngModelChange)="toFilter.set($event)" />
            </div>
            <div class="field">
              <label class="field__label">Módulo</label>
              <select class="field__control" [ngModel]="moduleFilter()" (ngModelChange)="moduleFilter.set($event)">
                <option value="">Todos</option>
                @for (m of moduleOptions; track m) {
                  <option [value]="m">{{ moduleLabel(m) }}</option>
                }
              </select>
            </div>
          </div>
          <div class="filters__row filters__row--footer">
            <label class="check">
              <input
                type="checkbox"
                [ngModel]="onlyWithActivity()"
                (ngModelChange)="onlyWithActivity.set($event)"
              />
              Solo estudiantes con actividad
            </label>
            <div class="filters__actions">
              @if (dateRangeInvalid()) {
                <span class="filters__warning">
                  <span class="material-icons">warning</span>
                  La fecha «desde» no puede ser posterior a «hasta».
                </span>
              }
              <button type="button" class="btn btn--primary" (click)="applyFilters()" [disabled]="dateRangeInvalid()">
                <span class="material-icons">search</span> Aplicar
              </button>
              <button type="button" class="btn btn--ghost" (click)="clearFilters()" [disabled]="!hasActiveFilters()">
                Limpiar
              </button>
            </div>
          </div>
        </section>

        @if (loading()) {
          <div class="state state--loading">
            <span class="material-icons spin">progress_activity</span>
            <p>Cargando el registro de uso…</p>
          </div>
        } @else if (error()) {
          <div class="state state--error">
            <span class="material-icons">error_outline</span>
            <p>{{ error() }}</p>
            <button type="button" class="btn btn--primary" (click)="reload()">Reintentar</button>
          </div>
        } @else if (data(); as d) {
          <!-- Cards resumen -->
          <section class="summary-grid">
            <div class="summary-card">
              <div class="summary-card__icon summary-card__icon--info">
                <span class="material-icons">group</span>
              </div>
              <div class="summary-card__value">{{ d.summary.totalUsers }}</div>
              <div class="summary-card__label">Usuarios encontrados</div>
            </div>
            <div class="summary-card">
              <div class="summary-card__icon summary-card__icon--info">
                <span class="material-icons">school</span>
              </div>
              <div class="summary-card__value">{{ d.summary.studentsWithActivity }}</div>
              <div class="summary-card__label">Estudiantes con actividad</div>
            </div>
            <div class="summary-card">
              <div class="summary-card__icon summary-card__icon--neutral">
                <span class="material-icons">trending_up</span>
              </div>
              <div class="summary-card__value" [class.summary-card__value--muted]="d.summary.averageProgress === null">
                {{ formatPercent(d.summary.averageProgress) }}
              </div>
              <div class="summary-card__label">Promedio de avance</div>
            </div>
            <div class="summary-card">
              <div class="summary-card__icon summary-card__icon--neutral">
                <span class="material-icons">task_alt</span>
              </div>
              <div class="summary-card__value" [class.summary-card__value--muted]="d.summary.averageAccuracy === null">
                {{ formatPercent(d.summary.averageAccuracy) }}
              </div>
              <div class="summary-card__label">Promedio tasa de acierto</div>
            </div>
            <div class="summary-card">
              <div class="summary-card__icon summary-card__icon--info">
                <span class="material-icons">login</span>
              </div>
              <div class="summary-card__value">{{ d.summary.totalSessionsStarted }}</div>
              <div class="summary-card__label">Sesiones iniciadas</div>
            </div>
            <div class="summary-card">
              <div class="summary-card__icon summary-card__icon--neutral">
                <span class="material-icons">grid_view</span>
              </div>
              <div class="summary-card__value" [class.summary-card__value--muted]="d.summary.topModule === null">
                {{ d.summary.topModule !== null ? moduleLabel(d.summary.topModule) : 'Sin registros' }}
              </div>
              <div class="summary-card__label">Módulo más visitado</div>
            </div>
          </section>

          <!-- Tabla consolidada -->
          @if (d.records.length === 0) {
            <div class="state state--empty">
              <span class="material-icons">inbox</span>
              <p>No se encontraron usuarios con los filtros seleccionados.</p>
              @if (hasActiveFilters()) {
                <button type="button" class="btn btn--ghost" (click)="clearFilters()">Limpiar filtros</button>
              }
            </div>
          } @else {
            <section class="table-wrap">
              <table class="records-table">
                <thead>
                  <tr>
                    <th class="sticky-col">Código / usuario</th>
                    <th>Nombre</th>
                    <th>Rol</th>
                    <th>Grado/sección</th>
                    <th class="num">Sesiones</th>
                    <th>Tiempo total</th>
                    <th class="num">Módulos</th>
                    <th class="num">Asignadas</th>
                    <th class="num">Completadas</th>
                    <th class="num">Avance</th>
                    <th class="num">Intentos</th>
                    <th class="num">Aciertos</th>
                    <th class="num">Errores</th>
                    <th class="num">Tasa acierto</th>
                    <th class="num">Retroalim.</th>
                    <th class="num">Incidencias</th>
                    <th>Última actividad</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of d.records; track r.userId) {
                    <tr>
                      <td class="sticky-col mono">{{ r.code ?? r.username }}</td>
                      <td class="name-cell">{{ r.fullName ?? r.username }}</td>
                      <td><span [class]="roleChipClass(r.role)">{{ roleLabel(r.role) }}</span></td>
                      <td>{{ formatGradeSection(r) }}</td>
                      <td class="num">{{ formatCount(r.sessionsStarted) }}</td>
                      <td class="num" [title]="usageTimeHint">
                        @if (r.totalUsageMinutes !== null) {
                          {{ formatMinutes(r.totalUsageMinutes) }}
                        } @else {
                          <span class="na-chip">No disponible</span>
                        }
                      </td>
                      <td class="num" [title]="visitedModulesTitle(r)">{{ formatCount(r.visitedModulesCount) }}</td>
                      <td class="num">{{ formatCount(r.assignedActivities) }}</td>
                      <td class="num">{{ formatCount(r.completedActivities) }}</td>
                      <td class="num">{{ formatPercent(r.progressPercentage) }}</td>
                      <td class="num">{{ formatCount(r.attemptsCount) }}</td>
                      <td class="num">{{ formatCount(r.correctAnswers) }}</td>
                      <td class="num">{{ formatCount(r.incorrectAnswers) }}</td>
                      <td class="num">{{ formatPercent(r.accuracyRate) }}</td>
                      <td class="num">{{ formatCount(r.feedbackReceived) }}</td>
                      <td class="num" [title]="r.technicalIncidentsSummary ?? 'Sin registros'">
                        {{ formatIncidents(r) }}
                      </td>
                      <td class="mono">{{ formatDate(r.lastActivityAt) }}</td>
                      <td>
                        <button type="button" class="btn btn--ghost btn--small" (click)="openDetail(r)">
                          <span class="material-icons">visibility</span> Ver detalle
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </section>
            <p class="table-note">
              El tiempo total es un valor estimado (por eso el símbolo ≈): se agrupan los
              momentos de actividad registrados en sesiones con un corte de inactividad de
              30 minutos y se suman sus duraciones. Es una estimación conservadora: el
              tiempo de lectura sin interacción no genera eventos y no se cuenta.
            </p>
          }
        }
      </main>
    </div>

    <!-- Modal de detalle por usuario -->
    @if (detailOpen()) {
      <div class="modal-overlay" (click)="closeDetail()">
        <div class="modal modal--detail" (click)="$event.stopPropagation()">
          <header class="modal__header">
            <div>
              <h2 class="modal__title">
                {{ detail()?.summary?.fullName ?? detail()?.summary?.username ?? 'Detalle de uso' }}
              </h2>
              @if (detail(); as det) {
                <p class="modal__subtitle">
                  <span [class]="roleChipClass(det.summary.role)">{{ roleLabel(det.summary.role) }}</span>
                  @if (det.summary.code) {
                    <span class="mono">{{ det.summary.code }}</span>
                  }
                  @if (det.summary.grade) {
                    <span>{{ det.summary.grade }}° {{ det.summary.section }}</span>
                  }
                </p>
              }
            </div>
            <button type="button" class="modal__close" aria-label="Cerrar" (click)="closeDetail()">
              <span class="material-icons">close</span>
            </button>
          </header>

          <div class="modal__body">
            @if (detailLoading()) {
              <div class="state state--loading state--compact">
                <span class="material-icons spin">progress_activity</span>
                <p>Cargando el detalle…</p>
              </div>
            } @else if (detailError()) {
              <div class="state state--error state--compact">
                <span class="material-icons">error_outline</span>
                <p>{{ detailError() }}</p>
              </div>
            } @else if (detail(); as det) {
              <!-- Indicadores principales -->
              <div class="mini-grid">
                <div class="mini-card">
                  <div class="mini-card__value">{{ formatCount(det.summary.sessionsStarted) }}</div>
                  <div class="mini-card__label">Sesiones iniciadas</div>
                </div>
                <div class="mini-card" [title]="usageTimeHint">
                  <div class="mini-card__value" [class.mini-card__value--muted]="det.summary.totalUsageMinutes === null">
                    {{ formatMinutes(det.summary.totalUsageMinutes) }}
                  </div>
                  <div class="mini-card__label">Tiempo estimado de uso</div>
                </div>
                <div class="mini-card">
                  <div class="mini-card__value">{{ formatCount(det.summary.visitedModulesCount) }}</div>
                  <div class="mini-card__label">Módulos visitados</div>
                </div>
                <div class="mini-card">
                  <div class="mini-card__value">{{ formatCount(det.summary.assignedActivities) }}</div>
                  <div class="mini-card__label">Actividades asignadas</div>
                </div>
                <div class="mini-card">
                  <div class="mini-card__value">{{ formatCount(det.summary.completedActivities) }}</div>
                  <div class="mini-card__label">Actividades completadas</div>
                </div>
                <div class="mini-card">
                  <div class="mini-card__value">{{ formatPercent(det.summary.progressPercentage) }}</div>
                  <div class="mini-card__label">Avance</div>
                </div>
                <div class="mini-card">
                  <div class="mini-card__value">{{ formatCount(det.summary.attemptsCount) }}</div>
                  <div class="mini-card__label">Intentos</div>
                </div>
                <div class="mini-card">
                  <div class="mini-card__value">{{ formatCount(det.summary.correctAnswers) }}</div>
                  <div class="mini-card__label">Aciertos</div>
                </div>
                <div class="mini-card">
                  <div class="mini-card__value">{{ formatCount(det.summary.incorrectAnswers) }}</div>
                  <div class="mini-card__label">Errores</div>
                </div>
                <div class="mini-card">
                  <div class="mini-card__value">{{ formatPercent(det.summary.accuracyRate) }}</div>
                  <div class="mini-card__label">Tasa de acierto</div>
                </div>
                <div class="mini-card">
                  <div class="mini-card__value">{{ formatCount(det.summary.feedbackReceived) }}</div>
                  <div class="mini-card__label">Retroalimentaciones</div>
                </div>
                <div class="mini-card">
                  <div class="mini-card__value">{{ formatCount(det.summary.technicalIncidentsCount) }}</div>
                  <div class="mini-card__label">Incidencias técnicas</div>
                </div>
              </div>

              <!-- Módulos visitados -->
              <h3 class="modal__section-title">
                <span class="material-icons">grid_view</span> Módulos visitados
              </h3>
              @if (det.summary.visitedModules.length === 0) {
                <p class="modal__empty">Sin módulos visitados en el período consultado.</p>
              } @else {
                <div class="pill-row">
                  @for (m of det.summary.visitedModules; track m) {
                    <span class="pill">{{ moduleLabel(m) }}</span>
                  }
                </div>
              }

              <!-- Evaluaciones -->
              <h3 class="modal__section-title">
                <span class="material-icons">assignment</span> Evaluaciones
              </h3>
              @if (det.evaluations.length === 0) {
                <p class="modal__empty">Sin evaluaciones asignadas ni intentos registrados.</p>
              } @else {
                <div class="detail-table-wrap">
                  <table class="records-table records-table--compact">
                    <thead>
                      <tr>
                        <th>Evaluación</th>
                        <th>Asignada</th>
                        <th class="num">Intentos</th>
                        <th>Completada</th>
                        <th>Último intento</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (ev of det.evaluations; track ev.evaluationId) {
                        <tr>
                          <td class="name-cell">{{ ev.title }}</td>
                          <td>{{ ev.assigned ? 'Sí' : 'No' }}</td>
                          <td class="num">{{ ev.attemptsCount }}</td>
                          <td>
                            <span class="pill" [class.pill--success]="ev.completed" [class.pill--muted]="!ev.completed">
                              {{ ev.completed ? 'Completada' : 'Pendiente' }}
                            </span>
                          </td>
                          <td class="mono">{{ formatDate(ev.lastAttemptAt) }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }

              <!-- Eventos recientes -->
              <h3 class="modal__section-title">
                <span class="material-icons">history</span> Eventos recientes
              </h3>
              @if (det.recentEvents.length === 0) {
                <p class="modal__empty">Sin eventos de uso registrados.</p>
              } @else {
                <div class="detail-table-wrap">
                  <table class="records-table records-table--compact">
                    <thead>
                      <tr>
                        <th>Fecha y hora</th>
                        <th>Módulo</th>
                        <th>Interacción</th>
                        <th>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (ev of det.recentEvents; track $index) {
                        <tr>
                          <td class="mono">{{ formatDate(ev.occurredAt) }}</td>
                          <td>{{ moduleLabel(ev.module) }}</td>
                          <td>{{ eventLabel(ev.eventType) }}</td>
                          <td class="desc">{{ ev.description ?? '—' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }

              <!-- Incidencias -->
              <h3 class="modal__section-title">
                <span class="material-icons">report_problem</span> Incidencias técnicas
              </h3>
              @if (det.incidents.length === 0) {
                <p class="modal__empty">Sin incidencias técnicas registradas.</p>
              } @else {
                <div class="detail-table-wrap">
                  <table class="records-table records-table--compact">
                    <thead>
                      <tr>
                        <th>Fecha y hora</th>
                        <th>Severidad</th>
                        <th>Acción</th>
                        <th>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (inc of det.incidents; track $index) {
                        <tr>
                          <td class="mono">{{ formatDate(inc.createdAt) }}</td>
                          <td>
                            <span class="pill" [class.pill--danger]="inc.severity === 'ERROR'" [class.pill--warning]="inc.severity === 'WARNING'">
                              {{ inc.severity === 'ERROR' ? 'Error' : 'Advertencia' }}
                            </span>
                          </td>
                          <td>{{ inc.action ?? inc.eventType }}</td>
                          <td class="desc">{{ inc.description ?? '—' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class StudentUsageRecordsComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly studentUsageService = inject(StudentUsageService);

  readonly navItems: readonly SidebarNavItem[] = ADMIN_NAV_ITEMS;
  readonly userRole = 'Admin';

  /** Explicación de la regla del tiempo estimado, mostrada como tooltip. */
  readonly usageTimeHint =
    'Tiempo estimado: suma de sesiones de actividad registrada (logins, eventos e intentos), ' +
    'con corte de inactividad de 30 minutos. La lectura sin interacción no se cuenta.';

  readonly gradeOptions: readonly string[] = ['1', '2', '3', '4', '5'];
  readonly sectionOptions: readonly string[] = ['A', 'B', 'C', 'D', 'E', 'F'];
  readonly moduleOptions: readonly UsageModule[] = [
    'DASHBOARD', 'PERIODIC_TABLE', 'COMPOUNDS', 'CONCEPTS', 'EVALUATIONS', 'WHITEBOARD',
    'RESULTS', 'ADMIN', 'USERS', 'SYSTEM_STATUS',
  ];

  private readonly storedUser = signal<AuthResponse | null>(this.readStoredUser());
  readonly userName = computed<string>(() => this.storedUser()?.username ?? 'Administrador');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly data = signal<StudentUsageRecordsResponse | null>(null);

  readonly roleFilter = signal<string>('');
  readonly searchFilter = signal<string>('');
  readonly gradeFilter = signal<string>('');
  readonly sectionFilter = signal<string>('');
  readonly fromFilter = signal<string>('');
  readonly toFilter = signal<string>('');
  readonly moduleFilter = signal<string>('');
  readonly onlyWithActivity = signal<boolean>(false);

  readonly detailOpen = signal<boolean>(false);
  readonly detailLoading = signal<boolean>(false);
  readonly detailError = signal<string | null>(null);
  readonly detail = signal<StudentUsageDetailResponse | null>(null);

  readonly hasActiveFilters = computed<boolean>(() =>
    this.roleFilter() !== '' ||
    this.searchFilter().trim() !== '' ||
    this.gradeFilter() !== '' ||
    this.sectionFilter() !== '' ||
    this.fromFilter() !== '' ||
    this.toFilter() !== '' ||
    this.moduleFilter() !== '' ||
    this.onlyWithActivity()
  );

  readonly dateRangeInvalid = computed<boolean>(() => {
    const from = this.fromFilter();
    const to = this.toFilter();
    return from !== '' && to !== '' && from > to;
  });

  ngOnInit(): void {
    this.load();
  }

  reload(): void {
    this.load();
  }

  applyFilters(): void {
    if (this.dateRangeInvalid()) {
      return;
    }
    this.load();
  }

  clearFilters(): void {
    this.roleFilter.set('');
    this.searchFilter.set('');
    this.gradeFilter.set('');
    this.sectionFilter.set('');
    this.fromFilter.set('');
    this.toFilter.set('');
    this.moduleFilter.set('');
    this.onlyWithActivity.set(false);
    this.load();
  }

  openDetail(record: StudentUsageRecord): void {
    this.detailOpen.set(true);
    this.detailLoading.set(true);
    this.detailError.set(null);
    this.detail.set(null);

    this.studentUsageService.getDetail(record.userId).subscribe({
      next: (det) => {
        this.detail.set(det);
        this.detailLoading.set(false);
      },
      error: () => {
        this.detailError.set('No se pudo cargar el detalle del usuario. Intenta nuevamente.');
        this.detailLoading.set(false);
      },
    });
  }

  closeDetail(): void {
    this.detailOpen.set(false);
    this.detail.set(null);
    this.detailError.set(null);
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);

    const filters: StudentUsageFilters = {
      role: this.roleFilter(),
      search: this.searchFilter(),
      grade: this.gradeFilter(),
      section: this.sectionFilter(),
      from: this.fromFilter(),
      to: this.toFilter(),
      module: this.moduleFilter(),
      onlyStudentsWithActivity: this.onlyWithActivity(),
    };

    this.studentUsageService.getRecords(filters).subscribe({
      next: (response) => {
        this.data.set(response);
        this.loading.set(false);
      },
      error: (err) => {
        const message = err?.status === 400
          ? (err?.error?.message ?? 'Los filtros seleccionados no son válidos.')
          : 'No se pudo cargar el registro de uso. Intenta nuevamente.';
        this.error.set(message);
        this.data.set(null);
        this.loading.set(false);
      },
    });
  }

  // === Etiquetas y formato ===

  moduleLabel(key: string): string {
    return USAGE_MODULE_LABELS[key as UsageModule] ?? key;
  }

  eventLabel(key: string): string {
    return USAGE_EVENT_TYPE_LABELS[key as UsageEventType] ?? key;
  }

  roleLabel(key: string): string {
    return USAGE_ROLE_LABELS[key as UserRole] ?? key;
  }

  roleChipClass(role: UserRole): string {
    switch (role) {
      case 'ESTUDIANTE': return 'pill pill--success';
      case 'DOCENTE': return 'pill pill--info';
      default: return 'pill pill--muted';
    }
  }

  /** Conteos: null significa «no disponible / no aplica», nunca cero. */
  formatCount(value: number | null): string {
    return value === null ? NOT_AVAILABLE : String(value);
  }

  formatPercent(value: number | null): string {
    return value === null ? NOT_AVAILABLE : `${value}%`;
  }

  /** Tiempo estimado legible: «≈ 45 min», «≈ 2 h 5 min». El ≈ recalca que es estimación. */
  formatMinutes(value: number | null): string {
    if (value === null) return NOT_AVAILABLE;
    if (value < 60) return `≈ ${value} min`;
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    return minutes === 0 ? `≈ ${hours} h` : `≈ ${hours} h ${minutes} min`;
  }

  formatIncidents(record: StudentUsageRecord): string {
    if (record.technicalIncidentsCount === null) return NOT_AVAILABLE;
    if (record.technicalIncidentsCount === 0) return 'Sin registros';
    return String(record.technicalIncidentsCount);
  }

  formatGradeSection(record: StudentUsageRecord): string {
    if (!record.grade) return '—';
    return `${record.grade}° ${record.section ?? ''}`.trim();
  }

  visitedModulesTitle(record: StudentUsageRecord): string {
    if (record.visitedModules.length === 0) return 'Sin módulos visitados';
    return record.visitedModules.map((m) => this.moduleLabel(m)).join(', ');
  }

  formatDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('es-CL', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  handleLogout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
  }

  private readStoredUser(): AuthResponse | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem('auth_user');
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as AuthResponse;
    } catch {
      return null;
    }
  }
}

function buildInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return 'AD';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
