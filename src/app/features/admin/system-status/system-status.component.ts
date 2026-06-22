import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { SystemStatusService, SystemHealth, ServiceStatus } from '../../../core/services/system-status.service';
import { SidebarComponent, SidebarNavItem } from '../../../shared/components/sidebar/sidebar.component';
import { AuthResponse } from '../../../shared/models';

@Component({
  selector: 'app-system-status',
  standalone: true,
  imports: [SidebarComponent],
  styleUrls: ['./system-status.component.scss'],
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
            <h1 class="main__title">Estado del sistema</h1>
            <p class="main__subtitle">Monitoreo técnico del backend y la base de datos.</p>
          </div>
          <button type="button" class="btn-refresh" (click)="refreshStatus()" [disabled]="loading()">
            <span class="material-icons">{{ loading() ? 'hourglass_empty' : 'refresh' }}</span>
            {{ loading() ? 'Verificando…' : 'Actualizar estado' }}
          </button>
        </header>

        <section class="status-grid">
          <!-- Frontend -->
          <div class="status-card">
            <div class="status-card__header">
              <div class="status-card__icon">
                <span class="material-icons">web</span>
              </div>
              <span class="badge badge--success">
                <span class="dot"></span>
                Disponible
              </span>
            </div>
            <div class="status-card__label">Frontend</div>
            <div class="status-card__detail">Aplicación web activa</div>
          </div>

          <!-- Backend -->
          <div class="status-card">
            <div class="status-card__header">
              <div class="status-card__icon">
                <span class="material-icons">dns</span>
              </div>
              @if (loading()) {
                <span class="badge badge--neutral">
                  <span class="dot"></span>
                  Verificando…
                </span>
              } @else {
                <span [class]="badgeClass(health()?.backend?.status)">
                  <span class="dot"></span>
                  {{ statusLabel(health()?.backend?.status) }}
                </span>
              }
            </div>
            <div class="status-card__label">Backend API</div>
            <div class="status-card__detail">
              {{ loading() ? 'Verificando conexión…' : 'Última verificación: ' + checkedAtLabel() }}
            </div>
          </div>

          <!-- Base de datos -->
          <div class="status-card">
            <div class="status-card__header">
              <div class="status-card__icon">
                <span class="material-icons">storage</span>
              </div>
              @if (loading()) {
                <span class="badge badge--neutral">
                  <span class="dot"></span>
                  Verificando…
                </span>
              } @else {
                <span [class]="badgeClass(health()?.database?.status)">
                  <span class="dot"></span>
                  {{ statusLabel(health()?.database?.status) }}
                </span>
              }
            </div>
            <div class="status-card__label">Base de datos</div>
            <div class="status-card__detail">
              @if (health()?.database?.status === 'no-informado') {
                Verificado por el backend
              } @else {
                PostgreSQL
              }
            </div>
          </div>

          <!-- Versión -->
          <div class="status-card">
            <div class="status-card__header">
              <div class="status-card__icon">
                <span class="material-icons">info_outline</span>
              </div>
            </div>
            <div class="status-card__label">Versión del sistema</div>
            <div class="status-card__version">v1.0.0 — MVP</div>
          </div>
        </section>

        @if (health()?.database?.status === 'no-informado' && health()?.backend?.status === 'disponible') {
          <div class="info-note">
            <span class="material-icons">info</span>
            La API respondió correctamente. El backend no reportó el estado detallado de la base de datos en este endpoint.
          </div>
        }

        <section class="info-section">
          <div class="section-label">Información del sistema</div>
          <div class="info-grid">
            <div class="info-col">
              <div class="info-row">
                <span class="info-key">Entorno</span>
                <span class="info-val">{{ envLabel }}</span>
              </div>
              <div class="info-row">
                <span class="info-key">Frontend</span>
                <span class="info-val info-val--mono">Angular 18</span>
              </div>
              <div class="info-row">
                <span class="info-key">Estado general</span>
                <span class="info-val" [class.text-success]="isOperativo()" [class.text-danger]="!isOperativo() && !loading()">
                  {{ estadoGeneral() }}
                </span>
              </div>
            </div>
            <div class="info-col">
              <div class="info-row">
                <span class="info-key">Backend</span>
                <span class="info-val info-val--mono">Spring Boot</span>
              </div>
              <div class="info-row">
                <span class="info-key">Base de datos</span>
                <span class="info-val info-val--mono">PostgreSQL 15</span>
              </div>
              <div class="info-row">
                <span class="info-key">Última revisión</span>
                <span class="info-val info-val--mono">{{ loading() ? '…' : checkedAtLabel() }}</span>
              </div>
            </div>
          </div>
          <div class="deploy-note">
            La validación se realiza contra la API configurada en el entorno.<br>
            Este sistema puede operar en red local, institucional o con reverse proxy — no requiere dominio público.
          </div>
        </section>
      </main>
    </div>
  `,
})
export class SystemStatusComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly statusService = inject(SystemStatusService);

  readonly navItems: readonly SidebarNavItem[] = [
    { label: 'Inicio', icon: 'home', route: '/admin-dashboard' },
    { label: 'Gestión de docentes', icon: 'badge', route: '/admin/teachers' },
    { label: 'Usuarios y roles', icon: 'manage_accounts', route: '/admin/users' },
    { label: 'Contenidos químicos', icon: 'auto_stories', route: '/admin-dashboard/content', disabled: true },
    { label: 'Elementos químicos', icon: 'table_chart', route: '/periodic-table' },
    { label: 'Grupos químicos', icon: 'hub', route: '/admin-dashboard/groups', disabled: true },
    { label: 'Logs del sistema', icon: 'terminal', route: '/admin-dashboard/logs', disabled: true },
    { label: 'Estado del sistema', icon: 'monitor_heart', route: '/admin/system-status' },
  ];

  readonly userRole = 'Admin';

  private readonly storedUser = signal<AuthResponse | null>(this.readStoredUser());

  readonly userName = computed<string>(() => this.storedUser()?.username ?? 'Administrador');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  readonly loading = signal<boolean>(false);
  readonly health = signal<SystemHealth | null>(null);

  readonly checkedAtLabel = computed<string>(() => {
    const h = this.health();
    if (h === null) return '—';
    return h.checkedAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  });

  readonly isOperativo = computed<boolean>(() => {
    const h = this.health();
    return h?.backend?.status === 'disponible';
  });

  readonly estadoGeneral = computed<string>(() => {
    if (this.loading()) return 'Verificando…';
    const h = this.health();
    if (h === null) return '—';
    if (h.backend.status === 'disponible') return 'Operativo';
    if (h.backend.status === 'con-problemas') return 'Con problemas';
    return 'No disponible';
  });

  readonly envLabel: string = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? 'Producción / Institucional'
    : 'Desarrollo local';

  ngOnInit(): void {
    this.refreshStatus();
  }

  refreshStatus(): void {
    this.loading.set(true);
    this.statusService.checkHealth().subscribe({
      next: (h) => {
        this.health.set(h);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  badgeClass(status: ServiceStatus | undefined): string {
    if (status === 'disponible') return 'badge badge--success';
    if (status === 'con-problemas') return 'badge badge--warning';
    if (status === 'no-informado') return 'badge badge--neutral';
    return 'badge badge--danger';
  }

  statusLabel(status: ServiceStatus | undefined): string {
    if (status === 'disponible') return 'Disponible';
    if (status === 'con-problemas') return 'Con problemas';
    if (status === 'no-informado') return 'No informado';
    return 'No disponible';
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
