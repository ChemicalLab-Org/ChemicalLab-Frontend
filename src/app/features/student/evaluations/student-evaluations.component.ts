import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { UsageMetricsService } from '../../../core/services/usage-metrics.service';
import { StudentEvaluationsService } from '../../../core/services/student-evaluations.service';
import { ExamSessionService } from '../../../core/services/exam-session.service';
import { ChemistryCatalogService } from '../../compounds/services/chemistry-catalog.service';
import { ChemicalEngineService } from '../../compounds/services/chemical-engine.service';
import {
  CompoundResponse,
  MetalCatalogItem,
} from '../../compounds/models/chemistry.models';
import {
  ELEMENT_DETAILS,
  ElementDetail,
  PERIODIC_ELEMENTS,
  PeriodicElement,
} from '../../periodic-table/data/elements-data';
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
    <div class="layout" [class.layout--exam]="view() === 'take'">
      <!-- Durante el intento se oculta la navegación lateral: modo examen sin salida libre. -->
      @if (view() !== 'take') {
        <app-sidebar
          [navItems]="navItems"
          [userName]="userName()"
          [userRole]="userRoleLabel()"
          [userInitials]="userInitials()"
          (onLogout)="handleLogout()"
        />
      }

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
                  <span class="fact__label">Orden de preguntas</span>
                  <span class="fact__value">{{ d.randomizeQuestions ? 'Aleatorio' : 'Normal' }}</span>
                </div>
                <div class="fact">
                  <span class="fact__label">Calculadora química</span>
                  <span class="fact__value">{{ d.allowChemicalCalculator ? 'Permitida' : 'No permitida' }}</span>
                </div>
                <div class="fact">
                  <span class="fact__label">Tabla periódica</span>
                  <span class="fact__value">{{ d.allowPeriodicTable ? 'Permitida' : 'No permitida' }}</span>
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
                  @if (d.questionDisplayMode === 'ONE_BY_ONE') {
                    <li>
                      <span class="material-icons">arrow_forward</span>
                      Avanzas pregunta por pregunta y no podrás volver a una anterior.
                    </li>
                  }
                  <li>
                    <span class="material-icons">shuffle</span>
                    Orden de preguntas: {{ d.randomizeQuestions ? 'aleatorio' : 'normal' }}.
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
                  <li>
                    <span class="material-icons">{{ d.allowPeriodicTable ? 'grid_on' : 'block' }}</span>
                    {{ d.allowPeriodicTable ? 'Puedes consultar la tabla periódica durante el intento.' : 'No se permite la tabla periódica.' }}
                  </li>
                  <li>
                    <span class="material-icons">lock</span>
                    Durante el examen no podrás navegar a otros módulos.
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

        <!-- ════════════════════ VISTA: RENDICIÓN (MODO EXAMEN) ════════════════════ -->
        @if (view() === 'take') {
          <button type="button" class="ev-back" (click)="leaveAttempt()">
            <span class="material-icons">logout</span> Salir del intento
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
                  <button type="button" class="btn btn-secondary btn-sm ev-tool-btn"
                    [class.ev-tool-btn--active]="calculatorOpen()" (click)="toggleCalculator()">
                    <span class="material-icons">calculate</span> Calculadora química
                  </button>
                }
                @if (periodicTableAllowed()) {
                  <button type="button" class="btn btn-secondary btn-sm ev-tool-btn"
                    [class.ev-tool-btn--active]="periodicTableOpen()" (click)="togglePeriodicTable()">
                    <span class="material-icons">grid_on</span> Tabla periódica
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

            <!-- Calculadora química embebida (formación de óxidos/hidróxidos). -->
            @if (calculatorAllowed() && calculatorOpen()) {
              <div class="ev-tool-panel">
                <div class="ev-tool-panel__head">
                  <span class="ev-tool-panel__title">
                    <span class="material-icons">calculate</span> Calculadora química
                  </span>
                  <button type="button" class="ev-tool-panel__close" (click)="toggleCalculator()" aria-label="Cerrar">
                    <span class="material-icons">close</span>
                  </button>
                </div>
                <p class="ev-tool-panel__hint">
                  Forma un óxido o hidróxido a partir de un elemento y su valencia. Es una herramienta
                  de apoyo: no revela las respuestas de la evaluación.
                </p>
                <div class="ev-tool-form">
                  <select class="select" [value]="calcType()" (change)="onCalcTypeChange($any($event.target).value)">
                    <option value="oxides">Óxido</option>
                    <option value="hydroxides">Hidróxido</option>
                  </select>
                  <select class="select" [value]="calcMetalSymbol()" (change)="onCalcMetalChange($any($event.target).value)">
                    <option value="">Elemento…</option>
                    @for (m of calcMetals(); track m.symbol) {
                      <option [value]="m.symbol">{{ m.name }} ({{ m.symbol }})</option>
                    }
                  </select>
                  <select class="select" [value]="calcValence() ?? ''" (change)="onCalcValenceChange($any($event.target).value)"
                    [disabled]="calcValences().length === 0">
                    <option value="">Valencia…</option>
                    @for (v of calcValences(); track v) {
                      <option [value]="v">{{ v }}</option>
                    }
                  </select>
                  <button type="button" class="btn btn-primary btn-sm" [disabled]="calcLoading()" (click)="computeCompound()">
                    {{ calcLoading() ? 'Formando…' : 'Formar' }}
                  </button>
                </div>
                @if (calcError()) {
                  <p class="ev-tool-panel__error">{{ calcError() }}</p>
                }
                @if (calcResult(); as r) {
                  <div class="ev-tool-result">
                    <div class="ev-tool-result__formula">{{ r.formula }}</div>
                    <ul class="ev-tool-result__names">
                      <li><strong>Tradicional:</strong> {{ r.nomenclature.traditional }}</li>
                      <li><strong>Stock:</strong> {{ r.nomenclature.stock }}</li>
                      <li><strong>Sistemática:</strong> {{ r.nomenclature.systematic }}</li>
                    </ul>
                  </div>
                }
              </div>
            }

            <!-- Tabla periódica embebida (consulta de referencia). -->
            @if (periodicTableAllowed() && periodicTableOpen()) {
              <div class="ev-tool-panel">
                <div class="ev-tool-panel__head">
                  <span class="ev-tool-panel__title">
                    <span class="material-icons">grid_on</span> Tabla periódica
                  </span>
                  <button type="button" class="ev-tool-panel__close" (click)="togglePeriodicTable()" aria-label="Cerrar">
                    <span class="material-icons">close</span>
                  </button>
                </div>
                <input class="input ev-pt__search" type="search" placeholder="Buscar por símbolo, nombre o número…"
                  [value]="ptQuery()" (input)="onPtSearch($event)" />
                <div class="ev-pt__body">
                  <div class="ev-pt__list">
                    @for (e of ptFiltered(); track e.atomicNumber) {
                      <button type="button" class="ev-pt__chip" [class.ev-pt__chip--active]="ptSelected()?.atomicNumber === e.atomicNumber"
                        (click)="selectElement(e)">
                        <span class="ev-pt__num">{{ e.atomicNumber }}</span>
                        <span class="ev-pt__sym">{{ e.symbol }}</span>
                      </button>
                    }
                  </div>
                  @if (ptSelected(); as el) {
                    <div class="ev-pt__detail">
                      <div class="ev-pt__detail-head">
                        <span class="ev-pt__detail-sym">{{ el.symbol }}</span>
                        <div>
                          <div class="ev-pt__detail-name">{{ el.name }}</div>
                          <div class="ev-pt__detail-num">N.º {{ el.atomicNumber }}</div>
                        </div>
                      </div>
                      @if (ptSelectedDetail(); as det) {
                        <ul class="ev-pt__props">
                          @if (det.atomicMass) { <li><strong>Masa atómica:</strong> {{ det.atomicMass }}</li> }
                          @if (det.state) { <li><strong>Estado:</strong> {{ det.state }}</li> }
                          @if (det.valence) { <li><strong>Valencias:</strong> {{ det.valence }}</li> }
                          @if (det.electronegativity) { <li><strong>Electronegatividad:</strong> {{ det.electronegativity }}</li> }
                        </ul>
                      }
                    </div>
                  }
                </div>
              </div>
            }

            <div class="ev-take__progress">
              <div class="ev-take__progress-bar">
                <div class="ev-take__progress-fill" [style.width.%]="progressPct()"></div>
              </div>
              <span class="ev-take__progress-label">
                @if (isOneByOne()) {
                  Pregunta {{ sequentialComplete() ? totalQuestions() : currentIndex() + 1 }} de {{ totalQuestions() }} ·
                }
                {{ answeredCount() }} de {{ d.questions.length }} respondidas
              </span>
            </div>

            @if (sequentialComplete()) {
              <div class="ev-seq-done">
                <span class="material-icons ev-seq-done__icon">task_alt</span>
                <p class="ev-seq-done__title">Respondiste todas las preguntas</p>
                <p class="ev-seq-done__desc">Revisa que estés listo y finaliza la evaluación.</p>
              </div>
            } @else {
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
            }

            @if (submitError()) {
              <div class="alert alert-danger">
                <span class="material-icons">error_outline</span> {{ submitError() }}
              </div>
            }

            <div class="ev-take__actions">
              @if (isOneByOne()) {
                <!-- Flujo secuencial: sin botón "Anterior"; no se puede volver atrás. -->
                @if (sequentialComplete()) {
                  <button
                    type="button"
                    class="btn btn-primary btn-lg"
                    [disabled]="submitting()"
                    (click)="finishSequential()"
                  >
                    {{ submitting() ? 'Enviando...' : 'Finalizar evaluación' }}
                    <span class="material-icons">send</span>
                  </button>
                } @else if (isLastQuestion()) {
                  <button
                    type="button"
                    class="btn btn-primary btn-lg"
                    [disabled]="advancing() || submitting()"
                    (click)="advanceOrFinish()"
                  >
                    {{ advancing() || submitting() ? 'Enviando...' : 'Finalizar evaluación' }}
                    <span class="material-icons">send</span>
                  </button>
                } @else {
                  <button
                    type="button"
                    class="btn btn-primary btn-lg"
                    [disabled]="advancing()"
                    (click)="advanceOrFinish()"
                  >
                    {{ advancing() ? 'Guardando...' : 'Guardar y continuar' }}
                    <span class="material-icons">arrow_forward</span>
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
  private readonly examSession = inject(ExamSessionService);
  private readonly catalogService = inject(ChemistryCatalogService);
  private readonly engineService = inject(ChemicalEngineService);

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
  // Guardando+avanzando en el modo una por una.
  readonly advancing = signal(false);

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
  // Calculadora: reutiliza el motor químico del backend (óxidos/hidróxidos a partir de
  // un metal del catálogo). No duplica lógica química ni expone respuestas correctas.
  readonly calcType = signal<'oxides' | 'hydroxides'>('oxides');
  readonly calcMetals = signal<MetalCatalogItem[]>([]);
  readonly calcMetalSymbol = signal<string>('');
  readonly calcValence = signal<number | null>(null);
  readonly calcResult = signal<CompoundResponse | null>(null);
  readonly calcLoading = signal(false);
  readonly calcError = signal<string | null>(null);

  // Panel de la tabla periódica (si la evaluación la permite). Reutiliza los datos de
  // elementos existentes; es solo consulta de referencia.
  readonly periodicTableOpen = signal(false);
  readonly ptQuery = signal('');
  readonly ptSelected = signal<PeriodicElement | null>(null);
  readonly periodicElements: readonly PeriodicElement[] = PERIODIC_ELEMENTS;

  /** Valencias disponibles del metal elegido en la calculadora. */
  readonly calcValences = computed<readonly number[]>(() => {
    const metal = this.calcMetals().find((m) => m.symbol === this.calcMetalSymbol());
    return metal?.valences ?? [];
  });

  /** Elementos filtrados por símbolo, nombre o número atómico en el panel de tabla periódica. */
  readonly ptFiltered = computed<readonly PeriodicElement[]>(() => {
    const q = this.ptQuery().trim().toLowerCase();
    if (!q) return this.periodicElements;
    return this.periodicElements.filter(
      (e) =>
        e.symbol.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        String(e.atomicNumber) === q
    );
  });

  /** Detalle del elemento seleccionado en el panel de tabla periódica. */
  readonly ptSelectedDetail = computed<ElementDetail | null>(() => {
    const el = this.ptSelected();
    return el ? ELEMENT_DETAILS[el.atomicNumber] ?? null : null;
  });

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
  readonly periodicTableAllowed = computed(
    () => this.detail()?.allowPeriodicTable === true
  );
  readonly tabExitTracked = computed(() => this.detail()?.trackTabExit === true);

  /**
   * Preguntas en el orden fijado para el intento. El backend entrega el orden en
   * `attempt.questionOrder` (estable entre recargas); si por algún motivo no llega, se
   * usa el orden natural del detalle.
   */
  readonly orderedQuestions = computed(() => {
    const questions = this.detail()?.questions ?? [];
    const order = this.attempt()?.questionOrder ?? [];
    if (order.length === 0) {
      return questions;
    }
    const byId = new Map(questions.map((q) => [q.id, q]));
    const ordered = order
      .map((id) => byId.get(id))
      .filter((q): q is (typeof questions)[number] => q !== undefined);
    // Incluye al final cualquier pregunta no contemplada en el orden (robustez).
    for (const q of questions) {
      if (!order.includes(q.id)) {
        ordered.push(q);
      }
    }
    return ordered;
  });

  readonly totalQuestions = computed(() => this.orderedQuestions().length);
  readonly currentQuestion = computed(() => {
    const questions = this.orderedQuestions();
    const index = this.currentIndex();
    return index >= 0 && index < questions.length ? questions[index] : null;
  });
  readonly isLastQuestion = computed(
    () => this.currentIndex() >= this.totalQuestions() - 1
  );
  /**
   * En el modo una por una, el intento ya recorrió todas las preguntas (el índice del
   * backend llegó al final) pero aún no se envía: se muestra la pantalla de finalizar.
   */
  readonly sequentialComplete = computed(
    () => this.isOneByOne() && this.currentIndex() >= this.totalQuestions()
  );
  /** Preguntas visibles: todas (ALL_AT_ONCE) o solo la actual (ONE_BY_ONE). */
  readonly visibleQuestions = computed(() => {
    if (!this.isOneByOne()) {
      return this.orderedQuestions();
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
    // En el modo una por una, continuamos desde la pregunta pendiente que indica el
    // backend (las anteriores quedan bloqueadas); en todas juntas el índice es indiferente.
    this.currentIndex.set(attempt.currentQuestionIndex ?? 0);
    this.autoSubmitted = false;
    this.exited = false;
    this.suppressNextExit = false;
    this.tabExitCount.set(0);
    this.tabExitWarning.set(null);
    this.calculatorOpen.set(false);
    this.periodicTableOpen.set(false);
    this.calcResult.set(null);
    this.calcError.set(null);
    this.ptSelected.set(null);
    this.ptQuery.set('');

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
    // Modo examen: se bloquea la navegación libre a otros módulos mientras dure el intento.
    this.examSession.start();
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

    // En el modo una por una NO se guarda al seleccionar: la respuesta se confirma al
    // pulsar "Guardar y continuar"/"Finalizar", que es cuando el backend la bloquea y
    // avanza. Así evitamos avanzar antes de tiempo.
    if (this.isOneByOne()) {
      return;
    }

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

  // ═══════════════ Avance secuencial una por una (ONE_BY_ONE) ═══════════════

  /**
   * Confirma la respuesta de la pregunta actual y avanza. El backend guarda la respuesta
   * y bloquea la pregunta (no hay retroceso). Si es la última, tras guardar se envía la
   * evaluación. No existe acción para volver a una pregunta anterior.
   */
  advanceOrFinish(): void {
    const attempt = this.attempt();
    const current = this.currentQuestion();
    if (!attempt || !current || this.advancing()) {
      return;
    }
    const wasLast = this.isLastQuestion();
    const selectedOptionId = this.answers()[current.id] ?? null;

    this.advancing.set(true);
    this.submitError.set(null);
    this.service
      .saveAnswer(attempt.id, { questionId: current.id, selectedOptionId })
      .subscribe({
        next: (updated) => {
          this.attempt.set(updated);
          this.advancing.set(false);
          if (wasLast) {
            // La última respuesta ya quedó guardada: se finaliza el intento.
            this.doSubmit();
          } else {
            // Continuamos desde la pregunta pendiente que indica el backend.
            this.currentIndex.set(updated.currentQuestionIndex ?? this.currentIndex() + 1);
          }
        },
        error: (err: HttpErrorResponse) => {
          this.advancing.set(false);
          this.submitError.set(this.extractError(err, 'No se pudo guardar la respuesta.'));
        },
      });
  }

  /** Finaliza el intento desde la pantalla de "todas respondidas" (modo una por una). */
  finishSequential(): void {
    this.askFinalSubmit();
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

  /** Pide confirmación antes de abandonar un intento en curso desde la vista de examen. */
  leaveAttempt(): void {
    this.confirmState.set({
      title: 'Salir del intento',
      message:
        'Tu progreso quedó guardado y podrás retomar el intento más tarde. ¿Deseas salir de la evaluación?',
      confirmLabel: 'Salir',
      onConfirm: () => {
        this.registerNavigationBlocked();
        this.backToList();
      },
    });
  }

  /**
   * Registra un intento de abandonar la evaluación como incidencia del intento, solo si
   * la evaluación tiene activada la detección. No es pérdida de foco, sino navegación
   * interna, por eso usa NAVIGATION_BLOCKED.
   */
  private registerNavigationBlocked(): void {
    if (!this.tabExitTracked()) return;
    const attempt = this.attempt();
    if (!attempt) return;
    this.service
      .registerAttemptEvent(attempt.id, {
        eventType: 'NAVIGATION_BLOCKED',
        description: 'Intento de salir de la evaluación.',
      })
      .subscribe({ error: () => { /* no interrumpe el intento */ } });
  }

  // ═══════════════ Calculadora química (panel embebido) ═══════════════

  toggleCalculator(): void {
    if (!this.calculatorAllowed()) return;
    const open = !this.calculatorOpen();
    this.calculatorOpen.set(open);
    if (open) {
      this.periodicTableOpen.set(false);
      this.loadCalculatorMetals();
    }
  }

  /** Carga el catálogo de metales del backend una sola vez (fuente de verdad química). */
  private loadCalculatorMetals(): void {
    if (this.calcMetals().length > 0) return;
    this.catalogService.metals().subscribe({
      next: (metals) => this.calcMetals.set(metals),
      error: () => this.calcError.set('No se pudo cargar el catálogo de elementos.'),
    });
  }

  onCalcTypeChange(value: string): void {
    this.calcType.set(value === 'hydroxides' ? 'hydroxides' : 'oxides');
    this.calcResult.set(null);
  }

  onCalcMetalChange(symbol: string): void {
    this.calcMetalSymbol.set(symbol);
    this.calcValence.set(null);
    this.calcResult.set(null);
  }

  onCalcValenceChange(value: string): void {
    const v = Number(value);
    this.calcValence.set(Number.isFinite(v) ? v : null);
    this.calcResult.set(null);
  }

  /** Forma el compuesto usando el motor del backend; no revela respuestas de la evaluación. */
  computeCompound(): void {
    const metal = this.calcMetals().find((m) => m.symbol === this.calcMetalSymbol());
    const valence = this.calcValence();
    if (!metal || valence === null) {
      this.calcError.set('Selecciona un elemento y su valencia.');
      return;
    }
    this.calcError.set(null);
    this.calcLoading.set(true);
    const request = { elementSymbol: metal.symbol, elementName: metal.name, valence };
    const call =
      this.calcType() === 'hydroxides'
        ? this.engineService.generateHydroxide(request)
        : this.engineService.generateOxide(request);
    call.subscribe({
      next: (result) => {
        this.calcResult.set(result);
        this.calcLoading.set(false);
      },
      error: () => {
        this.calcLoading.set(false);
        this.calcError.set('No se pudo formar el compuesto.');
      },
    });
  }

  // ═══════════════ Tabla periódica (panel embebido) ═══════════════

  togglePeriodicTable(): void {
    if (!this.periodicTableAllowed()) return;
    const open = !this.periodicTableOpen();
    this.periodicTableOpen.set(open);
    if (open) {
      this.calculatorOpen.set(false);
    }
  }

  onPtSearch(event: Event): void {
    this.ptQuery.set((event.target as HTMLInputElement).value);
  }

  selectElement(element: PeriodicElement): void {
    this.ptSelected.set(element);
  }

  // ═══════════════ Limpieza de la sesión de rendición ═══════════════

  /** Detiene el contador, los listeners y el modo examen (libera la navegación). */
  private stopAttemptSession(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.detachTabExitListeners();
    this.remainingSeconds.set(null);
    this.calculatorOpen.set(false);
    this.periodicTableOpen.set(false);
    this.examSession.end();
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
