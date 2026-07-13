import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AcademicSupervisionService } from '../../../core/services/academic-supervision.service';
import { SidebarComponent, SidebarNavItem } from '../../../shared/components/sidebar/sidebar.component';
import { ADMIN_NAV_ITEMS } from '../../../shared/components/sidebar/admin-nav';
import {
  AdminActivity,
  AdminActivityItem,
  AuthResponse,
  ConceptCategory,
  ConceptStatus,
  EvaluationStatus,
  SupervisionAssignment,
  SupervisionConcept,
  SupervisionEvaluation,
  SupervisionSectionRef,
  SupervisionSummary,
} from '../../../shared/models';

type SupervisionTab = 'resumen' | 'contenidos' | 'evaluaciones' | 'asignaciones' | 'actividad';

const CATEGORY_LABELS: Record<ConceptCategory, string> = {
  OXIDOS: 'Óxidos',
  HIDROXIDOS: 'Hidróxidos',
  ACIDOS: 'Ácidos',
  SALES_BINARIAS: 'Sales binarias',
  OXISALES: 'Oxisales',
  NOMENCLATURA: 'Nomenclatura',
  GENERAL: 'General',
};

/**
 * Panel administrativo de supervisión académica. Vista de solo lectura: el
 * administrador consulta contenidos, evaluaciones, asignaciones y actividad general
 * sin acciones de creación, edición, publicación, asignación ni calificación, y sin
 * acceso a la clave de respuestas de las evaluaciones.
 */
