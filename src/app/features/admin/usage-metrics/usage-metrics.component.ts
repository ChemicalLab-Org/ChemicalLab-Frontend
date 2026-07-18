import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';
import { SystemHealth, SystemStatusService } from '../../../core/services/system-status.service';
import { UsageMetricsService } from '../../../core/services/usage-metrics.service';
import { SidebarComponent, SidebarNavItem } from '../../../shared/components/sidebar/sidebar.component';
import { ADMIN_NAV_ITEMS } from '../../../shared/components/sidebar/admin-nav';
import {
  AuthResponse,
  CharterIndicator,
  USAGE_EVENT_TYPE_LABELS,
  USAGE_MODULE_LABELS,
  USAGE_ROLE_LABELS,
  UsageCountResponse,
  UsageEventResponse,
  UsageEventType,
  UsageMetricsSummaryResponse,
  UsageModule,
  UsagePanelResponse,
  UserRole,
  formatUsageResource,
} from '../../../shared/models';

const RECENT_LIMIT = 25;

/** Total de módulos funcionales que registran métricas de uso. */
const TOTAL_MODULES = 10;

@Component({
  selector: 'app-admin-usage-metrics',
  standalone: true,
  imports: [FormsModule, SidebarComponent],
  styleUrls: ['./usage-metrics.component.scss'],
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
            <h1 class="main__title">Métricas de uso</h1>
            <p class="main__subtitle">
              Actividad real del sistema organizada como evidencia de los objetivos del
              Project Charter: navegación, uso de módulos, pizarra, evaluaciones,
              trazabilidad y despliegue interno.
            </p>
          </div>
          <button type="button" class="btn-refresh" (click)="reload()" [disabled]="loading()">
            <span class="material-icons">{{ loading() ? 'hourglass_empty' : 'refresh' }}</span>
            {{ loading() ? 'Cargando…' : 'Actualizar' }}
          </button>
        </header>

        <!-- A. Resumen operativo (histórico total) -->
        <section class="summary-grid summary-grid--six">
          <div class="summary-card">
            <div class="summary-card__icon summary-card__icon--neutral">
              <span class="material-icons">insights</span>
            </div>
            <div class="summary-card__value">{{ panel()?.general?.totalEvents ?? '—' }}</div>
            <div class="summary-card__label">Eventos totales</div>
          </div>
          <div class="summary-card">
            <div class="summary-card__icon summary-card__icon--info">
              <span class="material-icons">person</span>
            </div>
            <div class="summary-card__value">{{ panel()?.general?.activeUsers ?? '—' }}</div>
            <div class="summary-card__label">Usuarios con actividad</div>
          </div>
          <div class="summary-card">
            <div class="summary-card__icon summary-card__icon--info">
              <span class="material-icons">grid_view</span>
            </div>
            <div class="summary-card__value">{{ topModuleLabel() }}</div>
            <div class="summary-card__label">Módulo más usado</div>
          </div>
          <div class="summary-card">
            <div class="summary-card__icon summary-card__icon--neutral">
              <span class="material-icons">groups</span>
            </div>
            <div class="summary-card__value">{{ topRoleLabel() }}</div>
            <div class="summary-card__label">Rol más activo</div>
          </div>
          <div class="summary-card">
            <div class="summary-card__icon summary-card__icon--info">
              <span class="material-icons">draw</span>
            </div>
            <div class="summary-card__value">{{ panel()?.whiteboard?.sessionsCreated ?? '—' }}</div>
            <div class="summary-card__label">Sesiones de pizarra</div>
          </div>
          <div class="summary-card">
            <div class="summary-card__icon summary-card__icon--neutral">
              <span class="material-icons">assignment_turned_in</span>
            </div>
            <div class="summary-card__value">{{ panel()?.evaluations?.attemptsSubmitted ?? '—' }}</div>
            <div class="summary-card__label">Evaluaciones enviadas</div>
          </div>
        </section>

        <!-- Filtros (aplican al desglose por fechas y a los eventos recientes) -->
        <section class="filters">
          <div class="filters__row">
            <div class="field">
              <label class="field__label">Desde</label>
              <input class="field__control" type="date" [ngModel]="fromDate()" (ngModelChange)="fromDate.set($event)" />
            </div>
            <div class="field">
              <label class="field__label">Hasta</label>
              <input class="field__control" type="date" [ngModel]="toDate()" (ngModelChange)="toDate.set($event)" />
            </div>
            <div class="field">
              <label class="field__label">Módulo (recientes)</label>
              <select class="field__control" [ngModel]="moduleFilter()" (ngModelChange)="moduleFilter.set($event)">
                <option [ngValue]="null">Todos</option>
                @for (m of moduleOptions; track m) {
                  <option [ngValue]="m">{{ moduleLabel(m) }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label class="field__label">Interacción (recientes)</label>
              <select class="field__control" [ngModel]="eventTypeFilter()" (ngModelChange)="eventTypeFilter.set($event)">
                <option [ngValue]="null">Todas</option>
                @for (t of eventTypeOptions; track t) {
                  <option [ngValue]="t">{{ eventLabel(t) }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label class="field__label">Rol (recientes)</label>
              <select class="field__control" [ngModel]="roleFilter()" (ngModelChange)="roleFilter.set($event)">
                <option [ngValue]="null">Todos</option>
                @for (r of roleOptions; track r) {
                  <option [ngValue]="r">{{ roleLabel(r) }}</option>
                }
              </select>
            </div>
            <div class="field field--actions">
              <button type="button" class="btn btn--primary" (click)="applyFilters()">
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
            <p>Cargando métricas…</p>
          </div>
        } @else if (error()) {
          <div class="state state--error">
            <span class="material-icons">error_outline</span>
            <p>{{ error() }}</p>
            <button type="button" class="btn btn--primary" (click)="reload()">Reintentar</button>
          </div>
        } @else {
          @if ((summary()?.totalEvents ?? 0) === 0) {
            <div class="state state--empty state--compact">
              <span class="material-icons">inbox</span>
              <p>No hay eventos de uso registrados para el rango de fechas seleccionado.</p>
              @if (hasActiveFilters()) {
                <button type="button" class="btn btn--ghost" (click)="clearFilters()">Limpiar filtros</button>
              }
            </div>
          } @else {
            <!-- B / C. Actividad por módulo, tipo de evento y rol (respetan filtro de fechas) -->
            <section class="breakdowns">
              <div class="breakdown">
                <h2 class="breakdown__title">Uso por módulo</h2>
                @for (item of summary()!.byModule; track item.key) {
                  <div class="bar-row">
                    <span class="bar-row__label" [title]="moduleLabel(item.key)">{{ moduleLabel(item.key) }}</span>
                    <div class="bar-row__track">
                      <div class="bar-row__fill" [style.width.%]="barWidth(item.count, summary()!.byModule)"></div>
                    </div>
                    <span class="bar-row__count">{{ item.count }}</span>
                  </div>
                }
              </div>

              <div class="breakdown">
                <h2 class="breakdown__title">Uso por tipo de interacción</h2>
                @for (item of summary()!.byEventType; track item.key) {
                  <div class="bar-row">
                    <span class="bar-row__label" [title]="eventLabel(item.key)">{{ eventLabel(item.key) }}</span>
                    <div class="bar-row__track">
                      <div class="bar-row__fill" [style.width.%]="barWidth(item.count, summary()!.byEventType)"></div>
                    </div>
                    <span class="bar-row__count">{{ item.count }}</span>
                  </div>
                }
              </div>

              <div class="breakdown">
                <h2 class="breakdown__title">Actividad por rol</h2>
                @for (item of summary()!.byRole; track item.key) {
                  <div class="bar-row">
                    <span class="bar-row__label" [title]="roleLabel(item.key)">{{ roleLabel(item.key) }}</span>
                    <div class="bar-row__track">
                      <div class="bar-row__fill" [style.width.%]="barWidth(item.count, summary()!.byRole)"></div>
                    </div>
                    <span class="bar-row__count">{{ item.count }}</span>
                  </div>
                }
              </div>
            </section>
          }

          @if (panel(); as p) {
            <!-- D. Pizarra interactiva -->
            <section class="panel-section">
              <h2 class="panel-section__title">
                <span class="material-icons">draw</span> Pizarra interactiva
              </h2>
              <p class="panel-section__hint">
                Totales históricos. Solo se cuentan sesiones y participaciones; nunca se
                muestran trazos ni contenidos de la pizarra.
              </p>
              <div class="mini-grid">
                <div class="mini-card">
                  <div class="mini-card__value">{{ p.whiteboard.sessionsCreated }}</div>
                  <div class="mini-card__label">Sesiones creadas</div>
                </div>
                <div class="mini-card">
                  <div class="mini-card__value">{{ p.whiteboard.sessionsActive }}</div>
                  <div class="mini-card__label">Sesiones activas</div>
                </div>
                <div class="mini-card">
                  <div class="mini-card__value">{{ p.whiteboard.sessionsClosed }}</div>
                  <div class="mini-card__label">Sesiones finalizadas</div>
                </div>
                <div class="mini-card">
                  <div class="mini-card__value">{{ p.whiteboard.sessionsWithSnapshot }}</div>
                  <div class="mini-card__label">Con captura final</div>
                </div>
                <div class="mini-card">
                  <div class="mini-card__value">{{ p.whiteboard.studentJoinEvents }}</div>
                  <div class="mini-card__label">Uniones de estudiantes</div>
                </div>
                <div class="mini-card">
                  <div class="mini-card__value">{{ p.whiteboard.distinctStudents }}</div>
                  <div class="mini-card__label">Estudiantes participantes</div>
                </div>
                <div class="mini-card">
                  <div class="mini-card__value">{{ p.whiteboard.auditEvents }}</div>
                  <div class="mini-card__label">Eventos auditados (ciclo de vida y permisos)</div>
                </div>
              </div>
            </section>

            <!-- E. Evaluaciones y resultados -->
            <section class="panel-section">
              <h2 class="panel-section__title">
                <span class="material-icons">assignment</span> Evaluaciones y resultados
              </h2>
              <p class="panel-section__hint">
                Totales históricos. No se muestran respuestas de estudiantes ni claves de
                corrección, solo conteos.
              </p>
              <div class="mini-grid">
                <div class="mini-card">
                  <div class="mini-card__value">{{ p.evaluations.published }}</div>
                  <div class="mini-card__label">Evaluaciones publicadas</div>
                </div>
                <div class="mini-card">
                  <div class="mini-card__value">{{ p.evaluations.openedEvents }}</div>
                  <div class="mini-card__label">Aperturas de evaluación</div>
                </div>
                <div class="mini-card">
                  <div class="mini-card__value">{{ p.evaluations.startedEvents }}</div>
                  <div class="mini-card__label">Inicios registrados</div>
                </div>
                <div class="mini-card">
                  <div class="mini-card__value">{{ p.evaluations.attemptsTotal }}</div>
                  <div class="mini-card__label">Intentos totales</div>
                </div>
                <div class="mini-card">
                  <div class="mini-card__value">{{ p.evaluations.attemptsSubmitted }}</div>
                  <div class="mini-card__label">Intentos enviados</div>
                </div>
                <div class="mini-card">
                  <div class="mini-card__value">{{ p.evaluations.attemptsGraded }}</div>
                  <div class="mini-card__label">Intentos calificados</div>
                </div>
                <div class="mini-card">
                  <div class="mini-card__value">{{ p.evaluations.resultViewEvents }}</div>
                  <div class="mini-card__label">Vistas de resultados</div>
                </div>
              </div>
            </section>

            <!-- Despliegue interno -->
            <section class="panel-section">
              <h2 class="panel-section__title">
                <span class="material-icons">dns</span> Despliegue interno
              </h2>
              <p class="panel-section__hint">
                Estado en vivo del backend y configuración del frontend actual. La
                disponibilidad en la red del colegio se valida con una prueba en sitio.
              </p>
              <div class="deploy-grid">
                <div class="deploy-item">
                  <span class="deploy-item__label">Backend</span>
                  <span [class]="healthClass(health()?.backend?.status)">
                    {{ healthText(health()?.backend?.status) }}
                  </span>
                </div>
                <div class="deploy-item">
                  <span class="deploy-item__label">Base de datos</span>
                  <span [class]="healthClass(health()?.database?.status)">
                    {{ healthText(health()?.database?.status) }}
                  </span>
                </div>
                <div class="deploy-item">
                  <span class="deploy-item__label">Entorno del frontend</span>
                  <span class="deploy-item__value">{{ envName }}</span>
                </div>
                <div class="deploy-item">
                  <span class="deploy-item__label">API base</span>
                  <span class="deploy-item__value mono">{{ apiBase }}</span>
                </div>
                <div class="deploy-item">
                  <span class="deploy-item__label">Rutas relativas (build colegio)</span>
                  <span class="deploy-item__value">{{ usesRelativeApi ? 'Sí' : 'No' }}</span>
                </div>
                <div class="deploy-item">
                  <span class="deploy-item__label">WebSocket de pizarra</span>
                  <span class="deploy-item__value">{{ wsConfigured ? 'Configurado' : 'No configurado' }}</span>
                </div>
              </div>
            </section>

            <!-- F. Indicadores del Project Charter -->
            <section class="panel-section">
              <h2 class="panel-section__title">
                <span class="material-icons">flag</span> Indicadores del Project Charter
              </h2>
              <p class="panel-section__hint">
                Cada indicador muestra su valor solo si el sistema lo mide con datos reales.
                Lo que no se mide aún aparece como pendiente o no disponible: no se
                presentan resultados inventados.
              </p>
              <div class="table-wrap">
                <table class="metrics-table charter-table">
                  <thead>
                    <tr>
                      <th>Objetivo</th>
                      <th>Indicador</th>
                      <th>Valor actual</th>
                      <th>Fuente de datos</th>
                      <th>Estado</th>
                      <th>Observación</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of charterIndicators(); track row.indicator) {
                      <tr>
                        <td class="charter-objective">{{ row.objective }}</td>
                        <td class="charter-indicator">{{ row.indicator }}</td>
                        <td>{{ row.value }}</td>
                        <td class="desc">{{ row.source }}</td>
                        <td><span [class]="statusChipClass(row.status)">{{ row.status }}</span></td>
                        <td class="desc">{{ row.observation }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          }

          <!-- G. Eventos recientes -->
          <section class="recent panel-section">
            <h2 class="panel-section__title">
              <span class="material-icons">history</span> Eventos recientes
            </h2>
            @if (recent().length === 0) {
              <div class="state state--empty state--compact">
                <span class="material-icons">inbox</span>
                <p>No hay eventos recientes con los filtros seleccionados.</p>
              </div>
            } @else {
              <div class="table-wrap">
                <table class="metrics-table">
                  <thead>
                    <tr>
                      <th>Fecha y hora</th>
                      <th>Usuario</th>
                      <th>Rol</th>
                      <th>Módulo</th>
                      <th>Interacción</th>
                      <th>Recurso</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (ev of recent(); track ev.id) {
                      <tr>
                        <td class="mono">{{ formatDate(ev.occurredAt) }}</td>
                        <td>{{ ev.username }}</td>
                        <td>{{ roleLabel(ev.userRole) }}</td>
                        <td>{{ moduleLabel(ev.module) }}</td>
                        <td>{{ eventLabel(ev.eventType) }}</td>
                        <td>{{ resourceText(ev) }}</td>
                        <td class="desc">{{ detailText(ev) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </section>
        }
      </main>
    </div>
  `,
})
export class UsageMetricsComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly metricsService = inject(UsageMetricsService);
  private readonly systemStatusService = inject(SystemStatusService);

  readonly navItems: readonly SidebarNavItem[] = ADMIN_NAV_ITEMS;
  readonly userRole = 'Admin';

  readonly moduleOptions: readonly UsageModule[] = [
    'DASHBOARD', 'PERIODIC_TABLE', 'COMPOUNDS', 'CONCEPTS', 'EVALUATIONS', 'WHITEBOARD',
    'RESULTS', 'ADMIN', 'USERS', 'SYSTEM_STATUS',
  ];
  readonly eventTypeOptions: readonly UsageEventType[] = [
    'MODULE_ACCESS', 'IMPORTANT_CLICK', 'CONTENT_VIEW', 'EVALUATION_OPENED', 'EVALUATION_STARTED',
    'COMPOUND_FORMATION_USED', 'PERIODIC_ELEMENT_VIEWED', 'RESULTS_VIEWED', 'WHITEBOARD_SESSION_JOINED',
  ];
  readonly roleOptions: readonly UserRole[] = ['ADMINISTRADOR', 'DOCENTE', 'ESTUDIANTE'];

  // Configuración visible del despliegue actual. Solo datos no sensibles: entorno,
  // ruta base de la API y si el WebSocket está configurado (sin exponer hosts internos).
  readonly envName = environment.production ? 'Producción / colegio' : 'Desarrollo';
  readonly apiBase = environment.apiUrl;
  readonly usesRelativeApi = environment.apiUrl.startsWith('/');
  readonly wsConfigured = typeof environment.wsUrl === 'string' && environment.wsUrl.length > 0;

  private readonly storedUser = signal<AuthResponse | null>(this.readStoredUser());
  readonly userName = computed<string>(() => this.storedUser()?.username ?? 'Administrador');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly summary = signal<UsageMetricsSummaryResponse | null>(null);
  readonly panel = signal<UsagePanelResponse | null>(null);
  readonly recent = signal<UsageEventResponse[]>([]);
  readonly health = signal<SystemHealth | null>(null);

  readonly fromDate = signal<string>('');
  readonly toDate = signal<string>('');
  readonly moduleFilter = signal<UsageModule | null>(null);
  readonly eventTypeFilter = signal<UsageEventType | null>(null);
  readonly roleFilter = signal<UserRole | null>(null);

  readonly hasActiveFilters = computed<boolean>(() =>
    this.fromDate().length > 0 ||
    this.toDate().length > 0 ||
    this.moduleFilter() !== null ||
    this.eventTypeFilter() !== null ||
    this.roleFilter() !== null
  );

  readonly topModuleLabel = computed<string>(() => this.topLabel(this.summary()?.byModule, (k) => this.moduleLabel(k)));
  readonly topRoleLabel = computed<string>(() => this.topLabel(this.summary()?.byRole, (k) => this.roleLabel(k)));

  /**
   * Filas de la sección "Indicadores del Project Charter". Los valores provienen
   * exclusivamente de datos reales (panel, salud del backend y configuración). Los
   * indicadores que el sistema no mide se marcan como pendientes o no disponibles.
   */
  readonly charterIndicators = computed<CharterIndicator[]>(() => {
    const p = this.panel();
    if (!p) return [];
    const h = this.health();
    const dash = '—';

    const deepInteractions = Math.max(0, p.general.totalEvents - p.general.moduleAccessEvents);
    const backendUp = h?.backend?.status === 'disponible';

    return [
      // Objetivo 1: arquitectura de información e interfaz (DCU)
      {
        objective: 'Objetivo 1 · Diseño centrado en el usuario',
        indicator: 'Acceso a módulos',
        value: `${p.general.modulesUsed} de ${TOTAL_MODULES} módulos con uso registrado (${p.general.moduleAccessEvents} accesos)`,
        source: 'Eventos de uso (MODULE_ACCESS)',
        status: 'Medido',
        observation: 'Los usuarios llegan y navegan entre los módulos del laboratorio.',
      },
      {
        objective: 'Objetivo 1 · Diseño centrado en el usuario',
        indicator: 'Profundidad de interacción',
        value: `${deepInteractions} interacciones dentro de módulos de ${p.general.totalEvents} eventos`,
        source: 'Eventos de uso (interacciones distintas al acceso)',
        status: 'Medido',
        observation: 'Contenidos vistos, evaluaciones, compuestos y pizarra: uso más allá de la navegación.',
      },
      {
        objective: 'Objetivo 1 · Diseño centrado en el usuario',
        indicator: 'Accesibilidad automatizada (Lighthouse / Axe)',
        value: dash,
        source: 'No se ejecuta desde el sistema',
        status: 'Pendiente de medición externa',
        observation: 'Requiere correr una auditoría Lighthouse/Axe sobre el frontend desplegado.',
      },
      {
        objective: 'Objetivo 1 · Diseño centrado en el usuario',
        indicator: 'Saliency Map Score (jerarquía visual)',
        value: dash,
        source: 'No se mide dentro del sistema',
        status: 'Pendiente de medición externa',
        observation: 'Requiere una herramienta externa de análisis visual sobre las pantallas.',
      },

      // Objetivo 2: motor lógico backend y permisos dinámicos
      {
        objective: 'Objetivo 2 · Motor lógico backend',
        indicator: 'Uso del motor de formación de compuestos',
        value: `${p.general.compoundFormationEvents} usos registrados`,
        source: 'Eventos de uso (COMPOUND_FORMATION_USED)',
        status: 'Parcial',
        observation: 'Se mide el uso real del motor; la precisión química se valida con casos de prueba externos.',
      },
      {
        objective: 'Objetivo 2 · Motor lógico backend',
        indicator: 'Tiempo de respuesta del servidor (< 100 ms)',
        value: dash,
        source: 'El backend no registra tiempos de respuesta',
        status: 'No disponible con datos actuales',
        observation: 'Requiere instrumentación de tiempos o una prueba de carga externa. No se estima.',
      },
      {
        objective: 'Objetivo 2 · Motor lógico backend',
        indicator: 'Permisos dinámicos de interacción (pizarra)',
        value: `${p.whiteboard.auditEvents} eventos de pizarra auditados`,
        source: 'Logs de trazabilidad (categoría pizarra)',
        status: 'Medido',
        observation: 'Incluye ciclo de vida de sesiones y cambios de permiso global e individual.',
      },

      // Objetivo 3: roles y trazabilidad
      {
        objective: 'Objetivo 3 · Roles y trazabilidad',
        indicator: 'Captura de eventos críticos',
        value: `${p.traceability.auditTotal} eventos auditados (${p.traceability.auditWarnings} advertencias, ${p.traceability.auditErrors} errores)`,
        source: 'Logs de trazabilidad del sistema',
        status: 'Medido',
        observation: 'Login, gestión de usuarios, contenidos, evaluaciones y pizarra quedan auditados.',
      },
      {
        objective: 'Objetivo 3 · Roles y trazabilidad',
        indicator: 'Actividad por rol',
        value: this.roleActivityText(),
        source: 'Eventos de uso agrupados por rol',
        status: 'Medido',
        observation: 'Permite comparar la actividad de administradores, docentes y estudiantes.',
      },
      {
        objective: 'Objetivo 3 · Roles y trazabilidad',
        indicator: 'Intentos de inicio de sesión fallidos',
        value: `${p.traceability.loginFailed} fallidos vs ${p.traceability.loginSuccess} exitosos`,
        source: 'Logs de trazabilidad (autenticación)',
        status: 'Medido',
        observation: 'Los intentos fallidos quedan registrados sin almacenar contraseñas.',
      },
      {
        objective: 'Objetivo 3 · Roles y trazabilidad',
        indicator: 'Accesos denegados por permisos (HTTP 403)',
        value: dash,
        source: 'El sistema responde 403 pero aún no lo registra como log',
        status: 'No disponible con datos actuales',
        observation: 'El control de acceso por rol funciona; falta registrar cada denegación para contarla.',
      },

      // Objetivo 4: despliegue interno
      {
        objective: 'Objetivo 4 · Despliegue interno',
        indicator: 'Salud del backend y base de datos',
        value: h
          ? `Backend: ${this.healthText(h.backend.status)} · BD: ${this.healthText(h.database.status)}`
          : 'Sin verificación aún',
        source: 'Endpoint de salud del backend (en vivo)',
        status: backendUp ? 'Medido' : 'Parcial',
        observation: 'Verificación en vivo al abrir este panel.',
      },
      {
        objective: 'Objetivo 4 · Despliegue interno',
        indicator: 'Build colegio con rutas relativas',
        value: this.usesRelativeApi ? `Sí (API base: ${this.apiBase})` : `No (API base: ${this.apiBase})`,
        source: 'Configuración del frontend actual',
        status: 'Medido',
        observation: 'Las rutas relativas permiten servir el sistema desde cualquier IP o host interno.',
      },
      {
        objective: 'Objetivo 4 · Despliegue interno',
        indicator: 'WebSocket de pizarra configurado',
        value: this.wsConfigured ? 'Configurado' : 'No configurado',
        source: 'Configuración del frontend actual',
        status: 'Medido',
        observation: 'Necesario para la sincronización en vivo de la pizarra en la intranet.',
      },
      {
        objective: 'Objetivo 4 · Despliegue interno',
        indicator: 'Disponibilidad en la red interna del colegio',
        value: dash,
        source: 'No se mide automáticamente desde el sistema',
        status: 'Pendiente de medición externa',
        observation: 'Se valida accediendo por IP/host interno en la red del colegio (prueba en sitio).',
      },
    ];
  });

  ngOnInit(): void {
    this.load();
  }

  reload(): void {
    this.load();
  }

  applyFilters(): void {
    this.load();
  }

  clearFilters(): void {
    this.fromDate.set('');
    this.toDate.set('');
    this.moduleFilter.set(null);
    this.eventTypeFilter.set(null);
    this.roleFilter.set(null);
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);

    const from = this.toIsoStart(this.fromDate());
    const to = this.toIsoEnd(this.toDate());

    this.metricsService.getSummary(from, to).subscribe({
      next: (s) => {
        this.summary.set(s);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar las métricas de uso. Intenta nuevamente.');
        this.summary.set(null);
        this.loading.set(false);
      },
    });

    // Indicadores agregados (histórico). Si falla, las secciones dependientes quedan ocultas.
    this.metricsService.getPanel().subscribe({
      next: (p) => this.panel.set(p),
      error: () => this.panel.set(null),
    });

    this.metricsService.getRecent(RECENT_LIMIT, this.moduleFilter(), this.roleFilter(), this.eventTypeFilter()).subscribe({
      next: (list) => this.recent.set(list),
      error: () => this.recent.set([]),
    });

    this.systemStatusService.checkHealth().subscribe({
      next: (h) => this.health.set(h),
      error: () => this.health.set(null),
    });
  }

  // === Etiquetas ===
  moduleLabel(key: string): string { return USAGE_MODULE_LABELS[key as UsageModule] ?? key; }
  eventLabel(key: string): string { return USAGE_EVENT_TYPE_LABELS[key as UsageEventType] ?? key; }
  roleLabel(key: string): string { return USAGE_ROLE_LABELS[key as UserRole] ?? key; }

  resourceText(ev: UsageEventResponse): string {
    return formatUsageResource(ev.resourceType, ev.resourceId);
  }

  /** Detalle legible del evento: descripción si existe; si no, la metadata corta. */
  detailText(ev: UsageEventResponse): string {
    return ev.description ?? ev.metadata ?? '—';
  }

  healthText(status: string | undefined): string {
    switch (status) {
      case 'disponible': return 'Disponible';
      case 'con-problemas': return 'Con problemas';
      case 'no-disponible': return 'No disponible';
      case 'no-informado': return 'No informado';
      default: return 'Verificando…';
    }
  }

  healthClass(status: string | undefined): string {
    const base = 'deploy-item__value';
    switch (status) {
      case 'disponible': return `${base} deploy-item__value--ok`;
      case 'con-problemas': return `${base} deploy-item__value--warn`;
      case 'no-disponible': return `${base} deploy-item__value--down`;
      default: return base;
    }
  }

  statusChipClass(status: string): string {
    switch (status) {
      case 'Medido': return 'status-chip status-chip--measured';
      case 'Parcial': return 'status-chip status-chip--partial';
      case 'Pendiente de medición externa': return 'status-chip status-chip--pending';
      default: return 'status-chip status-chip--unavailable';
    }
  }

  /** Ancho relativo de la barra respecto al valor máximo del grupo. */
  barWidth(count: number, group: UsageCountResponse[]): number {
    const max = group.reduce((acc, item) => Math.max(acc, item.count), 0);
    if (max <= 0) return 0;
    return Math.max(6, Math.round((count / max) * 100));
  }

  formatDate(iso: string): string {
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

  /** Resumen corto de actividad por rol para la tabla del Project Charter. */
  private roleActivityText(): string {
    const byRole = this.summary()?.byRole;
    if (!byRole || byRole.length === 0) return 'Sin actividad registrada aún';
    return byRole.map((r) => `${this.roleLabel(r.key)}: ${r.count}`).join(' · ');
  }

  private topLabel(group: UsageCountResponse[] | undefined, labeller: (key: string) => string): string {
    if (!group || group.length === 0) return '—';
    return labeller(group[0].key);
  }

  private toIsoStart(date: string): string | null {
    return date ? `${date}T00:00:00` : null;
  }

  private toIsoEnd(date: string): string | null {
    return date ? `${date}T23:59:59` : null;
  }

  private readStoredUser(): AuthResponse | null {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem('auth_user');
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
