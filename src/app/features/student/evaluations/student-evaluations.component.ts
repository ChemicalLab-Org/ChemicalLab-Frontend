import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
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
  ApiError,
  AttemptEventType,
  AttemptResponse,
  StudentEvaluationDetailResponse,
  StudentEvaluationResponse,
} from '../../../shared/models';

type View = 'list' | 'detail' | 'take' | 'submitted';
type FilterKey = 'all' | 'pending' | 'in_progress' | 'submitted' | 'overdue';

interface ConfirmState {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
}

interface SubmittedInfo {
  readonly title: string;
  readonly submittedAt: string | null;
  readonly attemptNumber: number;
  /** true si el envío se disparó automáticamente al agotarse el tiempo. */
  readonly autoSubmitted: boolean;
}

/** Prefijo de las claves de localStorage que recuerdan el intento en progreso. */
const ATTEMPT_STORAGE_PREFIX = 'chemlab.eval.attempt.';

@Component({
  selector: 'app-student-evaluations',
  standalone: true,
  imports: [SidebarComponent],
  styleUrls: ['./student-evaluations.component.scss'],
  template: `
    <div class="layout">
      <app-sidebar
        [navItems]="navItems"
        [userName]="userName()"
        [userRole]="userRoleLabel()"
        [userInitials]="userInitials()"
        (onLogout)="handleLogout()"
      />

      <main class="main">
        <!-- ════════════════════ VISTA: LISTA ════════════════════ -->
        @if (view() === 'list') {
          <header class="ev-header">
            <h1 class="ev-header__title">Mis evaluaciones</h1>
            <p class="ev-header__subtitle">
              Revisa y desarrolla las evaluaciones asignadas por tu docente.
            </p>
          </header>

          @if (loading()) {
            <div class="page-state">
              <div class="page-state__spinner" role="status" aria-label="Cargando">
                <span class="material-icons page-state__spin-icon">autorenew</span>
              </div>
              <p class="page-state__title">Estamos cargando tus evaluaciones...</p>
            </div>
          } @else if (loadError()) {
            <div class="page-state page-state--error">
              <div class="page-state__icon"><span class="material-icons">cloud_off</span></div>
              <p class="page-state__title">No se pudieron cargar tus evaluaciones.</p>
              <p class="page-state__desc">Verifica tu conexión e intenta de nuevo.</p>
              <button type="button" class="btn btn-primary" (click)="reload()">
                <span class="material-icons">refresh</span> Reintentar
              </button>
            </div>
          } @else if (evaluations().length === 0) {
            <div class="page-state page-state--empty">
              <div class="page-state__icon"><span class="material-icons">assignment</span></div>
              <p class="page-state__title">Aún no tienes evaluaciones asignadas.</p>
              <p class="page-state__desc">
                Cuando tu docente publique y asigne evaluaciones a tu sección, aparecerán aquí.
              </p>
            </div>
          } @else {
            <!-- Buscador + filtros -->
            <div class="ev-controls">
              <div class="search-bar">
                <span class="material-icons search-bar__icon">search</span>
                <input
                  class="search-bar__input"
                  type="search"
                  placeholder="Buscar por título, tema o descripción"
                  [value]="query()"
                  (input)="onSearch($event)"
                />
                @if (query()) {
                  <button
                    class="search-bar__clear"
                    type="button"
                    (click)="clearSearch()"
                    aria-label="Limpiar búsqueda"
                  >
                    <span class="material-icons">close</span>
                  </button>
                }
              </div>

              <div class="filter-pills" role="group" aria-label="Filtrar evaluaciones">
                @for (f of filters; track f.key) {
                  <button
                    type="button"
                    class="filter-pill"
                    [class.filter-pill--active]="activeFilter() === f.key"
                    (click)="setFilter(f.key)"
                  >
                    {{ f.label }}
                  </button>
                }
              </div>
            </div>

            @if (filtered().length === 0) {
              <div class="page-state page-state--empty">
                <div class="page-state__icon"><span class="material-icons">search_off</span></div>
                <p class="page-state__title">No se encontraron evaluaciones con los filtros seleccionados.</p>
                <button type="button" class="btn btn-secondary btn-sm" (click)="resetFilters()">
                  Ver todas
                </button>
              </div>
            } @else {
              <div class="ev-list">
                @for (ev of filtered(); track ev.id) {
                  <article class="ev-card" [class.ev-card--muted]="isClosed(ev)">
                    <div class="ev-card__icon">
                      <span class="material-icons">assignment</span>
                    </div>

                    <div class="ev-card__body">
                      <div class="ev-card__titlerow">
                        <h3 class="ev-card__title">{{ ev.title }}</h3>
                        @if (ev.topic) {
                          <span class="badge badge-neutral">{{ ev.topic }}</span>
                        }
                        <span class="badge" [class]="statusBadgeClass(ev)">
                          {{ statusLabel(ev) }}
                        </span>
                      </div>

                      @if (ev.description) {
                        <p class="ev-card__desc">{{ ev.description }}</p>
                      }

                      <div class="ev-card__meta">
                        <span class="ev-card__meta-item">
                          <span class="material-icons">help_outline</span>
                          {{ ev.questionCount }} {{ ev.questionCount === 1 ? 'pregunta' : 'preguntas' }}
                        </span>
                        <span class="ev-card__meta-item">
                          <span class="material-icons">replay</span>
                          Intentos: {{ ev.attemptsUsed }} / {{ ev.maxAttempts }}
                        </span>
                        @if (ev.timeLimitMinutes) {
                          <span class="ev-card__meta-item">
                            <span class="material-icons">schedule</span>
                            {{ ev.timeLimitMinutes }} min
                          </span>
                        }
                        @if (ev.dueAt) {
                          <span class="ev-card__meta-item">
                            <span class="material-icons">event</span>
                            Hasta {{ formatDate(ev.dueAt) }}
                          </span>
                        }
                      </div>
                    </div>

                    <div class="ev-card__action">
                      @if (hasInProgress(ev)) {
                        <button type="button" class="btn btn-primary" (click)="continueAttempt(ev)">
                          Continuar intento <span class="material-icons">arrow_forward</span>
                        </button>
                      } @else if (canStart(ev)) {
                        <button type="button" class="btn btn-primary" (click)="openEvaluation(ev)">
                          Ver evaluación <span class="material-icons">arrow_forward</span>
                        </button>
                      } @else if (isSubmitted(ev)) {
                        <button type="button" class="btn btn-secondary" (click)="goToResults()">
                          Ver resultado
                        </button>
                      } @else {
                        <button type="button" class="btn btn-secondary" disabled>
                          {{ isOverdue(ev) ? 'Vencida' : 'No disponible' }}
                        </button>
                      }
                    </div>
                  </article>
                }
              </div>
            }
          }
        }

        <!-- ════════════════════ VISTA: DETALLE ════════════════════ -->
        @if (view() === 'detail') {
          <button type="button" class="ev-back" (click)="backToList()">
            <span class="material-icons">arrow_back</span> Mis evaluaciones
          </button>

          @if (detailLoading()) {
            <div class="page-state">
              <div class="page-state__spinner" role="status" aria-label="Cargando">
                <span class="material-icons page-state__spin-icon">autorenew</span>
              </div>
              <p class="page-state__title">Cargando la evaluación...</p>
            </div>
          } @else if (detailError()) {
            <div class="page-state page-state--error">
              <div class="page-state__icon"><span class="material-icons">cloud_off</span></div>
              <p class="page-state__title">No se pudo cargar la evaluación.</p>
              <button type="button" class="btn btn-primary" (click)="reloadDetail()">
                <span class="material-icons">refresh</span> Reintentar
              </button>
            </div>
          } @else if (detail(); as d) {
            <div class="ev-detail">
              <header class="ev-detail__head">
                <h1 class="ev-detail__title">{{ d.title }}</h1>
                @if (d.topic) {
                  <span class="badge badge-neutral">{{ d.topic }}</span>
                }
              </header>

              @if (d.description) {
                <p class="ev-detail__desc">{{ d.description }}</p>
              }

              <div class="ev-detail__facts">
                <div class="fact">
                  <span class="fact__label">Preguntas</span>
                  <span class="fact__value">{{ d.questions.length }}</span>
                </div>
                <div class="fact">
                  <span class="fact__label">Intentos</span>
                  <span class="fact__value">{{ selectedAttemptsUsed() }} / {{ selectedMaxAttempts() }}</span>
                </div>
                <div class="fact">
                  <span class="fact__label">Tiempo límite</span>
                  <span class="fact__value">{{ d.timeLimitMinutes ? d.timeLimitMinutes + ' min' : 'Sin límite' }}</span>
                </div>
                <div class="fact">
                  <span class="fact__label">Fecha límite</span>
                  <span class="fact__value">{{ selectedDueAt() ? formatDate(selectedDueAt()!) : 'Sin fecha' }}</span>
                </div>
                <div class="fact">
                  <span class="fact__label">Modo de preguntas</span>
                  <span class="fact__value">{{ d.questionDisplayMode === 'ONE_BY_ONE' ? 'Una por una' : 'Todas juntas' }}</span>
                </div>
                <div class="fact">
                  <span class="fact__label">Calculadora química</span>
                  <span class="fact__value">{{ d.allowChemicalCalculator ? 'Permitida' : 'No permitida' }}</span>
                </div>
                <div class="fact">
                  <span class="fact__label">Salida de pestaña</span>
                  <span class="fact__value">{{ d.trackTabExit ? 'Se registrará' : 'Sin detección' }}</span>
                </div>
              </div>

              <div class="ev-rules">
                <div class="ev-rules__title">
                  <span class="material-icons">rule</span> Reglas de esta evaluación
                </div>
                <ul class="ev-rules__list">
                  <li>
                    <span class="material-icons">help_outline</span>
                    {{ d.questions.length }} {{ d.questions.length === 1 ? 'pregunta' : 'preguntas' }},
                    {{ d.questionDisplayMode === 'ONE_BY_ONE' ? 'una por pantalla' : 'todas en una pantalla' }}.
                  </li>
                  <li>
                    <span class="material-icons">replay</span>
                    Intentos: usaste {{ selectedAttemptsUsed() }} de {{ selectedMaxAttempts() }}.
                  </li>
                  <li>
                    <span class="material-icons">schedule</span>
                    {{ d.timeLimitMinutes ? 'Tiempo límite: ' + d.timeLimitMinutes + ' min (al agotarse se enviará automáticamente).' : 'Sin tiempo límite.' }}
                  </li>
                  <li>
                    <span class="material-icons">{{ d.allowChemicalCalculator ? 'calculate' : 'block' }}</span>
                    {{ d.allowChemicalCalculator ? 'Puedes usar la calculadora química durante el intento.' : 'No se permite la calculadora química.' }}
                  </li>
                  @if (d.trackTabExit) {
                    <li>
                      <span class="material-icons">visibility</span>
                      Si sales de la pestaña, quedará registrado.
                    </li>
                  }
                </ul>
              </div>

              @if (d.instructions) {
                <div class="ev-detail__section">
                  <div class="ev-detail__section-label">Instrucciones</div>
                  <p class="ev-detail__instructions">{{ d.instructions }}</p>
                </div>
              }

              @if (selected() && hasInProgress(selected()!)) {
                <div class="alert alert-info">
                  <span class="material-icons">info</span>
                  Tienes un intento en progreso. Puedes continuarlo donde lo dejaste.
                </div>
              } @else if (selected() && attemptsExhausted(selected()!)) {
                <div class="alert alert-warning">
                  <span class="material-icons">block</span>
                  Ya alcanzaste el número máximo de intentos.
                </div>
              } @else if (selected() && isOverdue(selected()!)) {
                <div class="alert alert-warning">
                  <span class="material-icons">event_busy</span>
                  El plazo de esta evaluación ya venció.
                </div>
              } @else {
                <div class="alert alert-warning">
                  <span class="material-icons">priority_high</span>
                  Al iniciar, se registrará un intento.
                </div>
              }

              @if (startError()) {
                <div class="alert alert-danger">
                  <span class="material-icons">error_outline</span>
                  {{ startError() }}
                </div>
              }

              <div class="ev-detail__actions">
                <button type="button" class="btn btn-secondary" (click)="backToList()">Volver</button>

                @if (selected() && hasInProgress(selected()!)) {
                  <button
                    type="button"
                    class="btn btn-primary btn-lg"
                    [disabled]="starting()"
                    (click)="continueAttempt(selected()!)"
                  >
                    {{ starting() ? 'Cargando...' : 'Continuar intento' }}
                    <span class="material-icons">arrow_forward</span>
                  </button>
                } @else if (selected() && canStart(selected()!)) {
                  <button
                    type="button"
                    class="btn btn-primary btn-lg"
                    [disabled]="starting()"
                    (click)="askStart()"
                  >
                    {{ starting() ? 'Iniciando...' : 'Iniciar evaluación' }}
                    <span class="material-icons">play_arrow</span>
                  </button>
                }
              </div>
            </div>
          }
        }

        <!-- ════════════════════ VISTA: RENDICIÓN ════════════════════ -->
        @if (view() === 'take') {
          <button type="button" class="ev-back" (click)="backToList()">
            <span class="material-icons">arrow_back</span> Mis evaluaciones
          </button>

          @if (detail(); as d) {
            <header class="ev-take__head">
              <h1 class="ev-take__title">{{ d.title }}</h1>
              <div class="ev-take__headmeta">
                @if (d.topic) {
                  <span class="badge badge-neutral">{{ d.topic }}</span>
                }
                <span class="badge badge-primary"><span class="dot"></span>En curso</span>
                @if (remainingLabel(); as time) {
                  <span
                    class="ev-timer"
                    [class.ev-timer--low]="timeRunningLow()"
                    role="timer"
                    aria-label="Tiempo restante"
                  >
                    <span class="material-icons">timer</span> {{ time }}
                  </span>
                }
                @if (calculatorAllowed()) {
                  <button type="button" class="btn btn-secondary btn-sm ev-calc-btn" (click)="toggleCalculator()">
                    <span class="material-icons">calculate</span> Calculadora química
                  </button>
                }
              </div>
            </header>

            <div class="alert alert-info ev-take__notice">
              <span class="material-icons">info</span>
              Lee cada pregunta con atención. Una vez enviada, no podrás modificar tus respuestas.
            </div>

            @if (tabExitWarning(); as warning) {
              <div class="alert alert-warning ev-take__notice">
                <span class="material-icons">visibility_off</span>
                {{ warning }}
                <button type="button" class="ev-warning-dismiss" (click)="dismissTabExitWarning()" aria-label="Cerrar aviso">
                  <span class="material-icons">close</span>
                </button>
              </div>
            }

            @if (calculatorAllowed() && calculatorOpen()) {
              <div class="ev-calc-panel">
                <div class="ev-calc-panel__head">
                  <span class="ev-calc-panel__title">
                    <span class="material-icons">science</span> Herramientas de apoyo químico
                  </span>
                  <button type="button" class="ev-calc-panel__close" (click)="toggleCalculator()" aria-label="Cerrar">
                    <span class="material-icons">close</span>
                  </button>
                </div>
                <p class="ev-calc-panel__hint">
                  Tu docente habilitó el uso de herramientas químicas. Se abren en una pestaña nueva
                  para que no pierdas tu intento. No revelan las respuestas de la evaluación.
                </p>
                <div class="ev-calc-panel__actions">
                  <button type="button" class="btn btn-secondary btn-sm" (click)="openChemistryTool('/periodic-table')">
                    <span class="material-icons">grid_on</span> Tabla periódica
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" (click)="openChemistryTool('/compounds')">
                    <span class="material-icons">science</span> Formación de compuestos
                  </button>
                </div>
              </div>
            }

            <div class="ev-take__progress">
              <div class="ev-take__progress-bar">
                <div class="ev-take__progress-fill" [style.width.%]="progressPct()"></div>
              </div>
              <span class="ev-take__progress-label">
                @if (isOneByOne()) {
                  Pregunta {{ currentIndex() + 1 }} de {{ totalQuestions() }} ·
                }
                {{ answeredCount() }} de {{ d.questions.length }} respondidas
              </span>
            </div>

            <div class="ev-questions">
              @for (q of visibleQuestions(); track q.id) {
                <div class="q-card">
                  <div class="q-card__head">
                    <div class="q-card__num">{{ isOneByOne() ? currentIndex() + 1 : ($index + 1) }}</div>
                    <div class="q-card__text">{{ q.questionText }}</div>
                  </div>

                  <div class="q-card__options">
                    @for (opt of q.options; track opt.id) {
                      <label
                        class="q-option"
                        [class.q-option--selected]="answerFor(q.id) === opt.id"
                      >
                        <input
                          type="radio"
                          class="q-option__input"
                          [name]="'q-' + q.id"
                          [checked]="answerFor(q.id) === opt.id"
                          (change)="selectOption(q.id, opt.id)"
                        />
                        <span class="q-option__radio"></span>
                        <span class="q-option__label">{{ opt.optionText }}</span>
                      </label>
                    }
                  </div>

                  <div class="q-card__feedback">
                    @if (savingQuestionId() === q.id) {
                      <span class="q-feedback q-feedback--saving">
                        <span class="material-icons">sync</span> Guardando...
                      </span>
                    } @else if (savedQuestionId() === q.id) {
                      <span class="q-feedback q-feedback--saved">
                        <span class="material-icons">check_circle</span> Respuesta guardada
                      </span>
                    } @else if (saveErrorQuestionId() === q.id) {
                      <span class="q-feedback q-feedback--error">
                        <span class="material-icons">error_outline</span>
                        No se pudo guardar. Se reintentará al enviar.
                      </span>
                    }
                  </div>
                </div>
              }
            </div>

            @if (submitError()) {
              <div class="alert alert-danger">
                <span class="material-icons">error_outline</span> {{ submitError() }}
              </div>
            }

            <div class="ev-take__actions">
              @if (isOneByOne()) {
                <button
                  type="button"
                  class="btn btn-secondary btn-lg"
                  [disabled]="currentIndex() === 0"
                  (click)="prevQuestion()"
                >
                  <span class="material-icons">arrow_back</span> Anterior
                </button>
                @if (isLastQuestion()) {
                  <button
                    type="button"
                    class="btn btn-primary btn-lg"
                    [disabled]="submitting()"
                    (click)="askSubmit()"
                  >
                    {{ submitting() ? 'Enviando...' : 'Enviar evaluación' }}
                    <span class="material-icons">send</span>
                  </button>
                } @else {
                  <button type="button" class="btn btn-primary btn-lg" (click)="nextQuestion()">
                    Siguiente <span class="material-icons">arrow_forward</span>
                  </button>
                }
              } @else {
                <button
                  type="button"
                  class="btn btn-primary btn-lg"
                  [disabled]="submitting()"
                  (click)="askSubmit()"
                >
                  {{ submitting() ? 'Enviando...' : 'Enviar evaluación' }}
                  <span class="material-icons">send</span>
                </button>
              }
            </div>
          }
        }

        <!-- ════════════════════ VISTA: CONFIRMACIÓN ════════════════════ -->
        @if (view() === 'submitted' && submittedInfo(); as info) {
          <div class="ev-done">
            <div class="ev-done__check">
              <span class="material-icons">check</span>
            </div>
            <h1 class="ev-done__title">Evaluación enviada</h1>
            <p class="ev-done__subtitle">Tus respuestas fueron registradas correctamente.</p>

            @if (info.autoSubmitted) {
              <div class="alert alert-warning ev-done__autonote">
                <span class="material-icons">timer_off</span>
                Se agotó el tiempo y la evaluación se envió automáticamente.
              </div>
            }

            <div class="ev-done__card">
              <div class="ev-done__row">
                <span class="ev-done__label">Evaluación</span>
                <span class="ev-done__value">{{ info.title }}</span>
              </div>
              <div class="ev-done__divider"></div>
              <div class="ev-done__row">
                <span class="ev-done__label">Intento</span>
                <span class="ev-done__value">N.° {{ info.attemptNumber }}</span>
              </div>
              @if (info.submittedAt) {
                <div class="ev-done__divider"></div>
                <div class="ev-done__row">
                  <span class="ev-done__label">Fecha y hora</span>
                  <span class="ev-done__value text-mono">{{ formatDateTime(info.submittedAt) }}</span>
                </div>
              }
            </div>

            <div class="ev-done__actions">
              <button type="button" class="btn btn-secondary btn-lg" (click)="backToList()">
                Volver a mis evaluaciones
              </button>
              <button type="button" class="btn btn-primary btn-lg" (click)="goToResults()">
                Ver resultado <span class="material-icons">arrow_forward</span>
              </button>
            </div>
          </div>
        }
      </main>
    </div>

    <!-- ════════════════════ DIÁLOGO DE CONFIRMACIÓN ════════════════════ -->
    @if (confirmState(); as c) {
      <div class="modal-overlay" (click)="cancelConfirm()">
        <div class="modal modal--confirm" (click)="$event.stopPropagation()">
          <h2 class="modal__title">{{ c.title }}</h2>
          <p class="modal__text">{{ c.message }}</p>
          <div class="modal__actions">
            <button type="button" class="btn btn-secondary" (click)="cancelConfirm()">Cancelar</button>
            <button type="button" class="btn btn-primary" (click)="acceptConfirm()">{{ c.confirmLabel }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class StudentEvaluationsComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly service = inject(StudentEvaluationsService);
  private readonly router = inject(Router);
  private readonly usageMetrics = inject(UsageMetricsService);

  // ── Estado general ──
  readonly view = signal<View>('list');

  // ── Lista ──
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly evaluations = signal<StudentEvaluationResponse[]>([]);
  readonly query = signal('');
  readonly activeFilter = signal<FilterKey>('all');

  readonly filters: ReadonlyArray<{ key: FilterKey; label: string }> = [
    { key: 'all', label: 'Todas' },
    { key: 'pending', label: 'Pendientes' },
    { key: 'in_progress', label: 'En progreso' },
    { key: 'submitted', label: 'Enviadas' },
    { key: 'overdue', label: 'Vencidas' },
  ];

  // ── Detalle ──
  readonly selected = signal<StudentEvaluationResponse | null>(null);
  readonly detail = signal<StudentEvaluationDetailResponse | null>(null);
  readonly detailLoading = signal(false);
  readonly detailError = signal(false);

  // ── Intento / rendición ──
  readonly attempt = signal<AttemptResponse | null>(null);
  readonly answers = signal<Record<number, number | null>>({});
  readonly starting = signal(false);
  readonly startError = signal<string | null>(null);

  readonly savingQuestionId = signal<number | null>(null);
  readonly savedQuestionId = signal<number | null>(null);
  readonly saveErrorQuestionId = signal<number | null>(null);

  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly submittedInfo = signal<SubmittedInfo | null>(null);

  // ── Configuración avanzada en la rendición ──
  // Modo una por una: índice de la pregunta visible.
  readonly currentIndex = signal(0);
  // Tiempo restante (segundos) cuando la evaluación tiene límite; null si no aplica.
  readonly remainingSeconds = signal<number | null>(null);
  private timerId: ReturnType<typeof setInterval> | null = null;
  private autoSubmitted = false;
  // Detección de salida de pestaña.
  readonly tabExitCount = signal(0);
  readonly tabExitWarning = signal<string | null>(null);
  private exited = false; // evita contar varias veces una misma salida
  private suppressNextExit = false; // no penalizar el uso de una herramienta permitida
  private listenersAttached = false;
  // Panel de la calculadora química (si la evaluación la permite).
  readonly calculatorOpen = signal(false);

  // Handlers enlazados (se agregan/quitan en pares para limpiar correctamente).
  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      this.handleExit('TAB_HIDDEN');
    } else {
      this.handleReturn();
    }
  };
  private readonly onWindowBlur = (): void => this.handleExit('WINDOW_BLUR');
  private readonly onWindowFocus = (): void => this.handleReturn();

  // ── Diálogo de confirmación ──
  readonly confirmState = signal<ConfirmState | null>(null);

  // ── Usuario / navegación ──
  private readonly currentUser = computed(() => this.authService.currentUser());
  readonly userName = computed<string>(() => this.currentUser()?.username ?? 'Usuario');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));
  readonly navItems: readonly SidebarNavItem[] = STUDENT_NAV_ITEMS;
  readonly userRoleLabel = computed<string>(() => {
    switch (this.authService.currentRole()) {
      case 'DOCENTE':
        return 'Docente';
      case 'ADMINISTRADOR':
        return 'Administrador';
      default:
        return 'Estudiante';
    }
  });

  // ── Derivados de la lista ──
  readonly filtered = computed<StudentEvaluationResponse[]>(() => {
    const q = this.query().toLowerCase().trim();
    const f = this.activeFilter();
    return this.evaluations().filter((ev) => {
      if (!this.matchesFilter(ev, f)) return false;
      if (!q) return true;
      return (
        ev.title.toLowerCase().includes(q) ||
        (ev.topic?.toLowerCase().includes(q) ?? false) ||
        (ev.description?.toLowerCase().includes(q) ?? false)
      );
    });
  });

  // ── Derivados del detalle (toma datos de la fila de lista seleccionada) ──
  readonly selectedAttemptsUsed = computed(() => this.selected()?.attemptsUsed ?? 0);
  readonly selectedMaxAttempts = computed(() => this.selected()?.maxAttempts ?? 0);
  readonly selectedDueAt = computed(() => this.selected()?.dueAt ?? null);

  // ── Derivados de la rendición ──
  readonly answeredCount = computed(() => {
    const map = this.answers();
    return Object.values(map).filter((v) => v !== null && v !== undefined).length;
  });
  readonly progressPct = computed(() => {
    const total = this.detail()?.questions.length ?? 0;
    if (total === 0) return 0;
    return Math.round((this.answeredCount() / total) * 100);
  });

  // ── Derivados de la configuración avanzada ──
  readonly isOneByOne = computed(
    () => this.detail()?.questionDisplayMode === 'ONE_BY_ONE'
  );
  readonly calculatorAllowed = computed(
    () => this.detail()?.allowChemicalCalculator === true
  );
  readonly tabExitTracked = computed(() => this.detail()?.trackTabExit === true);
  readonly totalQuestions = computed(() => this.detail()?.questions.length ?? 0);
  readonly currentQuestion = computed(() => {
    const questions = this.detail()?.questions ?? [];
    const index = this.currentIndex();
    return index >= 0 && index < questions.length ? questions[index] : null;
  });
  readonly isLastQuestion = computed(
    () => this.currentIndex() >= this.totalQuestions() - 1
  );
  /** Preguntas visibles: todas (ALL_AT_ONCE) o solo la actual (ONE_BY_ONE). */
  readonly visibleQuestions = computed(() => {
    const questions = this.detail()?.questions ?? [];
    if (!this.isOneByOne()) {
      return questions;
    }
    const current = this.currentQuestion();
    return current ? [current] : [];
  });
  /** Tiempo restante en formato mm:ss para el contador regresivo. */
  readonly remainingLabel = computed(() => {
    const seconds = this.remainingSeconds();
    if (seconds === null) return null;
    const safe = Math.max(0, seconds);
    const mm = Math.floor(safe / 60)
      .toString()
      .padStart(2, '0');
    const ss = (safe % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  });
  /** Aviso visual cuando queda poco tiempo (≤ 60 s). */
  readonly timeRunningLow = computed(() => {
    const seconds = this.remainingSeconds();
    return seconds !== null && seconds <= 60;
  });

  ngOnInit(): void {
    this.loadEvaluations();
  }

  ngOnDestroy(): void {
    this.stopAttemptSession();
  }

  // ═══════════════ Lista ═══════════════

  reload(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.loadEvaluations();
  }

  private loadEvaluations(): void {
    this.service.listStudentEvaluations().subscribe({
      next: (data) => {
        this.evaluations.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.loading.set(false);
      },
    });
  }

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  clearSearch(): void {
    this.query.set('');
  }

  setFilter(f: FilterKey): void {
    this.activeFilter.set(f);
  }

  resetFilters(): void {
    this.query.set('');
    this.activeFilter.set('all');
  }

  private matchesFilter(ev: StudentEvaluationResponse, f: FilterKey): boolean {
    switch (f) {
      case 'pending':
        return !ev.attemptStatus && !this.isOverdue(ev);
      case 'in_progress':
        return this.hasInProgress(ev);
      case 'submitted':
        return this.isSubmitted(ev);
      case 'overdue':
        return this.isOverdue(ev) && !this.isSubmitted(ev);
      default:
        return true;
    }
  }

  // ═══════════════ Estado por evaluación ═══════════════

  isOverdue(ev: StudentEvaluationResponse): boolean {
    return ev.dueAt !== null && new Date(ev.dueAt).getTime() < Date.now();
  }

  attemptsExhausted(ev: StudentEvaluationResponse): boolean {
    return ev.attemptsUsed >= ev.maxAttempts;
  }

  hasInProgress(ev: StudentEvaluationResponse): boolean {
    return ev.attemptStatus === 'IN_PROGRESS';
  }

  isSubmitted(ev: StudentEvaluationResponse): boolean {
    return ev.attemptStatus === 'SUBMITTED' || ev.attemptStatus === 'GRADED';
  }

  /** Puede iniciar un intento nuevo: no en progreso, no vencida y con intentos disponibles. */
  canStart(ev: StudentEvaluationResponse): boolean {
    return !this.hasInProgress(ev) && !this.isOverdue(ev) && !this.attemptsExhausted(ev);
  }

  /** La tarjeta se atenúa cuando ya no hay nada por hacer. */
  isClosed(ev: StudentEvaluationResponse): boolean {
    return !this.hasInProgress(ev) && !this.canStart(ev);
  }

  statusLabel(ev: StudentEvaluationResponse): string {
    if (this.hasInProgress(ev)) return 'En progreso';
    if (this.isSubmitted(ev)) return 'Enviada';
    if (this.isOverdue(ev)) return 'Vencida';
    return 'Pendiente';
  }

  statusBadgeClass(ev: StudentEvaluationResponse): string {
    if (this.hasInProgress(ev)) return 'badge-primary';
    if (this.isSubmitted(ev)) return 'badge-success';
    if (this.isOverdue(ev)) return 'badge-neutral';
    return 'badge-warning';
  }

  // ═══════════════ Detalle ═══════════════

  openEvaluation(ev: StudentEvaluationResponse): void {
    this.selected.set(ev);
    this.startError.set(null);
    this.view.set('detail');
    this.loadDetail(ev.id);
    // Métrica de uso: solo el id y la cantidad de preguntas; nunca enunciados ni respuestas.
    this.usageMetrics.trackEvaluationOpened(ev.id, ev.questionCount);
  }

  reloadDetail(): void {
    const ev = this.selected();
    if (ev) this.loadDetail(ev.id);
  }

  private loadDetail(evaluationId: number): void {
    this.detail.set(null);
    this.detailLoading.set(true);
    this.detailError.set(false);
    this.service.getStudentEvaluation(evaluationId).subscribe({
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

  // ═══════════════ Inicio de intento ═══════════════

  askStart(): void {
    this.confirmState.set({
      title: 'Iniciar evaluación',
      message: '¿Deseas iniciar esta evaluación? Se registrará un intento.',
      confirmLabel: 'Iniciar',
      onConfirm: () => this.doStart(),
    });
  }

  private doStart(): void {
    const ev = this.selected();
    if (!ev) return;
    this.starting.set(true);
    this.startError.set(null);
    this.service.startAttempt(ev.id).subscribe({
      next: (attempt) => {
        this.rememberAttempt(ev.id, attempt.id);
        this.enterTake(attempt);
        this.starting.set(false);
        // Métrica de uso: el estudiante inició un intento. Solo el id de la evaluación.
        this.usageMetrics.trackEvaluationStarted(ev.id);
      },
      error: (err: HttpErrorResponse) => {
        this.starting.set(false);
        this.startError.set(this.extractError(err, 'No se pudo iniciar la evaluación.'));
      },
    });
  }

  continueAttempt(ev: StudentEvaluationResponse): void {
    const attemptId = this.storedAttemptId(ev.id);
    this.selected.set(ev);
    this.startError.set(null);
    if (attemptId === null) {
      // Sin endpoint para resolver el intento en progreso por evaluación, solo
      // podemos retomarlo si lo iniciamos en este dispositivo.
      this.view.set('detail');
      this.loadDetail(ev.id);
      this.startError.set(
        'No pudimos recuperar tu intento en progreso en este dispositivo. ' +
          'Continúa desde el equipo donde lo iniciaste o contacta a tu docente.'
      );
      return;
    }
    this.starting.set(true);
    this.service.getAttempt(attemptId).subscribe({
      next: (attempt) => {
        if (attempt.status !== 'IN_PROGRESS') {
          // El intento ya fue enviado: refrescamos la lista y avisamos.
          this.forgetAttempt(ev.id);
          this.starting.set(false);
          this.view.set('detail');
          this.loadDetail(ev.id);
          this.startError.set('Este intento ya fue enviado.');
          return;
        }
        this.enterTake(attempt);
        this.starting.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.forgetAttempt(ev.id);
        this.starting.set(false);
        this.view.set('detail');
        this.loadDetail(ev.id);
        this.startError.set(this.extractError(err, 'No se pudo recuperar el intento en progreso.'));
      },
    });
  }

  /** Carga el intento en el estado y entra en modo rendición (asegura el detalle). */
  private enterTake(attempt: AttemptResponse): void {
    this.attempt.set(attempt);
    const map: Record<number, number | null> = {};
    for (const a of attempt.answers) {
      map[a.questionId] = a.selectedOptionId;
    }
    this.answers.set(map);
    this.submitError.set(null);
    // Reiniciamos el estado de la sesión de rendición.
    this.currentIndex.set(0);
    this.autoSubmitted = false;
    this.exited = false;
    this.suppressNextExit = false;
    this.tabExitCount.set(0);
    this.tabExitWarning.set(null);
    this.calculatorOpen.set(false);

    const loaded = this.detail();
    if (!loaded || loaded.id !== attempt.evaluationId) {
      this.detailLoading.set(true);
      this.detailError.set(false);
      this.service.getStudentEvaluation(attempt.evaluationId).subscribe({
        next: (d) => {
          this.detail.set(d);
          this.detailLoading.set(false);
          this.beginTake();
        },
        error: () => {
          this.detailLoading.set(false);
          this.detailError.set(true);
          this.view.set('detail');
          this.startError.set('No se pudieron cargar las preguntas de la evaluación.');
        },
      });
    } else {
      this.beginTake();
    }
  }

  /** Entra a la vista de rendición y arranca el contador y la detección de salida. */
  private beginTake(): void {
    this.view.set('take');
    this.startTimer();
    this.attachTabExitListeners();
  }

  // ═══════════════ Rendición ═══════════════

  answerFor(questionId: number): number | null {
    return this.answers()[questionId] ?? null;
  }

  selectOption(questionId: number, optionId: number): void {
    // Guardado local inmediato para no perder la selección.
    this.answers.update((m) => ({ ...m, [questionId]: optionId }));

    const attempt = this.attempt();
    if (!attempt) return;

    this.savedQuestionId.set(null);
    this.saveErrorQuestionId.set(null);
    this.savingQuestionId.set(questionId);

    this.service
      .saveAnswer(attempt.id, { questionId, selectedOptionId: optionId })
      .subscribe({
        next: (updated) => {
          this.attempt.set(updated);
          this.savingQuestionId.set(null);
          this.savedQuestionId.set(questionId);
          // El aviso "Respuesta guardada" se oculta tras un momento.
          setTimeout(() => {
            if (this.savedQuestionId() === questionId) this.savedQuestionId.set(null);
          }, 2000);
        },
        error: () => {
          // No bloqueamos la UI: la respuesta queda local y se reenvía al enviar.
          this.savingQuestionId.set(null);
          this.saveErrorQuestionId.set(questionId);
        },
      });
  }

  // ═══════════════ Navegación una por una (ONE_BY_ONE) ═══════════════

  nextQuestion(): void {
    if (this.currentIndex() < this.totalQuestions() - 1) {
      this.currentIndex.update((i) => i + 1);
    }
  }

  prevQuestion(): void {
    if (this.currentIndex() > 0) {
      this.currentIndex.update((i) => i - 1);
    }
  }

  // ═══════════════ Contador de tiempo ═══════════════

  /**
   * Arranca el contador regresivo si la evaluación tiene tiempo límite. El tiempo se
   * calcula desde la hora de inicio del intento (la entrega el backend), no desde que
   * se abre la pantalla, para que recargar no regale tiempo. El backend valida el
   * tiempo al enviar: este contador es solo la experiencia de usuario.
   */
  private startTimer(): void {
    const limit = this.detail()?.timeLimitMinutes ?? null;
    const attempt = this.attempt();
    if (!limit || limit <= 0 || !attempt) {
      this.remainingSeconds.set(null);
      return;
    }
    const startedAt = new Date(attempt.startedAt).getTime();
    const deadline = startedAt + limit * 60 * 1000;
    this.tick(deadline);
    this.timerId = setInterval(() => this.tick(deadline), 1000);
  }

  private tick(deadline: number): void {
    const remaining = Math.round((deadline - Date.now()) / 1000);
    this.remainingSeconds.set(Math.max(0, remaining));
    if (remaining <= 0) {
      this.handleTimeUp();
    }
  }

  /** Al agotarse el tiempo, se envía el intento automáticamente una sola vez. */
  private handleTimeUp(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.autoSubmitted || this.submitting()) {
      return;
    }
    this.autoSubmitted = true;
    this.confirmState.set(null);
    this.doSubmit(true);
  }

  // ═══════════════ Detección de salida de pestaña ═══════════════

  private attachTabExitListeners(): void {
    if (!this.tabExitTracked() || this.listenersAttached) {
      return;
    }
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('blur', this.onWindowBlur);
    window.addEventListener('focus', this.onWindowFocus);
    this.listenersAttached = true;
  }

  private detachTabExitListeners(): void {
    if (!this.listenersAttached) {
      return;
    }
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('blur', this.onWindowBlur);
    window.removeEventListener('focus', this.onWindowFocus);
    this.listenersAttached = false;
  }

  /** Registra una única salida por "abandono" (varios eventos seguidos cuentan como uno). */
  private handleExit(eventType: AttemptEventType): void {
    if (this.exited) {
      return;
    }
    this.exited = true;
    // Si la salida proviene de abrir una herramienta permitida, no se penaliza.
    if (this.suppressNextExit) {
      this.suppressNextExit = false;
      return;
    }
    const attempt = this.attempt();
    if (!attempt) {
      return;
    }
    this.service
      .registerAttemptEvent(attempt.id, {
        eventType,
        description: 'Salida detectada durante el intento.',
      })
      .subscribe({
        next: (summary) => {
          this.tabExitCount.set(summary.tabExitCount);
          this.tabExitWarning.set(
            'Se detectó que saliste de la evaluación. Este evento quedará registrado.'
          );
        },
        // Si el backend rechaza el registro (p. ej. detección desactivada), se ignora.
        error: () => {
          /* sin acción: no se interrumpe el intento */
        },
      });
  }

  /** Al regresar el foco, se rearma la detección para la siguiente salida. */
  private handleReturn(): void {
    this.exited = false;
  }

  dismissTabExitWarning(): void {
    this.tabExitWarning.set(null);
  }

  // ═══════════════ Calculadora química ═══════════════

  toggleCalculator(): void {
    this.calculatorOpen.update((open) => !open);
  }

  /**
   * Abre una herramienta de apoyo químico existente en una pestaña nueva, sin sacar al
   * estudiante del intento. Reutiliza las vistas del motor químico del proyecto; no se
   * duplica lógica química ni se exponen las respuestas de la evaluación. Si la
   * evaluación detecta salidas de pestaña, esta acción permitida no se contabiliza.
   */
  openChemistryTool(path: string): void {
    if (!this.calculatorAllowed()) {
      return;
    }
    if (this.tabExitTracked()) {
      this.suppressNextExit = true;
    }
    window.open(path, '_blank', 'noopener');
  }

  // ═══════════════ Limpieza de la sesión de rendición ═══════════════

  /** Detiene el contador y quita los listeners de salida de pestaña. */
  private stopAttemptSession(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.detachTabExitListeners();
    this.remainingSeconds.set(null);
  }

  // ═══════════════ Envío ═══════════════

  askSubmit(): void {
    const total = this.detail()?.questions.length ?? 0;
    const unanswered = total - this.answeredCount();

    if (unanswered > 0) {
      this.confirmState.set({
        title: 'Preguntas sin responder',
        message: `Aún tienes ${unanswered} ${
          unanswered === 1 ? 'pregunta sin responder' : 'preguntas sin responder'
        }. ¿Deseas continuar de todos modos?`,
        confirmLabel: 'Continuar',
        onConfirm: () => this.askFinalSubmit(),
      });
    } else {
      this.askFinalSubmit();
    }
  }

  private askFinalSubmit(): void {
    this.confirmState.set({
      title: 'Enviar evaluación',
      message:
        '¿Estás seguro de enviar la evaluación? Luego no podrás modificar tus respuestas.',
      confirmLabel: 'Enviar',
      onConfirm: () => this.doSubmit(),
    });
  }

  private doSubmit(auto = false): void {
    const attempt = this.attempt();
    const ev = this.selected();
    const d = this.detail();
    if (!attempt || !d) return;

    // El intento se cierra: detenemos contador y detección de salida de pestaña.
    this.stopAttemptSession();
    this.submitting.set(true);
    this.submitError.set(null);

    // Reenviamos las respuestas seleccionadas por si alguna no llegó a guardarse.
    const map = this.answers();
    const answers = Object.entries(map)
      .filter(([, optionId]) => optionId !== null && optionId !== undefined)
      .map(([questionId, optionId]) => ({
        questionId: Number(questionId),
        selectedOptionId: optionId as number,
      }));

    this.service.submitAttempt(attempt.id, { answers }).subscribe({
      next: (result) => {
        if (ev) this.forgetAttempt(ev.id);
        this.submitting.set(false);
        this.submittedInfo.set({
          title: d.title,
          submittedAt: result.submittedAt,
          attemptNumber: result.attemptNumber,
          autoSubmitted: auto,
        });
        this.view.set('submitted');
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.submitError.set(this.extractError(err, 'No se pudo enviar la evaluación.'));
      },
    });
  }

  // ═══════════════ Navegación entre vistas ═══════════════

  backToList(): void {
    this.stopAttemptSession();
    this.view.set('list');
    this.selected.set(null);
    this.detail.set(null);
    this.attempt.set(null);
    this.answers.set({});
    this.currentIndex.set(0);
    this.tabExitWarning.set(null);
    this.tabExitCount.set(0);
    this.calculatorOpen.set(false);
    this.startError.set(null);
    this.submitError.set(null);
    this.submittedInfo.set(null);
    this.savingQuestionId.set(null);
    this.savedQuestionId.set(null);
    this.saveErrorQuestionId.set(null);
    // Refrescamos la lista para reflejar el nuevo estado del intento.
    this.loadEvaluations();
  }

  // ═══════════════ Diálogo de confirmación ═══════════════

  acceptConfirm(): void {
    const c = this.confirmState();
    this.confirmState.set(null);
    c?.onConfirm();
  }

  cancelConfirm(): void {
    this.confirmState.set(null);
  }

  // ═══════════════ Persistencia local del intento en progreso ═══════════════

  private storageKey(evaluationId: number): string {
    return `${ATTEMPT_STORAGE_PREFIX}${evaluationId}`;
  }

  private rememberAttempt(evaluationId: number, attemptId: number): void {
    try {
      localStorage.setItem(this.storageKey(evaluationId), String(attemptId));
    } catch {
      /* almacenamiento no disponible: la rendición de esta sesión sigue funcionando */
    }
  }

  private storedAttemptId(evaluationId: number): number | null {
    try {
      const raw = localStorage.getItem(this.storageKey(evaluationId));
      if (!raw) return null;
      const id = Number(raw);
      return Number.isFinite(id) ? id : null;
    } catch {
      return null;
    }
  }

  private forgetAttempt(evaluationId: number): void {
    try {
      localStorage.removeItem(this.storageKey(evaluationId));
    } catch {
      /* sin acción */
    }
  }

  // ═══════════════ Utilidades ═══════════════

  /** Abre la pantalla de resultados/calificaciones del estudiante. */
  goToResults(): void {
    void this.router.navigateByUrl('/evaluations/results');
  }

  handleLogout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
  }

  formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('es-PE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }

  formatDateTime(value: string): string {
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

  private extractError(err: HttpErrorResponse, fallback: string): string {
    const body = err.error as ApiError | string | null;
    if (body && typeof body === 'object' && typeof body.message === 'string') {
      return body.message;
    }
    if (typeof body === 'string' && body.trim().length > 0) {
      return body;
    }
    return fallback;
  }
}

function buildInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
