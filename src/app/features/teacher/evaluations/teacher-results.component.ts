import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { TeacherEvaluationsService } from '../../../core/services/teacher-evaluations.service';
import {
  SidebarComponent,
  SidebarNavItem,
} from '../../../shared/components/sidebar/sidebar.component';
import { EvaluationResponse, EvaluationStatus } from '../../../shared/models';
import { TEACHER_NAV_ITEMS } from '../../../shared/components/sidebar/teacher-nav';

/**
 * Vista general de resultados del docente.
 * Ruta: /teacher/results. Lista las evaluaciones que pueden tener resultados
 * (publicadas o archivadas) y permite abrir el detalle de resultados de cada una.
 * Reutiliza el listado de evaluaciones del docente; el acceso por evaluación lleva a
 * /teacher/evaluations/:id/results, que muestra el resumen y los intentos.
 */
@Component({
  selector: 'app-teacher-results',
  standalone: true,
  imports: [SidebarComponent],
  styleUrls: ['./teacher-results.component.scss'],
  template: `
    <div class="layout">
      <app-sidebar
        [navItems]="navItems"
        [userName]="userName()"
        [userRole]="'Docente'"
        [userInitials]="userInitials()"
        (onLogout)="handleLogout()"
      />

      <main class="main">
        <header class="page-header">
          <div>
            <h1 class="page-title">Resultados</h1>
            <p class="page-description">
              Consulta las calificaciones obtenidas por tus estudiantes en las evaluaciones asignadas.
            </p>
          </div>
        </header>

        @if (loading()) {
          <div class="state">
            <div class="state__spinner"></div>
            <p class="state__title">Cargando evaluaciones…</p>
          </div>
        } @else if (error()) {
          <div class="state state--error">
            <span class="material-icons state__icon">cloud_off</span>
            <p class="state__title">No se pudieron cargar los resultados.</p>
            <button type="button" class="btn btn-primary" (click)="reload()">
              <span class="material-icons">refresh</span> Reintentar
            </button>
          </div>
        } @else if (withResults().length === 0) {
          <div class="empty-state">
            <div class="empty-state__icon"><span class="material-icons">bar_chart</span></div>
            <p class="empty-state__title">Aún no hay resultados disponibles.</p>
            <p class="empty-state__desc">
              Cuando tus estudiantes envíen sus evaluaciones, los resultados aparecerán aquí.
            </p>
          </div>
        } @else {
          <div class="card-grid">
            @for (e of withResults(); track e.id) {
              <article class="result-card">
                <div class="result-card__top">
                  @if (e.topic) {
                    <span class="badge badge-neutral">{{ e.topic }}</span>
                  } @else {
                    <span class="badge badge-neutral">Sin tema</span>
                  }
                  <span class="badge" [class]="statusBadge(e.status)">{{ statusLabel(e.status) }}</span>
                </div>

                <h3 class="result-card__title">{{ e.title }}</h3>
                <p class="result-card__desc">{{ e.description || 'Sin descripción.' }}</p>

                <div class="result-card__meta">
                  <span><span class="material-icons">help_outline</span> {{ e.questionCount }} pregunta(s)</span>
                  <span><span class="material-icons">group</span> {{ e.assignmentCount }} asignación(es)</span>
                  <span><span class="material-icons">replay</span> {{ e.maxAttempts }} intento(s)</span>
                </div>

                <button type="button" class="btn btn-primary result-card__action" (click)="openResults(e)">
                  Ver resultados <span class="material-icons">arrow_forward</span>
                </button>
              </article>
            }
          </div>
        }
      </main>
    </div>
  `,
})
export class TeacherResultsComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly service = inject(TeacherEvaluationsService);
  private readonly router = inject(Router);

  readonly navItems: readonly SidebarNavItem[] = TEACHER_NAV_ITEMS;

  readonly loading = signal(true);
  readonly error = signal(false);
  readonly evaluations = signal<EvaluationResponse[]>([]);

  readonly userName = computed<string>(() => this.auth.currentUser()?.username ?? 'Usuario');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  /** Solo las evaluaciones que pueden tener resultados (publicadas o archivadas). */
  readonly withResults = computed<EvaluationResponse[]>(() =>
    this.evaluations().filter((e) => e.status === 'PUBLISHED' || e.status === 'ARCHIVED')
  );

  ngOnInit(): void {
    this.load();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(false);
    this.load();
  }

  private load(): void {
    this.service.listTeacherEvaluations().subscribe({
      next: (data) => {
        this.evaluations.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  openResults(evaluation: EvaluationResponse): void {
    void this.router.navigateByUrl(`/teacher/results/${evaluation.id}`);
  }

  handleLogout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/auth/login');
  }

  statusLabel(status: EvaluationStatus): string {
    return status === 'PUBLISHED' ? 'Publicada' : status === 'ARCHIVED' ? 'Archivada' : 'Borrador';
  }

  statusBadge(status: EvaluationStatus): string {
    return status === 'PUBLISHED' ? 'badge-success' : status === 'ARCHIVED' ? 'badge-neutral' : 'badge-warning';
  }
}

function buildInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
