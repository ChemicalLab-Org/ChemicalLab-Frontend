import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { TeacherEvaluationsService } from '../../../core/services/teacher-evaluations.service';
import {
  SidebarComponent,
  SidebarNavItem,
} from '../../../shared/components/sidebar/sidebar.component';
import { TEACHER_NAV_ITEMS } from '../../../shared/components/sidebar/teacher-nav';
import {
  AttemptStatus,
  TeacherAttemptResultDetailResponse,
  TeacherEvaluationResultsResponse,
  TeacherStudentResultResponse,
} from '../../../shared/models';

type ApprovalFilter = 'all' | 'approved' | 'failed';
type SortKey = 'score' | 'date';

/** Umbral de aprobación (%) usado solo para etiquetar y filtrar filas en la UI. */
const APPROVAL_PERCENTAGE = 60;

/**
 * Vista de resultados de una evaluación para el docente.
 * Ruta: /teacher/evaluations/:evaluationId/results. Consume
 * GET /api/evaluations/teacher/{id}/results y el detalle de cada intento. El docente
 * solo accede a resultados de sus propias evaluaciones (validado en el backend).
 */
@Component({
  selector: 'app-teacher-evaluation-results',
  standalone: true,
  imports: [SidebarComponent],
  styleUrls: ['./teacher-evaluation-results.component.scss'],
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
        <button type="button" class="back-link" (click)="goBack()">
          <span class="material-icons">arrow_back</span> {{ backLabel }}
        </button>

        @if (loading()) {
          <div class="state">
            <div class="state__spinner"></div>
            <p class="state__title">Cargando resultados…</p>
          </div>
        } @else if (error()) {
          <div class="state state--error">
            <span class="material-icons state__icon">cloud_off</span>
            <p class="state__title">No se pudieron cargar los resultados.</p>
            <button type="button" class="btn btn-primary" (click)="reload()">
              <span class="material-icons">refresh</span> Reintentar
            </button>
          </div>
        } @else if (data(); as d) {
          <header class="page-header">
            <div>
              <h1 class="page-title">Resultados: {{ d.title }}</h1>
              <p class="page-description">
                @if (d.topic) {
                  <span class="badge badge-neutral">{{ d.topic }}</span>
                }
                Puntaje máximo: <strong>{{ d.maxScore }}</strong>
              </p>
            </div>
          </header>

          @if (d.totalAttempts === 0) {
            <div class="empty-state">
              <div class="empty-state__icon"><span class="material-icons">inbox</span></div>
              <p class="empty-state__title">Aún no hay intentos enviados para esta evaluación.</p>
            </div>
          } @else {
            <!-- Resumen -->
            <div class="summary">
              <div class="summary__card">
                <span class="summary__label">Intentos</span>
                <span class="summary__value">{{ d.totalAttempts }}</span>
              </div>
              <div class="summary__card">
                <span class="summary__label">Promedio</span>
                <span class="summary__value">{{ formatScore(d.averageScore) }} / {{ d.maxScore }}</span>
              </div>
              <div class="summary__card">
                <span class="summary__label">% promedio</span>
                <span class="summary__value">{{ formatPct(d.averagePercentage) }}</span>
              </div>
              <div class="summary__card">
                <span class="summary__label">Mayor</span>
                <span class="summary__value">{{ formatScore(d.highestScore) }}</span>
              </div>
              <div class="summary__card">
                <span class="summary__label">Menor</span>
                <span class="summary__value">{{ formatScore(d.lowestScore) }}</span>
              </div>
              <div class="summary__card">
                <span class="summary__label">Aprobados / Desaprob.</span>
                <span class="summary__value">{{ d.approvedCount }} / {{ d.failedCount }}</span>
              </div>
            </div>

            <!-- Filtros -->
            <div class="toolbar">
              <div class="input-group toolbar__search">
                <span class="material-icons input-group__icon">search</span>
                <input
                  class="input"
                  type="search"
                  placeholder="Buscar por estudiante o código…"
                  [value]="query()"
                  (input)="onSearch($event)"
                />
              </div>

              @if (sections().length > 1) {
                <select class="input toolbar__select" (change)="onSection($event)">
                  <option value="">Todas las secciones</option>
                  @for (s of sections(); track s) {
                    <option [value]="s" [selected]="sectionFilter() === s">Sección {{ s }}</option>
                  }
                </select>
              }

              <div class="pills">
                @for (f of approvalFilters; track f.key) {
                  <button
                    type="button"
                    class="pill"
                    [class.pill--active]="approvalFilter() === f.key"
                    (click)="approvalFilter.set(f.key)"
                  >
                    {{ f.label }}
                  </button>
                }
              </div>

              <button type="button" class="btn btn-ghost btn-sm" (click)="toggleSort()">
                <span class="material-icons">swap_vert</span>
                Orden: {{ sortKey() === 'score' ? 'Puntaje' : 'Fecha' }}
              </button>
            </div>

            @if (visibleRows().length === 0) {
              <div class="empty-state">
                <div class="empty-state__icon"><span class="material-icons">search_off</span></div>
                <p class="empty-state__title">No hay resultados con los filtros aplicados.</p>
              </div>
            } @else {
              <div class="table-container">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Estudiante</th>
                      <th>Grado/Sección</th>
                      <th>Intento</th>
                      <th>Puntaje</th>
                      <th>%</th>
                      <th>Estado</th>
                      <th>Enviado</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of visibleRows(); track r.attemptId) {
                      <tr>
                        <td>
                          <div class="student">
                            <span class="student__name">{{ r.studentName }}</span>
                            <span class="student__code">{{ r.studentCode }}</span>
                          </div>
                        </td>
                        <td>{{ r.grade }} "{{ r.section }}"</td>
                        <td>N.° {{ r.attemptNumber }}</td>
                        <td class="text-mono">{{ r.score ?? 0 }} / {{ r.maxScore ?? d.maxScore }}</td>
                        <td>
                          <span class="badge" [class]="pctBadge(r.percentage)">
                            {{ formatPct(r.percentage) }}
                          </span>
                        </td>
                        <td><span class="badge badge-success">{{ statusLabel(r.status) }}</span></td>
                        <td>{{ r.submittedAt ? formatDate(r.submittedAt) : '—' }}</td>
                        <td>
                          <button type="button" class="btn btn-secondary btn-sm" (click)="openDetail(r)">
                            Ver detalle
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              <div class="table-summary">
                Mostrando <strong>{{ visibleRows().length }}</strong> de
                <strong>{{ data()!.results.length }}</strong> intentos
              </div>
            }
          }
        }
      </main>
    </div>

    <!-- Modal: detalle de intento -->
    @if (detailOpen()) {
      <div class="modal-overlay" (click)="closeDetail()">
        <div class="modal" (click)="$event.stopPropagation()">
          <header class="modal__header">
            <h2 class="modal__title">Detalle del intento</h2>
            <button type="button" class="modal__close" aria-label="Cerrar" (click)="closeDetail()">
              <span class="material-icons">close</span>
            </button>
          </header>

          <div class="modal__body">
            @if (detailLoading()) {
              <div class="state">
                <div class="state__spinner"></div>
                <p class="state__title">Cargando detalle…</p>
              </div>
            } @else if (detailError()) {
              <div class="state state--error">
                <span class="material-icons state__icon">cloud_off</span>
                <p class="state__title">No se pudo cargar el detalle.</p>
                <button type="button" class="btn btn-primary" (click)="reloadDetail()">
                  <span class="material-icons">refresh</span> Reintentar
                </button>
              </div>
            } @else if (detail(); as dt) {
              <div class="detail-head">
                <div>
                  <span class="detail-head__name">{{ dt.studentName }}</span>
                  <span class="detail-head__meta">
                    {{ dt.studentCode }} · {{ dt.grade }} "{{ dt.section }}" · Intento N.° {{ dt.attemptNumber }}
                  </span>
                </div>
                <div class="detail-head__score">
                  <span class="badge" [class]="pctBadge(dt.percentage)">{{ formatPct(dt.percentage) }}</span>
                  <span class="detail-head__points">{{ dt.score ?? 0 }} / {{ dt.maxScore ?? 0 }}</span>
                </div>
              </div>

              <div class="answers">
                @for (a of dt.answers; track a.questionId; let i = $index) {
                  <div class="answer" [class.answer--ok]="a.correct" [class.answer--bad]="a.correct === false">
                    <div class="answer__head">
                      <span class="answer__num">{{ i + 1 }}</span>
                      <span class="answer__text">{{ a.questionText }}</span>
                      <span class="answer__points">{{ a.pointsAwarded }} / {{ a.points }}</span>
                    </div>
                    <div class="answer__row">
                      <span class="answer__label">Respuesta del estudiante:</span>
                      <span class="answer__value" [class.answer__value--muted]="!a.selectedOptionText">
                        {{ a.selectedOptionText || 'Sin responder' }}
                        @if (a.correct) {
                          <span class="material-icons answer__icon answer__icon--ok">check_circle</span>
                        } @else {
                          <span class="material-icons answer__icon answer__icon--bad">cancel</span>
                        }
                      </span>
                    </div>
                    @if (!a.correct && a.correctOptionText) {
                      <div class="answer__row">
                        <span class="answer__label">Respuesta correcta:</span>
                        <span class="answer__value answer__value--correct">{{ a.correctOptionText }}</span>
                      </div>
                    }
                    @if (a.explanation) {
                      <p class="answer__explanation">
                        <span class="material-icons">lightbulb</span> {{ a.explanation }}
                      </p>
                    }
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class TeacherEvaluationResultsComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly service = inject(TeacherEvaluationsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly navItems: readonly SidebarNavItem[] = TEACHER_NAV_ITEMS;

  readonly approvalFilters: ReadonlyArray<{ key: ApprovalFilter; label: string }> = [
    { key: 'all', label: 'Todos' },
    { key: 'approved', label: 'Aprobados' },
    { key: 'failed', label: 'Desaprobados' },
  ];

  private evaluationId = 0;
  // El detalle se alcanza desde "Resultados" (/teacher/results/:id) o desde
  // "Evaluaciones" (/teacher/evaluations/:id/results); volvemos al origen correcto.
  private cameFromResults = false;
  backLabel = 'Evaluaciones';

  readonly loading = signal(true);
  readonly error = signal(false);
  readonly data = signal<TeacherEvaluationResultsResponse | null>(null);

  readonly query = signal('');
  readonly sectionFilter = signal('');
  readonly approvalFilter = signal<ApprovalFilter>('all');
  readonly sortKey = signal<SortKey>('date');

  readonly detailOpen = signal(false);
  readonly detailLoading = signal(false);
  readonly detailError = signal(false);
  readonly detail = signal<TeacherAttemptResultDetailResponse | null>(null);
  private detailAttemptId: number | null = null;

  readonly userName = computed<string>(() => this.auth.currentUser()?.username ?? 'Usuario');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  readonly sections = computed<string[]>(() => {
    const set = new Set<string>();
    for (const r of this.data()?.results ?? []) set.add(r.section);
    return [...set].sort();
  });

  readonly visibleRows = computed<TeacherStudentResultResponse[]>(() => {
    const rows = [...(this.data()?.results ?? [])];
    const q = this.query().toLowerCase().trim();
    const section = this.sectionFilter();
    const approval = this.approvalFilter();

    const filtered = rows.filter((r) => {
      if (section && r.section !== section) return false;
      if (approval === 'approved' && !this.isApproved(r.percentage)) return false;
      if (approval === 'failed' && this.isApproved(r.percentage)) return false;
      if (!q) return true;
      return (
        r.studentName.toLowerCase().includes(q) || r.studentCode.toLowerCase().includes(q)
      );
    });

    filtered.sort((a, b) => {
      if (this.sortKey() === 'score') {
        return (b.percentage ?? 0) - (a.percentage ?? 0);
      }
      return new Date(b.submittedAt ?? 0).getTime() - new Date(a.submittedAt ?? 0).getTime();
    });
    return filtered;
  });

  ngOnInit(): void {
    this.evaluationId = Number(this.route.snapshot.paramMap.get('evaluationId'));
    this.cameFromResults = this.router.url.startsWith('/teacher/results');
    this.backLabel = this.cameFromResults ? 'Resultados' : 'Evaluaciones';
    this.load();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(false);
    this.load();
  }

  private load(): void {
    this.service.getEvaluationResults(this.evaluationId).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  onSection(event: Event): void {
    this.sectionFilter.set((event.target as HTMLSelectElement).value);
  }

  toggleSort(): void {
    this.sortKey.update((k) => (k === 'score' ? 'date' : 'score'));
  }

  openDetail(row: TeacherStudentResultResponse): void {
    this.detailAttemptId = row.attemptId;
    this.detailOpen.set(true);
    this.loadDetail();
  }

  reloadDetail(): void {
    this.loadDetail();
  }

  private loadDetail(): void {
    if (this.detailAttemptId === null) return;
    this.detail.set(null);
    this.detailLoading.set(true);
    this.detailError.set(false);
    this.service.getTeacherAttemptResult(this.detailAttemptId).subscribe({
      next: (d) => {
        this.detail.set(d);
        this.detailLoading.set(false);
      },
      error: () => {
        this.detailError.set(true);
        this.detailLoading.set(false);
      },
    });
  }

  closeDetail(): void {
    this.detailOpen.set(false);
    this.detail.set(null);
    this.detailAttemptId = null;
  }

  goBack(): void {
    void this.router.navigateByUrl(this.cameFromResults ? '/teacher/results' : '/teacher/evaluations');
  }

  handleLogout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/auth/login');
  }

  // ── Utilidades de presentación ──

  isApproved(percentage: number | null): boolean {
    return (percentage ?? 0) >= APPROVAL_PERCENTAGE;
  }

  pctBadge(percentage: number | null): string {
    const p = percentage ?? 0;
    if (p >= APPROVAL_PERCENTAGE) return 'badge-success';
    if (p >= 40) return 'badge-warning';
    return 'badge-danger';
  }

  statusLabel(status: AttemptStatus): string {
    return status === 'GRADED' ? 'Calificado' : status === 'SUBMITTED' ? 'Enviado' : 'En progreso';
  }

  formatScore(value: number | null): string {
    return value === null || value === undefined ? '—' : String(value);
  }

  formatPct(value: number | null): string {
    return value === null || value === undefined ? '—' : `${value}%`;
  }

  formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('es-PE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }
}

function buildInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
