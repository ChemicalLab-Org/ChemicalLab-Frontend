import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SidebarComponent, SidebarNavItem } from '../../shared/components/sidebar/sidebar.component';
import { STUDENT_NAV_ITEMS } from '../../shared/components/sidebar/student-nav';
import { TEACHER_NAV_ITEMS } from '../../shared/components/sidebar/teacher-nav';
import { ADMIN_NAV_ITEMS } from '../../shared/components/sidebar/admin-nav';
import { StudentConceptsService } from './services/student-concepts.service';
import { ConceptCategory, StudentConceptContentResponse, UserRole } from '../../shared/models';

const CATEGORY_LABELS: Record<ConceptCategory, string> = {
  OXIDOS: 'Óxidos',
  HIDROXIDOS: 'Hidróxidos',
  ACIDOS: 'Ácidos',
  SALES_BINARIAS: 'Sales binarias',
  OXISALES: 'Oxisales',
  NOMENCLATURA: 'Nomenclatura',
  GENERAL: 'General',
};

const CATEGORY_CONFIG: Record<ConceptCategory, { iconName: string; tone: { bg: string; fg: string } }> = {
  OXIDOS:       { iconName: 'local_fire_department', tone: { bg: '#fff4ed', fg: '#c2410c' } },
  HIDROXIDOS:   { iconName: 'opacity',               tone: { bg: '#eff6ff', fg: '#1d4ed8' } },
  ACIDOS:       { iconName: 'water_drop',            tone: { bg: '#f0fdf4', fg: '#15803d' } },
  SALES_BINARIAS: { iconName: 'grain',               tone: { bg: '#f0fdf4', fg: '#166534' } },
  OXISALES:     { iconName: 'hub',                   tone: { bg: '#faf5ff', fg: '#7e22ce' } },
  NOMENCLATURA: { iconName: 'menu_book',             tone: { bg: '#fff7ed', fg: '#c2410c' } },
  GENERAL:      { iconName: 'science',               tone: { bg: '#f0f9ff', fg: '#0369a1' } },
};

const CATEGORIES_WITH_COMPOUNDS = new Set<ConceptCategory>([
  'OXIDOS', 'HIDROXIDOS', 'ACIDOS', 'SALES_BINARIAS', 'OXISALES',
]);

const CATEGORY_ORDER: ConceptCategory[] = [
  'OXIDOS', 'HIDROXIDOS', 'ACIDOS', 'SALES_BINARIAS', 'OXISALES', 'NOMENCLATURA', 'GENERAL',
];

