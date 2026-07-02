import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { TeacherEvaluationsService } from '../../../core/services/teacher-evaluations.service';
import { UserManagementService } from '../../../core/services/user-management.service';
import {
  SidebarComponent,
  SidebarNavItem,
} from '../../../shared/components/sidebar/sidebar.component';
import { TEACHER_NAV_ITEMS } from '../../../shared/components/sidebar/teacher-nav';
import {
  ApiError,
  AssignEvaluationRequest,
  CreateEvaluationRequest,
  CreateQuestionRequest,
  EvaluationAssignmentResponse,
  EvaluationDetailResponse,
  EvaluationResponse,
  EvaluationStatus,
  QuestionDisplayMode,
  QuestionResponse,
  QuestionType,
} from '../../../shared/models';

type FormMode = 'create' | 'edit';
type StatusFilter = 'all' | EvaluationStatus;

/** Datos mínimos de una evaluación que necesitan los modales de acción. */
interface EvaluationLike {
  readonly id: number;
  readonly title: string;
  readonly status: EvaluationStatus;
}

interface SectionOption {
  readonly key: string;
  readonly grade: string;
  readonly section: string;
  readonly label: string;
}

@Component({
  selector: 'app-teacher-evaluations',
  standalone: true,
  imports: [ReactiveFormsModule, SidebarComponent],
  styleUrls: ['./teacher-evaluations.component.scss'],
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
        <header class="page-header">
          <div>
            <h1 class="page-title">Evaluaciones</h1>
            <p class="page-description">Crea y asigna evaluaciones para tus estudiantes.</p>
          </div>
          <button type="button" class="btn btn-primary" (click)="openCreate()">
            <span class="material-icons">add</span>
            Crear evaluación
          </button>
        </header>

        @if (successMessage()) {
          <div class="alert alert-success page-alert">
            <span class="material-icons">check_circle</span>
            {{ successMessage() }}
          </div>
        }

        <!-- Filtros por estado -->
        <div class="status-tabs">
          @for (tab of statusTabs; track tab.value) {
            <button
              type="button"
              class="status-tab"
              [class.status-tab--active]="statusFilter() === tab.value"
              (click)="statusFilter.set(tab.value)"
            >
              {{ tab.label }}
              <span class="status-tab__count">{{ countByStatus(tab.value) }}</span>
            </button>
          }
        </div>

        <!-- Buscador -->
        <div class="toolbar">
          <div class="input-group toolbar__search">
            <span class="material-icons input-group__icon">search</span>
            <input
              class="input"
              type="search"
              placeholder="Buscar por título, tema, descripción o estado…"
              [value]="searchTerm()"
              (input)="onSearch($event)"
            />
          </div>
        </div>

        <!-- Estados de carga / error / vacío / lista -->
        @if (loading()) {
          <div class="loading-state">
            <div class="loading-state__spinner"></div>
            <div class="loading-state__label">Cargando evaluaciones…</div>
          </div>
        } @else if (error()) {
          <div class="error-state">
            <div class="error-state__icon"><span class="material-icons">error_outline</span></div>
            <h2 class="error-state__title">No se pudieron cargar las evaluaciones</h2>
            <p class="error-state__desc">{{ error() }}</p>
            <button type="button" class="btn btn-secondary" (click)="loadEvaluations()">Reintentar</button>
          </div>
        } @else if (evaluations().length === 0) {
          <div class="empty-state">
            <div class="empty-state__icon"><span class="material-icons">grading</span></div>
            <h2 class="empty-state__title">Aún no has creado evaluaciones.</h2>
            <p class="empty-state__desc">Crea tu primera evaluación para empezar a asignarla a tus estudiantes.</p>
            <button type="button" class="btn btn-primary" (click)="openCreate()">
              <span class="material-icons">add</span>
              Crear evaluación
            </button>
          </div>
        } @else if (filteredEvaluations().length === 0) {
          <div class="empty-state">
            <div class="empty-state__icon"><span class="material-icons">filter_alt</span></div>
            <h2 class="empty-state__title">No se encontraron evaluaciones con los filtros seleccionados.</h2>
            <p class="empty-state__desc">Ajusta la búsqueda o el filtro de estado para ver más resultados.</p>
          </div>
        } @else {
          <div class="eval-grid">
            @for (e of filteredEvaluations(); track e.id) {
              <article class="eval-card">
                <div class="eval-card__top">
                  @if (e.topic) {
                    <span class="badge badge-neutral">{{ e.topic }}</span>
                  } @else {
                    <span class="badge badge-neutral eval-card__topic--empty">Sin tema</span>
                  }
                  <span class="badge" [class]="statusBadgeClass(e.status)">
                    <span class="status-dot"></span>{{ statusLabel(e.status) }}
                  </span>
                </div>

                <h3 class="eval-card__title">{{ e.title }}</h3>
                <p class="eval-card__summary">{{ e.description || 'Sin descripción.' }}</p>

                <div class="eval-card__meta">
                  <span class="eval-card__meta-item">
                    <span class="material-icons">help_outline</span>
                    {{ e.questionCount }} pregunta(s)
                  </span>
                  <span class="eval-card__meta-item">
                    <span class="material-icons">group</span>
                    {{ e.assignmentCount }} asignación(es)
                  </span>
                  <span class="eval-card__meta-item">
                    <span class="material-icons">replay</span>
                    {{ e.maxAttempts }} intento(s)
                  </span>
                  <span class="eval-card__meta-item">
                    <span class="material-icons">timer</span>
                    {{ e.timeLimitMinutes ? e.timeLimitMinutes + ' min' : 'Sin límite' }}
                  </span>
                  <span class="eval-card__meta-item">
                    <span class="material-icons">schedule</span>
                    {{ formatDate(e.updatedAt) }}
                  </span>
                </div>

                <div class="eval-card__actions">
                  <button type="button" class="row-action" title="Ver detalle" aria-label="Ver detalle" (click)="openDetail(e)">
                    <span class="material-icons">visibility</span>
                  </button>
                  <button
                    type="button"
                    class="row-action"
                    title="Ver resultados"
                    aria-label="Ver resultados"
                    [disabled]="e.status === 'DRAFT'"
                    (click)="openResults(e)"
                  >
                    <span class="material-icons">analytics</span>
                  </button>
                  <button type="button" class="row-action" title="Editar datos generales" aria-label="Editar datos generales" (click)="openEdit(e)">
                    <span class="material-icons">edit</span>
                  </button>
                  <button
                    type="button"
                    class="row-action"
                    title="Agregar pregunta"
                    aria-label="Agregar pregunta"
                    [disabled]="e.status === 'ARCHIVED'"
                    (click)="openQuestionCreate(e)"
                  >
                    <span class="material-icons">playlist_add</span>
                  </button>
                  <button
                    type="button"
                    class="row-action"
                    title="Publicar"
                    aria-label="Publicar"
                    [disabled]="e.status !== 'DRAFT'"
                    (click)="askPublish(e)"
                  >
                    <span class="material-icons">publish</span>
                  </button>
                  <button
                    type="button"
                    class="row-action"
                    title="Asignar a sección"
                    aria-label="Asignar a sección"
                    [disabled]="e.status !== 'PUBLISHED'"
                    (click)="openAssign(e)"
                  >
                    <span class="material-icons">assignment_ind</span>
                  </button>
                  <button
                    type="button"
                    class="row-action row-action--danger"
                    title="Archivar"
                    aria-label="Archivar"
                    [disabled]="e.status === 'ARCHIVED'"
                    (click)="askArchive(e)"
                  >
                    <span class="material-icons">archive</span>
                  </button>
                </div>
              </article>
            }
          </div>

          <div class="table-summary">
            Mostrando <strong>{{ filteredEvaluations().length }}</strong> de
            <strong>{{ evaluations().length }}</strong> evaluaciones
          </div>
        }
      </main>
    </div>

    <!-- Modal: formulario crear / editar datos generales -->
    @if (formOpen()) {
      <div class="modal-overlay" (click)="closeForm()">
        <div class="modal modal--form" (click)="$event.stopPropagation()">
          <header class="modal__header">
            <h2 class="modal__title">
              {{ formMode() === 'edit' ? 'Editar evaluación' : 'Crear evaluación' }}
            </h2>
            <button type="button" class="modal__close" aria-label="Cerrar" (click)="closeForm()">
              <span class="material-icons">close</span>
            </button>
          </header>

          <form [formGroup]="form" (ngSubmit)="submitForm()" class="modal__body">
            <div class="form-grid">
              <div class="form-group form-group--full">
                <label class="form-label" for="title">Título</label>
                <input id="title" class="input" formControlName="title" placeholder="ej. Evaluación de óxidos"
                  [class.input-error]="isInvalid('title')" />
                @if (isInvalid('title')) {
                  <span class="form-error">El título es obligatorio (máx. 150 caracteres).</span>
                }
              </div>

              <div class="form-group">
                <label class="form-label" for="topic">Tema</label>
                <input id="topic" class="input" formControlName="topic" placeholder="ej. Óxidos"
                  [class.input-error]="isInvalid('topic')" />
                @if (isInvalid('topic')) {
                  <span class="form-error">El tema no puede superar 120 caracteres.</span>
                }
              </div>

              <div class="form-group">
                <label class="form-label" for="maxAttempts">Intentos máximos</label>
                <input id="maxAttempts" class="input" type="number" min="1" max="10" formControlName="maxAttempts"
                  [class.input-error]="isInvalid('maxAttempts')" />
                @if (isInvalid('maxAttempts')) {
                  <span class="form-error">Debe ser un número entre 1 y 10.</span>
                }
              </div>

              <div class="form-group">
                <label class="form-label" for="timeLimitMinutes">Tiempo límite (min)</label>
                <input id="timeLimitMinutes" class="input" type="number" min="1" max="240" formControlName="timeLimitMinutes"
                  placeholder="Opcional" [class.input-error]="isInvalid('timeLimitMinutes')" />
                @if (isInvalid('timeLimitMinutes')) {
                  <span class="form-error">Si se indica, debe ser un número entre 1 y 240.</span>
                }
              </div>

              <div class="form-group form-group--full">
                <label class="form-label" for="description">Descripción</label>
                <input id="description" class="input" formControlName="description" placeholder="Breve descripción de la evaluación"
                  [class.input-error]="isInvalid('description')" />
                @if (isInvalid('description')) {
                  <span class="form-error">La descripción no puede superar 1000 caracteres.</span>
                }
              </div>

              <div class="form-group form-group--full">
                <label class="form-label" for="instructions">Instrucciones</label>
                <textarea id="instructions" class="textarea" formControlName="instructions" rows="4"
                  placeholder="Instrucciones que verán los estudiantes (opcional)"
                  [class.input-error]="isInvalid('instructions')"></textarea>
                @if (isInvalid('instructions')) {
                  <span class="form-error">Las instrucciones no pueden superar 2000 caracteres.</span>
                }
              </div>

              <!-- Configuración avanzada del intento -->
              <div class="form-group form-group--full">
                <h3 class="form-section-title">
                  <span class="material-icons">tune</span> Configuración del intento
                </h3>
                <p class="field-hint">
                  Define las reglas que verán y deberán respetar los estudiantes al rendir.
                </p>

                <div class="config-grid">
                  <label class="config-toggle">
                    <input type="checkbox" formControlName="allowChemicalCalculator" />
                    <span class="config-toggle__text">
                      <span class="config-toggle__title">Permitir calculadora química</span>
                      <span class="config-toggle__desc">El estudiante podrá abrir herramientas de apoyo químico durante el intento.</span>
                    </span>
                  </label>

                  <label class="config-toggle">
                    <input type="checkbox" formControlName="allowPeriodicTable" />
                    <span class="config-toggle__text">
                      <span class="config-toggle__title">Permitir tabla periódica</span>
                      <span class="config-toggle__desc">El estudiante podrá consultar la tabla periódica durante el intento.</span>
                    </span>
                  </label>

                  <label class="config-toggle">
                    <input type="checkbox" formControlName="trackTabExit" />
                    <span class="config-toggle__text">
                      <span class="config-toggle__title">Detectar salida de pestaña</span>
                      <span class="config-toggle__desc">Se registrará cuando el estudiante cambie de pestaña o pierda el foco. Es una detección básica, no un bloqueo.</span>
                    </span>
                  </label>

                  <label class="config-toggle">
                    <input type="checkbox" formControlName="randomizeQuestions" />
                    <span class="config-toggle__text">
                      <span class="config-toggle__title">Orden aleatorio de preguntas</span>
                      <span class="config-toggle__desc">Las preguntas se mostrarán en un orden distinto para cada intento.</span>
                    </span>
                  </label>
                </div>

                <div class="form-group config-grid__mode">
                  <label class="form-label" for="questionDisplayMode">Mostrar preguntas</label>
                  <select id="questionDisplayMode" class="select" formControlName="questionDisplayMode">
                    <option value="ALL_AT_ONCE">Todas juntas</option>
                    <option value="ONE_BY_ONE">Una por una</option>
                  </select>
                </div>
              </div>
            </div>

            @if (formError()) {
              <div class="alert alert-danger modal__note">
                <span class="material-icons">error_outline</span>
                {{ formError() }}
              </div>
            }

            <div class="modal__actions">
              <button type="button" class="btn btn-secondary" (click)="closeForm()" [disabled]="saving()">
                Cancelar
              </button>
              <button type="submit" class="btn btn-primary" [disabled]="saving()">
                {{ saving() ? 'Guardando…' : 'Guardar' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Modal: detalle -->
    @if (detailEvaluation(); as d) {
      <div class="modal-overlay" (click)="closeDetail()">
        <div class="modal modal--detail" (click)="$event.stopPropagation()">
          <header class="modal__header">
            <div class="modal__header-main">
              <h2 class="modal__title">{{ d.title }}</h2>
              <div class="detail__tags">
                @if (d.topic) {
                  <span class="badge badge-neutral">{{ d.topic }}</span>
                }
                <span class="badge" [class]="statusBadgeClass(d.status)">
                  <span class="status-dot"></span>{{ statusLabel(d.status) }}
                </span>
              </div>
            </div>
            <button type="button" class="modal__close" aria-label="Cerrar" (click)="closeDetail()">
              <span class="material-icons">close</span>
            </button>
          </header>

          <div class="modal__body detail">
            <div class="detail__facts">
              <div class="detail__fact">
                <span class="detail__fact-label">Intentos máximos</span>
                <span class="detail__fact-value">{{ d.maxAttempts }}</span>
              </div>
              <div class="detail__fact">
                <span class="detail__fact-label">Tiempo límite</span>
                <span class="detail__fact-value">{{ d.timeLimitMinutes ? d.timeLimitMinutes + ' min' : 'Sin límite' }}</span>
              </div>
              <div class="detail__fact">
                <span class="detail__fact-label">Preguntas</span>
                <span class="detail__fact-value">{{ d.questions.length }}</span>
              </div>
              <div class="detail__fact">
                <span class="detail__fact-label">Modo de preguntas</span>
                <span class="detail__fact-value">{{ d.questionDisplayMode === 'ONE_BY_ONE' ? 'Una por una' : 'Todas juntas' }}</span>
              </div>
              <div class="detail__fact">
                <span class="detail__fact-label">Orden de preguntas</span>
                <span class="detail__fact-value">{{ d.randomizeQuestions ? 'Aleatorio' : 'Normal' }}</span>
              </div>
              <div class="detail__fact">
                <span class="detail__fact-label">Calculadora química</span>
                <span class="detail__fact-value">{{ d.allowChemicalCalculator ? 'Permitida' : 'Bloqueada' }}</span>
              </div>
              <div class="detail__fact">
                <span class="detail__fact-label">Tabla periódica</span>
                <span class="detail__fact-value">{{ d.allowPeriodicTable ? 'Permitida' : 'Bloqueada' }}</span>
              </div>
              <div class="detail__fact">
                <span class="detail__fact-label">Salida de pestaña</span>
                <span class="detail__fact-value">{{ d.trackTabExit ? 'Detección activada' : 'Sin detección' }}</span>
              </div>
            </div>

            @if (d.description) {
              <section class="detail__section">
                <h3 class="detail__heading">Descripción</h3>
                <p class="detail__text">{{ d.description }}</p>
              </section>
            }

            @if (d.instructions) {
              <section class="detail__section">
                <h3 class="detail__heading">Instrucciones</h3>
                <p class="detail__text detail__text--pre">{{ d.instructions }}</p>
              </section>
            }

            <!-- Preguntas -->
            <section class="detail__section">
              <div class="detail__section-head">
                <h3 class="detail__heading">Preguntas</h3>
                @if (d.status !== 'ARCHIVED') {
                  <button type="button" class="btn btn-ghost btn-sm" (click)="openQuestionCreate(d)">
                    <span class="material-icons">add</span> Agregar pregunta
                  </button>
                }
              </div>

              @if (d.questions.length === 0) {
                <p class="detail__text detail__text--muted">Esta evaluación todavía no tiene preguntas.</p>
              } @else {
                <div class="question-list">
                  @for (q of d.questions; track q.id; let i = $index) {
                    <article class="question-item">
                      <div class="question-item__head">
                        <span class="question-item__index">{{ i + 1 }}</span>
                        <p class="question-item__text">{{ q.questionText }}</p>
                        <span class="badge" [class.badge-info]="q.questionType === 'OPEN_TEXT'"
                          [class.badge-neutral]="q.questionType !== 'OPEN_TEXT'">
                          {{ q.questionType === 'OPEN_TEXT' ? 'Abierta' : 'Opción múltiple' }}
                        </span>
                        <span class="badge badge-neutral question-item__points">{{ q.points }} pts</span>
                        @if (d.status !== 'ARCHIVED') {
                          <div class="question-item__actions">
                            <button type="button" class="row-action" title="Editar pregunta" aria-label="Editar pregunta" (click)="openQuestionEdit(d, q)">
                              <span class="material-icons">edit</span>
                            </button>
                            <button type="button" class="row-action row-action--danger" title="Desactivar pregunta" aria-label="Desactivar pregunta" (click)="askDeactivateQuestion(d, q)">
                              <span class="material-icons">delete_outline</span>
                            </button>
                          </div>
                        }
                      </div>
                      @if (q.questionType === 'OPEN_TEXT') {
                        <p class="question-item__open">
                          <span class="material-icons option-list__icon">edit_note</span>
                          Respuesta abierta · revisión manual
                        </p>
                        @if (q.expectedAnswer) {
                          <p class="question-item__explanation">
                            <strong>Criterio (solo docente):</strong> {{ q.expectedAnswer }}
                          </p>
                        }
                      } @else {
                        <ul class="option-list">
                          @for (opt of q.options; track opt.id) {
                            <li class="option-list__item" [class.option-list__item--correct]="opt.correct">
                              <span class="material-icons option-list__icon">
                                {{ opt.correct ? 'check_circle' : 'radio_button_unchecked' }}
                              </span>
                              {{ opt.optionText }}
                            </li>
                          }
                        </ul>
                      }
                      @if (q.explanation) {
                        <p class="question-item__explanation">
                          <strong>Explicación:</strong> {{ q.explanation }}
                        </p>
                      }
                    </article>
                  }
                </div>
              }
            </section>

            <!-- Asignaciones -->
            <section class="detail__section">
              <h3 class="detail__heading">Asignaciones activas</h3>
              @if (activeAssignments(d).length === 0) {
                <p class="detail__text detail__text--muted">Esta evaluación no tiene asignaciones activas.</p>
              } @else {
                <div class="assignment-list">
                  @for (a of activeAssignments(d); track a.id) {
                    <div class="assignment-row">
                      <div class="assignment-row__info">
                        <span class="badge badge-primary">{{ a.grade }}° {{ a.section }}</span>
                        <span class="assignment-row__date">
                          @if (a.startAt) { Inicio {{ formatDateTime(a.startAt) }} · }
                          @if (a.dueAt) { Cierre {{ formatDateTime(a.dueAt) }} · }
                          Asignado el {{ formatDate(a.assignedAt) }}
                        </span>
                      </div>
                      <button type="button" class="btn btn-danger btn-sm" (click)="askDeactivateAssignment(d, a)">
                        Desactivar
                      </button>
                    </div>
                  }
                </div>
              }
            </section>
          </div>

          <div class="modal__actions modal__actions--detail">
            <button type="button" class="btn btn-secondary" (click)="openEdit(d)">
              <span class="material-icons">edit</span> Editar
            </button>
            @if (d.status === 'DRAFT') {
              <button type="button" class="btn btn-secondary" (click)="askPublish(toLike(d, d.questions.length))">
                <span class="material-icons">publish</span> Publicar
              </button>
            }
            @if (d.status === 'PUBLISHED') {
              <button type="button" class="btn btn-primary" (click)="openAssign(d)">
                <span class="material-icons">assignment_ind</span> Asignar a sección
              </button>
            }
            @if (d.status !== 'ARCHIVED') {
              <button type="button" class="btn btn-danger" (click)="askArchive(d)">
                <span class="material-icons">archive</span> Archivar
              </button>
            }
          </div>
        </div>
      </div>
    }

    <!-- Modal: formulario de pregunta -->
    @if (questionModalOpen()) {
      <div class="modal-overlay" (click)="closeQuestion()">
        <div class="modal modal--form" (click)="$event.stopPropagation()">
          <header class="modal__header">
            <h2 class="modal__title">
              {{ questionMode() === 'edit' ? 'Editar pregunta' : 'Agregar pregunta' }}
            </h2>
            <button type="button" class="modal__close" aria-label="Cerrar" (click)="closeQuestion()">
              <span class="material-icons">close</span>
            </button>
          </header>

          <form [formGroup]="questionForm" (ngSubmit)="submitQuestion()" class="modal__body">
            <div class="form-grid">
              <div class="form-group form-group--full">
                <label class="form-label" for="questionType">Tipo de pregunta</label>
                <select id="questionType" class="input" formControlName="questionType"
                  (change)="onQuestionTypeChange($event)">
                  <option value="MULTIPLE_CHOICE">Opción múltiple</option>
                  <option value="OPEN_TEXT">Respuesta abierta</option>
                </select>
                <p class="field-hint">
                  @if (questionType() === 'OPEN_TEXT') {
                    La responde el estudiante con texto y la calificas manualmente.
                  } @else {
                    Se califica automáticamente según la alternativa correcta.
                  }
                </p>
              </div>

              <div class="form-group form-group--full">
                <label class="form-label" for="questionText">Enunciado</label>
                <textarea id="questionText" class="textarea" formControlName="questionText" rows="3"
                  placeholder="Escribe el enunciado de la pregunta"
                  [class.input-error]="isQuestionInvalid('questionText')"></textarea>
                @if (isQuestionInvalid('questionText')) {
                  <span class="form-error">El enunciado es obligatorio.</span>
                }
              </div>

              <div class="form-group">
                <label class="form-label" for="points">Puntaje</label>
                <input id="points" class="input" type="number" min="1" formControlName="points"
                  [class.input-error]="isQuestionInvalid('points')" />
                @if (isQuestionInvalid('points')) {
                  <span class="form-error">El puntaje debe ser al menos 1.</span>
                }
              </div>

              @if (questionType() === 'OPEN_TEXT') {
                <div class="form-group">
                  <label class="form-label form-label--check">
                    <input type="checkbox" formControlName="required" />
                    Respuesta obligatoria
                  </label>
                  <p class="field-hint">Si está marcada, el estudiante no puede enviar sin responder.</p>
                </div>
              }

              <div class="form-group form-group--full">
                <label class="form-label" for="explanation">Explicación (opcional)</label>
                <input id="explanation" class="input" formControlName="explanation"
                  placeholder="Se muestra como retroalimentación" />
              </div>

              @if (questionType() === 'OPEN_TEXT') {
                <div class="form-group form-group--full">
                  <label class="form-label" for="expectedAnswer">Respuesta esperada o criterio (opcional)</label>
                  <textarea id="expectedAnswer" class="textarea" formControlName="expectedAnswer" rows="3"
                    placeholder="Visible solo para ti; te orienta al calificar"></textarea>
                  <p class="field-hint">Solo tú la ves. El estudiante nunca recibe este criterio.</p>
                </div>
              } @else {
                <div class="form-group form-group--full">
                  <label class="form-label">Alternativas</label>
                  <p class="field-hint">Marca la alternativa correcta. Debe haber al menos dos alternativas y exactamente una correcta.</p>
                  <div class="option-editor" formArrayName="options">
                    @for (group of optionsArray.controls; track $index) {
                      <div class="option-editor__row" [formGroupName]="$index">
                        <input
                          type="radio"
                          class="option-editor__radio"
                          name="correctOption"
                          [attr.aria-label]="'Marcar alternativa ' + ($index + 1) + ' como correcta'"
                          [checked]="group.get('correct')?.value === true"
                          (change)="markCorrect($index)"
                        />
                        <input class="input" formControlName="optionText" [placeholder]="'Alternativa ' + ($index + 1)" />
                        <button
                          type="button"
                          class="row-action row-action--danger"
                          aria-label="Eliminar alternativa"
                          [disabled]="optionsArray.length <= 2"
                          (click)="removeOption($index)"
                        >
                          <span class="material-icons">close</span>
                        </button>
                      </div>
                    }
                    <button type="button" class="btn btn-ghost btn-sm option-editor__add" (click)="addOption()">
                      <span class="material-icons">add</span> Agregar alternativa
                    </button>
                  </div>
                </div>
              }
            </div>

            @if (questionError()) {
              <div class="alert alert-danger modal__note">
                <span class="material-icons">error_outline</span>
                {{ questionError() }}
              </div>
            }

            <div class="modal__actions">
              <button type="button" class="btn btn-secondary" (click)="closeQuestion()" [disabled]="savingQuestion()">
                Cancelar
              </button>
              <button type="submit" class="btn btn-primary" [disabled]="savingQuestion()">
                {{ savingQuestion() ? 'Guardando…' : 'Guardar pregunta' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Modal: asignar a sección -->
    @if (assignTarget(); as target) {
      <div class="modal-overlay" (click)="closeAssign()">
        <div class="modal modal--form" (click)="$event.stopPropagation()">
          <header class="modal__header">
            <h2 class="modal__title">Asignar “{{ target.title }}”</h2>
            <button type="button" class="modal__close" aria-label="Cerrar" (click)="closeAssign()">
              <span class="material-icons">close</span>
            </button>
          </header>

          <form [formGroup]="assignForm" (ngSubmit)="submitAssign()" class="modal__body">
            <p class="modal__text">Selecciona una de tus secciones con estudiantes registrados.</p>
            <div class="form-grid">
              <div class="form-group form-group--full">
                <label class="form-label" for="sectionKey">Sección</label>
                <select
                  id="sectionKey"
                  class="select"
                  formControlName="sectionKey"
                  [disabled]="sectionOptions().length === 0"
                >
                  @for (option of sectionOptions(); track option.key) {
                    <option [value]="option.key">{{ option.label }}</option>
                  }
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="startAt">Inicio (opcional)</label>
                <input id="startAt" class="input" type="datetime-local" formControlName="startAt" />
              </div>
              <div class="form-group">
                <label class="form-label" for="dueAt">Cierre (opcional)</label>
                <input id="dueAt" class="input" type="datetime-local" formControlName="dueAt" />
              </div>
            </div>

            @if (sectionOptions().length === 0) {
              <div class="alert alert-info modal__note">
                <span class="material-icons">info</span>
                Aún no tienes secciones con estudiantes registrados.
              </div>
            }

            @if (assignTargetAssignments().length > 0) {
              <div class="assignment-list assignment-list--compact">
                <span class="form-label">Ya asignada a:</span>
                <div class="assignment-chips">
                  @for (a of assignTargetAssignments(); track a.id) {
                    <span class="badge badge-primary">{{ a.grade }}° {{ a.section }}</span>
                  }
                </div>
              </div>
            }

            @if (assignError()) {
              <div class="alert alert-danger modal__note">
                <span class="material-icons">error_outline</span>
                {{ assignError() }}
              </div>
            }

            <div class="modal__actions">
              <button type="button" class="btn btn-secondary" (click)="closeAssign()" [disabled]="assigning()">
                Cancelar
              </button>
              <button type="submit" class="btn btn-primary" [disabled]="assigning() || sectionOptions().length === 0">
                {{ assigning() ? 'Asignando…' : 'Asignar' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Modal: confirmar publicar -->
    @if (publishTarget(); as target) {
      <div class="modal-overlay" (click)="cancelPublish()">
        <div class="modal modal--confirm" (click)="$event.stopPropagation()">
          <div class="modal__warn-icon modal__warn-icon--info"><span class="material-icons">publish</span></div>
          <h2 class="modal__title">¿Deseas publicar esta evaluación?</h2>
          <p class="modal__text">
            “{{ target.title }}” quedará visible para los estudiantes de las secciones que asignes.
          </p>
          @if (publishHasNoQuestions()) {
            <div class="alert alert-warning modal__note">
              <span class="material-icons">warning_amber</span>
              Esta evaluación no tiene preguntas. El backend podría rechazar la publicación.
            </div>
          }
          @if (actionError()) {
            <div class="alert alert-danger modal__note"><span class="material-icons">error_outline</span>{{ actionError() }}</div>
          }
          <div class="modal__actions">
            <button type="button" class="btn btn-secondary" (click)="cancelPublish()" [disabled]="actionLoading()">Cancelar</button>
            <button type="button" class="btn btn-primary" (click)="confirmPublish()" [disabled]="actionLoading()">
              {{ actionLoading() ? 'Publicando…' : 'Publicar' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Modal: confirmar archivar -->
    @if (archiveTarget(); as target) {
      <div class="modal-overlay" (click)="cancelArchive()">
        <div class="modal modal--confirm" (click)="$event.stopPropagation()">
          <div class="modal__warn-icon"><span class="material-icons">archive</span></div>
          <h2 class="modal__title">¿Deseas archivar esta evaluación?</h2>
          <p class="modal__text">
            “{{ target.title }}” dejará de estar disponible y no podrás asignarla a nuevas secciones.
          </p>
          @if (actionError()) {
            <div class="alert alert-danger modal__note"><span class="material-icons">error_outline</span>{{ actionError() }}</div>
          }
          <div class="modal__actions">
            <button type="button" class="btn btn-secondary" (click)="cancelArchive()" [disabled]="actionLoading()">Cancelar</button>
            <button type="button" class="btn btn-danger" (click)="confirmArchive()" [disabled]="actionLoading()">
              {{ actionLoading() ? 'Archivando…' : 'Archivar' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Modal: confirmar desactivar pregunta -->
    @if (deactivateQuestionTarget(); as target) {
      <div class="modal-overlay" (click)="cancelDeactivateQuestion()">
        <div class="modal modal--confirm" (click)="$event.stopPropagation()">
          <div class="modal__warn-icon"><span class="material-icons">delete_outline</span></div>
          <h2 class="modal__title">¿Desactivar esta pregunta?</h2>
          <p class="modal__text">La pregunta dejará de formar parte de la evaluación.</p>
          @if (actionError()) {
            <div class="alert alert-danger modal__note"><span class="material-icons">error_outline</span>{{ actionError() }}</div>
          }
          <div class="modal__actions">
            <button type="button" class="btn btn-secondary" (click)="cancelDeactivateQuestion()" [disabled]="actionLoading()">Cancelar</button>
            <button type="button" class="btn btn-danger" (click)="confirmDeactivateQuestion()" [disabled]="actionLoading()">
              {{ actionLoading() ? 'Desactivando…' : 'Desactivar' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Modal: confirmar desactivar asignación -->
    @if (deactivateAssignmentTarget(); as target) {
      <div class="modal-overlay" (click)="cancelDeactivateAssignment()">
        <div class="modal modal--confirm" (click)="$event.stopPropagation()">
          <div class="modal__warn-icon"><span class="material-icons">link_off</span></div>
          <h2 class="modal__title">¿Desactivar la asignación?</h2>
          <p class="modal__text">
            La sección {{ target.assignment.grade }}° {{ target.assignment.section }} dejará de ver esta evaluación.
          </p>
          @if (actionError()) {
            <div class="alert alert-danger modal__note"><span class="material-icons">error_outline</span>{{ actionError() }}</div>
          }
          <div class="modal__actions">
            <button type="button" class="btn btn-secondary" (click)="cancelDeactivateAssignment()" [disabled]="actionLoading()">Cancelar</button>
            <button type="button" class="btn btn-danger" (click)="confirmDeactivateAssignment()" [disabled]="actionLoading()">
              {{ actionLoading() ? 'Desactivando…' : 'Desactivar' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class TeacherEvaluationsComponent {
  private readonly authService = inject(AuthService);
  private readonly evaluationService = inject(TeacherEvaluationsService);
  private readonly userManagementService = inject(UserManagementService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly navItems: readonly SidebarNavItem[] = TEACHER_NAV_ITEMS;

  readonly userRole = 'Docente';

  readonly statusTabs: readonly { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Todas' },
    { value: 'DRAFT', label: 'Borradores' },
    { value: 'PUBLISHED', label: 'Publicadas' },
    { value: 'ARCHIVED', label: 'Archivadas' },
  ];

  // Estado de datos
  readonly evaluations = signal<EvaluationResponse[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Búsqueda y filtros
  readonly searchTerm = signal<string>('');
  readonly statusFilter = signal<StatusFilter>('all');

  // Formulario datos generales
  readonly formOpen = signal<boolean>(false);
  readonly formMode = signal<FormMode>('create');
  readonly saving = signal<boolean>(false);
  readonly formError = signal<string | null>(null);
  private readonly editingId = signal<number | null>(null);

  // Detalle
  readonly detailEvaluation = signal<EvaluationDetailResponse | null>(null);

  // Formulario de pregunta
  readonly questionModalOpen = signal<boolean>(false);
  readonly questionMode = signal<FormMode>('create');
  readonly savingQuestion = signal<boolean>(false);
  readonly questionError = signal<string | null>(null);
  /** Tipo de pregunta seleccionado en el modal; controla qué campos se muestran. */
  readonly questionType = signal<QuestionType>('MULTIPLE_CHOICE');
  private readonly questionEvaluationId = signal<number | null>(null);
  private readonly editingQuestionId = signal<number | null>(null);
  private readonly editingQuestionOrder = signal<number | null>(null);

  // Asignación
  readonly assignTarget = signal<EvaluationLike | null>(null);
  readonly assignTargetAssignments = signal<EvaluationAssignmentResponse[]>([]);
  readonly assigning = signal<boolean>(false);
  readonly assignError = signal<string | null>(null);

  // Acciones de confirmación
  readonly publishTarget = signal<EvaluationLike | null>(null);
  readonly publishHasNoQuestions = signal<boolean>(false);
  readonly archiveTarget = signal<EvaluationLike | null>(null);
  readonly deactivateQuestionTarget = signal<{
    evaluationId: number;
    question: QuestionResponse;
  } | null>(null);
  readonly deactivateAssignmentTarget = signal<{
    evaluationId: number;
    assignment: EvaluationAssignmentResponse;
  } | null>(null);
  readonly actionLoading = signal<boolean>(false);
  readonly actionError = signal<string | null>(null);

  // Opciones de sección derivadas de las combinaciones reales de estudiantes del docente.
  private readonly studentSectionOptions = signal<SectionOption[]>([]);
  readonly sectionOptions = computed<SectionOption[]>(() => this.studentSectionOptions());

  readonly form: FormGroup = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(150)]],
    topic: ['', [Validators.maxLength(120)]],
    description: ['', [Validators.maxLength(1000)]],
    instructions: ['', [Validators.maxLength(2000)]],
    maxAttempts: [1, [Validators.required, Validators.min(1), Validators.max(10)]],
    timeLimitMinutes: [null as number | null, [Validators.min(1), Validators.max(240)]],
    allowChemicalCalculator: [false],
    allowPeriodicTable: [false],
    trackTabExit: [false],
    questionDisplayMode: ['ALL_AT_ONCE' as QuestionDisplayMode],
    randomizeQuestions: [false],
  });

  readonly questionForm: FormGroup = this.fb.group({
    questionText: ['', [Validators.required]],
    questionType: ['MULTIPLE_CHOICE' as QuestionType],
    points: [1, [Validators.required, Validators.min(1)]],
    explanation: [''],
    required: [true],
    expectedAnswer: [''],
    options: this.fb.array([this.buildOption(), this.buildOption()]),
  });

  readonly assignForm: FormGroup = this.fb.group({
    sectionKey: ['', [Validators.required]],
    startAt: [''],
    dueAt: [''],
  });

  // Usuario autenticado
  private readonly currentUser = this.authService.currentUser;
  readonly userName = computed<string>(() => this.currentUser()?.username ?? 'Docente');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  readonly filteredEvaluations = computed<EvaluationResponse[]>(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const status = this.statusFilter();

    return this.evaluations().filter((e) => {
      const matchesStatus = status === 'all' || e.status === status;
      if (!matchesStatus) {
        return false;
      }
      if (term === '') {
        return true;
      }
      const haystack = [
        e.title,
        e.topic ?? '',
        e.description ?? '',
        this.statusLabel(e.status),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  });

  constructor() {
    this.loadEvaluations();
    this.loadGradeSectionOptions();
  }

  // ===========================================================================
  // Carga de datos
  // ===========================================================================

  loadEvaluations(): void {
    this.loading.set(true);
    this.error.set(null);
    this.evaluationService.listTeacherEvaluations().subscribe({
      next: (evaluations) => {
        this.evaluations.set(evaluations);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(this.extractError(err, 'Ocurrió un error al cargar las evaluaciones.'));
        this.loading.set(false);
      },
    });
  }

  /** Deriva las combinaciones de grado/sección reales a partir de los estudiantes del docente. */
  private loadGradeSectionOptions(): void {
    const teacherId = this.currentUser()?.userId ?? null;
    if (teacherId === null) {
      return;
    }
    this.userManagementService.listStudentsByTeacher(teacherId).subscribe({
      next: (students) => {
        this.studentSectionOptions.set(buildSectionOptions(students));
      },
      error: () => {
        this.studentSectionOptions.set([]);
      },
    });
  }

  // ===========================================================================
  // Búsqueda / filtros
  // ===========================================================================

  onSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  countByStatus(status: StatusFilter): number {
    if (status === 'all') {
      return this.evaluations().length;
    }
    return this.evaluations().filter((e) => e.status === status).length;
  }

  // ===========================================================================
  // Crear / editar datos generales
  // ===========================================================================

  openCreate(): void {
    this.formMode.set('create');
    this.editingId.set(null);
    this.formError.set(null);
    this.form.reset({
      title: '',
      topic: '',
      description: '',
      instructions: '',
      maxAttempts: 1,
      timeLimitMinutes: null,
      allowChemicalCalculator: false,
      allowPeriodicTable: false,
      trackTabExit: false,
      questionDisplayMode: 'ALL_AT_ONCE',
      randomizeQuestions: false,
    });
    this.detailEvaluation.set(null);
    this.formOpen.set(true);
  }

  openEdit(evaluation: EvaluationResponse | EvaluationDetailResponse): void {
    this.formMode.set('edit');
    this.editingId.set(evaluation.id);
    this.formError.set(null);
    this.form.reset({
      title: evaluation.title,
      topic: evaluation.topic ?? '',
      description: evaluation.description ?? '',
      instructions: evaluation.instructions ?? '',
      maxAttempts: evaluation.maxAttempts,
      timeLimitMinutes: evaluation.timeLimitMinutes ?? null,
      allowChemicalCalculator: evaluation.allowChemicalCalculator ?? false,
      allowPeriodicTable: evaluation.allowPeriodicTable ?? false,
      trackTabExit: evaluation.trackTabExit ?? false,
      questionDisplayMode: evaluation.questionDisplayMode ?? 'ALL_AT_ONCE',
      randomizeQuestions: evaluation.randomizeQuestions ?? false,
    });
    this.detailEvaluation.set(null);
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.formError.set(null);
  }

  submitForm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    const raw = this.form.getRawValue();
    const request: CreateEvaluationRequest = {
      title: (raw.title ?? '').trim(),
      topic: emptyToUndefined(raw.topic),
      description: emptyToUndefined(raw.description),
      instructions: emptyToUndefined(raw.instructions),
      maxAttempts: Number(raw.maxAttempts),
      timeLimitMinutes: toPositiveOrNull(raw.timeLimitMinutes),
      allowChemicalCalculator: raw.allowChemicalCalculator === true,
      allowPeriodicTable: raw.allowPeriodicTable === true,
      trackTabExit: raw.trackTabExit === true,
      questionDisplayMode: (raw.questionDisplayMode as QuestionDisplayMode) ?? 'ALL_AT_ONCE',
      randomizeQuestions: raw.randomizeQuestions === true,
    };

    if (this.formMode() === 'create') {
      this.evaluationService.createEvaluation(request).subscribe({
        next: () => this.onSaveSuccess('Evaluación creada correctamente.'),
        error: (err: unknown) => this.onSaveError(err, 'No se pudo crear la evaluación.'),
      });
    } else {
      const id = this.editingId();
      if (id === null) {
        this.saving.set(false);
        return;
      }
      this.evaluationService.updateEvaluation(id, request).subscribe({
        next: () => this.onSaveSuccess('Evaluación actualizada correctamente.'),
        error: (err: unknown) => this.onSaveError(err, 'No se pudo actualizar la evaluación.'),
      });
    }
  }

  // ===========================================================================
  // Detalle
  // ===========================================================================

  openDetail(evaluation: EvaluationLike): void {
    this.evaluationService.getTeacherEvaluation(evaluation.id).subscribe({
      next: (detail) => this.detailEvaluation.set(detail),
      error: (err: unknown) =>
        this.flashError(this.extractError(err, 'No se pudo cargar el detalle de la evaluación.')),
    });
  }

  closeDetail(): void {
    this.detailEvaluation.set(null);
  }

  /** Abre la pantalla de resultados de la evaluación. */
  openResults(evaluation: EvaluationLike): void {
    void this.router.navigateByUrl(`/teacher/evaluations/${evaluation.id}/results`);
  }

  /** Refresca el detalle abierto desde el backend. */
  private refreshDetail(evaluationId: number): void {
    if (this.detailEvaluation()?.id !== evaluationId) {
      return;
    }
    this.evaluationService.getTeacherEvaluation(evaluationId).subscribe({
      next: (detail) => this.detailEvaluation.set(detail),
      error: () => {
        /* se conserva la vista actual */
      },
    });
  }

  // ===========================================================================
  // Preguntas
  // ===========================================================================

  get optionsArray(): FormArray {
    return this.questionForm.get('options') as FormArray;
  }

  private buildOption(text = '', correct = false): FormGroup {
    return this.fb.group({
      optionText: [text, [Validators.required]],
      correct: [correct],
    });
  }

  addOption(): void {
    this.optionsArray.push(this.buildOption());
  }

  removeOption(index: number): void {
    if (this.optionsArray.length <= 2) {
      return;
    }
    this.optionsArray.removeAt(index);
  }

  markCorrect(index: number): void {
    this.optionsArray.controls.forEach((control, i) => {
      control.get('correct')?.setValue(i === index);
    });
  }

  /** Sincroniza la señal de tipo con el selector para mostrar los campos correctos. */
  onQuestionTypeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as QuestionType;
    this.questionType.set(value);
    this.questionForm.get('questionType')?.setValue(value);
    this.questionError.set(null);
  }

  openQuestionCreate(evaluation: EvaluationLike): void {
    if (evaluation.status === 'ARCHIVED') {
      return;
    }
    this.questionMode.set('create');
    this.questionEvaluationId.set(evaluation.id);
    this.editingQuestionId.set(null);
    this.editingQuestionOrder.set(null);
    this.questionError.set(null);
    this.resetQuestionForm();
    this.questionModalOpen.set(true);
  }

  openQuestionEdit(evaluation: EvaluationLike, question: QuestionResponse): void {
    this.questionMode.set('edit');
    this.questionEvaluationId.set(evaluation.id);
    this.editingQuestionId.set(question.id);
    this.editingQuestionOrder.set(question.orderIndex);
    this.questionError.set(null);

    this.questionType.set(question.questionType);
    this.questionForm.reset({
      questionText: question.questionText,
      questionType: question.questionType,
      points: question.points,
      explanation: question.explanation ?? '',
      required: question.required ?? true,
      expectedAnswer: question.expectedAnswer ?? '',
    });
    const array = this.optionsArray;
    array.clear();
    question.options
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .forEach((opt) => array.push(this.buildOption(opt.optionText, opt.correct)));
    // Las preguntas abiertas no tienen alternativas, pero el FormArray necesita el mínimo
    // por si el docente cambia el tipo a opción múltiple durante la edición.
    while (array.length < 2) {
      array.push(this.buildOption());
    }

    this.questionModalOpen.set(true);
  }

  private resetQuestionForm(): void {
    this.questionType.set('MULTIPLE_CHOICE');
    this.questionForm.reset({
      questionText: '',
      questionType: 'MULTIPLE_CHOICE',
      points: 1,
      explanation: '',
      required: true,
      expectedAnswer: '',
    });
    const array = this.optionsArray;
    array.clear();
    array.push(this.buildOption());
    array.push(this.buildOption());
  }

  closeQuestion(): void {
    this.questionModalOpen.set(false);
    this.questionError.set(null);
  }

  isQuestionInvalid(controlName: string): boolean {
    const control = this.questionForm.controls[controlName];
    return control.invalid && (control.touched || control.dirty);
  }

  submitQuestion(): void {
    const evaluationId = this.questionEvaluationId();
    if (evaluationId === null) {
      return;
    }

    const raw = this.questionForm.getRawValue();
    const type = (raw.questionType ?? 'MULTIPLE_CHOICE') as QuestionType;

    // Validación común: el enunciado es obligatorio para ambos tipos.
    if (!(raw.questionText ?? '').trim()) {
      this.questionForm.markAllAsTouched();
      return;
    }

    const orderIndex =
      this.questionMode() === 'edit'
        ? this.editingQuestionOrder() ?? 0
        : this.detailEvaluation()?.questions.length ?? 0;

    let request: CreateQuestionRequest;

    if (type === 'OPEN_TEXT') {
      // Pregunta abierta: sin alternativas, con criterio opcional visible solo para el docente.
      request = {
        questionText: (raw.questionText ?? '').trim(),
        questionType: 'OPEN_TEXT',
        points: Number(raw.points),
        explanation: emptyToUndefined(raw.explanation),
        expectedAnswer: emptyToUndefined(raw.expectedAnswer),
        required: raw.required === true,
        orderIndex,
      };
    } else {
      const options = (raw.options as { optionText: string; correct: boolean }[])
        .map((o, i) => ({
          optionText: (o.optionText ?? '').trim(),
          correct: o.correct === true,
          orderIndex: i,
        }))
        .filter((o) => o.optionText.length > 0);

      if (options.length < 2) {
        this.questionError.set('La pregunta debe tener al menos dos alternativas con texto.');
        return;
      }
      const correctCount = options.filter((o) => o.correct).length;
      if (correctCount === 0) {
        this.questionError.set('Debes marcar una alternativa como correcta.');
        return;
      }
      if (correctCount > 1) {
        this.questionError.set('Solo puede haber una alternativa correcta.');
        return;
      }

      // Reasignar orderIndex consecutivo tras el filtrado.
      const normalizedOptions = options.map((o, i) => ({ ...o, orderIndex: i }));

      request = {
        questionText: (raw.questionText ?? '').trim(),
        questionType: 'MULTIPLE_CHOICE',
        points: Number(raw.points),
        explanation: emptyToUndefined(raw.explanation),
        required: raw.required === true,
        orderIndex,
        options: normalizedOptions,
      };
    }

    this.savingQuestion.set(true);
    this.questionError.set(null);

    if (this.questionMode() === 'create') {
      this.evaluationService.addQuestion(evaluationId, request).subscribe({
        next: () => this.onQuestionSuccess(evaluationId, 'Pregunta agregada correctamente.'),
        error: (err: unknown) => this.onQuestionError(err, 'No se pudo agregar la pregunta.'),
      });
    } else {
      const questionId = this.editingQuestionId();
      if (questionId === null) {
        this.savingQuestion.set(false);
        return;
      }
      this.evaluationService.updateQuestion(evaluationId, questionId, request).subscribe({
        next: () => this.onQuestionSuccess(evaluationId, 'Pregunta actualizada correctamente.'),
        error: (err: unknown) => this.onQuestionError(err, 'No se pudo actualizar la pregunta.'),
      });
    }
  }

  private onQuestionSuccess(evaluationId: number, message: string): void {
    this.savingQuestion.set(false);
    this.questionModalOpen.set(false);
    this.flashSuccess(message);
    this.loadEvaluations();
    this.refreshDetail(evaluationId);
  }

  private onQuestionError(err: unknown, fallback: string): void {
    this.savingQuestion.set(false);
    this.questionError.set(this.extractError(err, fallback));
  }

  askDeactivateQuestion(evaluation: EvaluationLike, question: QuestionResponse): void {
    this.actionError.set(null);
    this.deactivateQuestionTarget.set({ evaluationId: evaluation.id, question });
  }

  cancelDeactivateQuestion(): void {
    this.deactivateQuestionTarget.set(null);
    this.actionError.set(null);
  }

  confirmDeactivateQuestion(): void {
    const target = this.deactivateQuestionTarget();
    if (target === null) {
      return;
    }
    this.actionLoading.set(true);
    this.actionError.set(null);
    this.evaluationService.deactivateQuestion(target.evaluationId, target.question.id).subscribe({
      next: () => {
        this.actionLoading.set(false);
        this.deactivateQuestionTarget.set(null);
        this.flashSuccess('Pregunta desactivada.');
        this.loadEvaluations();
        this.refreshDetail(target.evaluationId);
      },
      error: (err: unknown) => {
        this.actionLoading.set(false);
        this.actionError.set(this.extractError(err, 'No se pudo desactivar la pregunta.'));
      },
    });
  }

  // ===========================================================================
  // Asignación
  // ===========================================================================

  openAssign(evaluation: EvaluationLike): void {
    if (evaluation.status !== 'PUBLISHED') {
      return;
    }
    this.assignError.set(null);
    const sections = this.sectionOptions();
    this.assignForm.reset({
      sectionKey: sections[0]?.key ?? '',
      startAt: '',
      dueAt: '',
    });
    this.assignTarget.set({ id: evaluation.id, title: evaluation.title, status: evaluation.status });

    // Cargar asignaciones activas actuales para mostrarlas como referencia.
    const detail = this.detailEvaluation();
    if (detail !== null && detail.id === evaluation.id) {
      this.assignTargetAssignments.set(this.activeAssignments(detail));
    } else {
      this.assignTargetAssignments.set([]);
      this.evaluationService.getTeacherEvaluation(evaluation.id).subscribe({
        next: (d) => this.assignTargetAssignments.set(this.activeAssignments(d)),
        error: () => this.assignTargetAssignments.set([]),
      });
    }
  }

  closeAssign(): void {
    this.assignTarget.set(null);
    this.assignError.set(null);
  }

  submitAssign(): void {
    const target = this.assignTarget();
    if (target === null) {
      return;
    }
    if (this.assignForm.invalid) {
      this.assignForm.markAllAsTouched();
      return;
    }

    const raw = this.assignForm.getRawValue();
    const selectedSection = this.sectionOptions().find((option) => option.key === raw.sectionKey);
    if (selectedSection === undefined) {
      this.assignError.set('Aún no tienes secciones con estudiantes registrados.');
      return;
    }
    const startAt = emptyToNull(raw.startAt);
    const dueAt = emptyToNull(raw.dueAt);

    if (startAt !== null && dueAt !== null && new Date(dueAt) <= new Date(startAt)) {
      this.assignError.set('La fecha de cierre debe ser posterior a la de inicio.');
      return;
    }

    this.assigning.set(true);
    this.assignError.set(null);
    const request: AssignEvaluationRequest = {
      grade: selectedSection.grade,
      section: selectedSection.section,
      startAt,
      dueAt,
    };

    this.evaluationService.assignEvaluation(target.id, request).subscribe({
      next: () => {
        this.assigning.set(false);
        this.assignTarget.set(null);
        this.flashSuccess(`Evaluación asignada a ${request.grade}° ${request.section}.`);
        this.loadEvaluations();
        this.refreshDetail(target.id);
      },
      error: (err: unknown) => {
        this.assigning.set(false);
        this.assignError.set(
          this.extractError(err, 'Ya existe una asignación activa para esta sección.')
        );
      },
    });
  }

  askDeactivateAssignment(
    evaluation: EvaluationLike,
    assignment: EvaluationAssignmentResponse
  ): void {
    this.actionError.set(null);
    this.deactivateAssignmentTarget.set({ evaluationId: evaluation.id, assignment });
  }

  cancelDeactivateAssignment(): void {
    this.deactivateAssignmentTarget.set(null);
    this.actionError.set(null);
  }

  confirmDeactivateAssignment(): void {
    const target = this.deactivateAssignmentTarget();
    if (target === null) {
      return;
    }
    this.actionLoading.set(true);
    this.actionError.set(null);
    this.evaluationService
      .deactivateAssignment(target.evaluationId, target.assignment.id)
      .subscribe({
        next: () => {
          this.actionLoading.set(false);
          this.deactivateAssignmentTarget.set(null);
          this.flashSuccess('Asignación desactivada.');
          this.loadEvaluations();
          this.refreshDetail(target.evaluationId);
        },
        error: (err: unknown) => {
          this.actionLoading.set(false);
          this.actionError.set(this.extractError(err, 'No se pudo desactivar la asignación.'));
        },
      });
  }

  // ===========================================================================
  // Publicar
  // ===========================================================================

  askPublish(evaluation: EvaluationLike & { questionCount?: number }): void {
    this.actionError.set(null);
    this.publishHasNoQuestions.set((evaluation.questionCount ?? 1) === 0);
    this.publishTarget.set({
      id: evaluation.id,
      title: evaluation.title,
      status: evaluation.status,
    });
  }

  cancelPublish(): void {
    this.publishTarget.set(null);
    this.actionError.set(null);
    this.publishHasNoQuestions.set(false);
  }

  confirmPublish(): void {
    const target = this.publishTarget();
    if (target === null) {
      return;
    }
    this.actionLoading.set(true);
    this.actionError.set(null);
    this.evaluationService.publishEvaluation(target.id).subscribe({
      next: (detail) => {
        this.actionLoading.set(false);
        this.publishTarget.set(null);
        this.publishHasNoQuestions.set(false);
        this.flashSuccess('Evaluación publicada correctamente.');
        this.loadEvaluations();
        if (this.detailEvaluation()?.id === detail.id) {
          this.detailEvaluation.set(detail);
        }
      },
      error: (err: unknown) => {
        this.actionLoading.set(false);
        this.actionError.set(this.extractError(err, 'No se pudo publicar la evaluación.'));
      },
    });
  }

  // ===========================================================================
  // Archivar
  // ===========================================================================

  askArchive(evaluation: EvaluationLike): void {
    this.actionError.set(null);
    this.archiveTarget.set({
      id: evaluation.id,
      title: evaluation.title,
      status: evaluation.status,
    });
  }

  cancelArchive(): void {
    this.archiveTarget.set(null);
    this.actionError.set(null);
  }

  confirmArchive(): void {
    const target = this.archiveTarget();
    if (target === null) {
      return;
    }
    this.actionLoading.set(true);
    this.actionError.set(null);
    this.evaluationService.archiveEvaluation(target.id).subscribe({
      next: () => {
        this.actionLoading.set(false);
        this.archiveTarget.set(null);
        this.flashSuccess('Evaluación archivada correctamente.');
        this.loadEvaluations();
        this.refreshDetail(target.id);
      },
      error: (err: unknown) => {
        this.actionLoading.set(false);
        this.actionError.set(this.extractError(err, 'No se pudo archivar la evaluación.'));
      },
    });
  }

  // ===========================================================================
  // Utilidades de presentación
  // ===========================================================================

  statusLabel(status: EvaluationStatus): string {
    switch (status) {
      case 'DRAFT':
        return 'Borrador';
      case 'PUBLISHED':
        return 'Publicada';
      case 'ARCHIVED':
        return 'Archivada';
    }
  }

  statusBadgeClass(status: EvaluationStatus): string {
    switch (status) {
      case 'DRAFT':
        return 'badge-neutral';
      case 'PUBLISHED':
        return 'badge-success';
      case 'ARCHIVED':
        return 'badge-warning';
    }
  }

  activeAssignments(evaluation: EvaluationDetailResponse): EvaluationAssignmentResponse[] {
    return evaluation.assignments.filter((a) => a.active);
  }

  /** Construye un EvaluationLike con el conteo de preguntas para el modal de publicar. */
  toLike(evaluation: EvaluationLike, questionCount: number): EvaluationLike & { questionCount: number } {
    return {
      id: evaluation.id,
      title: evaluation.title,
      status: evaluation.status,
      questionCount,
    };
  }

  formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    return date.toLocaleString('es-PE', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  isInvalid(controlName: string): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.touched || control.dirty);
  }

  handleLogout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
  }

  // ===========================================================================
  // Helpers privados
  // ===========================================================================

  private onSaveSuccess(message: string): void {
    this.saving.set(false);
    this.formOpen.set(false);
    this.flashSuccess(message);
    this.loadEvaluations();
    const id = this.editingId();
    if (id !== null) {
      this.refreshDetail(id);
    }
  }

  private onSaveError(err: unknown, fallback: string): void {
    this.saving.set(false);
    this.formError.set(this.extractError(err, fallback));
  }

  private flashSuccess(message: string): void {
    this.successMessage.set(message);
    setTimeout(() => this.successMessage.set(null), 4000);
  }

  private flashError(message: string): void {
    this.error.set(message);
  }

  private extractError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const apiError = err.error as ApiError | null;
      if (apiError?.message) {
        return apiError.message;
      }
      if (err.status === 0) {
        return 'No se pudo conectar con el servidor.';
      }
    }
    return fallback;
  }
}

function emptyToUndefined(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toPositiveOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function buildSectionOptions(students: readonly { grade: string; section: string }[]): SectionOption[] {
  const sections = new Map<string, SectionOption>();
  for (const student of students) {
    const grade = student.grade.trim();
    const section = student.section.trim().toUpperCase();
    if (grade.length === 0 || section.length === 0) {
      continue;
    }
    const key = `${grade}|${section}`;
    sections.set(key, { key, grade, section, label: `${grade}° ${section}` });
  }
  return [...sections.values()].sort(
    (a, b) =>
      Number(a.grade) - Number(b.grade) ||
      a.section.localeCompare(b.section, 'es')
  );
}

function buildInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) {
    return '??';
  }
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
