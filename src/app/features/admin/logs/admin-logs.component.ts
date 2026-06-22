import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AdminLogsService } from '../../../core/services/admin-logs.service';
import { SidebarComponent, SidebarNavItem } from '../../../shared/components/sidebar/sidebar.component';
import {
  ACTOR_ROLE_LABELS,
  AuditLogFilters,
  AuditLogResponse,
  AuditLogSummaryResponse,
  AuthResponse,
  LOG_CATEGORY_LABELS,
  LOG_EVENT_TYPE_LABELS,
  LOG_SEVERITY_LABELS,
  LogCategory,
  LogEventType,
  LogSeverity,
  UserRole,
} from '../../../shared/models';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-admin-logs',
  standalone: true,
  imports: [FormsModule, SidebarComponent],
  styleUrls: ['./admin-logs.component.scss'],
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
            <h1 class="main__title">Logs del sistema</h1>
            <p class="main__subtitle">
              Consulta eventos importantes registrados durante el uso de la plataforma.
            </p>
          </div>
          <button type="button" class="btn-refresh" (click)="reload()" [disabled]="loading()">
            <span class="material-icons">{{ loading() ? 'hourglass_empty' : 'refresh' }}</span>
            {{ loading() ? 'Cargando…' : 'Actualizar' }}
          </button>
        </header>

        <!-- Tarjetas de resumen -->
        <section class="summary-grid">
          <div class="summary-card">
            <div class="summary-card__icon summary-card__icon--neutral">
              <span class="material-icons">receipt_long</span>
            </div>
            <div class="summary-card__value">{{ summary()?.totalLogs ?? '—' }}</div>
            <div class="summary-card__label">Total de eventos</div>
          </div>
          <div class="summary-card">
            <div class="summary-card__icon summary-card__icon--info">
              <span class="material-icons">info</span>
            </div>
            <div class="summary-card__value">{{ summary()?.infoCount ?? '—' }}</div>
            <div class="summary-card__label">Información</div>
          </div>
          <div class="summary-card">
            <div class="summary-card__icon summary-card__icon--warning">
              <span class="material-icons">warning</span>
            </div>
            <div class="summary-card__value">{{ summary()?.warningCount ?? '—' }}</div>
            <div class="summary-card__label">Advertencias</div>
          </div>
          <div class="summary-card">
            <div class="summary-card__icon summary-card__icon--danger">
              <span class="material-icons">error</span>
            </div>
            <div class="summary-card__value">{{ summary()?.errorCount ?? '—' }}</div>
            <div class="summary-card__label">Errores</div>
          </div>
        </section>

        <!-- Filtros -->
        <section class="filters">
          <div class="filters__row">
            <div class="field">
              <label class="field__label">Categoría</label>
              <select class="field__control" [ngModel]="category()" (ngModelChange)="onFilterChange('category', $event)">
                <option [ngValue]="null">Todas</option>
                @for (c of categoryOptions; track c) {
                  <option [ngValue]="c">{{ categoryLabel(c) }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label class="field__label">Severidad</label>
              <select class="field__control" [ngModel]="severity()" (ngModelChange)="onFilterChange('severity', $event)">
                <option [ngValue]="null">Todas</option>
                @for (s of severityOptions; track s) {
                  <option [ngValue]="s">{{ severityLabel(s) }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label class="field__label">Tipo de evento</label>
              <select class="field__control" [ngModel]="eventType()" (ngModelChange)="onFilterChange('eventType', $event)">
                <option [ngValue]="null">Todos</option>
                @for (e of eventTypeOptions; track e) {
                  <option [ngValue]="e">{{ eventTypeLabel(e) }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label class="field__label">Rol del actor</label>
              <select class="field__control" [ngModel]="actorRole()" (ngModelChange)="onFilterChange('actorRole', $event)">
                <option [ngValue]="null">Todos</option>
                @for (r of roleOptions; track r) {
                  <option [ngValue]="r">{{ roleLabel(r) }}</option>
                }
              </select>
            </div>
          </div>

          <div class="filters__row">
            <div class="field field--grow">
              <label class="field__label">Búsqueda</label>
              <input
                class="field__control"
                type="text"
                placeholder="Usuario, recurso o descripción…"
                [ngModel]="search()"
                (ngModelChange)="search.set($event)"
                (keyup.enter)="applyFilters()"
              />
            </div>
            <div class="field">
              <label class="field__label">Desde</label>
              <input class="field__control" type="date" [ngModel]="fromDate()" (ngModelChange)="onFilterChange('from', $event)" />
            </div>
            <div class="field">
              <label class="field__label">Hasta</label>
              <input class="field__control" type="date" [ngModel]="toDate()" (ngModelChange)="onFilterChange('to', $event)" />
            </div>
            <div class="field field--actions">
              <button type="button" class="btn btn--primary" (click)="applyFilters()">
                <span class="material-icons">search</span> Buscar
              </button>
              <button type="button" class="btn btn--ghost" (click)="clearFilters()" [disabled]="!hasActiveFilters()">
                Limpiar filtros
              </button>
            </div>
          </div>
        </section>

        <!-- Contenido -->
        @if (loading()) {
          <div class="state state--loading">
            <span class="material-icons spin">progress_activity</span>
            <p>Cargando logs…</p>
          </div>
        } @else if (error()) {
          <div class="state state--error">
            <span class="material-icons">error_outline</span>
            <p>{{ error() }}</p>
            <button type="button" class="btn btn--primary" (click)="reload()">Reintentar</button>
          </div>
        } @else if (logs().length === 0) {
          <div class="state state--empty">
            <span class="material-icons">inbox</span>
            <p>{{ hasActiveFilters() ? 'No se encontraron logs con los filtros seleccionados.' : 'Aún no hay logs registrados.' }}</p>
            @if (hasActiveFilters()) {
              <button type="button" class="btn btn--ghost" (click)="clearFilters()">Limpiar filtros</button>
            }
          </div>
        } @else {
          <section class="table-wrap">
            <table class="logs-table">
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Categoría</th>
                  <th>Evento</th>
                  <th>Severidad</th>
                  <th>Usuario actor</th>
                  <th>Rol</th>
                  <th>Recurso afectado</th>
                  <th>Descripción</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (log of logs(); track log.id) {
                  <tr>
                    <td class="mono">{{ formatDate(log.createdAt) }}</td>
                    <td>{{ categoryLabel(log.category) }}</td>
                    <td>{{ eventTypeLabel(log.eventType) }}</td>
                    <td>
                      <span [class]="severityClass(log.severity)">
                        <span class="dot"></span>{{ severityLabel(log.severity) }}
                      </span>
                    </td>
                    <td>{{ log.actorUsername ?? '—' }}</td>
                    <td>{{ log.actorRole ? roleLabel(log.actorRole) : '—' }}</td>
                    <td>{{ log.targetLabel ?? '—' }}</td>
                    <td class="desc">{{ log.description ?? '—' }}</td>
                    <td>
                      <button type="button" class="btn-detail" (click)="openDetail(log)">Ver detalle</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </section>

          <footer class="pager">
            <span class="pager__info">
              {{ totalElements() }} evento(s) · Página {{ page() + 1 }} de {{ totalPages() }}
            </span>
            <div class="pager__buttons">
              <button type="button" class="btn btn--ghost" (click)="prevPage()" [disabled]="first()">Anterior</button>
              <button type="button" class="btn btn--ghost" (click)="nextPage()" [disabled]="last()">Siguiente</button>
            </div>
          </footer>
        }
      </main>
    </div>

    <!-- Detalle -->
    @if (selectedLog(); as log) {
      <div class="modal-overlay" (click)="closeDetail()">
        <div class="modal" (click)="$event.stopPropagation()">
          <header class="modal__header">
            <h2 class="modal__title">Detalle del evento</h2>
            <button type="button" class="modal__close" (click)="closeDetail()">
              <span class="material-icons">close</span>
            </button>
          </header>
          <div class="modal__body">
            <div class="detail-row"><span class="detail-key">Evento</span><span class="detail-val">{{ eventTypeLabel(log.eventType) }}</span></div>
            <div class="detail-row"><span class="detail-key">Categoría</span><span class="detail-val">{{ categoryLabel(log.category) }}</span></div>
            <div class="detail-row">
              <span class="detail-key">Severidad</span>
              <span class="detail-val">
                <span [class]="severityClass(log.severity)"><span class="dot"></span>{{ severityLabel(log.severity) }}</span>
              </span>
            </div>
            <div class="detail-row"><span class="detail-key">Fecha completa</span><span class="detail-val mono">{{ formatDateFull(log.createdAt) }}</span></div>
            <div class="detail-row"><span class="detail-key">Usuario actor</span><span class="detail-val">{{ log.actorUsername ?? '—' }}</span></div>
            <div class="detail-row"><span class="detail-key">Rol del actor</span><span class="detail-val">{{ log.actorRole ? roleLabel(log.actorRole) : '—' }}</span></div>
            <div class="detail-row"><span class="detail-key">ID del actor</span><span class="detail-val mono">{{ log.actorUserId ?? '—' }}</span></div>
            <div class="detail-row"><span class="detail-key">Recurso</span><span class="detail-val">{{ log.targetType ?? '—' }}</span></div>
            <div class="detail-row"><span class="detail-key">ID del recurso</span><span class="detail-val mono">{{ log.targetId ?? '—' }}</span></div>
            <div class="detail-row"><span class="detail-key">Etiqueta del recurso</span><span class="detail-val">{{ log.targetLabel ?? '—' }}</span></div>
            <div class="detail-row"><span class="detail-key">Acción</span><span class="detail-val">{{ log.action ?? '—' }}</span></div>
            <div class="detail-row detail-row--block"><span class="detail-key">Descripción</span><span class="detail-val">{{ log.description ?? '—' }}</span></div>
            @if (log.metadata) {
              <div class="detail-row detail-row--block"><span class="detail-key">Metadata</span><span class="detail-val mono">{{ log.metadata }}</span></div>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class AdminLogsComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly logsService = inject(AdminLogsService);

  readonly navItems: readonly SidebarNavItem[] = [
    { label: 'Inicio', icon: 'home', route: '/admin-dashboard' },
    { label: 'Gestión de docentes', icon: 'badge', route: '/admin/teachers' },
    { label: 'Usuarios y roles', icon: 'manage_accounts', route: '/admin/users' },
    { label: 'Contenidos químicos', icon: 'auto_stories', route: '/admin-dashboard/content', disabled: true },
    { label: 'Elementos químicos', icon: 'table_chart', route: '/periodic-table' },
    { label: 'Grupos químicos', icon: 'hub', route: '/admin-dashboard/groups', disabled: true },
    { label: 'Logs del sistema', icon: 'terminal', route: '/admin/logs' },
    { label: 'Estado del sistema', icon: 'monitor_heart', route: '/admin/system-status' },
  ];

  readonly userRole = 'Admin';

  readonly categoryOptions: readonly LogCategory[] = [
    'AUTH', 'USER_MANAGEMENT', 'CONCEPT_CONTENT', 'EVALUATION', 'RESULTS', 'ADMIN', 'SYSTEM',
  ];
  readonly severityOptions: readonly LogSeverity[] = ['INFO', 'WARNING', 'ERROR'];
  readonly roleOptions: readonly UserRole[] = ['ADMINISTRADOR', 'DOCENTE', 'ESTUDIANTE'];
  readonly eventTypeOptions: readonly LogEventType[] = [
    'LOGIN_SUCCESS', 'LOGIN_FAILED', 'USER_CREATED', 'USER_DEACTIVATED', 'USER_REACTIVATED',
    'PASSWORD_RESET', 'CONCEPT_CREATED', 'CONCEPT_PUBLISHED', 'CONCEPT_ASSIGNED',
    'EVALUATION_CREATED', 'EVALUATION_PUBLISHED', 'EVALUATION_ASSIGNED', 'EVALUATION_ATTEMPT_SUBMITTED',
  ];

  private readonly storedUser = signal<AuthResponse | null>(this.readStoredUser());
  readonly userName = computed<string>(() => this.storedUser()?.username ?? 'Administrador');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  // Estado de datos
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly logs = signal<AuditLogResponse[]>([]);
  readonly summary = signal<AuditLogSummaryResponse | null>(null);
  readonly selectedLog = signal<AuditLogResponse | null>(null);

  // Paginación
  readonly page = signal<number>(0);
  readonly totalPages = signal<number>(1);
  readonly totalElements = signal<number>(0);
  readonly first = signal<boolean>(true);
  readonly last = signal<boolean>(true);

  // Filtros
  readonly category = signal<LogCategory | null>(null);
  readonly severity = signal<LogSeverity | null>(null);
  readonly eventType = signal<LogEventType | null>(null);
  readonly actorRole = signal<UserRole | null>(null);
  readonly search = signal<string>('');
  readonly fromDate = signal<string>('');
  readonly toDate = signal<string>('');

  readonly hasActiveFilters = computed<boolean>(() =>
    this.category() !== null ||
    this.severity() !== null ||
    this.eventType() !== null ||
    this.actorRole() !== null ||
    this.search().trim().length > 0 ||
    this.fromDate().length > 0 ||
    this.toDate().length > 0
  );

  ngOnInit(): void {
    this.loadSummary();
    this.loadLogs();
  }

  /** Recarga resumen y listado desde la página actual. */
  reload(): void {
    this.loadSummary();
    this.loadLogs();
  }

  /** Aplica los filtros volviendo a la primera página. */
  applyFilters(): void {
    this.page.set(0);
    this.loadLogs();
  }

  onFilterChange(field: 'category' | 'severity' | 'eventType' | 'actorRole' | 'from' | 'to', value: unknown): void {
    switch (field) {
      case 'category': this.category.set((value as LogCategory) ?? null); break;
      case 'severity': this.severity.set((value as LogSeverity) ?? null); break;
      case 'eventType': this.eventType.set((value as LogEventType) ?? null); break;
      case 'actorRole': this.actorRole.set((value as UserRole) ?? null); break;
      case 'from': this.fromDate.set((value as string) ?? ''); break;
      case 'to': this.toDate.set((value as string) ?? ''); break;
    }
    this.applyFilters();
  }

  clearFilters(): void {
    this.category.set(null);
    this.severity.set(null);
    this.eventType.set(null);
    this.actorRole.set(null);
    this.search.set('');
    this.fromDate.set('');
    this.toDate.set('');
    this.applyFilters();
  }

  prevPage(): void {
    if (!this.first()) {
      this.page.update((p) => Math.max(0, p - 1));
      this.loadLogs();
    }
  }

  nextPage(): void {
    if (!this.last()) {
      this.page.update((p) => p + 1);
      this.loadLogs();
    }
  }

  openDetail(log: AuditLogResponse): void {
    this.selectedLog.set(log);
  }

  closeDetail(): void {
    this.selectedLog.set(null);
  }

  private loadLogs(): void {
    this.loading.set(true);
    this.error.set(null);

    const filters: AuditLogFilters = {
      category: this.category(),
      severity: this.severity(),
      eventType: this.eventType(),
      actorRole: this.actorRole(),
      search: this.search().trim() || null,
      from: this.toIsoStart(this.fromDate()),
      to: this.toIsoEnd(this.toDate()),
      page: this.page(),
      size: PAGE_SIZE,
    };

    this.logsService.listLogs(filters).subscribe({
      next: (res) => {
        this.logs.set(res.content);
        this.totalPages.set(Math.max(1, res.totalPages));
        this.totalElements.set(res.totalElements);
        this.first.set(res.first);
        this.last.set(res.last);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar los logs. Intenta nuevamente.');
        this.logs.set([]);
        this.loading.set(false);
      },
    });
  }

  private loadSummary(): void {
    this.logsService.getLogSummary().subscribe({
      next: (s) => this.summary.set(s),
      error: () => this.summary.set(null),
    });
  }

  // === Etiquetas amigables ===
  categoryLabel(c: LogCategory): string { return LOG_CATEGORY_LABELS[c] ?? c; }
  severityLabel(s: LogSeverity): string { return LOG_SEVERITY_LABELS[s] ?? s; }
  eventTypeLabel(e: LogEventType): string { return LOG_EVENT_TYPE_LABELS[e] ?? e; }
  roleLabel(r: UserRole): string { return ACTOR_ROLE_LABELS[r] ?? r; }

  severityClass(s: LogSeverity): string {
    if (s === 'INFO') return 'pill pill--info';
    if (s === 'WARNING') return 'pill pill--warning';
    return 'pill pill--danger';
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('es-CL', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  formatDateFull(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('es-CL', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  handleLogout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
  }

  /** Convierte una fecha (YYYY-MM-DD) al inicio del día en formato ISO date-time. */
  private toIsoStart(date: string): string | null {
    return date ? `${date}T00:00:00` : null;
  }

  /** Convierte una fecha (YYYY-MM-DD) al final del día en formato ISO date-time. */
  private toIsoEnd(date: string): string | null {
    return date ? `${date}T23:59:59` : null;
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
