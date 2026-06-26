import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { ConceptContentService } from '../../../core/services/concept-content.service';
import { ConceptMaterialsService } from '../../../core/services/concept-materials.service';
import { UserManagementService } from '../../../core/services/user-management.service';
import {
  SidebarComponent,
  SidebarNavItem,
} from '../../../shared/components/sidebar/sidebar.component';
import { TEACHER_NAV_ITEMS } from '../../../shared/components/sidebar/teacher-nav';
import {
  ApiError,
  AssignConceptContentRequest,
  ConceptAssignmentResponse,
  ConceptCategory,
  ConceptContentResponse,
  ConceptMaterialResponse,
  ConceptStatus,
  CreateConceptContentRequest,
} from '../../../shared/models';

type FormMode = 'create' | 'edit';
type StatusFilter = 'all' | ConceptStatus;
type ListField = 'formationSteps' | 'keyPoints' | 'examples';

/**
 * Etiquetas legibles para las categorías clásicas que se almacenaban como código en
 * mayúsculas. Las categorías personalizadas se muestran tal cual las escribió el docente.
 */
const LEGACY_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  OXIDOS: 'Óxidos',
  HIDROXIDOS: 'Hidróxidos',
  ACIDOS: 'Ácidos',
  SALES_BINARIAS: 'Sales binarias',
  OXISALES: 'Oxisales',
  NOMENCLATURA: 'Nomenclatura',
  GENERAL: 'General',
};