@Component({
  selector: 'app-concepts',
  standalone: true,
  imports: [SidebarComponent],
  styleUrls: ['./concepts.component.scss'],
  template: `
    <div class="layout">
      <app-sidebar
        [navItems]="navItems()"
        [userName]="userName()"
        [userRole]="userRoleLabel()"
        [userInitials]="userInitials()"
        (onLogout)="handleLogout()"
      />

      <main class="main">
        <!-- Encabezado -->
        <header class="concepts-header">
          <h1 class="concepts-header__title">Contenidos conceptuales</h1>
          <p class="concepts-header__subtitle">
            Repasa los conceptos asignados por tu docente antes de formar compuestos químicos.
          </p>
        </header>

        <!-- Estado: cargando -->
        @if (loading()) {
          <div class="page-state">
            <div class="page-state__spinner" role="status" aria-label="Cargando">
              <span class="material-icons page-state__spin-icon">autorenew</span>
            </div>
            <p class="page-state__title">Estamos cargando tus contenidos conceptuales...</p>
          </div>
        }

        <!-- Estado: error de carga -->
        @else if (loadError()) {
          <div class="page-state page-state--error">
            <div class="page-state__icon">
              <span class="material-icons">cloud_off</span>
            </div>
            <p class="page-state__title">No se pudieron cargar los contenidos conceptuales.</p>
            <p class="page-state__desc">Verifica tu conexión e intenta de nuevo.</p>
            <button type="button" class="btn btn-primary" (click)="reload()">
              <span class="material-icons">refresh</span>
              Reintentar
            </button>
          </div>
        }

        <!-- Estado: sin contenidos asignados -->
        @else if (concepts().length === 0) {
          <div class="page-state page-state--empty">
            <div class="page-state__icon">
              <span class="material-icons">library_books</span>
            </div>
            <p class="page-state__title">Aún no tienes contenidos asignados.</p>
            <p class="page-state__desc">
              Cuando tu docente publique contenidos para tu sección, aparecerán aquí.
            </p>
          </div>
        }

        <!-- Contenido principal -->
        @else {
          <!-- Buscador + filtros -->
          <div class="concepts-controls">
            <div class="search-bar">
              <span class="material-icons search-bar__icon">search</span>
              <input
                class="search-bar__input"
                type="search"
                placeholder="Buscar concepto, palabra clave o explicación"
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

            <div class="category-pills" role="group" aria-label="Filtrar por categoría">
              <button
                type="button"
                class="category-pill"
                [class.category-pill--active]="activeCategory() === null"
                (click)="setCategory(null)"
              >
                Todos
              </button>
              @for (cat of availableCategoryKeys(); track cat) {
                <button
                  type="button"
                  class="category-pill"
                  [class.category-pill--active]="activeCategory() === cat"
                  (click)="setCategory(cat)"
                >
                  {{ categoryLabel(cat) }}
                </button>
              }
            </div>
          </div>

          <!-- Workspace: lista izquierda + detalle derecho -->
          <div class="concepts-workspace" [class.concepts-workspace--open]="selectedConcept() !== null">

            <!-- ── Lista de conceptos (columna izquierda) ── -->
            <div class="concepts-list" role="list">
              @if (filtered().length > 0) {
                @for (concept of filtered(); track concept.id) {
                  <button
                    type="button"
                    role="listitem"
                    class="concept-row"
                    [class.concept-row--active]="selectedId() === concept.id"
                    (click)="selectConcept(concept.id)"
                    [attr.aria-pressed]="selectedId() === concept.id"
                  >
                    <div
                      class="concept-row__icon"
                      [style.background]="conceptBg(concept.category)"
                      [style.color]="conceptFg(concept.category)"
                    >
                      <span class="material-icons">{{ conceptIcon(concept.category) }}</span>
                    </div>
                    <div class="concept-row__body">
                      <div class="concept-row__title">{{ concept.title }}</div>
                      <div class="concept-row__desc">{{ concept.summary }}</div>
                      <div class="concept-row__chips">
                        @for (ex of concept.examples.slice(0, 3); track ex) {
                          <span class="concept-row__chip">{{ truncate(ex, 24) }}</span>
                        }
                      </div>
                    </div>
                    <span
                      class="material-icons concept-row__arrow"
                      [class.concept-row__arrow--active]="selectedId() === concept.id"
                    >
                      chevron_right
                    </span>
                  </button>
                }
              } @else {
                <div class="list-empty">
                  <div class="list-empty__icon">
                    <span class="material-icons">search_off</span>
                  </div>
                  <p class="list-empty__title">No se encontraron contenidos relacionados.</p>
                  <p class="list-empty__desc">
                    Intenta con otra palabra clave o categoría.
                  </p>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    (click)="resetFilters()"
                  >
                    Ver todos
                  </button>
                </div>
              }
            </div>

            <!-- ── Panel de detalle (columna derecha) ── -->
            <div class="concepts-detail">
              @if (selectedConcept(); as concept) {

                <!-- Botón "Volver" visible solo en móvil -->
                <button
                  type="button"
                  class="detail-back"
                  (click)="closeConcept()"
                >
                  <span class="material-icons">arrow_back</span>
                  Volver a la lista
                </button>

                <!-- Encabezado del detalle -->
                <div class="detail-head">
                  <div class="detail-head__left">
                    <div
                      class="detail-head__icon"
                      [style.background]="conceptBg(concept.category)"
                      [style.color]="conceptFg(concept.category)"
                    >
                      <span class="material-icons">{{ conceptIcon(concept.category) }}</span>
                    </div>
                    <div>
                      <h2 class="detail-head__title">{{ concept.title }}</h2>
                      <span class="badge badge-primary">{{ categoryLabel(concept.category) }}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm detail-head__close"
                    (click)="closeConcept()"
                    aria-label="Cerrar detalle"
                  >
                    <span class="material-icons">close</span>
                  </button>
                </div>

                <!-- Cuerpo del detalle -->
                <div class="detail-body">

                  <!-- ¿Qué es? -->
                  @if (concept.explanation) {
                    <div class="content-section">
                      <div class="content-section__label">¿Qué es?</div>
                      <p class="content-section__text">{{ concept.explanation }}</p>
                    </div>
                  }

                  <!-- ¿Cómo se forma? -->
                  @if (concept.formationSteps.length > 0) {
                    <div class="content-section">
                      <div class="content-section__label">¿Cómo se forma?</div>
                      <ol class="steps-list">
                        @for (step of concept.formationSteps; track step; let i = $index) {
                          <li class="steps-list__item">
                            <div class="steps-list__number">{{ i + 1 }}</div>
                            <div class="steps-list__text">{{ step }}</div>
                          </li>
                        }
                      </ol>
                    </div>
                  }

                  <!-- Puntos clave -->
                  @if (concept.keyPoints.length > 0) {
                    <div class="content-section">
                      <div class="content-section__label">Puntos clave</div>
                      <ul class="key-points">
                        @for (point of concept.keyPoints; track point) {
                          <li class="key-points__item">
                            <span class="material-icons key-points__check">check_circle</span>
                            <span>{{ point }}</span>
                          </li>
                        }
                      </ul>
                    </div>
                  }

                  <!-- Ejemplos -->
                  @if (concept.examples.length > 0) {
                    <div class="content-section">
                      <div class="content-section__label">Ejemplos</div>
                      <ul class="examples-text-list">
                        @for (ex of concept.examples; track ex) {
                          <li class="examples-text-list__item">
                            <span class="material-icons examples-text-list__icon">science</span>
                            <span>{{ ex }}</span>
                          </li>
                        }
                      </ul>
                    </div>
                  }

                  <!-- CTA a formación de compuestos -->
                  @if (hasRelatedCompounds(concept.category)) {
                    <div class="detail-cta">
                      <div class="detail-cta__text">
                        <span class="material-icons">biotech</span>
                        <span>
                          ¿Quieres practicar la formación de
                          <strong>{{ concept.title }}</strong>?
                        </span>
                      </div>
                      <button
                        type="button"
                        class="btn btn-primary"
                        (click)="goToCompounds()"
                      >
                        Ir a formación de compuestos
                        <span class="material-icons">arrow_forward</span>
                      </button>
                    </div>
                  }

                </div>

              } @else {
                <!-- Placeholder cuando no hay selección -->
                <div class="detail-placeholder">
                  <div class="detail-placeholder__icon">
                    <span class="material-icons">menu_book</span>
                  </div>
                  <p class="detail-placeholder__title">Selecciona un contenido para revisarlo.</p>
                  <p class="detail-placeholder__desc">
                    Elige un tema de la lista para ver su explicación completa, pasos de formación y ejemplos.
                  </p>
                </div>
              }
            </div>

          </div>
        }
      </main>
    </div>
  `,
})
export class ConceptsComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly studentConceptsService = inject(StudentConceptsService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly concepts = signal<StudentConceptContentResponse[]>([]);

  readonly query = signal('');
  readonly activeCategory = signal<ConceptCategory | null>(null);
  readonly selectedId = signal<number | null>(null);

  readonly availableCategoryKeys = computed<ConceptCategory[]>(() => {
    const present = new Set(this.concepts().map((c) => c.category));
    return CATEGORY_ORDER.filter((k) => present.has(k));
  });

  readonly filtered = computed<StudentConceptContentResponse[]>(() => {
    const q = this.query().toLowerCase().trim();
    const cat = this.activeCategory();

    return this.concepts().filter((c) => {
      const matchCat = cat === null || c.category === cat;
      if (!matchCat) return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        CATEGORY_LABELS[c.category].toLowerCase().includes(q) ||
        (c.summary?.toLowerCase().includes(q) ?? false) ||
        c.explanation.toLowerCase().includes(q) ||
        c.formationSteps.some((s) => s.toLowerCase().includes(q)) ||
        c.keyPoints.some((p) => p.toLowerCase().includes(q)) ||
        c.examples.some((e) => e.toLowerCase().includes(q))
      );
    });
  });

  readonly selectedConcept = computed<StudentConceptContentResponse | null>(() => {
    const id = this.selectedId();
    if (id === null) return null;
    return this.filtered().find((c) => c.id === id) ?? null;
  });

  private readonly currentUser = computed(() => this.authService.currentUser());
  readonly userName = computed<string>(() => this.currentUser()?.username ?? 'Usuario');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));
  readonly navItems = computed<readonly SidebarNavItem[]>(() =>
    buildNavItems(this.authService.currentRole())
  );
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

  ngOnInit(): void {
    this.loadConcepts();
  }

  reload(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.loadConcepts();
  }

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.selectedId.set(null);
  }

  clearSearch(): void {
    this.query.set('');
  }

  setCategory(cat: ConceptCategory | null): void {
    this.activeCategory.set(cat);
    this.selectedId.set(null);
  }

  selectConcept(id: number): void {
    this.selectedId.set(id);
  }

  closeConcept(): void {
    this.selectedId.set(null);
  }

  resetFilters(): void {
    this.query.set('');
    this.activeCategory.set(null);
    this.selectedId.set(null);
  }

  goToCompounds(): void {
    void this.router.navigateByUrl('/compounds');
  }

  handleLogout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
  }

  categoryLabel(cat: ConceptCategory): string {
    return CATEGORY_LABELS[cat];
  }

  conceptIcon(cat: ConceptCategory): string {
    return CATEGORY_CONFIG[cat].iconName;
  }

  conceptBg(cat: ConceptCategory): string {
    return CATEGORY_CONFIG[cat].tone.bg;
  }

  conceptFg(cat: ConceptCategory): string {
    return CATEGORY_CONFIG[cat].tone.fg;
  }

  hasRelatedCompounds(cat: ConceptCategory): boolean {
    return CATEGORIES_WITH_COMPOUNDS.has(cat);
  }

  truncate(text: string, maxLen: number): string {
    return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
  }

  private loadConcepts(): void {
    this.studentConceptsService.listAssignedConcepts().subscribe({
      next: (data) => {
        this.concepts.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.loading.set(false);
      },
    });
  }
}

function buildNavItems(role: UserRole | null): readonly SidebarNavItem[] {
  switch (role) {
    case 'DOCENTE':
      return TEACHER_NAV_ITEMS;
    case 'ADMINISTRADOR':
      return ADMIN_NAV_ITEMS;
    default:
      return STUDENT_NAV_ITEMS;
  }
}

function buildInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
