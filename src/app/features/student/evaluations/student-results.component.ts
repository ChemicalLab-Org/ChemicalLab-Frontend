import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { UsageMetricsService } from '../../../core/services/usage-metrics.service';
import { StudentEvaluationsService } from '../../../core/services/student-evaluations.service';
import {
  SidebarComponent,
  SidebarNavItem,
} from '../../../shared/components/sidebar/sidebar.component';
import { STUDENT_NAV_ITEMS } from '../../../shared/components/sidebar/student-nav';
import {
  StudentAttemptResultDetailResponse,
  StudentResultSummaryResponse,
} from '../../../shared/models';
import { formatNumberWithoutTrailingZero } from '../../../shared/utils/display-format.util';

type View = 'list' | 'detail';

/** Umbral de aprobación (%) usado solo para colorear el porcentaje en la UI. */
const APPROVAL_PERCENTAGE = 60;

/**
 * Vista de resultados/calificaciones del estudiante.
 * Ruta: /evaluations/results. Lista las calificaciones de los intentos terminales y
 * permite abrir el detalle de cada uno. El detalle de respuestas correctas solo se
 * muestra cuando el backend lo autoriza (`canViewDetailedFeedback`), evitando que el
 * estudiante use el resultado para acertar en intentos que aún tenga disponibles.
 */
