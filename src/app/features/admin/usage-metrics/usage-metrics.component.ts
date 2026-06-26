import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { UsageMetricsService } from '../../../core/services/usage-metrics.service';
import { SidebarComponent, SidebarNavItem } from '../../../shared/components/sidebar/sidebar.component';
import { ADMIN_NAV_ITEMS } from '../../../shared/components/sidebar/admin-nav';
import {
  AuthResponse,
  USAGE_EVENT_TYPE_LABELS,
  USAGE_MODULE_LABELS,
  USAGE_ROLE_LABELS,
  UsageCountResponse,
  UsageEventResponse,
  UsageEventType,
  UsageMetricsSummaryResponse,
  UsageModule,
  UserRole,
} from '../../../shared/models';

const RECENT_LIMIT = 25;

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
              Interacción educativa del sistema: accesos a módulos, recursos vistos y acciones
              relevantes. Es independiente de los logs de auditoría.
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
              <span class="material-icons">insights</span>
            </div>
            <div class="summary-card__value">{{ summary()?.totalEvents ?? '—' }}</div>
            <div class="summary-card__label">Eventos totales</div>
          </div>
          <div class="summary-card">
            <div class="summary-card__icon summary-card__icon--info">
              <span class="material-icons">grid_view</span>
            </div>
            <div class="summary-card__value">{{ topModuleLabel() }}</div>
            <div class="summary-card__label">Módulo más usado</div>
          </div>
          <div class="summary-card">
            <div class="summary-card__icon summary-card__icon--info">
              <span class="material-icons">touch_app</span>
            </div>
            <div class="summary-card__value">{{ topEventLabel() }}</div>
            <div class="summary-card__label">Interacción más frecuente</div>
          </div>
          <div class="summary-card">
            <div class="summary-card__icon summary-card__icon--neutral">
              <span class="material-icons">groups</span>
            </div>
            <div class="summary-card__value">{{ topRoleLabel() }}</div>
            <div class="summary-card__label">Rol más activo</div>
          </div>
        </section>

        <!-- Filtros -->
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
        } @else if ((summary()?.totalEvents ?? 0) === 0) {
          <div class="state state--empty">
            <span class="material-icons">inbox</span>
            <p>Aún no hay métricas de uso registradas para el rango seleccionado.</p>
            @if (hasActiveFilters()) {
              <button type="button" class="btn btn--ghost" (click)="clearFilters()">Limpiar filtros</button>
            }
          </div>
        } @else {
          <!-- Desgloses -->
          <section class="breakdowns">
            <div class="breakdown">
              <h2 class="breakdown__title">Uso por módulo</h2>
              @for (item of summary()!.byModule; track item.key) {
                <div class="bar-row">
                  <span class="bar-row__label">{{ moduleLabel(item.key) }}</span>
                  <div class="bar-row__track">
                    <div class="bar-row__fill" [style.width.%]="barWidth(item.count, summary()!.byModule)"></div>
                  </div>
                  <span class="bar-row__count">{{ item.count }}</span>
                </div>
              }
            </div>

            <div class="breakdown">
              <h2 class="breakdown__title">Uso por tipo de evento</h2>
              @for (item of summary()!.byEventType; track item.key) {
                <div class="bar-row">
                  <span class="bar-row__label">{{ eventLabel(item.key) }}</span>
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
                  <span class="bar-row__label">{{ roleLabel(item.key) }}</span>
                  <div class="bar-row__track">
                    <div class="bar-row__fill" [style.width.%]="barWidth(item.count, summary()!.byRole)"></div>
                  </div>
                  <span class="bar-row__count">{{ item.count }}</span>
                </div>
              }
            </div>
          </section>

          <!-- Eventos recientes -->
          <section class="recent">
            <h2 class="recent__title">Eventos recientes</h2>
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
                        <td class="desc">{{ ev.metadata ?? '—' }}</td>
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

  readonly navItems: readonly SidebarNavItem[] = ADMIN_NAV_ITEMS;
  readonly userRole = 'Admin';

  readonly moduleOptions: readonly UsageModule[] = [
    'DASHBOARD', 'PERIODIC_TABLE', 'COMPOUNDS', 'CONCEPTS', 'EVALUATIONS', 'RESULTS', 'ADMIN', 'USERS', 'SYSTEM_STATUS',
  ];
  readonly roleOptions: readonly UserRole[] = ['ADMINISTRADOR', 'DOCENTE', 'ESTUDIANTE'];

  private readonly storedUser = signal<AuthResponse | null>(this.readStoredUser());
  readonly userName = computed<string>(() => this.storedUser()?.username ?? 'Administrador');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly summary = signal<UsageMetricsSummaryResponse | null>(null);
  readonly recent = signal<UsageEventResponse[]>([]);

  readonly fromDate = signal<string>('');
  readonly toDate = signal<string>('');
  readonly moduleFilter = signal<UsageModule | null>(null);
  readonly roleFilter = signal<UserRole | null>(null);

  readonly hasActiveFilters = computed<boolean>(() =>
    this.fromDate().length > 0 ||
    this.toDate().length > 0 ||
    this.moduleFilter() !== null ||
    this.roleFilter() !== null
  );

  readonly topModuleLabel = computed<string>(() => this.topLabel(this.summary()?.byModule, (k) => this.moduleLabel(k)));
  readonly topEventLabel = computed<string>(() => this.topLabel(this.summary()?.byEventType, (k) => this.eventLabel(k)));
  readonly topRoleLabel = computed<string>(() => this.topLabel(this.summary()?.byRole, (k) => this.roleLabel(k)));

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

    this.metricsService.getRecent(RECENT_LIMIT, this.moduleFilter(), this.roleFilter()).subscribe({
      next: (list) => this.recent.set(list),
      error: () => this.recent.set([]),
    });
  }

  // === Etiquetas ===
  moduleLabel(key: string): string { return USAGE_MODULE_LABELS[key as UsageModule] ?? key; }
  eventLabel(key: string): string { return USAGE_EVENT_TYPE_LABELS[key as UsageEventType] ?? key; }
  roleLabel(key: string): string { return USAGE_ROLE_LABELS[key as UserRole] ?? key; }

  resourceText(ev: UsageEventResponse): string {
    if (!ev.resourceType && !ev.resourceId) return '—';
    if (ev.resourceType && ev.resourceId) return `${ev.resourceType} · ${ev.resourceId}`;
    return ev.resourceType ?? ev.resourceId ?? '—';
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