@Component({
  selector: 'app-academic-supervision',
  standalone: true,
  imports: [FormsModule, SidebarComponent],
  styleUrls: ['./academic-supervision.component.scss'],
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
            <h1 class="main__title">Supervisión académica</h1>
            <p class="main__subtitle">
              Consulta institucional de solo lectura sobre contenidos, evaluaciones,
              asignaciones y actividad general del sistema.
            </p>
          </div>
          <button type="button" class="btn-refresh" (click)="reloadActive()" [disabled]="anyLoading()">
            <span class="material-icons">{{ anyLoading() ? 'hourglass_empty' : 'refresh' }}</span>
            {{ anyLoading() ? 'Cargando…' : 'Actualizar' }}
          </button>
        </header>

        <!-- Pestañas -->
        <nav class="tabs" role="tablist">
          @for (tab of tabs; track tab.id) {
            <button
              type="button"
              class="tabs__tab"
              [class.tabs__tab--active]="activeTab() === tab.id"
              role="tab"
              [attr.aria-selected]="activeTab() === tab.id"
              (click)="selectTab(tab.id)"
            >
              <span class="material-icons">{{ tab.icon }}</span>
              {{ tab.label }}
            </button>
          }
        </nav>

        <!-- ================= RESUMEN ================= -->
        @if (activeTab() === 'resumen') {
          @if (summaryLoading()) {
            <div class="state state--loading">
              <span class="material-icons spin">progress_activity</span>
              <p>Cargando resumen…</p>
            </div>
          } @else if (summaryError()) {
            <div class="state state--error">
              <span class="material-icons">error_outline</span>
              <p>{{ summaryError() }}</p>
              <button type="button" class="btn btn--primary" (click)="loadSummary()">Reintentar</button>
            </div>
          } @else if (summary(); as s) {
            <section class="summary-grid">
              <div class="summary-card">
                <div class="summary-card__icon summary-card__icon--neutral"><span class="material-icons">menu_book</span></div>
                <div class="summary-card__value">{{ s.totalConcepts }}</div>
                <div class="summary-card__label">Contenidos</div>
              </div>
              <div class="summary-card">
                <div class="summary-card__icon summary-card__icon--success"><span class="material-icons">task_alt</span></div>
                <div class="summary-card__value">{{ s.publishedConcepts }}</div>
                <div class="summary-card__label">Contenidos publicados</div>
              </div>
              <div class="summary-card">
                <div class="summary-card__icon summary-card__icon--neutral"><span class="material-icons">quiz</span></div>
                <div class="summary-card__value">{{ s.totalEvaluations }}</div>
                <div class="summary-card__label">Evaluaciones</div>
              </div>
              <div class="summary-card">
                <div class="summary-card__icon summary-card__icon--success"><span class="material-icons">fact_check</span></div>
                <div class="summary-card__value">{{ s.publishedEvaluations }}</div>
                <div class="summary-card__label">Evaluaciones publicadas</div>
              </div>
              <div class="summary-card">
                <div class="summary-card__icon summary-card__icon--info"><span class="material-icons">groups</span></div>
                <div class="summary-card__value">{{ s.teachersWithActivity }}</div>
                <div class="summary-card__label">Docentes con actividad</div>
              </div>
              <div class="summary-card">
                <div class="summary-card__icon summary-card__icon--info"><span class="material-icons">school</span></div>
                <div class="summary-card__value">{{ s.sectionsWithAssignments }}</div>
                <div class="summary-card__label">Secciones con asignaciones</div>
              </div>
              <div class="summary-card">
                <div class="summary-card__icon summary-card__icon--warning"><span class="material-icons">how_to_reg</span></div>
                <div class="summary-card__value">{{ s.submittedAttempts }}</div>
                <div class="summary-card__label">Intentos enviados</div>
              </div>
            </section>
          }
        }

        <!-- ================= CONTENIDOS ================= -->
        @if (activeTab() === 'contenidos') {
          @if (conceptsLoading()) {
            <div class="state state--loading"><span class="material-icons spin">progress_activity</span><p>Cargando contenidos…</p></div>
          } @else if (conceptsError()) {
            <div class="state state--error">
              <span class="material-icons">error_outline</span>
              <p>{{ conceptsError() }}</p>
              <button type="button" class="btn btn--primary" (click)="loadConcepts()">Reintentar</button>
            </div>
          } @else if (concepts().length === 0) {
            <div class="state state--empty"><span class="material-icons">inbox</span><p>No hay contenidos registrados.</p></div>
          } @else {
            <section class="filters">
              <div class="field field--grow">
                <label class="field__label">Buscar</label>
                <input
                  class="field__control"
                  type="text"
                  placeholder="Título o docente creador…"
                  [ngModel]="conceptSearch()"
                  (ngModelChange)="conceptSearch.set($event)"
                />
              </div>
              <div class="field">
                <label class="field__label">Estado</label>
                <select class="field__control" [ngModel]="conceptStatus()" (ngModelChange)="conceptStatus.set($event)">
                  <option value="">Todos</option>
                  @for (s of statusOptions; track s) {
                    <option [value]="s">{{ statusLabel(s) }}</option>
                  }
                </select>
              </div>
              <div class="field">
                <label class="field__label">Categoría</label>
                <select class="field__control" [ngModel]="conceptCategory()" (ngModelChange)="conceptCategory.set($event)">
                  <option value="">Todas</option>
                  @for (c of conceptCategoryOptions(); track c) {
                    <option [value]="c">{{ categoryLabel(c) }}</option>
                  }
                </select>
              </div>
              <div class="field">
                <label class="field__label">Grado / sección</label>
                <select class="field__control" [ngModel]="conceptSection()" (ngModelChange)="conceptSection.set($event)">
                  <option value="">Todas</option>
                  @for (s of conceptSectionOptions(); track s) {
                    <option [value]="s">{{ s }}</option>
                  }
                </select>
              </div>
              @if (hasConceptFilters()) {
                <div class="field field--actions">
                  <button type="button" class="btn btn--ghost" (click)="clearConceptFilters()">Limpiar filtros</button>
                </div>
              }
            </section>

            @if (filteredConcepts().length === 0) {
              <div class="state state--empty">
                <span class="material-icons">filter_alt_off</span>
                <p>No se encontraron registros con los filtros aplicados.</p>
                <button type="button" class="btn btn--ghost" (click)="clearConceptFilters()">Limpiar filtros</button>
              </div>
            } @else {
              <section class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Título</th>
                      <th>Docente creador</th>
                      <th>Categoría</th>
                      <th>Estado</th>
                      <th>Materiales</th>
                      <th>Grados / secciones</th>
                      <th>Creado</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of filteredConcepts(); track c.id) {
                      <tr>
                        <td class="strong">{{ c.title }}</td>
                        <td>{{ c.createdByTeacher ?? '—' }}</td>
                        <td><span class="badge badge-neutral">{{ categoryLabel(c.category) }}</span></td>
                        <td><span class="badge" [class]="statusBadgeClass(c.status)">{{ statusLabel(c.status) }}</span></td>
                        <td>{{ materialsLabel(c) }}</td>
                        <td>{{ sectionsLabel(c.sections) }}</td>
                        <td class="mono">{{ formatDate(c.createdAt) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </section>
            }
          }
        }

        <!-- ================= EVALUACIONES ================= -->
        @if (activeTab() === 'evaluaciones') {
          @if (evaluationsLoading()) {
            <div class="state state--loading"><span class="material-icons spin">progress_activity</span><p>Cargando evaluaciones…</p></div>
          } @else if (evaluationsError()) {
            <div class="state state--error">
              <span class="material-icons">error_outline</span>
              <p>{{ evaluationsError() }}</p>
              <button type="button" class="btn btn--primary" (click)="loadEvaluations()">Reintentar</button>
            </div>
          } @else if (evaluations().length === 0) {
            <div class="state state--empty"><span class="material-icons">inbox</span><p>No hay evaluaciones registradas.</p></div>
          } @else {
            <p class="note">
              <span class="material-icons">lock</span>
              Vista de solo lectura. La supervisión muestra metadatos de las evaluaciones; nunca la clave de respuestas.
            </p>

            <section class="filters">
              <div class="field field--grow">
                <label class="field__label">Buscar</label>
                <input
                  class="field__control"
                  type="text"
                  placeholder="Título o docente creador…"
                  [ngModel]="evalSearch()"
                  (ngModelChange)="evalSearch.set($event)"
                />
              </div>
              <div class="field">
                <label class="field__label">Estado</label>
                <select class="field__control" [ngModel]="evalStatus()" (ngModelChange)="evalStatus.set($event)">
                  <option value="">Todos</option>
                  @for (s of statusOptions; track s) {
                    <option [value]="s">{{ statusLabel(s) }}</option>
                  }
                </select>
              </div>
              <div class="field">
                <label class="field__label">Grado / sección</label>
                <select class="field__control" [ngModel]="evalSection()" (ngModelChange)="evalSection.set($event)">
                  <option value="">Todas</option>
                  @for (s of evalSectionOptions(); track s) {
                    <option [value]="s">{{ s }}</option>
                  }
                </select>
              </div>
              <div class="field field--check">
                <label class="check">
                  <input type="checkbox" [ngModel]="evalWithAttempts()" (ngModelChange)="evalWithAttempts.set($event)" />
                  Solo con intentos enviados
                </label>
              </div>
              @if (hasEvalFilters()) {
                <div class="field field--actions">
                  <button type="button" class="btn btn--ghost" (click)="clearEvalFilters()">Limpiar filtros</button>
                </div>
              }
            </section>

            @if (filteredEvaluations().length === 0) {
              <div class="state state--empty">
                <span class="material-icons">filter_alt_off</span>
                <p>No se encontraron registros con los filtros aplicados.</p>
                <button type="button" class="btn btn--ghost" (click)="clearEvalFilters()">Limpiar filtros</button>
              </div>
            } @else {
              <section class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Título</th>
                      <th>Docente creador</th>
                      <th>Estado</th>
                      <th>Grados / secciones</th>
                      <th class="num">Preguntas</th>
                      <th class="num">Intentos enviados</th>
                      <th>Creada</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (e of filteredEvaluations(); track e.id) {
                      <tr>
                        <td class="strong">{{ e.title }}</td>
                        <td>{{ e.createdByTeacher ?? '—' }}</td>
                        <td><span class="badge" [class]="statusBadgeClass(e.status)">{{ statusLabel(e.status) }}</span></td>
                        <td>{{ sectionsLabel(e.sections) }}</td>
                        <td class="num">{{ e.questionCount }}</td>
                        <td class="num">{{ e.submittedAttempts }}</td>
                        <td class="mono">{{ formatDate(e.createdAt) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </section>
            }
          }
        }

        <!-- ================= ASIGNACIONES ================= -->
        @if (activeTab() === 'asignaciones') {
          @if (assignmentsLoading()) {
            <div class="state state--loading"><span class="material-icons spin">progress_activity</span><p>Cargando asignaciones…</p></div>
          } @else if (assignmentsError()) {
            <div class="state state--error">
              <span class="material-icons">error_outline</span>
              <p>{{ assignmentsError() }}</p>
              <button type="button" class="btn btn--primary" (click)="loadAssignments()">Reintentar</button>
            </div>
          } @else if (assignments().length === 0) {
            <div class="state state--empty"><span class="material-icons">inbox</span><p>No hay asignaciones registradas.</p></div>
          } @else {
            <section class="filters">
              <div class="field field--grow">
                <label class="field__label">Buscar</label>
                <input
                  class="field__control"
                  type="text"
                  placeholder="Título o docente responsable…"
                  [ngModel]="assignSearch()"
                  (ngModelChange)="assignSearch.set($event)"
                />
              </div>
              <div class="field">
                <label class="field__label">Tipo</label>
                <select class="field__control" [ngModel]="assignType()" (ngModelChange)="assignType.set($event)">
                  <option value="">Todos</option>
                  <option value="CONTENIDO">Contenido</option>
                  <option value="EVALUACION">Evaluación</option>
                </select>
              </div>
              <div class="field">
                <label class="field__label">Grado</label>
                <select class="field__control" [ngModel]="assignGrade()" (ngModelChange)="assignGrade.set($event)">
                  <option value="">Todos</option>
                  @for (g of assignGradeOptions(); track g) {
                    <option [value]="g">{{ g }}</option>
                  }
                </select>
              </div>
              <div class="field">
                <label class="field__label">Sección</label>
                <select class="field__control" [ngModel]="assignSection()" (ngModelChange)="assignSection.set($event)">
                  <option value="">Todas</option>
                  @for (s of assignSectionOptions(); track s) {
                    <option [value]="s">{{ s }}</option>
                  }
                </select>
              </div>
              <div class="field">
                <label class="field__label">Estado</label>
                <select class="field__control" [ngModel]="assignActive()" (ngModelChange)="assignActive.set($event)">
                  <option value="">Todos</option>
                  <option value="true">Activa</option>
                  <option value="false">Inactiva</option>
                </select>
              </div>
              @if (hasAssignFilters()) {
                <div class="field field--actions">
                  <button type="button" class="btn btn--ghost" (click)="clearAssignFilters()">Limpiar filtros</button>
                </div>
              }
            </section>

            @if (filteredAssignments().length === 0) {
              <div class="state state--empty">
                <span class="material-icons">filter_alt_off</span>
                <p>No se encontraron registros con los filtros aplicados.</p>
                <button type="button" class="btn btn--ghost" (click)="clearAssignFilters()">Limpiar filtros</button>
              </div>
            } @else {
              <section class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Título</th>
                      <th>Docente responsable</th>
                      <th>Grado</th>
                      <th>Sección</th>
                      <th>Estado</th>
                      <th>Asignado</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (a of filteredAssignments(); track $index) {
                      <tr>
                        <td><span class="badge" [class]="typeBadgeClass(a.type)">{{ typeLabel(a.type) }}</span></td>
                        <td class="strong">{{ a.title }}</td>
                        <td>{{ a.createdByTeacher ?? '—' }}</td>
                        <td>{{ a.grade }}</td>
                        <td>{{ a.section }}</td>
                        <td>
                          <span class="badge" [class]="a.active ? 'badge-success' : 'badge-neutral'">
                            {{ a.active ? 'Activa' : 'Inactiva' }}
                          </span>
                        </td>
                        <td class="mono">{{ formatDate(a.assignedAt) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </section>
            }
          }
        }

        <!-- ================= ACTIVIDAD ================= -->
        @if (activeTab() === 'actividad') {
          @if (activityLoading()) {
            <div class="state state--loading"><span class="material-icons spin">progress_activity</span><p>Cargando actividad…</p></div>
          } @else if (activityError()) {
            <div class="state state--error">
              <span class="material-icons">error_outline</span>
              <p>{{ activityError() }}</p>
              <button type="button" class="btn btn--primary" (click)="loadActivity()">Reintentar</button>
            </div>
          } @else if (activity(); as act) {
            <section class="filters">
              <div class="field field--grow">
                <label class="field__label">Buscar</label>
                <input
                  class="field__control"
                  type="text"
                  placeholder="Título, usuario o docente…"
                  [ngModel]="activitySearch()"
                  (ngModelChange)="activitySearch.set($event)"
                />
              </div>
              <div class="field">
                <label class="field__label">Tipo de actividad</label>
                <select class="field__control" [ngModel]="activityType()" (ngModelChange)="activityType.set($event)">
                  <option value="">Todas</option>
                  <option value="concepts">Contenidos</option>
                  <option value="evaluations">Evaluaciones</option>
                  <option value="users">Usuarios</option>
                </select>
              </div>
              @if (hasActivityFilters()) {
                <div class="field field--actions">
                  <button type="button" class="btn btn--ghost" (click)="clearActivityFilters()">Limpiar filtros</button>
                </div>
              }
            </section>

            @if (activityEmpty()) {
              <div class="state state--empty">
                <span class="material-icons">filter_alt_off</span>
                <p>No se encontraron registros con los filtros aplicados.</p>
                <button type="button" class="btn btn--ghost" (click)="clearActivityFilters()">Limpiar filtros</button>
              </div>
            } @else {
              <section class="activity-grid">
                @if (showActivityType('concepts')) {
                  <article class="activity-card">
                    <h2 class="activity-card__title"><span class="material-icons">menu_book</span> Contenidos recientes</h2>
                    @if (filteredRecentConcepts().length === 0) {
                      <p class="activity-card__empty">Sin contenidos para los filtros aplicados.</p>
                    } @else {
                      <ul class="activity-list">
                        @for (item of filteredRecentConcepts(); track $index) {
                          <li class="activity-item">
                            <span class="activity-item__title">{{ item.title }}</span>
                            <span class="activity-item__meta">{{ item.subtitle ?? '—' }} · {{ formatDate(item.timestamp) }}</span>
                          </li>
                        }
                      </ul>
                    }
                  </article>
                }

                @if (showActivityType('evaluations')) {
                  <article class="activity-card">
                    <h2 class="activity-card__title"><span class="material-icons">quiz</span> Evaluaciones recientes</h2>
                    @if (filteredRecentEvaluations().length === 0) {
                      <p class="activity-card__empty">Sin evaluaciones para los filtros aplicados.</p>
                    } @else {
                      <ul class="activity-list">
                        @for (item of filteredRecentEvaluations(); track $index) {
                          <li class="activity-item">
                            <span class="activity-item__title">{{ item.title }}</span>
                            <span class="activity-item__meta">{{ item.subtitle ?? '—' }} · {{ formatDate(item.timestamp) }}</span>
                          </li>
                        }
                      </ul>
                    }
                  </article>
                }

                @if (showActivityType('users')) {
                  <article class="activity-card">
                    <h2 class="activity-card__title"><span class="material-icons">person_add</span> Usuarios recientes</h2>
                    @if (filteredRecentUsers().length === 0) {
                      <p class="activity-card__empty">Sin usuarios para los filtros aplicados.</p>
                    } @else {
                      <ul class="activity-list">
                        @for (item of filteredRecentUsers(); track $index) {
                          <li class="activity-item">
                            <span class="activity-item__title">{{ item.title }}</span>
                            <span class="activity-item__meta">{{ item.subtitle ?? '—' }} · {{ formatDate(item.timestamp) }}</span>
                          </li>
                        }
                      </ul>
                    }
                  </article>
                }
              </section>
            }
          }
        }
      </main>
    </div>
  `,
})
export class AcademicSupervisionComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly supervisionService = inject(AcademicSupervisionService);

  readonly navItems: readonly SidebarNavItem[] = ADMIN_NAV_ITEMS;
  readonly userRole = 'Admin';

  readonly tabs: readonly { id: SupervisionTab; label: string; icon: string }[] = [
    { id: 'resumen', label: 'Resumen', icon: 'dashboard' },
    { id: 'contenidos', label: 'Contenidos', icon: 'menu_book' },
    { id: 'evaluaciones', label: 'Evaluaciones', icon: 'quiz' },
    { id: 'asignaciones', label: 'Asignaciones', icon: 'assignment' },
    { id: 'actividad', label: 'Actividad', icon: 'history' },
  ];

  private readonly storedUser = signal<AuthResponse | null>(this.readStoredUser());
  readonly userName = computed<string>(() => this.storedUser()?.username ?? 'Administrador');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  readonly activeTab = signal<SupervisionTab>('resumen');

  // Resumen
  readonly summary = signal<SupervisionSummary | null>(null);
  readonly summaryLoading = signal<boolean>(false);
  readonly summaryError = signal<string | null>(null);

  // Contenidos
  readonly concepts = signal<SupervisionConcept[]>([]);
  readonly conceptsLoading = signal<boolean>(false);
  readonly conceptsError = signal<string | null>(null);
  private conceptsLoaded = false;

  // Evaluaciones
  readonly evaluations = signal<SupervisionEvaluation[]>([]);
  readonly evaluationsLoading = signal<boolean>(false);
  readonly evaluationsError = signal<string | null>(null);
  private evaluationsLoaded = false;

  // Asignaciones
  readonly assignments = signal<SupervisionAssignment[]>([]);
  readonly assignmentsLoading = signal<boolean>(false);
  readonly assignmentsError = signal<string | null>(null);
  private assignmentsLoaded = false;

  // Actividad
  readonly activity = signal<AdminActivity | null>(null);
  readonly activityLoading = signal<boolean>(false);
  readonly activityError = signal<string | null>(null);
  private activityLoaded = false;

  readonly anyLoading = computed<boolean>(
    () =>
      this.summaryLoading() ||
      this.conceptsLoading() ||
      this.evaluationsLoading() ||
      this.assignmentsLoading() ||
      this.activityLoading()
  );

  // ===========================================================================
  // FILTROS (lado frontend, sobre los datos ya cargados)
  // ===========================================================================

  // Estados disponibles para contenidos y evaluaciones (comparten valores).
  readonly statusOptions: readonly ConceptStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

  // --- Contenidos ---
  readonly conceptSearch = signal<string>('');
  readonly conceptStatus = signal<string>('');
  readonly conceptCategory = signal<string>('');
  readonly conceptSection = signal<string>('');

  readonly conceptCategoryOptions = computed<ConceptCategory[]>(() => {
    const set = new Set<ConceptCategory>();
    this.concepts().forEach((c) => set.add(c.category));
    return Array.from(set).sort((a, b) => this.categoryLabel(a).localeCompare(this.categoryLabel(b)));
  });

  readonly conceptSectionOptions = computed<string[]>(() =>
    this.sectionOptionsFrom(this.concepts().flatMap((c) => c.sections))
  );

  readonly filteredConcepts = computed<SupervisionConcept[]>(() => {
    const term = this.conceptSearch();
    const status = this.conceptStatus();
    const category = this.conceptCategory();
    const section = this.conceptSection();
    return this.concepts().filter((c) => {
      if (!this.textIncludes(term, c.title, c.createdByTeacher)) return false;
      if (status && c.status !== status) return false;
      if (category && c.category !== category) return false;
      if (section && !this.activeSectionKeys(c.sections).includes(section)) return false;
      return true;
    });
  });

  readonly hasConceptFilters = computed<boolean>(
    () => !!(this.conceptSearch().trim() || this.conceptStatus() || this.conceptCategory() || this.conceptSection())
  );

  // --- Evaluaciones ---
  readonly evalSearch = signal<string>('');
  readonly evalStatus = signal<string>('');
  readonly evalSection = signal<string>('');
  readonly evalWithAttempts = signal<boolean>(false);

  readonly evalSectionOptions = computed<string[]>(() =>
    this.sectionOptionsFrom(this.evaluations().flatMap((e) => e.sections))
  );

  readonly filteredEvaluations = computed<SupervisionEvaluation[]>(() => {
    const term = this.evalSearch();
    const status = this.evalStatus();
    const section = this.evalSection();
    const withAttempts = this.evalWithAttempts();
    return this.evaluations().filter((e) => {
      if (!this.textIncludes(term, e.title, e.createdByTeacher)) return false;
      if (status && e.status !== status) return false;
      if (section && !this.activeSectionKeys(e.sections).includes(section)) return false;
      if (withAttempts && e.submittedAttempts <= 0) return false;
      return true;
    });
  });

  readonly hasEvalFilters = computed<boolean>(
    () => !!(this.evalSearch().trim() || this.evalStatus() || this.evalSection() || this.evalWithAttempts())
  );

  // --- Asignaciones ---
  readonly assignSearch = signal<string>('');
  readonly assignType = signal<string>('');
  readonly assignGrade = signal<string>('');
  readonly assignSection = signal<string>('');
  readonly assignActive = signal<string>('');

  readonly assignGradeOptions = computed<string[]>(() => {
    const set = new Set<string>();
    this.assignments().forEach((a) => set.add(a.grade));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  });

  readonly assignSectionOptions = computed<string[]>(() => {
    const set = new Set<string>();
    this.assignments().forEach((a) => set.add(a.section));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  });

  readonly filteredAssignments = computed<SupervisionAssignment[]>(() => {
    const term = this.assignSearch();
    const type = this.assignType();
    const grade = this.assignGrade();
    const section = this.assignSection();
    const active = this.assignActive();
    return this.assignments().filter((a) => {
      if (!this.textIncludes(term, a.title, a.createdByTeacher)) return false;
      if (type && a.type !== type) return false;
      if (grade && a.grade !== grade) return false;
      if (section && a.section !== section) return false;
      if (active && String(a.active) !== active) return false;
      return true;
    });
  });

  readonly hasAssignFilters = computed<boolean>(
    () =>
      !!(
        this.assignSearch().trim() ||
        this.assignType() ||
        this.assignGrade() ||
        this.assignSection() ||
        this.assignActive()
      )
  );

  // --- Actividad ---
  readonly activitySearch = signal<string>('');
  readonly activityType = signal<string>('');

  readonly filteredRecentConcepts = computed<AdminActivityItem[]>(() =>
    this.filterActivityItems(this.activity()?.recentConcepts ?? [])
  );
  readonly filteredRecentEvaluations = computed<AdminActivityItem[]>(() =>
    this.filterActivityItems(this.activity()?.recentEvaluations ?? [])
  );
  readonly filteredRecentUsers = computed<AdminActivityItem[]>(() =>
    this.filterActivityItems(this.activity()?.recentUsers ?? [])
  );

  readonly hasActivityFilters = computed<boolean>(
    () => !!(this.activitySearch().trim() || this.activityType())
  );

  readonly activityEmpty = computed<boolean>(() => {
    const concepts = this.showActivityType('concepts') ? this.filteredRecentConcepts().length : 0;
    const evaluations = this.showActivityType('evaluations') ? this.filteredRecentEvaluations().length : 0;
    const users = this.showActivityType('users') ? this.filteredRecentUsers().length : 0;
    return concepts + evaluations + users === 0;
  });

  ngOnInit(): void {
    this.loadSummary();
  }

  // ===========================================================================
  // Acciones de filtros
  // ===========================================================================

  clearConceptFilters(): void {
    this.conceptSearch.set('');
    this.conceptStatus.set('');
    this.conceptCategory.set('');
    this.conceptSection.set('');
  }

  clearEvalFilters(): void {
    this.evalSearch.set('');
    this.evalStatus.set('');
    this.evalSection.set('');
    this.evalWithAttempts.set(false);
  }

  clearAssignFilters(): void {
    this.assignSearch.set('');
    this.assignType.set('');
    this.assignGrade.set('');
    this.assignSection.set('');
    this.assignActive.set('');
  }

  clearActivityFilters(): void {
    this.activitySearch.set('');
    this.activityType.set('');
  }

  /** Indica si una columna de actividad debe mostrarse según el filtro de tipo. */
  showActivityType(type: 'concepts' | 'evaluations' | 'users'): boolean {
    return this.activityType() === '' || this.activityType() === type;
  }

  /** Cambia de pestaña y carga sus datos la primera vez que se abre. */
  selectTab(tab: SupervisionTab): void {
    this.activeTab.set(tab);
    switch (tab) {
      case 'contenidos':
        if (!this.conceptsLoaded) this.loadConcepts();
        break;
      case 'evaluaciones':
        if (!this.evaluationsLoaded) this.loadEvaluations();
        break;
      case 'asignaciones':
        if (!this.assignmentsLoaded) this.loadAssignments();
        break;
      case 'actividad':
        if (!this.activityLoaded) this.loadActivity();
        break;
      default:
        break;
    }
  }

  /** Recarga los datos de la pestaña activa. */
  reloadActive(): void {
    switch (this.activeTab()) {
      case 'resumen': this.loadSummary(); break;
      case 'contenidos': this.loadConcepts(); break;
      case 'evaluaciones': this.loadEvaluations(); break;
      case 'asignaciones': this.loadAssignments(); break;
      case 'actividad': this.loadActivity(); break;
    }
  }

  loadSummary(): void {
    this.summaryLoading.set(true);
    this.summaryError.set(null);
    this.supervisionService.getSummary().subscribe({
      next: (s) => {
        this.summary.set(s);
        this.summaryLoading.set(false);
      },
      error: () => {
        this.summaryError.set('No se pudo cargar el resumen académico. Intenta nuevamente.');
        this.summary.set(null);
        this.summaryLoading.set(false);
      },
    });
  }

  loadConcepts(): void {
    this.conceptsLoading.set(true);
    this.conceptsError.set(null);
    this.supervisionService.listConcepts().subscribe({
      next: (list) => {
        this.concepts.set(list);
        this.conceptsLoaded = true;
        this.conceptsLoading.set(false);
      },
      error: () => {
        this.conceptsError.set('No se pudieron cargar los contenidos. Intenta nuevamente.');
        this.conceptsLoading.set(false);
      },
    });
  }

  loadEvaluations(): void {
    this.evaluationsLoading.set(true);
    this.evaluationsError.set(null);
    this.supervisionService.listEvaluations().subscribe({
      next: (list) => {
        this.evaluations.set(list);
        this.evaluationsLoaded = true;
        this.evaluationsLoading.set(false);
      },
      error: () => {
        this.evaluationsError.set('No se pudieron cargar las evaluaciones. Intenta nuevamente.');
        this.evaluationsLoading.set(false);
      },
    });
  }

  loadAssignments(): void {
    this.assignmentsLoading.set(true);
    this.assignmentsError.set(null);
    this.supervisionService.listAssignments().subscribe({
      next: (list) => {
        this.assignments.set(list);
        this.assignmentsLoaded = true;
        this.assignmentsLoading.set(false);
      },
      error: () => {
        this.assignmentsError.set('No se pudieron cargar las asignaciones. Intenta nuevamente.');
        this.assignmentsLoading.set(false);
      },
    });
  }

  loadActivity(): void {
    this.activityLoading.set(true);
    this.activityError.set(null);
    this.supervisionService.getActivity().subscribe({
      next: (act) => {
        this.activity.set(act);
        this.activityLoaded = true;
        this.activityLoading.set(false);
      },
      error: () => {
        this.activityError.set('No se pudo cargar la actividad reciente. Intenta nuevamente.');
        this.activity.set(null);
        this.activityLoading.set(false);
      },
    });
  }

  // === Utilidades de presentación ===

  categoryLabel(category: ConceptCategory): string {
    return CATEGORY_LABELS[category] ?? category;
  }

  statusLabel(status: ConceptStatus | EvaluationStatus): string {
    switch (status) {
      case 'DRAFT': return 'Borrador';
      case 'PUBLISHED': return 'Publicado';
      case 'ARCHIVED': return 'Archivado';
      default: return status;
    }
  }

  statusBadgeClass(status: ConceptStatus | EvaluationStatus): string {
    switch (status) {
      case 'PUBLISHED': return 'badge-success';
      case 'ARCHIVED': return 'badge-warning';
      default: return 'badge-neutral';
    }
  }

  typeLabel(type: SupervisionAssignment['type']): string {
    return type === 'EVALUACION' ? 'Evaluación' : 'Contenido';
  }

  typeBadgeClass(type: SupervisionAssignment['type']): string {
    return type === 'EVALUACION' ? 'badge-primary' : 'badge-info';
  }

  /** Resume las secciones activas de un recurso en una etiqueta legible. */
  sectionsLabel(sections: SupervisionSectionRef[]): string {
    const active = sections.filter((s) => s.active);
    if (active.length === 0) return 'Sin asignar';
    return active.map((s) => `${s.grade} ${s.section}`).join(', ');
  }

  /** Resumen de solo lectura de los materiales de apoyo de un contenido. */
  materialsLabel(concept: SupervisionConcept): string {
    if (concept.materialCount === 0) return 'Sin materiales';
    const parts = [`${concept.materialCount} material(es)`];
    if (concept.hasAttachment) parts.push('con archivo');
    return parts.join(' · ');
  }

  /** Verdadero si el término está vacío o aparece en alguno de los valores dados. */
  private textIncludes(term: string, ...values: (string | null | undefined)[]): boolean {
    const t = term.trim().toLowerCase();
    if (!t) return true;
    return values.some((v) => (v ?? '').toLowerCase().includes(t));
  }

  /** Claves "grado sección" de las asignaciones activas de un recurso. */
  private activeSectionKeys(sections: SupervisionSectionRef[]): string[] {
    return sections.filter((s) => s.active).map((s) => `${s.grade} ${s.section}`);
  }

  /** Lista ordenada y sin duplicados de "grado sección" a partir de secciones activas. */
  private sectionOptionsFrom(sections: SupervisionSectionRef[]): string[] {
    const set = new Set<string>();
    sections.filter((s) => s.active).forEach((s) => set.add(`${s.grade} ${s.section}`));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  /** Filtra una lista de actividad por el término de búsqueda (título o subtítulo). */
  private filterActivityItems(items: AdminActivityItem[]): AdminActivityItem[] {
    const term = this.activitySearch();
    return items.filter((i) => this.textIncludes(term, i.title, i.subtitle));
  }

  formatDate(value: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  handleLogout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
  }

  private readStoredUser(): AuthResponse | null {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem('auth_user');
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as AuthResponse;
    } catch {
      return null;
    }
  }
}

function buildInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return 'AD';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