@Component({
  selector: 'app-student-results',
  standalone: true,
  imports: [SidebarComponent],
  styleUrls: ['./student-results.component.scss'],
  template: `
    <div class="layout">
      <app-sidebar
        [navItems]="navItems"
        [userName]="userName()"
        [userRole]="'Estudiante'"
        [userInitials]="userInitials()"
        (onLogout)="handleLogout()"
      />

      <main class="main">
        <!-- ════════════════ LISTA ════════════════ -->
        @if (view() === 'list') {
          <header class="page-header">
            <div>
              <h1 class="page-title">Mis resultados</h1>
              <p class="page-description">Consulta la calificación de tus evaluaciones.</p>
            </div>
          </header>

          @if (loading()) {
            <div class="state">
              <div class="state__spinner"></div>
              <p class="state__title">Cargando tus resultados…</p>
            </div>
          } @else if (error()) {
            <div class="state state--error">
              <span class="material-icons state__icon">cloud_off</span>
              <p class="state__title">No se pudieron cargar los resultados.</p>
              <button type="button" class="btn btn-primary" (click)="reload()">
                <span class="material-icons">refresh</span> Reintentar
              </button>
            </div>
          } @else if (results().length === 0) {
            <div class="empty-state">
              <div class="empty-state__icon"><span class="material-icons">bar_chart</span></div>
              <p class="empty-state__title">Aún no tienes evaluaciones calificadas.</p>
              <p class="empty-state__desc">
                Cuando envíes una evaluación, su calificación aparecerá aquí.
              </p>
            </div>
          } @else {
            <div class="result-list">
              @for (r of results(); track r.attemptId) {
                <article class="result-card">
                  <div class="result-card__main">
                    <div class="result-card__titlerow">
                      <h3 class="result-card__title">{{ r.evaluationTitle }}</h3>
                      @if (r.topic) {
                        <span class="badge badge-neutral">{{ r.topic }}</span>
                      }
                    </div>
                    <div class="result-card__meta">
                      <span><span class="material-icons">replay</span> Intento N.° {{ r.attemptNumber }}</span>
                      @if (r.submittedAt) {
                        <span><span class="material-icons">event</span> {{ formatDate(r.submittedAt) }}</span>
                      }
                    </div>
                  </div>

                  <div class="result-card__score">
                    @if (r.reviewLocked) {
                      <!-- La revisión del grupo aún no cierra: no se muestra la nota. -->
                      <span class="badge badge-warning">
                        <span class="material-icons">lock_clock</span> Revisión pendiente
                      </span>
                    } @else if (!r.gradeClosed) {
                      <span class="badge badge-warning">
                        <span class="material-icons">hourglass_top</span> Pendiente de calificación
                      </span>
                    } @else {
                      <span class="result-card__points">{{ formatGrade(r.finalScore) }} / 20</span>
                      <span class="badge" [class]="pctBadge(r.percentage)">{{ formatPct(r.percentage) }}</span>
                    }
                  </div>

                  <button type="button" class="btn btn-primary" (click)="openDetail(r.attemptId)">
                    Ver resultado <span class="material-icons">arrow_forward</span>
                  </button>
                </article>
              }
            </div>
          }
        }

        <!-- ════════════════ DETALLE ════════════════ -->
        @if (view() === 'detail') {
          <button type="button" class="back-link" (click)="backToList()">
            <span class="material-icons">arrow_back</span> Mis resultados
          </button>

          @if (detailLoading()) {
            <div class="state">
              <div class="state__spinner"></div>
              <p class="state__title">Cargando el resultado…</p>
            </div>
          } @else if (detailError()) {
            <div class="state state--error">
              <span class="material-icons state__icon">cloud_off</span>
              <p class="state__title">No se pudieron cargar los resultados.</p>
              <button type="button" class="btn btn-primary" (click)="reloadDetail()">
                <span class="material-icons">refresh</span> Reintentar
              </button>
            </div>
          } @else if (detail(); as d) {
            <header class="detail-header">
              <h1 class="page-title">{{ d.evaluationTitle }}</h1>
              @if (d.topic) {
                <span class="badge badge-neutral">{{ d.topic }}</span>
              }
            </header>

            @if (d.reviewLocked) {
              <!-- ═══ Revisión bloqueada hasta el cierre grupal (18.6) ═══
                   El backend no envía respuestas correctas ni nota mientras siga bloqueada;
                   aquí solo se muestra el estado, el plazo y el progreso general (sin nombres). -->
              <div class="review-pending">
                <div class="review-pending__icon">
                  <span class="material-icons">lock_clock</span>
                </div>
                <h2 class="review-pending__title">Revisión pendiente</h2>
                <p class="review-pending__text">
                  {{ d.reviewMessage ?? defaultLockedMessage }}
                </p>
                @if (d.reviewAvailableAt) {
                  <p class="review-pending__meta">
                    <span class="material-icons">event</span>
                    Disponible a partir del {{ formatDate(d.reviewAvailableAt) }}
                  </p>
                }
                @if (d.assignedStudentsCount > 0) {
                  <div class="review-pending__progress">
                    <div class="review-pending__progress-head">
                      <span>Progreso del grupo</span>
                      <span>{{ d.finishedStudentsCount }} de {{ d.assignedStudentsCount }} finalizaron</span>
                    </div>
                    <div class="review-pending__bar">
                      <div
                        class="review-pending__bar-fill"
                        [style.width.%]="groupProgressPct(d)"
                      ></div>
                    </div>
                  </div>
                }
                <button type="button" class="btn btn-primary" (click)="reloadDetail()">
                  <span class="material-icons">refresh</span> Actualizar estado
                </button>
              </div>
            } @else if (!d.gradeClosed) {
              <div class="alert alert-info feedback-locked">
                <span class="material-icons">hourglass_top</span>
                Tu evaluación fue enviada y está pendiente de calificación por el docente.
                Cuando cierre la calificación verás aquí tu nota final y su retroalimentación.
              </div>
            } @else {
              <div class="score-panel">
                <div class="score-panel__big">
                  <span class="score-panel__points">{{ formatGrade(d.finalScore) }}</span>
                  <span class="score-panel__max">/ 20</span>
                </div>
                <div class="score-panel__bar">
                  <div class="score-panel__bar-fill" [style.width.%]="d.percentage ?? 0"></div>
                </div>
                <div class="score-panel__facts">
                  <div class="fact">
                    <span class="fact__label">Puntaje</span>
                    <span class="fact__value">{{ formatScore(d.score) }} / {{ formatScore(d.maxScore) }}</span>
                  </div>
                  <div class="fact">
                    <span class="fact__label">Porcentaje</span>
                    <span class="badge" [class]="pctBadge(d.percentage)">{{ formatPct(d.percentage) }}</span>
                  </div>
                  <div class="fact">
                    <span class="fact__label">Intento</span>
                    <span class="fact__value">N.° {{ d.attemptNumber }}</span>
                  </div>
                  <div class="fact">
                    <span class="fact__label">Enviado</span>
                    <span class="fact__value">{{ d.submittedAt ? formatDate(d.submittedAt) : '—' }}</span>
                  </div>
                </div>
              </div>

              @if (d.overallFeedback) {
                <div class="alert alert-info">
                  <span class="material-icons">forum</span>
                  <span><strong>Retroalimentación del docente:</strong> {{ d.overallFeedback }}</span>
                </div>
              }

              <h2 class="section-title">Detalle de respuestas</h2>
              <div class="answers">
              @for (a of d.answers; track a.questionId; let i = $index) {
                @if (a.questionType === 'OPEN_TEXT') {
                  <!-- Pregunta abierta: el estudiante ve su texto y, una vez revisada,
                       el puntaje y la retroalimentación del docente. -->
                  <div class="answer">
                    <div class="answer__head">
                      <span class="answer__num">{{ i + 1 }}</span>
                      <span class="answer__text">{{ a.questionText }}</span>
                      @if (a.reviewed) {
                        <span class="answer__points">{{ formatScore(a.pointsAwarded) }} / {{ formatScore(a.points) }}</span>
                      } @else {
                        <span class="badge badge-warning">Pendiente de revisión</span>
                      }
                    </div>
                    <div class="answer__row">
                      <span class="answer__label">Tu respuesta:</span>
                      <span class="answer__value" [class.answer__value--muted]="!a.answerText">
                        {{ a.answerText || 'Sin responder' }}
                      </span>
                    </div>
                    @if (a.reviewed && a.teacherFeedback) {
                      <p class="answer__explanation">
                        <span class="material-icons">rate_review</span>
                        <strong>Retroalimentación:</strong> {{ a.teacherFeedback }}
                      </p>
                    }
                  </div>
                } @else {
                  <!-- Alternativa única: al llegar aquí la revisión ya está disponible
                       para el grupo, por lo que se muestra la corrección completa. -->
                  <div class="answer" [class.answer--ok]="a.correct" [class.answer--bad]="a.correct === false">
                    <div class="answer__head">
                      <span class="answer__num">{{ i + 1 }}</span>
                      <span class="answer__text">{{ a.questionText }}</span>
                      <span class="answer__points">{{ formatScore(a.pointsAwarded) }} / {{ formatScore(a.points) }}</span>
                    </div>
                    <div class="answer__row">
                      <span class="answer__label">Tu respuesta:</span>
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
              }
              </div>
            }
          }
        }
      </main>
    </div>
  `,
})
export class StudentResultsComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly service = inject(StudentEvaluationsService);
  private readonly router = inject(Router);
  private readonly usageMetrics = inject(UsageMetricsService);

  readonly navItems: readonly SidebarNavItem[] = STUDENT_NAV_ITEMS;

  readonly view = signal<View>('list');

  readonly loading = signal(true);
  readonly error = signal(false);
  readonly results = signal<StudentResultSummaryResponse[]>([]);

  readonly detailLoading = signal(false);
  readonly detailError = signal(false);
  readonly detail = signal<StudentAttemptResultDetailResponse | null>(null);
  private detailAttemptId: number | null = null;

  readonly userName = computed<string>(() => this.auth.currentUser()?.username ?? 'Usuario');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  /** Mensaje de respaldo si el backend no envía uno mientras la revisión está bloqueada. */
  readonly defaultLockedMessage =
    'Tu evaluación fue enviada correctamente. La revisión estará disponible cuando ' +
    'todas las estudiantes asignadas hayan finalizado o cuando se cumpla la fecha límite.';

  ngOnInit(): void {
    this.load();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(false);
    this.load();
  }

  private load(): void {
    this.service.listStudentResults().subscribe({
      next: (data) => {
        this.results.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  openDetail(attemptId: number): void {
    this.detailAttemptId = attemptId;
    this.view.set('detail');
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
    this.service.getStudentAttemptResult(this.detailAttemptId).subscribe({
      next: (d) => {
        this.detail.set(d);
        this.detailLoading.set(false);
        // Métrica de uso: solo cuenta como revisión efectiva cuando la revisión está
        // disponible. Un intento con la revisión bloqueada no se registra como consulta
        // exitosa de resultados (no se ve nota ni corrección).
        if (d.reviewAvailable) {
          this.usageMetrics.trackResultsViewed('ESTUDIANTE');
        }
      },
      error: () => {
        this.detailError.set(true);
        this.detailLoading.set(false);
      },
    });
  }

  backToList(): void {
    this.view.set('list');
    this.detail.set(null);
    this.detailAttemptId = null;
  }

  handleLogout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/auth/login');
  }

  // ── Utilidades de presentación ──

  pctBadge(percentage: number | null): string {
    const p = percentage ?? 0;
    if (p >= APPROVAL_PERCENTAGE) return 'badge-success';
    if (p >= 40) return 'badge-warning';
    return 'badge-danger';
  }

  /** Nota en escala 0–20 con un decimal; '—' si no hay valor. */
  formatGrade(value: number | null): string {
    return formatNumberWithoutTrailingZero(value);
  }

  formatScore(value: number | null): string {
    return formatNumberWithoutTrailingZero(value);
  }

  /** Porcentaje de estudiantes del grupo que ya finalizaron (para la barra de progreso). */
  groupProgressPct(d: StudentAttemptResultDetailResponse): number {
    if (d.assignedStudentsCount <= 0) return 0;
    return Math.round((d.finishedStudentsCount / d.assignedStudentsCount) * 100);
  }

  formatPct(value: number | null): string {
    return value === null || value === undefined ? '—' : `${value}%`;
  }

  formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('es-PE', {
      day: 'numeric',
      month: 'long',
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
