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
  AttemptEventType,
  AttemptStatus,
  AttemptTraceabilityResponse,
  TeacherAttemptResultDetailResponse,
  TeacherAttemptReviewResponse,
  TeacherEvaluationResultsResponse,
  TeacherReviewAnswerResponse,
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
                      <th>Salidas</th>
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
                        <td><span class="badge" [class]="statusBadge(r.status)">{{ statusLabel(r.status) }}</span></td>
                        <td>
                          @if (r.tabExitCount > 0) {
                            <span class="badge badge-warning" title="Salidas de pestaña detectadas">
                              <span class="material-icons" style="font-size:14px">visibility_off</span>
                              {{ r.tabExitCount }}
                            </span>
                          } @else {
                            <span class="text-muted">—</span>
                          }
                        </td>
                        <td>{{ r.submittedAt ? formatDate(r.submittedAt) : '—' }}</td>
                        <td>
                          <div class="row-actions">
                            @if (r.status === 'PENDING_MANUAL_REVIEW') {
                              <button type="button" class="btn btn-primary btn-sm" (click)="openReview(r)">
                                Revisar
                              </button>
                            }
                            <button type="button" class="btn btn-secondary btn-sm" (click)="openDetail(r)">
                              Ver detalle
                            </button>
                          </div>
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

              <!-- Trazabilidad del intento -->
              <section class="trace">
                <h3 class="trace__title">
                  <span class="material-icons">timeline</span> Trazabilidad del intento
                </h3>

                @if (traceLoading()) {
                  <p class="text-muted">Cargando trazabilidad…</p>
                } @else if (traceError()) {
                  <p class="text-muted">No se pudo cargar la trazabilidad de este intento.</p>
                } @else if (traceability(); as tr) {
                  <div class="trace__chips">
                    <span class="chip"><span class="chip__k">Estado final</span><span class="chip__v">{{ statusLabel(tr.finalStatus) }}</span></span>
                    <span class="chip"><span class="chip__k">Tiempo usado</span><span class="chip__v">{{ formatDuration(tr.timeUsedSeconds) }}</span></span>
                    <span class="chip"><span class="chip__k">Inicio</span><span class="chip__v">{{ tr.startedAt ? formatDate(tr.startedAt) : '—' }}</span></span>
                    <span class="chip"><span class="chip__k">Finalización</span><span class="chip__v">{{ tr.submittedAt ? formatDate(tr.submittedAt) : '—' }}</span></span>
                    <span class="chip"><span class="chip__k">Salidas de pestaña</span><span class="chip__v">{{ tr.tabExitCount }}</span></span>
                    <span class="chip"><span class="chip__k">Regresos</span><span class="chip__v">{{ tr.tabReturnCount }}</span></span>
                    <span class="chip"><span class="chip__k">Intentos de salida</span><span class="chip__v">{{ tr.exitAttemptCount }}</span></span>
                  </div>

                  @if (!tr.trackTabExit) {
                    <p class="text-muted" style="margin-top:8px">
                      La detección de salida de pestaña estaba desactivada en esta evaluación.
                    </p>
                  }

                  @if (tr.toolsUsed.length > 0) {
                    <div class="trace__tools">
                      <span class="text-muted">Herramientas consultadas:</span>
                      @for (t of tr.toolsUsed; track t) {
                        <span class="badge badge-neutral">{{ toolLabel(t) }}</span>
                      }
                    </div>
                  }

                  @if (tr.events.length > 0) {
                    <ul class="timeline">
                      @for (e of tr.events; track e.id) {
                        <li class="timeline__item">
                          <span class="timeline__dot" [class]="eventTone(e.eventType)"></span>
                          <span class="timeline__time">{{ formatTime(e.occurredAt) }}</span>
                          <span class="timeline__label">{{ eventLabel(e.eventType) }}</span>
                          @if (toolFromMetadata(e.metadata); as tool) {
                            <span class="badge badge-neutral timeline__meta">{{ tool }}</span>
                          }
                        </li>
                      }
                    </ul>
                  } @else {
                    <p class="text-muted" style="margin-top:8px">
                      No se registraron eventos durante este intento.
                    </p>
                  }
                }
              </section>

              <div class="answers">
                @for (a of dt.answers; track a.questionId; let i = $index) {
                  @if (a.questionType === 'OPEN_TEXT') {
                    <div class="answer">
                      <div class="answer__head">
                        <span class="answer__num">{{ i + 1 }}</span>
                        <span class="answer__text">{{ a.questionText }}</span>
                        @if (a.reviewed) {
                          <span class="answer__points">{{ a.pointsAwarded ?? 0 }} / {{ a.points }}</span>
                        } @else {
                          <span class="badge badge-warning">Pendiente</span>
                        }
                      </div>
                      <div class="answer__row">
                        <span class="answer__label">Respuesta del estudiante:</span>
                        <span class="answer__value" [class.answer__value--muted]="!a.answerText">
                          {{ a.answerText || 'Sin responder' }}
                        </span>
                      </div>
                      @if (a.teacherFeedback) {
                        <p class="answer__explanation">
                          <span class="material-icons">rate_review</span>
                          <strong>Tu retroalimentación:</strong> {{ a.teacherFeedback }}
                        </p>
                      }
                    </div>
                  } @else {
                    <div class="answer" [class.answer--ok]="a.correct" [class.answer--bad]="a.correct === false">
                      <div class="answer__head">
                        <span class="answer__num">{{ i + 1 }}</span>
                        <span class="answer__text">{{ a.questionText }}</span>
                        <span class="answer__points">{{ a.pointsAwarded ?? 0 }} / {{ a.points }}</span>
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
                }
              </div>
            }
          </div>
        </div>
      </div>
    }

    <!-- Modal: revisión manual de respuestas abiertas -->
    @if (reviewOpen()) {
      <div class="modal-overlay" (click)="closeReview()">
        <div class="modal" (click)="$event.stopPropagation()">
          <header class="modal__header">
            <h2 class="modal__title">Revisión manual</h2>
            <button type="button" class="modal__close" aria-label="Cerrar" (click)="closeReview()">
              <span class="material-icons">close</span>
            </button>
          </header>

          <div class="modal__body">
            @if (reviewLoading()) {
              <div class="state">
                <div class="state__spinner"></div>
                <p class="state__title">Cargando respuestas…</p>
              </div>
            } @else if (reviewError()) {
              <div class="state state--error">
                <span class="material-icons state__icon">cloud_off</span>
                <p class="state__title">No se pudo cargar la revisión.</p>
                <button type="button" class="btn btn-primary" (click)="reloadReview()">
                  <span class="material-icons">refresh</span> Reintentar
                </button>
              </div>
            } @else if (review(); as rv) {
              <div class="detail-head">
                <div>
                  <span class="detail-head__name">{{ rv.studentName }}</span>
                  <span class="detail-head__meta">
                    {{ rv.studentCode }} · {{ rv.grade }} "{{ rv.section }}" · Intento N.° {{ rv.attemptNumber }}
                  </span>
                </div>
                <div class="detail-head__score">
                  <span class="badge" [class]="statusBadge(rv.status)">{{ statusLabel(rv.status) }}</span>
                  <span class="detail-head__points">{{ rv.score ?? 0 }} / {{ rv.maxScore ?? 0 }}</span>
                </div>
              </div>

              @if (reviewMessage()) {
                <div class="alert alert-success">
                  <span class="material-icons">check_circle</span> {{ reviewMessage() }}
                </div>
              }
              @if (reviewSaveError()) {
                <div class="alert alert-danger">
                  <span class="material-icons">error_outline</span> {{ reviewSaveError() }}
                </div>
              }

              <div class="answers">
                @for (a of rv.openAnswers; track a.questionId; let i = $index) {
                  <div class="answer">
                    <div class="answer__head">
                      <span class="answer__num">{{ i + 1 }}</span>
                      <span class="answer__text">{{ a.questionText }}</span>
                      @if (a.reviewed) {
                        <span class="badge badge-success">Revisada</span>
                      } @else {
                        <span class="badge badge-warning">Pendiente</span>
                      }
                    </div>
                    <div class="answer__row">
                      <span class="answer__label">Respuesta del estudiante:</span>
                      <span class="answer__value" [class.answer__value--muted]="!a.answerText">
                        {{ a.answerText || 'Sin responder' }}
                      </span>
                    </div>
                    @if (a.expectedAnswer) {
                      <p class="answer__explanation">
                        <span class="material-icons">fact_check</span>
                        <strong>Criterio (solo tú lo ves):</strong> {{ a.expectedAnswer }}
                      </p>
                    }

                    @if (a.answerId !== null) {
                      <div class="grade-row">
                        <label class="form-label">
                          Puntaje (0 – {{ a.maxPoints }})
                          <input
                            type="number"
                            class="input grade-row__score"
                            min="0"
                            [max]="a.maxPoints"
                            [value]="scoreFor(a.answerId)"
                            (input)="setScore(a.answerId, $any($event.target).value)"
                          />
                        </label>
                        <label class="form-label form-label--full">
                          Retroalimentación (opcional)
                          <textarea
                            class="textarea"
                            rows="2"
                            maxlength="2000"
                            [value]="feedbackFor(a.answerId)"
                            (input)="setFeedback(a.answerId, $any($event.target).value)"
                          ></textarea>
                        </label>
                        <button
                          type="button"
                          class="btn btn-primary btn-sm"
                          [disabled]="savingAnswerId() === a.answerId"
                          (click)="gradeAnswer(a)"
                        >
                          {{ savingAnswerId() === a.answerId ? 'Guardando…' : 'Guardar puntaje' }}
                        </button>
                      </div>
                    } @else {
                      <p class="text-muted">El estudiante no dejó respuesta; igual debes asignarle un puntaje.</p>
                    }
                  </div>
                }
              </div>

              <div class="modal__actions">
                <button type="button" class="btn btn-secondary" (click)="closeReview()">Cerrar</button>
                <button
                  type="button"
                  class="btn btn-primary"
                  [disabled]="rv.pendingOpenCount > 0 || completing()"
                  (click)="completeReview()"
                >
                  {{ completing() ? 'Finalizando…' : 'Finalizar revisión' }}
                </button>
              </div>
              @if (rv.pendingOpenCount > 0) {
                <p class="text-muted">Faltan {{ rv.pendingOpenCount }} respuestas por calificar para finalizar.</p>
              }
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

  // Trazabilidad del intento (resumen + línea de tiempo), cargada junto al detalle.
  readonly traceLoading = signal(false);
  readonly traceError = signal(false);
  readonly traceability = signal<AttemptTraceabilityResponse | null>(null);

  // Revisión manual de respuestas abiertas.
  readonly reviewOpen = signal(false);
  readonly reviewLoading = signal(false);
  readonly reviewError = signal(false);
  readonly review = signal<TeacherAttemptReviewResponse | null>(null);
  readonly savingAnswerId = signal<number | null>(null);
  readonly completing = signal(false);
  readonly reviewMessage = signal<string | null>(null);
  readonly reviewSaveError = signal<string | null>(null);
  private reviewAttemptId: number | null = null;
  // Borradores de puntaje y retroalimentación por respuesta (answerId → valor).
  private readonly scoreDrafts = signal<Record<number, string>>({});
  private readonly feedbackDrafts = signal<Record<number, string>>({});

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
    this.loadTraceability();
  }

  /** Carga la trazabilidad del intento abierto. Su error no bloquea el detalle de respuestas. */
  private loadTraceability(): void {
    if (this.detailAttemptId === null) return;
    this.traceability.set(null);
    this.traceLoading.set(true);
    this.traceError.set(false);
    this.service.getAttemptTraceability(this.detailAttemptId).subscribe({
      next: (t) => {
        this.traceability.set(t);
        this.traceLoading.set(false);
      },
      error: () => {
        this.traceError.set(true);
        this.traceLoading.set(false);
      },
    });
  }

  closeDetail(): void {
    this.detailOpen.set(false);
    this.detail.set(null);
    this.detailAttemptId = null;
    this.traceability.set(null);
    this.traceError.set(false);
  }

  // ── Revisión manual ──

  openReview(row: TeacherStudentResultResponse): void {
    this.reviewAttemptId = row.attemptId;
    this.reviewOpen.set(true);
    this.reviewMessage.set(null);
    this.reviewSaveError.set(null);
    this.loadReview();
  }

  reloadReview(): void {
    this.loadReview();
  }

  private loadReview(): void {
    if (this.reviewAttemptId === null) return;
    this.review.set(null);
    this.reviewLoading.set(true);
    this.reviewError.set(false);
    this.service.getAttemptReview(this.reviewAttemptId).subscribe({
      next: (rv) => {
        this.review.set(rv);
        this.hydrateDrafts(rv);
        this.reviewLoading.set(false);
      },
      error: () => {
        this.reviewError.set(true);
        this.reviewLoading.set(false);
      },
    });
  }

  /** Inicializa los borradores con los puntajes/retroalimentación ya asignados. */
  private hydrateDrafts(rv: TeacherAttemptReviewResponse): void {
    const scores: Record<number, string> = {};
    const feedback: Record<number, string> = {};
    for (const a of rv.openAnswers) {
      if (a.answerId !== null) {
        scores[a.answerId] = a.awardedScore !== null ? String(a.awardedScore) : '';
        feedback[a.answerId] = a.teacherFeedback ?? '';
      }
    }
    this.scoreDrafts.set(scores);
    this.feedbackDrafts.set(feedback);
  }

  scoreFor(answerId: number): string {
    return this.scoreDrafts()[answerId] ?? '';
  }

  feedbackFor(answerId: number): string {
    return this.feedbackDrafts()[answerId] ?? '';
  }

  setScore(answerId: number, value: string): void {
    this.scoreDrafts.update((m) => ({ ...m, [answerId]: value }));
  }

  setFeedback(answerId: number, value: string): void {
    this.feedbackDrafts.update((m) => ({ ...m, [answerId]: value }));
  }

  gradeAnswer(answer: TeacherReviewAnswerResponse): void {
    if (answer.answerId === null || this.reviewAttemptId === null) return;
    const raw = this.scoreDrafts()[answer.answerId] ?? '';
    const score = Number(raw);
    if (raw.trim() === '' || Number.isNaN(score) || score < 0 || score > answer.maxPoints) {
      this.reviewSaveError.set(`El puntaje debe estar entre 0 y ${answer.maxPoints}.`);
      return;
    }
    const feedback = (this.feedbackDrafts()[answer.answerId] ?? '').trim() || null;

    this.reviewSaveError.set(null);
    this.reviewMessage.set(null);
    this.savingAnswerId.set(answer.answerId);
    this.service
      .gradeOpenAnswer(this.reviewAttemptId, answer.answerId, { score, feedback })
      .subscribe({
        next: (rv) => {
          this.review.set(rv);
          this.hydrateDrafts(rv);
          this.savingAnswerId.set(null);
          this.reviewMessage.set('Puntaje guardado.');
          // El estado del intento puede haber pasado a GRADED: se refresca la lista.
          this.load();
        },
        error: (err: unknown) => {
          this.savingAnswerId.set(null);
          this.reviewSaveError.set(this.extractError(err, 'No se pudo guardar el puntaje.'));
        },
      });
  }

  completeReview(): void {
    if (this.reviewAttemptId === null) return;
    this.reviewSaveError.set(null);
    this.completing.set(true);
    this.service.completeReview(this.reviewAttemptId).subscribe({
      next: (rv) => {
        this.review.set(rv);
        this.hydrateDrafts(rv);
        this.completing.set(false);
        this.reviewMessage.set('Revisión finalizada. La nota final ya está disponible.');
        this.load();
      },
      error: (err: unknown) => {
        this.completing.set(false);
        this.reviewSaveError.set(this.extractError(err, 'No se pudo finalizar la revisión.'));
      },
    });
  }

  closeReview(): void {
    this.reviewOpen.set(false);
    this.review.set(null);
    this.reviewAttemptId = null;
    this.reviewMessage.set(null);
    this.reviewSaveError.set(null);
  }

  private extractError(err: unknown, fallback: string): string {
    const e = err as { error?: { message?: string } };
    return e?.error?.message ?? fallback;
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
    switch (status) {
      case 'GRADED':
        return 'Calificado';
      case 'PENDING_MANUAL_REVIEW':
        return 'Pendiente de revisión';
      case 'SUBMITTED':
        return 'Enviado';
      default:
        return 'En progreso';
    }
  }

  statusBadge(status: AttemptStatus): string {
    switch (status) {
      case 'GRADED':
        return 'badge-success';
      case 'PENDING_MANUAL_REVIEW':
        return 'badge-warning';
      default:
        return 'badge-neutral';
    }
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

  /** Solo la hora (hh:mm:ss), para la línea de tiempo de eventos. */
  formatTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('es-PE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  }

  /** Tiempo usado en formato legible (mm:ss o hh:mm:ss); '—' si no hay dato. */
  formatDuration(seconds: number | null): string {
    if (seconds === null || seconds === undefined) return '—';
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  }

  /** Etiqueta en español para un tipo de evento del intento. */
  eventLabel(type: AttemptEventType): string {
    switch (type) {
      case 'ATTEMPT_STARTED': return 'Inicio del intento';
      case 'ATTEMPT_SUBMITTED': return 'Envío del intento';
      case 'ATTEMPT_EXITED': return 'Salida del intento';
      case 'TIME_EXPIRED': return 'Tiempo agotado';
      case 'EXIT_ATTEMPTED': return 'Intento de salida';
      case 'TOOL_OPENED': return 'Abrió una herramienta';
      case 'TOOL_RETURNED': return 'Volvió al intento';
      case 'TAB_HIDDEN': return 'Salida de pestaña';
      case 'WINDOW_BLUR': return 'Ventana sin foco';
      case 'TAB_VISIBLE': return 'Regreso a la pestaña';
      case 'WINDOW_FOCUS': return 'Ventana con foco';
      case 'NAVIGATION_BLOCKED': return 'Navegación bloqueada';
      default: return type;
    }
  }

  /** Tono visual del punto de la línea de tiempo según el tipo de evento. */
  eventTone(type: AttemptEventType): string {
    if (type === 'TAB_HIDDEN' || type === 'WINDOW_BLUR') return 'tone-warn';
    if (type === 'EXIT_ATTEMPTED' || type === 'ATTEMPT_EXITED' || type === 'TIME_EXPIRED') return 'tone-exit';
    if (type === 'TOOL_OPENED' || type === 'TOOL_RETURNED') return 'tone-tool';
    return '';
  }

  /** Nombre legible de una herramienta consultada. */
  toolLabel(tool: string): string {
    switch (tool) {
      case 'PERIODIC_TABLE': return 'Tabla periódica';
      case 'COMPOUND_FORMATION': return 'Formación de compuestos';
      default: return tool;
    }
  }

  /** Extrae el nombre de la herramienta de una metadata "tool=..."; null si no hay. */
  toolFromMetadata(metadata: string | null): string | null {
    if (!metadata) return null;
    for (const part of metadata.split(';')) {
      const trimmed = part.trim();
      if (trimmed.startsWith('tool=')) {
        const value = trimmed.substring('tool='.length).trim();
        return value.length > 0 ? this.toolLabel(value) : null;
      }
    }
    return null;
  }
}

function buildInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
