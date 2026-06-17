import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SidebarComponent, SidebarNavItem } from '../../shared/components/sidebar/sidebar.component';
import { UserRole } from '../../shared/models';
import {
  CATEGORIES,
  CONCEPTS,
  ConceptCategory,
  ConceptContent,
} from './data/concepts-data';

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
            Repasa los conceptos principales antes de formar compuestos químicos.
          </p>
        </header>

        <!-- Buscador + filtros -->
        <div class="concepts-controls">
          <div class="search-bar">
            <span class="material-icons search-bar__icon">search</span>
            <input
              class="search-bar__input"
              type="search"
              placeholder="Buscar concepto, fórmula o palabra clave"
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
            @for (cat of categories; track cat) {
              <button
                type="button"
                class="category-pill"
                [class.category-pill--active]="activeCategory() === cat"
                (click)="setCategory(cat)"
              >
                {{ cat }}
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
                    [style.background]="concept.tone.bg"
                    [style.color]="concept.tone.fg"
                  >
                    <span class="material-icons">{{ concept.iconName }}</span>
                  </div>
                  <div class="concept-row__body">
                    <div class="concept-row__title">{{ concept.title }}</div>
                    <div class="concept-row__desc">{{ concept.shortDescription }}</div>
                    <div class="concept-row__chips">
                      @for (ex of concept.examples.slice(0, 3); track ex.formula) {
                        <span class="concept-row__chip">{{ ex.formula }}</span>
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
                <p class="list-empty__title">Sin resultados.</p>
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
                    [style.background]="concept.tone.bg"
                    [style.color]="concept.tone.fg"
                  >
                    <span class="material-icons">{{ concept.iconName }}</span>
                  </div>
                  <div>
                    <h2 class="detail-head__title">{{ concept.title }}</h2>
                    <span class="badge badge-primary">{{ concept.category }}</span>
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
                <div class="content-section">
                  <div class="content-section__label">¿Qué es?</div>
                  <p class="content-section__text">{{ concept.explanation }}</p>
                </div>

                <!-- ¿Cómo se forma? -->
                <div class="content-section">
                  <div class="content-section__label">¿Cómo se forma?</div>
                  <ol class="steps-list">
                    @for (step of concept.steps; track step.title; let i = $index) {
                      <li class="steps-list__item">
                        <div class="steps-list__number">{{ i + 1 }}</div>
                        <div>
                          <div class="steps-list__title">{{ step.title }}</div>
                          <div class="steps-list__desc">{{ step.description }}</div>
                        </div>
                      </li>
                    }
                  </ol>
                </div>

                <!-- Puntos clave -->
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

                <!-- Ejemplos -->
                <div class="content-section">
                  <div class="content-section__label">Ejemplos</div>
                  <div class="examples-list">
                    @for (ex of concept.examples; track ex.formula) {
                      <div class="examples-list__item">
                        <div class="examples-list__formula">{{ ex.formula }}</div>
                        <div class="examples-list__info">
                          <div class="examples-list__name">{{ ex.name }}</div>
                          @if (ex.hint) {
                            <div class="examples-list__hint">{{ ex.hint }}</div>
                          }
                        </div>
                      </div>
                    }
                  </div>
                </div>

                <!-- CTA a formación de compuestos -->
                @if (concept.relatedCompounds) {
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
      </main>
    </div>
  `,
})
export class ConceptsComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly categories = CATEGORIES;
  private readonly allConcepts = CONCEPTS;

  readonly query = signal('');
  readonly activeCategory = signal<ConceptCategory>('Todos');
  readonly selectedId = signal<string | null>(null);

  readonly filtered = computed<readonly ConceptContent[]>(() => {
    const q = this.query().toLowerCase().trim();
    const cat = this.activeCategory();

    return this.allConcepts.filter((c) => {
      const matchCat = cat === 'Todos' || c.category === cat;
      if (!matchCat) {
        return false;
      }
      if (q === '') {
        return true;
      }
      return (
        c.title.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.explanation.toLowerCase().includes(q) ||
        c.shortDescription.toLowerCase().includes(q) ||
        c.examples.some(
          (ex) =>
            ex.formula.toLowerCase().includes(q) ||
            ex.name.toLowerCase().includes(q)
        )
      );
    });
  });

  /** Solo muestra el detalle si el concepto sigue apareciendo en los resultados filtrados. */
  readonly selectedConcept = computed<ConceptContent | null>(() => {
    const id = this.selectedId();
    if (id === null) {
      return null;
    }
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

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  clearSearch(): void {
    this.query.set('');
  }

  setCategory(cat: ConceptCategory): void {
    this.activeCategory.set(cat);
  }

  selectConcept(id: string): void {
    this.selectedId.set(id);
  }

  closeConcept(): void {
    this.selectedId.set(null);
  }

  resetFilters(): void {
    this.query.set('');
    this.activeCategory.set('Todos');
    this.selectedId.set(null);
  }

  goToCompounds(): void {
    void this.router.navigateByUrl('/compounds');
  }

  handleLogout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
  }
}

function buildNavItems(role: UserRole | null): readonly SidebarNavItem[] {
  switch (role) {
    case 'DOCENTE':
      return [
        { label: 'Inicio', icon: 'home', route: '/teacher-dashboard' },
        { label: 'Mis estudiantes', icon: 'group', route: '/teacher/students' },
        { label: 'Contenidos conceptuales', icon: 'library_books', route: '/teacher/concepts' },
        { label: 'Tabla periódica', icon: 'science', route: '/periodic-table' },
        { label: 'Conceptos químicos', icon: 'menu_book', route: '/concepts' },
        { label: 'Formación de compuestos', icon: 'biotech', route: '/compounds' },
        { label: 'Restablecer contraseñas', icon: 'lock_reset', route: '/teacher/passwords' },
      ];
    case 'ADMINISTRADOR':
      return [
        { label: 'Inicio', icon: 'home', route: '/admin-dashboard' },
        { label: 'Gestión de docentes', icon: 'badge', route: '/admin/teachers' },
        { label: 'Elementos químicos', icon: 'table_chart', route: '/periodic-table' },
        { label: 'Conceptos químicos', icon: 'menu_book', route: '/concepts' },
        { label: 'Formación de compuestos', icon: 'biotech', route: '/compounds' },
      ];
    default:
      return [
        { label: 'Inicio', icon: 'home', route: '/student-dashboard' },
        { label: 'Tabla periódica', icon: 'science', route: '/periodic-table' },
        { label: 'Conceptos químicos', icon: 'menu_book', route: '/concepts' },
        { label: 'Formación de compuestos', icon: 'biotech', route: '/compounds' },
        { label: 'Mis evaluaciones', icon: 'assignment', route: '/student-dashboard/evaluations', disabled: true },
        { label: 'Mis resultados', icon: 'bar_chart', route: '/student-dashboard/results', disabled: true },
      ];
  }
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
