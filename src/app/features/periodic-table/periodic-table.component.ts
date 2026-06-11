import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SidebarComponent, SidebarNavItem } from '../../shared/components/sidebar/sidebar.component';
import { UserRole } from '../../shared/models';
import {
  CATEGORY_LABELS,
  ELEMENT_DETAILS,
  ELEMENT_FILTERS,
  ElementCategory,
  ElementDetail,
  ElementFilter,
  LEGEND_CATEGORIES,
  PERIODIC_ELEMENTS,
  PeriodicElement,
  groupOf,
  periodOf,
} from './data/elements-data';

interface PropertyRow {
  readonly label: string;
  readonly value: string;
  readonly mono: boolean;
}

@Component({
  selector: 'app-periodic-table',
  standalone: true,
  imports: [SidebarComponent],
  styleUrls: ['./periodic-table.component.scss'],
  template: `
    <div class="layout">
      <app-sidebar
        [navItems]="navItems()"
        [userName]="userName()"
        [userRole]="userRole()"
        [userInitials]="userInitials()"
        (onLogout)="handleLogout()"
      />

      <main class="main">
        <div class="periodic-table-page" [class.periodic-table-page--split]="selectedElement() !== null">
          <!-- ===== Columna principal: tabla ===== -->
          <div class="periodic-main">
            <header class="periodic-header">
              <div class="periodic-header__intro">
                <h1 class="periodic-header__title">Tabla periódica</h1>
                <p class="periodic-header__subtitle">
                  118 elementos organizados por su número atómico y propiedades.
                </p>
              </div>

              <div class="input-group periodic-header__search">
                <span class="input-group__icon material-icons">search</span>
                <input
                  class="input"
                  type="text"
                  placeholder="Buscar por nombre, símbolo o número atómico"
                  [value]="query()"
                  (input)="onQueryInput($event)"
                  aria-label="Buscar elemento"
                />
              </div>
            </header>

            <!-- Filtros tipo pill -->
            <div class="periodic-filters">
              @for (f of filters; track f.id) {
                <button
                  type="button"
                  class="periodic-filters__pill"
                  [class.periodic-filters__pill--active]="activeFilter() === f.id"
                  (click)="setFilter(f.id)"
                >
                  {{ f.label }}
                </button>
              }
            </div>

            <!-- Leyenda compacta -->
            <div class="periodic-legend">
              <span class="periodic-legend__title">Leyenda</span>
              @for (cat of legendCategories; track cat) {
                <span class="periodic-legend__item">
                  <span class="periodic-legend__swatch" [attr.data-category]="cat"></span>
                  {{ categoryLabel(cat) }}
                </span>
              }
            </div>

            <!-- Card con la cuadrícula -->
            <div class="periodic-grid-card">
              @if (matchCount() === 0) {
                <div class="empty-state">
                  <div class="empty-state__icon">
                    <span class="material-icons">search_off</span>
                  </div>
                  <p class="empty-state__title">Sin resultados</p>
                  <p class="empty-state__desc">
                    No se encontraron elementos que coincidan con la búsqueda o el filtro.
                  </p>
                </div>
              } @else {
                <div class="periodic-grid" [class.periodic-grid--compact]="selectedElement() !== null">
                  @for (el of elements; track el.atomicNumber) {
                    <button
                      type="button"
                      class="periodic-element"
                      [class.periodic-element--selected]="selectedAtomicNumber() === el.atomicNumber"
                      [class.periodic-element--dimmed]="!matches(el)"
                      [attr.data-category]="el.category"
                      [style.grid-column]="el.gridColumn"
                      [style.grid-row]="rowOf(el)"
                      (click)="selectElement(el.atomicNumber)"
                      [attr.aria-label]="el.name + ', número atómico ' + el.atomicNumber"
                    >
                      <span class="periodic-element__number">{{ el.atomicNumber }}</span>
                      <span class="periodic-element__symbol">{{ el.symbol }}</span>
                      <span class="periodic-element__name">{{ el.name }}</span>
                    </button>
                  }

                  <!-- Etiqueta serie lantánidos -->
                  <div class="periodic-series-label periodic-series-label--lan">
                    Lantánidos
                    <span class="periodic-series-label__line"></span>
                    <span class="periodic-series-label__range">57–71</span>
                  </div>

                  <!-- Etiqueta serie actínidos -->
                  <div class="periodic-series-label periodic-series-label--act">
                    Actínidos
                    <span class="periodic-series-label__line"></span>
                    <span class="periodic-series-label__range">89–103</span>
                  </div>
                </div>
              }
            </div>
          </div>

          <!-- ===== Panel lateral de detalle ===== -->
          @if (selectedElement(); as el) {
            <aside class="periodic-detail-panel">
              <div class="periodic-detail-panel__top">
                <button
                  type="button"
                  class="periodic-detail-panel__close"
                  aria-label="Cerrar panel"
                  (click)="closePanel()"
                >
                  <span class="material-icons">close</span>
                </button>
              </div>

              <div class="detail-panel-body">
                <!-- Tarjeta grande del elemento -->
                <div class="detail-element-card" [attr.data-category]="el.category">
                  <span class="detail-element-card__number">{{ el.atomicNumber }}</span>
                  <span class="detail-element-card__symbol">{{ el.symbol }}</span>
                  <span class="detail-element-card__name">{{ el.name }}</span>
                </div>

                <!-- Badge de categoría -->
                <div class="detail-badge-row">
                  <span class="detail-badge" [attr.data-category]="el.category">
                    <span class="detail-badge__dot"></span>
                    {{ categoryLabel(el.category) }}
                  </span>
                </div>

                <!-- Modelo atómico (placeholder) -->
                <section class="detail-section">
                  <h2 class="detail-section__title">Modelo atómico</h2>
                  <div class="detail-visual">
                    <span class="material-icons detail-visual__icon">blur_circular</span>
                    <span class="detail-visual__caption">Modelo de Bohr — representación esquemática</span>
                  </div>
                </section>

                <!-- Visualización 3D (placeholder) -->
                <section class="detail-section">
                  <h2 class="detail-section__title">Visualización 3D</h2>
                  <div class="detail-visual">
                    <span class="material-icons detail-visual__icon">3d_rotation</span>
                    <span class="detail-visual__caption">Visualización 3D — próximamente</span>
                  </div>
                </section>

                <!-- Propiedades -->
                <section class="detail-section">
                  <h2 class="detail-section__title">Propiedades</h2>
                  <div class="detail-properties">
                    @for (p of properties(); track p.label) {
                      <div class="detail-properties__cell">
                        <div class="detail-properties__label">{{ p.label }}</div>
                        <div class="detail-properties__value" [class.text-mono]="p.mono">{{ p.value }}</div>
                      </div>
                    }
                  </div>
                </section>

                <!-- Descripción -->
                <section class="detail-section">
                  <h2 class="detail-section__title">Descripción</h2>
                  <p class="detail-description">{{ description() }}</p>
                </section>
              </div>

              <!-- Acciones fijas al fondo -->
              <div class="detail-panel-actions">
                <button
                  type="button"
                  class="btn btn-primary btn-lg detail-panel-actions__primary"
                  disabled
                  title="Próximamente"
                >
                  Usar en formación de compuestos
                  <span class="detail-panel-actions__soon">Próximamente</span>
                </button>
                <button type="button" class="btn btn-secondary" (click)="closePanel()">
                  Ver en tabla completa
                </button>
              </div>
            </aside>
          }
        </div>
      </main>
    </div>
  `,
})
export class PeriodicTableComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly elements: readonly PeriodicElement[] = PERIODIC_ELEMENTS;
  readonly filters: readonly ElementFilter[] = ELEMENT_FILTERS;
  readonly legendCategories: readonly ElementCategory[] = LEGEND_CATEGORIES;

  readonly activeFilter = signal<string>('all');
  readonly query = signal<string>('');
  readonly selectedAtomicNumber = signal<number | null>(null);

  readonly selectedElement = computed<PeriodicElement | null>(() => {
    const n = this.selectedAtomicNumber();
    if (n === null) {
      return null;
    }
    return this.elements.find((el) => el.atomicNumber === n) ?? null;
  });

  readonly matchCount = computed<number>(() =>
    this.elements.reduce((count, el) => (this.matches(el) ? count + 1 : count), 0)
  );

  private readonly activeCategories = computed<readonly ElementCategory[] | null>(() => {
    const filter = this.filters.find((f) => f.id === this.activeFilter());
    return filter ? filter.categories : null;
  });

  readonly properties = computed<readonly PropertyRow[]>(() => {
    const el = this.selectedElement();
    if (el === null) {
      return [];
    }
    const detail = this.detailFor(el);
    const group = groupOf(el);
    const rows: PropertyRow[] = [
      { label: 'Nº atómico', value: String(el.atomicNumber), mono: true },
    ];
    if (detail.atomicMass) {
      rows.push({ label: 'Masa atómica', value: detail.atomicMass, mono: true });
    }
    rows.push({ label: 'Grupo', value: group === null ? '—' : String(group), mono: group !== null });
    rows.push({ label: 'Periodo', value: String(periodOf(el)), mono: true });
    rows.push({ label: 'Tipo', value: detail.typeLabel ?? this.categoryLabel(el.category), mono: false });
    if (detail.state) {
      rows.push({ label: 'Estado', value: detail.state, mono: false });
    }
    if (detail.valence) {
      rows.push({ label: 'Valencia', value: detail.valence, mono: true });
    }
    if (detail.electronegativity) {
      rows.push({ label: 'Electronegatividad', value: detail.electronegativity, mono: true });
    }
    return rows;
  });

  readonly description = computed<string>(() => {
    const el = this.selectedElement();
    if (el === null) {
      return '';
    }
    return this.detailFor(el).description ?? 'Información descriptiva pendiente para este elemento.';
  });

  // ===== Sidebar dependiente del rol =====
  private readonly currentUser = computed(() => this.authService.currentUser());

  readonly userName = computed<string>(() => this.currentUser()?.username ?? 'Usuario');

  readonly userRole = computed<string>(() => {
    switch (this.authService.currentRole()) {
      case 'DOCENTE':
        return 'Docente';
      case 'ADMINISTRADOR':
        return 'Administrador';
      default:
        return 'Estudiante';
    }
  });

  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  readonly navItems = computed<readonly SidebarNavItem[]>(() =>
    buildNavItems(this.authService.currentRole())
  );

  matches(element: PeriodicElement): boolean {
    const categories = this.activeCategories();
    if (categories && !categories.includes(element.category)) {
      return false;
    }
    const q = this.query().toLowerCase().trim();
    if (q.length > 0) {
      const matchesName = element.name.toLowerCase().includes(q);
      const matchesSymbol = element.symbol.toLowerCase().includes(q);
      const matchesNumber = String(element.atomicNumber).startsWith(q);
      if (!matchesName && !matchesSymbol && !matchesNumber) {
        return false;
      }
    }
    return true;
  }

  rowOf(element: PeriodicElement): number {
    if (typeof element.gridRow === 'number') {
      return element.gridRow;
    }
    return element.gridRow === 'lan' ? 9 : 10;
  }

  categoryLabel(category: ElementCategory): string {
    return CATEGORY_LABELS[category];
  }

  setFilter(id: string): void {
    this.activeFilter.set(id);
  }

  onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  selectElement(atomicNumber: number): void {
    this.selectedAtomicNumber.set(atomicNumber);
  }

  closePanel(): void {
    this.selectedAtomicNumber.set(null);
  }

  handleLogout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
  }

  private detailFor(element: PeriodicElement): ElementDetail {
    return ELEMENT_DETAILS[element.atomicNumber] ?? {};
  }
}

function buildNavItems(role: UserRole | null): readonly SidebarNavItem[] {
  switch (role) {
    case 'DOCENTE':
      return [
        { label: 'Inicio', icon: 'home', route: '/teacher-dashboard' },
        { label: 'Mis estudiantes', icon: 'group', route: '/teacher/students' },
        { label: 'Tabla periódica', icon: 'science', route: '/periodic-table' },
        { label: 'Restablecer contraseñas', icon: 'lock_reset', route: '/teacher/passwords' },
      ];
    case 'ADMINISTRADOR':
      return [
        { label: 'Inicio', icon: 'home', route: '/admin-dashboard' },
        { label: 'Gestión de docentes', icon: 'badge', route: '/admin/teachers' },
        { label: 'Elementos químicos', icon: 'table_chart', route: '/periodic-table' },
      ];
    default:
      return [
        { label: 'Inicio', icon: 'home', route: '/student-dashboard' },
        { label: 'Tabla periódica', icon: 'science', route: '/periodic-table' },
        { label: 'Conceptos químicos', icon: 'menu_book', route: '/student-dashboard/concepts', disabled: true },
        { label: 'Formar compuestos', icon: 'biotech', route: '/student-dashboard/compounds', disabled: true },
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
