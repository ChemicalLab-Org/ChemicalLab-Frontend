import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AdminService } from '../../core/services/admin.service';
import { SidebarComponent, SidebarNavItem } from '../../shared/components/sidebar/sidebar.component';
import { ADMIN_NAV_ITEMS } from '../../shared/components/sidebar/admin-nav';
import { AdminSummary, AuthResponse } from '../../shared/models';

interface MetricCard {
  readonly id: string;
  readonly label: string;
  readonly value: number | string;
  readonly icon: string;
}

interface ShortcutCard {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly tone: 'mint' | 'violet' | 'amber' | 'green';
  readonly cta: string;
  /** Ruta a la que navega la card. Si no se define, la card aún no es funcional. */
  readonly route?: string;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [SidebarComponent],
  styleUrls: ['./admin-dashboard.component.scss'],
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
            <h1 class="main__title">
              Bienvenido, Administrador <span class="main__wave">👋</span>
            </h1>
            <p class="main__subtitle">Resumen general del sistema.</p>
          </div>
          <div class="role-chip">
            <span class="role-chip__dot"></span>
            Administrador del sistema
          </div>
        </header>

        <section class="metrics-grid">
          @for (m of metrics(); track m.id) {
            <div class="metric">
              <div class="metric__icon">
                <span class="material-icons">{{ m.icon }}</span>
              </div>
              <div class="metric__body">
                <div class="metric__label">{{ m.label }}</div>
                <div class="metric__value">{{ m.value }}</div>
              </div>
            </div>
          }
        </section>

        <section class="shortcuts">
          <div class="shortcuts__header">Accesos rápidos</div>
          <div class="shortcuts-grid">
            @for (s of shortcuts; track s.id) {
              <article
                class="card"
                [class.card--clickable]="s.route"
                [attr.data-tone]="s.tone"
                [attr.role]="s.route ? 'button' : null"
                [attr.tabindex]="s.route ? 0 : null"
                (click)="openShortcut(s)"
                (keyup.enter)="openShortcut(s)"
              >
                <div class="card__icon" [attr.data-tone]="s.tone">
                  <span class="material-icons">{{ s.icon }}</span>
                </div>
                <h3 class="card__title">{{ s.title }}</h3>
                <p class="card__desc">{{ s.description }}</p>
                <div class="card__cta">
                  {{ s.route ? s.cta : 'Próximamente' }}
                  @if (s.route) {
                    <span class="material-icons card__cta-arrow">arrow_forward</span>
                  }
                </div>
              </article>
            }
          </div>
        </section>
      </main>
    </div>
  `,
})
export class AdminDashboardComponent {
  private readonly authService = inject(AuthService);
  private readonly adminService = inject(AdminService);
  private readonly router = inject(Router);

  readonly navItems: readonly SidebarNavItem[] = ADMIN_NAV_ITEMS;

  readonly userRole = 'Admin';

  private readonly storedUser = signal<AuthResponse | null>(this.readStoredUser());

  readonly userName = computed<string>(() => this.storedUser()?.username ?? 'Administrador');

  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  // Las métricas provienen del resumen administrativo (/api/admin/summary).
  // Si la carga falla, cada métrica se muestra como «—» y el dashboard sigue siendo usable.
  private readonly summary = signal<AdminSummary | null>(null);

  readonly metrics = computed<readonly MetricCard[]>(() => {
    const s = this.summary();
    const v = (n: number | undefined): number | string => (s ? n ?? 0 : '—');
    return [
      { id: 'users', label: 'Total usuarios', value: v(s?.totalUsers), icon: 'group' },
      { id: 'teachers', label: 'Total docentes', value: v(s?.totalTeachers), icon: 'badge' },
      { id: 'students', label: 'Total estudiantes', value: v(s?.totalStudents), icon: 'school' },
      { id: 'evaluations', label: 'Evaluaciones', value: v(s?.totalEvaluations), icon: 'grading' },
    ];
  });

  readonly shortcuts: readonly ShortcutCard[] = [
    {
      id: 'teachers',
      title: 'Gestión de docentes',
      description: 'Registra y administra los docentes del sistema.',
      icon: 'badge',
      tone: 'mint',
      cta: 'Ir a docentes',
      route: '/admin/teachers',
    },
    {
      id: 'users',
      title: 'Usuarios y roles',
      description: 'Gestiona roles y permisos de los usuarios.',
      icon: 'manage_accounts',
      tone: 'violet',
      cta: 'Ver usuarios',
      route: '/admin/users',
    },
    {
      id: 'academic-supervision',
      title: 'Supervisión académica',
      description: 'Supervisa contenidos, evaluaciones, asignaciones y actividad.',
      icon: 'school',
      tone: 'green',
      cta: 'Ir a supervisión',
      route: '/admin/academic-supervision',
    },
    {
      id: 'logs',
      title: 'Logs del sistema',
      description: 'Revisa el registro de actividad del sistema.',
      icon: 'terminal',
      tone: 'amber',
      cta: 'Ver logs',
      route: '/admin/logs',
    },
    {
      id: 'system',
      title: 'Estado del sistema',
      description: 'Monitorea el estado del backend y la base de datos.',
      icon: 'monitor_heart',
      tone: 'green',
      cta: 'Ver estado',
      route: '/admin/system-status',
    },
  ];

  constructor() {
    this.loadSummary();
  }

  openShortcut(shortcut: ShortcutCard): void {
    if (shortcut.route) {
      void this.router.navigateByUrl(shortcut.route);
    }
  }

  handleLogout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
  }

  private loadSummary(): void {
    this.adminService.getSummary().subscribe({
      next: (summary) => this.summary.set(summary),
      // Si falla, las métricas se mantienen como «—»; el dashboard sigue siendo usable.
      error: () => this.summary.set(null),
    });
  }

  private readStoredUser(): AuthResponse | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    const raw = localStorage.getItem('auth_user');
    if (raw === null) {
      return null;
    }
    try {
      return JSON.parse(raw) as AuthResponse;
    } catch {
      return null;
    }
  }
}

function buildInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) {
    return 'AD';
  }
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
