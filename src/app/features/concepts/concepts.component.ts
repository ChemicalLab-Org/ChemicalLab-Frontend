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
          <div>
            <h1 class="concepts-header__title">Contenidos conceptuales</h1>
            <p class="concepts-header__subtitle">
              Repasa los conceptos principales antes de formar compuestos químicos.
            </p>
          </div>
        </header>

        <!-- Buscador -->
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
            <button class="search-bar__clear" type="button" (click)="clearSearch()" aria-label="Limpiar búsqueda">
              <span class="material-icons">close</span>
            </button>
          }
        </div>

        <!-- Filtros de categoría -->
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

        <!-- Grid de tarjetas -->
        @if (filtered().length > 0) {
          <div class="concepts-grid">
            @for (concept of filtered(); track concept.id) {
              <button
                type="button"
                class="concept-card"
                [class.concept-card--active]="selectedId() === concept.id"
                (click)="selectConcept(concept.id)"
              >
                <div
                  class="concept-card__icon"
                  [style.background]="concept.tone.bg"
                  [style.color]="concept.tone.fg"
                >
                  <span class="material-icons">{{ concept.iconName }}</span>
                </div>

                <div class="concept-card__body">
                  <div class="concept-card__title">{{ concept.title }}</div>
                  <div class="concept-card__desc">{{ concept.shortDescription }}</div>

                  <div class="concept-card__formula">{{ concept.formula }}</div>

                  <div class="concept-card__examples">
                    @for (ex of concept.examples.slice(0, 3); track ex.formula) {
                      <span class="concept-card__example-chip">{{ ex.formula }}</span>
                    }
                  </div>
                </div>

                <div
                  class="concept-card__cta"
                  [style.color]="selectedId() === concept.id ? concept.tone.fg : ''"
                >
                  {{ selectedId() === concept.id ? 'Leyendo' : 'Ver contenido' }}
                  <span class="material-icons">
                    {{ selectedId() === concept.id ? 'expand_less' : 'arrow_forward' }}
                  </span>
                </div>
              </button>
            }
          </div>
        } @else {
          <div class="empty-state">
            <div class="empty-state__icon">
              <span class="material-icons">search_off</span>
            </div>
            <p class="empty-state__title">No se encontraron contenidos relacionados.</p>
            <p class="empty-state__desc">
              Intenta con otra palabra clave o selecciona otra categoría.
            </p>
            <button class="btn btn-secondary btn-sm" type="button" (click)="resetFilters()">
              Ver todos los contenidos
            </button>
          </div>
        }

        <!-- Panel de detalle -->
        @if (selectedConcept(); as concept) {
          <section class="detail-panel">
            <!-- Encabezado del panel -->
            <div class="detail-panel__head">
              <div class="detail-panel__head-left">
                <div
                  class="detail-panel__icon"
                  [style.background]="concept.tone.bg"
                  [style.color]="concept.tone.fg"
                >
                  <span class="material-icons">{{ concept.iconName }}</span>
                </div>
                <div>
                  <h2 class="detail-panel__title">{{ concept.title }}</h2>
                  <span class="badge badge-primary">{{ concept.category }}</span>
                </div>
              </div>
              <button
                type="button"
                class="btn btn-secondary btn-sm detail-panel__close"
                (click)="closeConcept()"
              >
                <span class="material-icons">close</span>
                Cerrar
              </button>
            </div>

            <!-- Contenido en 2 columnas -->
            <div class="detail-panel__grid">
              <!-- Columna izquierda -->
              <div class="detail-panel__col">
                <div class="content-section">
                  <div class="content-section__label">¿Qué es?</div>
                  <p class="content-section__text">{{ concept.explanation }}</p>
                </div>

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
              </div>

              <!-- Columna derecha -->
              <div class="detail-panel__col">
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
              </div>
            </div>

            <!-- Relacionar con formación de compuestos -->
            @if (concept.relatedCompounds) {
              <div class="detail-panel__related">
                <div class="detail-panel__related-text">
                  <span class="material-icons">biotech</span>
                  <span>
                    ¿Quieres practicar la formación de <strong>{{ concept.title }}</strong>?
                    Prueba el motor químico interactivo.
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
          </section>
        }
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

  readonly selectedConcept = computed<ConceptContent | null>(() => {
    const id = this.selectedId();
    if (id === null) {
      return null;
    }
    return this.allConcepts.find((c) => c.id === id) ?? null;
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
    this.selectedId.set(null);
  }

  clearSearch(): void {
    this.query.set('');
  }

  setCategory(cat: ConceptCategory): void {
    this.activeCategory.set(cat);
    this.selectedId.set(null);
  }

  selectConcept(id: string): void {
    this.selectedId.update((current) => (current === id ? null : id));
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
