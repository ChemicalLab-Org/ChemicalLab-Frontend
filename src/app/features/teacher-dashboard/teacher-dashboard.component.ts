import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { UserManagementService } from '../../core/services/user-management.service';
import { SidebarComponent, SidebarNavItem } from '../../shared/components/sidebar/sidebar.component';
import { TEACHER_NAV_ITEMS } from '../../shared/components/sidebar/teacher-nav';
import { AuthResponse } from '../../shared/models';
import { buildInitials, firstNameAndLastName } from '../../shared/utils/display-format.util';

interface MetricCard {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly icon: string;
}

interface ShortcutCard {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly tone: 'mint' | 'blue' | 'green' | 'amber';
  readonly cta: string;
  /** Ruta a la que navega el acceso rápido. Si no se define, el card no navega. */
  readonly route?: string;
}

@Component({
  selector: 'app-teacher-dashboard',
  standalone: true,
  imports: [SidebarComponent],
  styleUrls: ['./teacher-dashboard.component.scss'],
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
              Hola, profesor(a) {{ firstName() }} <span class="main__wave">👋</span>
            </h1>
            <p class="main__subtitle">Aquí tienes el resumen de tu clase.</p>
          </div>
          <div class="role-chip">
            <span class="role-chip__dot"></span>
            Docente
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
                [attr.data-tone]="s.tone"
                [attr.role]="s.route ? 'button' : null"
                [attr.tabindex]="s.route ? 0 : null"
                (click)="onShortcut(s)"
                (keydown.enter)="onShortcut(s)"
              >
                <div class="card__icon" [attr.data-tone]="s.tone">
                  <span class="material-icons">{{ s.icon }}</span>
                </div>
                <h3 class="card__title">{{ s.title }}</h3>
                <p class="card__desc">{{ s.description }}</p>
                <div class="card__cta">
                  {{ s.cta }}
                  <span class="material-icons card__cta-arrow">arrow_forward</span>
                </div>
              </article>
            }
          </div>
        </section>
      </main>
    </div>
  `,
})
export class TeacherDashboardComponent {
  private readonly authService = inject(AuthService);
  private readonly userManagementService = inject(UserManagementService);
  private readonly router = inject(Router);

  readonly navItems: readonly SidebarNavItem[] = TEACHER_NAV_ITEMS;

  readonly userRole = 'Docente';

  private readonly storedUser = signal<AuthResponse | null>(this.readStoredUser());

  readonly userName = computed<string>(() =>
    firstNameAndLastName(this.storedUser(), this.storedUser()?.username ?? 'Docente')
  );

  readonly firstName = computed<string>(() => firstNameAndLastName(this.storedUser(), 'Docente'));

  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  // Cantidad real de estudiantes del docente autenticado.
  private readonly studentCount = signal<number>(0);

  readonly metrics = computed<MetricCard[]>(() => [
    { id: 'students', label: 'Estudiantes registrados', value: this.studentCount(), icon: 'group' },
    { id: 'created', label: 'Evaluaciones creadas', value: 0, icon: 'grading' },
    { id: 'active', label: 'Evaluaciones activas', value: 0, icon: 'pending_actions' },
  ]);

  readonly shortcuts: readonly ShortcutCard[] = [
    {
      id: 'students',
      title: 'Mis estudiantes',
      description: 'Registra y gestiona tus estudiantes.',
      icon: 'group',
      tone: 'mint',
      cta: 'Ir a estudiantes',
      route: '/teacher/students',
    },
    {
      id: 'concepts',
      title: 'Gestionar contenidos',
      description: 'Crea y asigna contenidos conceptuales.',
      icon: 'library_books',
      tone: 'green',
      cta: 'Gestionar contenidos',
      route: '/teacher/concepts',
    },
    {
      id: 'evaluations',
      title: 'Gestionar evaluaciones',
      description: 'Crea, publica y asigna evaluaciones.',
      icon: 'grading',
      tone: 'blue',
      cta: 'Gestionar evaluaciones',
      route: '/teacher/evaluations',
    },
    {
      id: 'results',
      title: 'Ver resultados',
      description: 'Revisa el desempeño de tus estudiantes.',
      icon: 'bar_chart',
      tone: 'green',
      cta: 'Ver resultados',
      route: '/teacher/results',
    },
    {
      id: 'whiteboards',
      title: 'Pizarra interactiva',
      description: 'Dibuja y explica conceptos en vivo con tu clase.',
      icon: 'draw',
      tone: 'blue',
      cta: 'Abrir pizarra',
      route: '/teacher/whiteboards',
    },
    {
      id: 'compounds',
      title: 'Formación de compuestos',
      description: 'Forma y explica compuestos químicos en clase.',
      icon: 'biotech',
      tone: 'mint',
      cta: 'Abrir módulo',
      route: '/compounds',
    },
    {
      id: 'passwords',
      title: 'Restablecer contraseñas',
      description: 'Genera contraseñas temporales.',
      icon: 'lock_reset',
      tone: 'amber',
      cta: 'Gestionar contraseñas',
      route: '/teacher/passwords',
    },
  ];

  constructor() {
    this.loadStudentCount();
  }

  onShortcut(shortcut: ShortcutCard): void {
    if (shortcut.route) {
      void this.router.navigateByUrl(shortcut.route);
    }
  }

  handleLogout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
  }

  private loadStudentCount(): void {
    const teacherUserId = this.authService.currentUser()?.userId ?? null;
    if (teacherUserId === null) {
      return;
    }

    this.userManagementService.listStudentsByTeacher(teacherUserId).subscribe({
      next: (students) => this.studentCount.set(students.length),
      error: (err: unknown) => {
        // Si falla, la métrica se mantiene en 0 y dejamos registro controlado en consola.
        const status = err instanceof HttpErrorResponse ? err.status : 'desconocido';
        console.error(`No se pudo cargar el número de estudiantes (estado: ${status}).`);
        this.studentCount.set(0);
      },
    });
  }

  private readStoredUser(): AuthResponse | null {
    if (typeof sessionStorage === 'undefined') {
      return null;
    }
    const raw = sessionStorage.getItem('auth_user');
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