@Component({
  selector: 'app-teacher-concepts',
  standalone: true,
  imports: [ReactiveFormsModule, SidebarComponent],
  styleUrls: ['./teacher-concepts.component.scss'],
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
            <h1 class="page-title">Contenidos conceptuales</h1>
            <p class="page-description">Crea y asigna contenidos de apoyo para tus estudiantes.</p>
          </div>
          <button type="button" class="btn btn-primary" (click)="openCreate()">
            <span class="material-icons">add</span>
            Crear contenido
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
              placeholder="Buscar por título, categoría, resumen o sección…"
              [value]="searchTerm()"
              (input)="onSearch($event)"
            />
          </div>
        </div>

        <!-- Estados de carga / error / vacío / lista -->
        @if (loading()) {
          <div class="loading-state">
            <div class="loading-state__spinner"></div>
            <div class="loading-state__label">Cargando contenidos…</div>
          </div>
        } @else if (error()) {
          <div class="error-state">
            <div class="error-state__icon"><span class="material-icons">error_outline</span></div>
            <h2 class="error-state__title">No se pudieron cargar los contenidos</h2>
            <p class="error-state__desc">{{ error() }}</p>
            <button type="button" class="btn btn-secondary" (click)="loadConcepts()">Reintentar</button>
          </div>
        } @else if (concepts().length === 0) {
          <div class="empty-state">
            <div class="empty-state__icon"><span class="material-icons">menu_book</span></div>
            <h2 class="empty-state__title">Aún no has creado contenidos conceptuales.</h2>
            <p class="empty-state__desc">Crea tu primer contenido de apoyo para empezar a compartirlo con tus estudiantes.</p>
            <button type="button" class="btn btn-primary" (click)="openCreate()">
              <span class="material-icons">add</span>
              Crear contenido
            </button>
          </div>
        } @else if (filteredConcepts().length === 0) {
          <div class="empty-state">
            <div class="empty-state__icon"><span class="material-icons">filter_alt</span></div>
            <h2 class="empty-state__title">No se encontraron contenidos con los filtros seleccionados.</h2>
            <p class="empty-state__desc">Ajusta la búsqueda o el filtro de estado para ver más resultados.</p>
          </div>
        } @else {
          <div class="concept-grid">
            @for (c of filteredConcepts(); track c.id) {
              <article class="concept-card">
                <div class="concept-card__top">
                  <span class="badge badge-neutral">{{ categoryLabel(c.category) }}</span>
                  <span class="badge" [class]="statusBadgeClass(c.status)">
                    <span class="status-dot"></span>{{ statusLabel(c.status) }}
                  </span>
                </div>

                <h3 class="concept-card__title">{{ c.title }}</h3>
                <p class="concept-card__summary">{{ c.summary || 'Sin resumen.' }}</p>

                <div class="concept-card__meta">
                  <span class="concept-card__meta-item">
                    <span class="material-icons">schedule</span>
                    {{ formatDate(c.updatedAt) }}
                  </span>
                  <span class="concept-card__meta-item">
                    <span class="material-icons">group</span>
                    {{ activeAssignments(c).length }} asignación(es)
                  </span>
                </div>

                <div class="concept-card__actions">
                  <button type="button" class="row-action" title="Ver detalle" aria-label="Ver detalle" (click)="openDetail(c)">
                    <span class="material-icons">visibility</span>
                  </button>
                  <button type="button" class="row-action" title="Editar" aria-label="Editar" (click)="openEdit(c)">
                    <span class="material-icons">edit</span>
                  </button>
                  <button
                    type="button"
                    class="row-action"
                    title="Publicar"
                    aria-label="Publicar"
                    [disabled]="c.status !== 'DRAFT'"
                    (click)="askPublish(c)"
                  >
                    <span class="material-icons">publish</span>
                  </button>
                  <button
                    type="button"
                    class="row-action"
                    title="Asignar a sección"
                    aria-label="Asignar a sección"
                    [disabled]="c.status !== 'PUBLISHED'"
                    (click)="openAssign(c)"
                  >
                    <span class="material-icons">assignment_ind</span>
                  </button>
                  <button
                    type="button"
                    class="row-action row-action--danger"
                    title="Archivar"
                    aria-label="Archivar"
                    [disabled]="c.status === 'ARCHIVED'"
                    (click)="askArchive(c)"
                  >
                    <span class="material-icons">archive</span>
                  </button>
                </div>
              </article>
            }
          </div>

          <div class="table-summary">
            Mostrando <strong>{{ filteredConcepts().length }}</strong> de
            <strong>{{ concepts().length }}</strong> contenidos
          </div>
        }
      </main>
    </div>

    <!-- Modal: formulario crear / editar -->
    @if (formOpen()) {
      <div class="modal-overlay" (click)="closeForm()">
        <div class="modal modal--form" (click)="$event.stopPropagation()">
          <header class="modal__header">
            <h2 class="modal__title">
              {{ formMode() === 'edit' ? 'Editar contenido' : 'Crear contenido' }}
            </h2>
            <button type="button" class="modal__close" aria-label="Cerrar" (click)="closeForm()">
              <span class="material-icons">close</span>
            </button>
          </header>

          <form [formGroup]="form" (ngSubmit)="submitForm()" class="modal__body">
            <div class="alert alert-info modal__note">
              <span class="material-icons">lightbulb</span>
              Un contenido puede usar texto, archivos de apoyo o enlaces (o una combinación).
              Tras guardarlo, abre su detalle para adjuntar archivos PDF, diapositivas o enlaces.
            </div>
            <div class="form-grid">
              <div class="form-group form-group--full">
                <label class="form-label" for="title">Título</label>
                <input id="title" class="input" formControlName="title" placeholder="ej. Formación de óxidos"
                  [class.input-error]="isInvalid('title')" />
                @if (isInvalid('title')) {
                  <span class="form-error">El título es obligatorio (máx. 150 caracteres).</span>
                }
              </div>

              <div class="form-group">
                <label class="form-label" for="category">Categoría</label>
                <input
                  id="category"
                  class="input"
                  formControlName="category"
                  list="category-suggestions"
                  maxlength="100"
                  placeholder="ej. Enlace químico, Tabla periódica…"
                  [class.input-error]="isInvalid('category')"
                />
                <datalist id="category-suggestions">
                  @for (cat of categorySuggestions(); track cat) {
                    <option [value]="cat"></option>
                  }
                </datalist>
                <span class="form-hint">
                  Escribe una categoría o elige una sugerida. Puedes usar temas libres, no solo tipos de compuestos.
                </span>
                @if (isInvalid('category')) {
                  <span class="form-error">La categoría es obligatoria (máx. 100 caracteres).</span>
                }
              </div>

              <div class="form-group form-group--full">
                <label class="form-label" for="summary">Resumen <span class="form-label__optional">(opcional)</span></label>
                <input id="summary" class="input" formControlName="summary" placeholder="Breve descripción del contenido"
                  [class.input-error]="isInvalid('summary')" />
                @if (isInvalid('summary')) {
                  <span class="form-error">El resumen no puede superar 500 caracteres.</span>
                }
              </div>

              <div class="form-group form-group--full">
                <label class="form-label" for="explanation">Explicación <span class="form-label__optional">(opcional)</span></label>
                <textarea id="explanation" class="textarea" formControlName="explanation" rows="5"
                  placeholder="Explica el concepto o, si prefieres, apóyate solo en un archivo o enlace"
                  [class.input-error]="isInvalid('explanation')"></textarea>
              </div>

              <!-- Listas dinámicas -->
              <div class="form-group form-group--full">
                <label class="form-label">Pasos de formación</label>
                <div class="list-editor" formArrayName="formationSteps">
                  @for (ctrl of formationSteps.controls; track $index) {
                    <div class="list-editor__row">
                      <input class="input" [formControlName]="$index" placeholder="Describe un paso" />
                      <button type="button" class="row-action row-action--danger" aria-label="Eliminar paso"
                        (click)="removeItem('formationSteps', $index)">
                        <span class="material-icons">close</span>
                      </button>
                    </div>
                  }
                  <button type="button" class="btn btn-ghost btn-sm list-editor__add" (click)="addItem('formationSteps')">
                    <span class="material-icons">add</span> Agregar paso
                  </button>
                </div>
              </div>

              <div class="form-group form-group--full">
                <label class="form-label">Puntos clave</label>
                <div class="list-editor" formArrayName="keyPoints">
                  @for (ctrl of keyPoints.controls; track $index) {
                    <div class="list-editor__row">
                      <input class="input" [formControlName]="$index" placeholder="Punto clave" />
                      <button type="button" class="row-action row-action--danger" aria-label="Eliminar punto"
                        (click)="removeItem('keyPoints', $index)">
                        <span class="material-icons">close</span>
                      </button>
                    </div>
                  }
                  <button type="button" class="btn btn-ghost btn-sm list-editor__add" (click)="addItem('keyPoints')">
                    <span class="material-icons">add</span> Agregar punto
                  </button>
                </div>
              </div>

              <div class="form-group form-group--full">
                <label class="form-label">Ejemplos</label>
                <div class="list-editor" formArrayName="examples">
                  @for (ctrl of examples.controls; track $index) {
                    <div class="list-editor__row">
                      <input class="input" [formControlName]="$index" placeholder="Ejemplo" />
                      <button type="button" class="row-action row-action--danger" aria-label="Eliminar ejemplo"
                        (click)="removeItem('examples', $index)">
                        <span class="material-icons">close</span>
                      </button>
                    </div>
                  }
                  <button type="button" class="btn btn-ghost btn-sm list-editor__add" (click)="addItem('examples')">
                    <span class="material-icons">add</span> Agregar ejemplo
                  </button>
                </div>
              </div>

              <div class="form-group form-group--full">
                <label class="form-label" for="suggestedActivity">Actividad sugerida</label>
                <textarea id="suggestedActivity" class="textarea" formControlName="suggestedActivity" rows="3"
                  placeholder="Indicaciones o actividad sugerida para trabajar el tema (opcional)"
                  [class.input-error]="isInvalid('suggestedActivity')"></textarea>
                @if (isInvalid('suggestedActivity')) {
                  <span class="form-error">La actividad sugerida no puede superar 2000 caracteres.</span>
                }
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
    @if (detailConcept(); as d) {
      <div class="modal-overlay" (click)="closeDetail()">
        <div class="modal modal--detail" (click)="$event.stopPropagation()">
          <header class="modal__header">
            <div class="modal__header-main">
              <h2 class="modal__title">{{ d.title }}</h2>
              <div class="detail__tags">
                <span class="badge badge-neutral">{{ categoryLabel(d.category) }}</span>
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
            @if (d.summary) {
              <section class="detail__section">
                <h3 class="detail__heading">Resumen</h3>
                <p class="detail__text">{{ d.summary }}</p>
              </section>
            }

            <section class="detail__section">
              <h3 class="detail__heading">Explicación</h3>
              <p class="detail__text detail__text--pre">{{ d.explanation }}</p>
            </section>

            @if (d.formationSteps.length > 0) {
              <section class="detail__section">
                <h3 class="detail__heading">Pasos de formación</h3>
                <ol class="detail__list">
                  @for (step of d.formationSteps; track $index) {
                    <li>{{ step }}</li>
                  }
                </ol>
              </section>
            }

            @if (d.keyPoints.length > 0) {
              <section class="detail__section">
                <h3 class="detail__heading">Puntos clave</h3>
                <ul class="detail__list">
                  @for (p of d.keyPoints; track $index) {
                    <li>{{ p }}</li>
                  }
                </ul>
              </section>
            }

            @if (d.examples.length > 0) {
              <section class="detail__section">
                <h3 class="detail__heading">Ejemplos</h3>
                <ul class="detail__list">
                  @for (e of d.examples; track $index) {
                    <li>{{ e }}</li>
                  }
                </ul>
              </section>
            }

            @if (d.suggestedActivity) {
              <section class="detail__section">
                <h3 class="detail__heading">Actividad sugerida</h3>
                <p class="detail__text detail__text--pre">{{ d.suggestedActivity }}</p>
              </section>
            }

            <section class="detail__section">
              <h3 class="detail__heading">Materiales de apoyo</h3>

              @if (d.materials.length === 0) {
                <p class="detail__text detail__text--muted">Este contenido aún no tiene materiales de apoyo.</p>
              } @else {
                <div class="material-list">
                  @for (m of d.materials; track m.materialId) {
                    <div class="material-row">
                      <span class="material-icons material-row__icon">{{ materialIcon(m) }}</span>
                      <div class="material-row__info">
                        <span class="material-row__title">{{ materialLabel(m) }}</span>
                        <span class="material-row__meta">{{ materialMeta(m) }}</span>
                      </div>
                      <div class="material-row__actions">
                        @if (m.type === 'LINK') {
                          <a class="row-action" [href]="m.url" target="_blank" rel="noopener noreferrer"
                            title="Abrir enlace" aria-label="Abrir enlace">
                            <span class="material-icons">open_in_new</span>
                          </a>
                        } @else {
                          <button type="button" class="row-action" title="Descargar" aria-label="Descargar"
                            [disabled]="downloadingId() === m.materialId" (click)="downloadMaterial(m)">
                            <span class="material-icons">download</span>
                          </button>
                        }
                        <button type="button" class="row-action row-action--danger" title="Retirar" aria-label="Retirar"
                          [disabled]="removingId() === m.materialId" (click)="removeMaterial(d, m)">
                          <span class="material-icons">delete</span>
                        </button>
                      </div>
                    </div>
                  }
                </div>
              }

              <div class="material-editor">
                <div class="material-editor__block">
                  <h4 class="material-subheading">{{ hasFileMaterial(d) ? 'Reemplazar archivo' : 'Agregar archivo' }}</h4>
                  <p class="form-hint">PDF, diapositivas (PPT/PPTX) o imágenes (PNG/JPG). Máximo 10 MB.</p>
                  <div class="material-upload">
                    <input type="file" class="input" #fileInput
                      accept=".pdf,.ppt,.pptx,.png,.jpg,.jpeg"
                      (change)="onFileSelected($event)" />
                    <button type="button" class="btn btn-primary btn-sm"
                      [disabled]="!selectedFile() || uploadingFile()" (click)="uploadFile(d, fileInput)">
                      {{ uploadingFile() ? 'Subiendo…' : 'Subir' }}
                    </button>
                  </div>
                  @if (selectedFile(); as f) {
                    <span class="material-selected">{{ f.name }} · {{ formatSize(f.size) }}</span>
                  }
                  @if (fileError()) {
                    <span class="form-error">{{ fileError() }}</span>
                  }
                </div>

                <div class="material-editor__block">
                  <h4 class="material-subheading">Agregar enlace externo</h4>
                  <form [formGroup]="linkForm" (ngSubmit)="addLink(d)" class="material-link-form">
                    <input class="input" formControlName="title" placeholder="Título (opcional)" maxlength="150" />
                    <input class="input" formControlName="url" placeholder="https://recurso-de-apoyo…" />
                    <button type="submit" class="btn btn-secondary btn-sm" [disabled]="addingLink()">
                      {{ addingLink() ? 'Agregando…' : 'Agregar enlace' }}
                    </button>
                  </form>
                  @if (linkError()) {
                    <span class="form-error">{{ linkError() }}</span>
                  }
                </div>
              </div>
            </section>

            <section class="detail__section">
              <h3 class="detail__heading">Asignaciones activas</h3>
              @if (activeAssignments(d).length === 0) {
                <p class="detail__text detail__text--muted">Este contenido no tiene asignaciones activas.</p>
              } @else {
                <div class="assignment-list">
                  @for (a of activeAssignments(d); track a.id) {
                    <div class="assignment-row">
                      <div class="assignment-row__info">
                        <span class="badge badge-primary">{{ a.grade }}° {{ a.section }}</span>
                        <span class="assignment-row__date">Asignado el {{ formatDate(a.assignedAt) }}</span>
                      </div>
                      <button type="button" class="btn btn-danger btn-sm" (click)="askDeactivate(d, a)">
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
              <button type="button" class="btn btn-secondary" (click)="askPublish(d)">
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
            <p class="modal__text">Selecciona el grado y la sección que verán este contenido.</p>
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label" for="grade">Grado</label>
                <select id="grade" class="select" formControlName="grade">
                  @for (g of gradeOptions(); track g) {
                    <option [value]="g">{{ g }}° de secundaria</option>
                  }
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="section">Sección</label>
                <select id="section" class="select" formControlName="section">
                  @for (s of sectionOptions(); track s) {
                    <option [value]="s">Sección {{ s }}</option>
                  }
                </select>
              </div>
            </div>

            @if (activeAssignments(target).length > 0) {
              <div class="assignment-list assignment-list--compact">
                <span class="form-label">Ya asignado a:</span>
                <div class="assignment-chips">
                  @for (a of activeAssignments(target); track a.id) {
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
              <button type="submit" class="btn btn-primary" [disabled]="assigning()">
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
          <h2 class="modal__title">¿Deseas publicar este contenido?</h2>
          <p class="modal__text">
            “{{ target.title }}” quedará visible para los estudiantes de las secciones que asignes.
          </p>
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
          <h2 class="modal__title">¿Deseas archivar este contenido?</h2>
          <p class="modal__text">
            “{{ target.title }}” dejará de estar disponible y no podrás asignarlo a nuevas secciones.
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

    <!-- Modal: confirmar desactivar asignación -->
    @if (deactivateTarget(); as target) {
      <div class="modal-overlay" (click)="cancelDeactivate()">
        <div class="modal modal--confirm" (click)="$event.stopPropagation()">
          <div class="modal__warn-icon"><span class="material-icons">link_off</span></div>
          <h2 class="modal__title">¿Desactivar la asignación?</h2>
          <p class="modal__text">
            La sección {{ target.assignment.grade }}° {{ target.assignment.section }} dejará de ver este contenido.
          </p>
          @if (actionError()) {
            <div class="alert alert-danger modal__note"><span class="material-icons">error_outline</span>{{ actionError() }}</div>
          }
          <div class="modal__actions">
            <button type="button" class="btn btn-secondary" (click)="cancelDeactivate()" [disabled]="actionLoading()">Cancelar</button>
            <button type="button" class="btn btn-danger" (click)="confirmDeactivate()" [disabled]="actionLoading()">
              {{ actionLoading() ? 'Desactivando…' : 'Desactivar' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class TeacherConceptsComponent {
  private readonly authService = inject(AuthService);
  private readonly conceptService = inject(ConceptContentService);
  private readonly materialsService = inject(ConceptMaterialsService);
  private readonly userManagementService = inject(UserManagementService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly navItems: readonly SidebarNavItem[] = TEACHER_NAV_ITEMS;

  readonly userRole = 'Docente';

  // Categorías sugeridas para el formulario (catálogo del backend + las ya usadas).
  readonly categorySuggestions = signal<string[]>([]);

  readonly statusTabs: readonly { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'DRAFT', label: 'Borradores' },
    { value: 'PUBLISHED', label: 'Publicados' },
    { value: 'ARCHIVED', label: 'Archivados' },
  ];

  private readonly defaultGrades = ['1', '2', '3', '4', '5'];
  private readonly defaultSections = ['A', 'B', 'C', 'D'];

  // Estado de datos
  readonly concepts = signal<ConceptContentResponse[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Búsqueda y filtros
  readonly searchTerm = signal<string>('');
  readonly statusFilter = signal<StatusFilter>('all');

  // Formulario crear / editar
  readonly formOpen = signal<boolean>(false);
  readonly formMode = signal<FormMode>('create');
  readonly saving = signal<boolean>(false);
  readonly formError = signal<string | null>(null);
  private readonly editingId = signal<number | null>(null);

  // Detalle
  readonly detailConcept = signal<ConceptContentResponse | null>(null);

  // Asignación
  readonly assignTarget = signal<ConceptContentResponse | null>(null);
  readonly assigning = signal<boolean>(false);
  readonly assignError = signal<string | null>(null);

  // Acciones de confirmación (publicar / archivar / desactivar)
  readonly publishTarget = signal<ConceptContentResponse | null>(null);
  readonly archiveTarget = signal<ConceptContentResponse | null>(null);
  readonly deactivateTarget = signal<{
    concept: ConceptContentResponse;
    assignment: ConceptAssignmentResponse;
  } | null>(null);
  readonly actionLoading = signal<boolean>(false);
  readonly actionError = signal<string | null>(null);

  // Opciones de grado/sección derivadas de los estudiantes del docente
  private readonly studentGrades = signal<string[]>([]);
  private readonly studentSections = signal<string[]>([]);

  readonly gradeOptions = computed<string[]>(() => {
    const fromStudents = this.studentGrades();
    return fromStudents.length > 0 ? fromStudents : this.defaultGrades;
  });
  readonly sectionOptions = computed<string[]>(() => {
    const fromStudents = this.studentSections();
    return fromStudents.length > 0 ? fromStudents : this.defaultSections;
  });

  readonly form: FormGroup = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(150)]],
    category: ['', [Validators.required, Validators.maxLength(100)]],
    summary: ['', [Validators.maxLength(500)]],
    explanation: [''],
    formationSteps: this.fb.array<FormControl<string>>([]),
    keyPoints: this.fb.array<FormControl<string>>([]),
    examples: this.fb.array<FormControl<string>>([]),
    suggestedActivity: ['', [Validators.maxLength(2000)]],
  });

  readonly assignForm: FormGroup = this.fb.group({
    grade: ['1', [Validators.required]],
    section: ['A', [Validators.required]],
  });

  // Gestión de materiales de apoyo (en el modal de detalle)
  readonly selectedFile = signal<File | null>(null);
  readonly fileError = signal<string | null>(null);
  readonly uploadingFile = signal<boolean>(false);
  readonly addingLink = signal<boolean>(false);
  readonly linkError = signal<string | null>(null);
  readonly removingId = signal<number | null>(null);
  readonly downloadingId = signal<number | null>(null);

  readonly linkForm: FormGroup = this.fb.group({
    title: [''],
    url: ['', [Validators.required]],
  });

  // Tipos de archivo permitidos (alineados con el backend) y tamaño máximo (10 MB).
  private readonly allowedFileExtensions = ['pdf', 'ppt', 'pptx', 'png', 'jpg', 'jpeg'];
  private readonly maxFileSizeBytes = 10 * 1024 * 1024;

  // Usuario autenticado
  private readonly currentUser = this.authService.currentUser;
  readonly userName = computed<string>(() => this.currentUser()?.username ?? 'Docente');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  readonly filteredConcepts = computed<ConceptContentResponse[]>(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const status = this.statusFilter();

    return this.concepts().filter((c) => {
      const matchesStatus = status === 'all' || c.status === status;
      if (!matchesStatus) {
        return false;
      }
      if (term === '') {
        return true;
      }
      const sections = c.assignments
        .filter((a) => a.active)
        .map((a) => `${a.grade}° ${a.section} ${a.grade}${a.section}`)
        .join(' ');
      const haystack = [
        c.title,
        this.categoryLabel(c.category),
        c.summary ?? '',
        sections,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  });

  constructor() {
    this.loadConcepts();
    this.loadGradeSectionOptions();
    this.loadCategorySuggestions();
  }

  /** Carga las categorías sugeridas; si falla no es bloqueante (el campo es libre). */
  private loadCategorySuggestions(): void {
    this.conceptService.listCategorySuggestions().subscribe({
      next: (categories) => this.categorySuggestions.set(categories),
      error: () => this.categorySuggestions.set([]),
    });
  }

  // ===========================================================================
  // Carga de datos
  // ===========================================================================

  loadConcepts(): void {
    this.loading.set(true);
    this.error.set(null);
    this.conceptService.listTeacherConcepts().subscribe({
      next: (concepts) => {
        this.concepts.set(concepts);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(this.extractError(err, 'Ocurrió un error al cargar los contenidos.'));
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
        this.studentGrades.set([...new Set(students.map((s) => s.grade))].sort());
        this.studentSections.set([...new Set(students.map((s) => s.section))].sort());
      },
      // Si falla, se usan las opciones por defecto; no es un error bloqueante.
      error: () => {
        this.studentGrades.set([]);
        this.studentSections.set([]);
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
      return this.concepts().length;
    }
    return this.concepts().filter((c) => c.status === status).length;
  }

  // ===========================================================================
  // FormArrays de listas
  // ===========================================================================

  get formationSteps(): FormArray<FormControl<string>> {
    return this.form.get('formationSteps') as FormArray<FormControl<string>>;
  }
  get keyPoints(): FormArray<FormControl<string>> {
    return this.form.get('keyPoints') as FormArray<FormControl<string>>;
  }
  get examples(): FormArray<FormControl<string>> {
    return this.form.get('examples') as FormArray<FormControl<string>>;
  }

  private listFor(field: ListField): FormArray<FormControl<string>> {
    return this.form.get(field) as FormArray<FormControl<string>>;
  }

  addItem(field: ListField, value = ''): void {
    this.listFor(field).push(this.fb.nonNullable.control(value));
  }

  removeItem(field: ListField, index: number): void {
    this.listFor(field).removeAt(index);
  }

  private setListValues(field: ListField, values: string[]): void {
    const array = this.listFor(field);
    array.clear();
    values.forEach((v) => array.push(this.fb.nonNullable.control(v)));
  }

  // ===========================================================================
  // Crear / editar
  // ===========================================================================

  openCreate(): void {
    this.formMode.set('create');
    this.editingId.set(null);
    this.formError.set(null);
    this.form.reset({
      title: '',
      category: '',
      summary: '',
      explanation: '',
      suggestedActivity: '',
    });
    this.setListValues('formationSteps', []);
    this.setListValues('keyPoints', []);
    this.setListValues('examples', []);
    this.detailConcept.set(null);
    this.formOpen.set(true);
  }

  openEdit(concept: ConceptContentResponse): void {
    this.formMode.set('edit');
    this.editingId.set(concept.id);
    this.formError.set(null);
    this.form.reset({
      title: concept.title,
      category: concept.category,
      summary: concept.summary ?? '',
      explanation: concept.explanation ?? '',
      suggestedActivity: concept.suggestedActivity ?? '',
    });
    this.setListValues('formationSteps', concept.formationSteps);
    this.setListValues('keyPoints', concept.keyPoints);
    this.setListValues('examples', concept.examples);
    this.detailConcept.set(null);
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
    const summary = (raw.summary ?? '').trim();
    const explanation = (raw.explanation ?? '').trim();
    const suggestedActivity = (raw.suggestedActivity ?? '').trim();
    const request: CreateConceptContentRequest = {
      title: (raw.title ?? '').trim(),
      category: (raw.category ?? '').trim(),
      summary: summary.length > 0 ? summary : undefined,
      explanation: explanation.length > 0 ? explanation : undefined,
      formationSteps: cleanList(raw.formationSteps),
      keyPoints: cleanList(raw.keyPoints),
      examples: cleanList(raw.examples),
      suggestedActivity: suggestedActivity.length > 0 ? suggestedActivity : undefined,
    };

    if (this.formMode() === 'create') {
      this.conceptService.createConcept(request).subscribe({
        next: () => this.onSaveSuccess('Contenido creado correctamente.'),
        error: (err: unknown) => this.onSaveError(err, 'No se pudo crear el contenido.'),
      });
    } else {
      const id = this.editingId();
      if (id === null) {
        this.saving.set(false);
        return;
      }
      this.conceptService.updateConcept(id, request).subscribe({
        next: () => this.onSaveSuccess('Contenido actualizado correctamente.'),
        error: (err: unknown) => this.onSaveError(err, 'No se pudo actualizar el contenido.'),
      });
    }
  }

  // ===========================================================================
  // Detalle
  // ===========================================================================

  openDetail(concept: ConceptContentResponse): void {
    // Se muestra de inmediato con los datos en memoria y se refresca desde el backend.
    this.resetMaterialState();
    this.detailConcept.set(concept);
    this.conceptService.getTeacherConcept(concept.id).subscribe({
      next: (fresh) => {
        this.detailConcept.set(fresh);
        this.replaceConcept(fresh);
      },
      error: () => {
        // Si falla el refresco se conserva la vista con los datos en memoria.
      },
    });
  }

  closeDetail(): void {
    this.detailConcept.set(null);
    this.resetMaterialState();
  }

  // ===========================================================================
  // Asignación
  // ===========================================================================

  openAssign(concept: ConceptContentResponse): void {
    if (concept.status !== 'PUBLISHED') {
      return;
    }
    this.assignError.set(null);
    this.assignForm.reset({
      grade: this.gradeOptions()[0] ?? '1',
      section: this.sectionOptions()[0] ?? 'A',
    });
    this.assignTarget.set(concept);
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

    this.assigning.set(true);
    this.assignError.set(null);
    const raw = this.assignForm.getRawValue();
    const request: AssignConceptContentRequest = {
      grade: raw.grade,
      section: raw.section,
    };

    this.conceptService.assignConcept(target.id, request).subscribe({
      next: () => {
        this.assigning.set(false);
        this.assignTarget.set(null);
        this.flashSuccess(`Contenido asignado a ${request.grade}° ${request.section}.`);
        this.refreshConcept(target.id);
      },
      error: (err: unknown) => {
        this.assigning.set(false);
        this.assignError.set(this.extractError(err, 'No se pudo asignar el contenido.'));
      },
    });
  }

  // ===========================================================================
  // Publicar
  // ===========================================================================

  askPublish(concept: ConceptContentResponse): void {
    this.actionError.set(null);
    this.publishTarget.set(concept);
  }

  cancelPublish(): void {
    this.publishTarget.set(null);
    this.actionError.set(null);
  }

  confirmPublish(): void {
    const target = this.publishTarget();
    if (target === null) {
      return;
    }
    this.actionLoading.set(true);
    this.actionError.set(null);
    this.conceptService.publishConcept(target.id).subscribe({
      next: () => {
        this.actionLoading.set(false);
        this.publishTarget.set(null);
        this.flashSuccess('Contenido publicado correctamente.');
        this.refreshConcept(target.id);
      },
      error: (err: unknown) => {
        this.actionLoading.set(false);
        this.actionError.set(this.extractError(err, 'No se pudo publicar el contenido.'));
      },
    });
  }

  // ===========================================================================
  // Archivar
  // ===========================================================================

  askArchive(concept: ConceptContentResponse): void {
    this.actionError.set(null);
    this.archiveTarget.set(concept);
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
    this.conceptService.archiveConcept(target.id).subscribe({
      next: () => {
        this.actionLoading.set(false);
        this.archiveTarget.set(null);
        this.flashSuccess('Contenido archivado correctamente.');
        this.refreshConcept(target.id);
      },
      error: (err: unknown) => {
        this.actionLoading.set(false);
        this.actionError.set(this.extractError(err, 'No se pudo archivar el contenido.'));
      },
    });
  }

  // ===========================================================================
  // Desactivar asignación
  // ===========================================================================

  askDeactivate(concept: ConceptContentResponse, assignment: ConceptAssignmentResponse): void {
    this.actionError.set(null);
    this.deactivateTarget.set({ concept, assignment });
  }

  cancelDeactivate(): void {
    this.deactivateTarget.set(null);
    this.actionError.set(null);
  }

  confirmDeactivate(): void {
    const target = this.deactivateTarget();
    if (target === null) {
      return;
    }
    this.actionLoading.set(true);
    this.actionError.set(null);
    this.conceptService.deactivateAssignment(target.concept.id, target.assignment.id).subscribe({
      next: () => {
        this.actionLoading.set(false);
        this.deactivateTarget.set(null);
        this.flashSuccess('Asignación desactivada.');
        this.refreshConcept(target.concept.id);
      },
      error: (err: unknown) => {
        this.actionLoading.set(false);
        this.actionError.set(this.extractError(err, 'No se pudo desactivar la asignación.'));
      },
    });
  }

  // ===========================================================================
  // Materiales de apoyo
  // ===========================================================================

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.fileError.set(null);
    if (file === null) {
      this.selectedFile.set(null);
      return;
    }
    const error = this.validateFile(file);
    if (error !== null) {
      this.fileError.set(error);
      this.selectedFile.set(null);
      input.value = '';
      return;
    }
    this.selectedFile.set(file);
  }

  /** Valida tipo y tamaño del archivo antes de enviarlo (el backend repite la validación). */
  private validateFile(file: File): string | null {
    const extension = file.name.includes('.')
      ? file.name.split('.').pop()!.toLowerCase()
      : '';
    if (!this.allowedFileExtensions.includes(extension)) {
      return 'Tipo de archivo no permitido. Usa PDF, PPT/PPTX, PNG o JPG.';
    }
    if (file.size === 0) {
      return 'El archivo está vacío.';
    }
    if (file.size > this.maxFileSizeBytes) {
      return 'El archivo supera el tamaño máximo permitido (10 MB).';
    }
    return null;
  }

  uploadFile(concept: ConceptContentResponse, input: HTMLInputElement): void {
    const file = this.selectedFile();
    if (file === null) {
      return;
    }
    this.uploadingFile.set(true);
    this.fileError.set(null);
    this.materialsService.uploadFile(concept.id, file).subscribe({
      next: () => {
        this.uploadingFile.set(false);
        this.selectedFile.set(null);
        input.value = '';
        this.flashSuccess('Archivo de apoyo guardado.');
        this.refreshConcept(concept.id);
      },
      error: (err: unknown) => {
        this.uploadingFile.set(false);
        this.fileError.set(this.extractError(err, 'No se pudo subir el archivo.'));
      },
    });
  }

  addLink(concept: ConceptContentResponse): void {
    if (this.linkForm.invalid) {
      this.linkForm.markAllAsTouched();
      this.linkError.set('Ingresa una URL válida (http:// o https://).');
      return;
    }
    const raw = this.linkForm.getRawValue();
    const url = (raw.url ?? '').trim();
    if (!/^https?:\/\//i.test(url)) {
      this.linkError.set('La URL debe iniciar con http:// o https://.');
      return;
    }
    const title = (raw.title ?? '').trim();

    this.addingLink.set(true);
    this.linkError.set(null);
    this.materialsService
      .addLink(concept.id, { url, title: title.length > 0 ? title : undefined })
      .subscribe({
        next: () => {
          this.addingLink.set(false);
          this.linkForm.reset({ title: '', url: '' });
          this.flashSuccess('Enlace de apoyo agregado.');
          this.refreshConcept(concept.id);
        },
        error: (err: unknown) => {
          this.addingLink.set(false);
          this.linkError.set(this.extractError(err, 'No se pudo agregar el enlace.'));
        },
      });
  }

  removeMaterial(concept: ConceptContentResponse, material: ConceptMaterialResponse): void {
    this.removingId.set(material.materialId);
    this.materialsService.deleteMaterial(concept.id, material.materialId).subscribe({
      next: () => {
        this.removingId.set(null);
        this.flashSuccess('Material retirado.');
        this.refreshConcept(concept.id);
      },
      error: (err: unknown) => {
        this.removingId.set(null);
        this.fileError.set(this.extractError(err, 'No se pudo retirar el material.'));
      },
    });
  }

  downloadMaterial(material: ConceptMaterialResponse): void {
    const concept = this.detailConcept();
    if (concept === null || material.type !== 'FILE') {
      return;
    }
    this.downloadingId.set(material.materialId);
    this.materialsService.downloadMaterial(concept.id, material.materialId).subscribe({
      next: (blob) => {
        this.downloadingId.set(null);
        this.triggerDownload(blob, material.originalFileName ?? 'material');
      },
      error: (err: unknown) => {
        this.downloadingId.set(null);
        this.fileError.set(this.extractError(err, 'No se pudo descargar el material.'));
      },
    });
  }

  private triggerDownload(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  private resetMaterialState(): void {
    this.selectedFile.set(null);
    this.fileError.set(null);
    this.linkError.set(null);
    this.uploadingFile.set(false);
    this.addingLink.set(false);
    this.removingId.set(null);
    this.downloadingId.set(null);
    this.linkForm.reset({ title: '', url: '' });
  }

  hasFileMaterial(concept: ConceptContentResponse): boolean {
    return concept.materials.some((m) => m.type === 'FILE');
  }

  materialIcon(material: ConceptMaterialResponse): string {
    if (material.type === 'LINK') {
      return 'link';
    }
    const type = material.contentType ?? '';
    if (type === 'application/pdf') {
      return 'picture_as_pdf';
    }
    if (type.startsWith('image/')) {
      return 'image';
    }
    return 'slideshow';
  }

  materialLabel(material: ConceptMaterialResponse): string {
    return (
      material.title ||
      material.originalFileName ||
      material.url ||
      'Material de apoyo'
    );
  }

  materialMeta(material: ConceptMaterialResponse): string {
    if (material.type === 'LINK') {
      return material.url ?? 'Enlace externo';
    }
    const parts: string[] = [];
    if (material.originalFileName && material.title) {
      parts.push(material.originalFileName);
    }
    if (material.fileSize) {
      parts.push(this.formatSize(material.fileSize));
    }
    return parts.join(' · ');
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ===========================================================================
  // Utilidades de presentación
  // ===========================================================================

  categoryLabel(category: ConceptCategory): string {
    if (!category) {
      return 'Sin categoría';
    }
    // Las categorías clásicas se guardaban como código en mayúsculas; se muestran con su
    // etiqueta legible. Las personalizadas se muestran tal cual.
    return LEGACY_CATEGORY_LABELS[category] ?? category;
  }

  statusLabel(status: ConceptStatus): string {
    switch (status) {
      case 'DRAFT':
        return 'Borrador';
      case 'PUBLISHED':
        return 'Publicado';
      case 'ARCHIVED':
        return 'Archivado';
    }
  }

  statusBadgeClass(status: ConceptStatus): string {
    switch (status) {
      case 'DRAFT':
        return 'badge-neutral';
      case 'PUBLISHED':
        return 'badge-success';
      case 'ARCHIVED':
        return 'badge-warning';
    }
  }

  activeAssignments(concept: ConceptContentResponse): ConceptAssignmentResponse[] {
    return concept.assignments.filter((a) => a.active);
  }

  formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
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
    this.loadConcepts();
  }

  private onSaveError(err: unknown, fallback: string): void {
    this.saving.set(false);
    this.formError.set(this.extractError(err, fallback));
  }

  /** Recarga la lista y, si el detalle está abierto para ese contenido, lo actualiza. */
  private refreshConcept(conceptId: number): void {
    this.loadConcepts();
    if (this.detailConcept()?.id === conceptId) {
      this.conceptService.getTeacherConcept(conceptId).subscribe({
        next: (fresh) => this.detailConcept.set(fresh),
        error: () => {
          /* se conserva la vista actual */
        },
      });
    }
  }

  /** Sustituye un contenido en la lista en memoria por su versión actualizada. */
  private replaceConcept(updated: ConceptContentResponse): void {
    this.concepts.update((list) =>
      list.map((c) => (c.id === updated.id ? updated : c))
    );
  }

  private flashSuccess(message: string): void {
    this.successMessage.set(message);
    setTimeout(() => this.successMessage.set(null), 4000);
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

function cleanList(values: readonly (string | null)[] | null | undefined): string[] {
  if (!values) {
    return [];
  }
  return values
    .map((v) => (v ?? '').trim())
    .filter((v) => v.length > 0);
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
