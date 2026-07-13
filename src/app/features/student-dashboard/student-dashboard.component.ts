import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SidebarComponent, SidebarNavItem } from '../../shared/components/sidebar/sidebar.component';
import { STUDENT_NAV_ITEMS } from '../../shared/components/sidebar/student-nav';
import { AuthResponse } from '../../shared/models';
import { buildInitials, firstNameAndLastName } from '../../shared/utils/display-format.util';

interface DashboardCard {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly tone: 'mint' | 'blue' | 'violet' | 'amber' | 'green';
  readonly badge?: string;
  /** Ruta a la que navega la card. Si no se define, la card aún no está disponible. */
  readonly route?: string;
}

@Component({
  selector: 'app-student-dashboard',
  standalone: true,
  imports: [SidebarComponent],
  styleUrls: ['./student-dashboard.component.scss'],
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
            <h1 class="main__title">Hola, {{ displayName() }} <span class="main__wave">👋</span></h1>
            <p class="main__subtitle">¿Qué quieres explorar hoy?</p>
          </div>
          <div class="role-chip">
            <span class="role-chip__dot"></span>
            Estudiante
          </div>
        </header>

        <section class="cards-grid">
          @for (card of cards; track card.id) {
            <article
              class="card"
              [attr.data-tone]="card.tone"
              [class.card--disabled]="!card.route"
              [attr.role]="card.route ? 'button' : null"
              [attr.tabindex]="card.route ? 0 : null"
              (click)="openCard(card)"
              (keydown.enter)="openCard(card)"
              (keydown.space)="openCard(card)"
            >
              <div class="card__icon" [attr.data-tone]="card.tone">
                <span class="material-icons">{{ card.icon }}</span>
              </div>
              <div class="card__head">
                <h3 class="card__title">{{ card.title }}</h3>
                @if (card.badge) {
                  <span class="card__badge">{{ card.badge }}</span>
                }
              </div>
              <p class="card__desc">{{ card.description }}</p>
              <div class="card__cta">
                {{ card.route ? 'Abrir' : 'Próximamente' }}
                @if (card.route) {
                  <span class="material-icons card__cta-arrow">arrow_forward</span>
                }
              </div>
            </article>
          }
        </section>
      </main>
    </div>
  `,
})
export class StudentDashboardComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly navItems: readonly SidebarNavItem[] = STUDENT_NAV_ITEMS;

  readonly userRole = 'Estudiante';

  private readonly storedUser = signal<AuthResponse | null>(this.readStoredUser());

  readonly userName = computed<string>(() => {
    const user = this.storedUser();
    return firstNameAndLastName(user, user?.username ?? 'Estudiante');
  });

  readonly displayName = computed<string>(() => firstNameAndLastName(this.storedUser(), 'Estudiante'));

  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  readonly cards: readonly DashboardCard[] = [
    {
      id: 'periodic',
      title: 'Tabla periódica',
      description: 'Consulta los 118 elementos.',
      icon: 'science',
      tone: 'mint',
      route: '/periodic-table',
    },
    {
      id: 'concepts',
      title: 'Conceptos químicos',
      description: 'Aprende sobre óxidos, hidróxidos, ácidos, sales y nomenclatura.',
      icon: 'menu_book',
      tone: 'blue',
      route: '/concepts',
    },
    {
      id: 'compounds',
      title: 'Formación de compuestos',
      description: 'Combina elementos y genera fórmulas químicas.',
      icon: 'biotech',
      tone: 'violet',
      route: '/compounds',
    },
    {
      id: 'whiteboards',
      title: 'Pizarra interactiva',
      description: 'Únete a las pizarras en vivo de tu clase y revisa las finalizadas.',
      icon: 'draw',
      tone: 'green',
      route: '/student/whiteboards',
    },
    {
      id: 'evaluations',
      title: 'Mis evaluaciones',
      description: 'Desarrolla las evaluaciones asignadas por tu docente.',
      icon: 'assignment',
      tone: 'amber',
      route: '/evaluations',
    },
    {
      id: 'results',
      title: 'Mis resultados',
      description: 'Revisa tus calificaciones.',
      icon: 'bar_chart',
      tone: 'green',
      route: '/evaluations/results',
    },
  ];

  openCard(card: DashboardCard): void {
    if (card.route) {
      void this.router.navigateByUrl(card.route);
    }
  }

  handleLogout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
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

