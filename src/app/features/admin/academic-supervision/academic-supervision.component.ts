import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AcademicSupervisionService } from '../../../core/services/academic-supervision.service';
import { SidebarComponent, SidebarNavItem } from '../../../shared/components/sidebar/sidebar.component';
import { ADMIN_NAV_ITEMS } from '../../../shared/components/sidebar/admin-nav';
import {
  AdminActivity,
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
  imports: [SidebarComponent],
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
            <section class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Título</th>
                    <th>Docente creador</th>
                    <th>Categoría</th>
                    <th>Estado</th>
                    <th>Grados / secciones</th>
                    <th>Creado</th>
                  </tr>
                </thead>
                <tbody>
                  @for (c of concepts(); track c.id) {
                    <tr>
                      <td class="strong">{{ c.title }}</td>
                      <td>{{ c.createdByTeacher ?? '—' }}</td>
                      <td><span class="badge badge-neutral">{{ categoryLabel(c.category) }}</span></td>
                      <td><span class="badge" [class]="statusBadgeClass(c.status)">{{ statusLabel(c.status) }}</span></td>
                      <td>{{ sectionsLabel(c.sections) }}</td>
                      <td class="mono">{{ formatDate(c.createdAt) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </section>
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
                  @for (e of evaluations(); track e.id) {
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
                  @for (a of assignments(); track $index) {
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
            <section class="activity-grid">
              <article class="activity-card">
                <h2 class="activity-card__title"><span class="material-icons">menu_book</span> Contenidos recientes</h2>
                @if (act.recentConcepts.length === 0) {
                  <p class="activity-card__empty">Sin contenidos recientes.</p>
                } @else {
                  <ul class="activity-list">
                    @for (item of act.recentConcepts; track $index) {
                      <li class="activity-item">
                        <span class="activity-item__title">{{ item.title }}</span>
                        <span class="activity-item__meta">{{ item.subtitle ?? '—' }} · {{ formatDate(item.timestamp) }}</span>
                      </li>
                    }
                  </ul>
                }
              </article>

              <article class="activity-card">
                <h2 class="activity-card__title"><span class="material-icons">quiz</span> Evaluaciones recientes</h2>
                @if (act.recentEvaluations.length === 0) {
                  <p class="activity-card__empty">Sin evaluaciones recientes.</p>
                } @else {
                  <ul class="activity-list">
                    @for (item of act.recentEvaluations; track $index) {
                      <li class="activity-item">
                        <span class="activity-item__title">{{ item.title }}</span>
                        <span class="activity-item__meta">{{ item.subtitle ?? '—' }} · {{ formatDate(item.timestamp) }}</span>
                      </li>
                    }
                  </ul>
                }
              </article>

              <article class="activity-card">
                <h2 class="activity-card__title"><span class="material-icons">person_add</span> Usuarios recientes</h2>
                @if (act.recentUsers.length === 0) {
                  <p class="activity-card__empty">Sin usuarios recientes.</p>
                } @else {
                  <ul class="activity-list">
                    @for (item of act.recentUsers; track $index) {
                      <li class="activity-item">
                        <span class="activity-item__title">{{ item.title }}</span>
                        <span class="activity-item__meta">{{ item.subtitle ?? '—' }} · {{ formatDate(item.timestamp) }}</span>
                      </li>
                    }
                  </ul>
                }
              </article>
            </section>
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

  ngOnInit(): void {
    this.loadSummary();
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
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem('auth_user');
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
