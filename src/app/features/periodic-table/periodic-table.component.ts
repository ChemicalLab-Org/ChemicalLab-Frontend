import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { UserRole } from '../../shared/models';
import { SidebarComponent, SidebarNavItem } from '../../shared/components/sidebar/sidebar.component';
import {
  PERIODIC_CATEGORIES,
  PERIODIC_ELEMENTS,
  PeriodicElement,
  PeriodicElementCategory,
} from './data/elements-data';

interface FilterOption {
  readonly id: 'all' | PeriodicElementCategory;
  readonly label: string;
  readonly categories: readonly PeriodicElementCategory[] | null;
}

@Component({
  selector: 'app-periodic-table',
  standalone: true,
  imports: [SidebarComponent],
  styleUrls: ['./periodic-table.component.scss'],
  template: `
    <div class="periodic-table-page page-shell">
      <app-sidebar
        [navItems]="navItems()"
        [userName]="userName()"
        [userRole]="userRoleLabel()"
        [userInitials]="userInitials()"
        (onLogout)="handleLogout()"
      />

      <main class="periodic-main">
        <header class="page-header periodic-header">
          <div>
            <h1 class="page-title">Tabla periódica</h1>
            <p class="page-description">
              Explora los elementos químicos por símbolo, nombre, número atómico y categoría.
            </p>
          </div>

          <div class="input-group periodic-search">
            <span class="material-icons input-group__icon">search</span>
            <input
              id="periodic-search"
              class="input"
              type="search"
              [value]="query()"
              placeholder="Buscar por nombre, símbolo o número atómico"
              (input)="updateQuery($event)"
            />
          </div>
        </header>

        <section class="periodic-filters" aria-label="Filtros por categoría">
          @for (filter of filters; track filter.id) {
            <button
              type="button"
              class="filter-pill"
              [class.filter-pill--active]="activeFilter() === filter.id"
              (click)="setFilter(filter.id)"
            >
              {{ filter.label }}
            </button>
          }
        </section>

        <section class="periodic-legend card" aria-label="Leyenda de categorías">
          <span class="periodic-legend__title">LEYENDA</span>
          @for (category of categories; track category.id) {
            <span class="periodic-legend__item">
              <span [attr.class]="legendSwatchClasses(category.className)"></span>
              {{ category.label }}
            </span>
          }
        </section>

        <section class="periodic-content" [class.periodic-content--with-detail]="selectedElement() !== null">
          <div class="periodic-table-card card">
            @if (visibleElements().length > 0) {
              <div class="periodic-grid-wrap">
                <div class="periodic-grid" aria-label="Tabla periódica interactiva">
                  @for (element of elements; track element.atomicNumber) {
                    <button
                      type="button"
                      [attr.class]="elementClasses(element)"
                      [style.grid-column]="element.gridColumn"
                      [style.grid-row]="gridRow(element)"
                      (click)="selectElement(element)"
                      [attr.aria-pressed]="selectedElement()?.atomicNumber === element.atomicNumber"
                      [attr.aria-label]="element.name + ', número atómico ' + element.atomicNumber"
                    >
                      <span class="element-number">{{ element.atomicNumber }}</span>
                      <span class="element-symbol">{{ element.symbol }}</span>
                      <span class="element-name">{{ element.name }}</span>
                    </button>
                  }

                  <div class="series-label series-label--lan">
                    <span>Lantánidos</span>
                    <strong>57-71</strong>
                  </div>
                  <div class="series-label series-label--act">
                    <span>Actínidos</span>
                    <strong>89-103</strong>
                  </div>
                </div>
              </div>
            } @else {
              <div class="empty-state">
                <div class="empty-state__icon">
                  <span class="material-icons">search_off</span>
                </div>
                <h2 class="empty-state__title">No se encontraron elementos</h2>
                <p class="empty-state__desc">Ajusta la búsqueda o elige Todos para ver la tabla completa.</p>
              </div>
            }
          </div>

          @if (selectedElement(); as element) {
            <aside class="element-detail-card card" aria-label="Detalle básico del elemento">
              <button
                type="button"
                class="element-detail-card__close"
                aria-label="Cerrar detalle"
                (click)="clearSelection()"
              >
                <span class="material-icons">close</span>
              </button>

              <div class="element-detail-card__head">
                <span class="element-detail-card__number">{{ element.atomicNumber }}</span>
                <div>
                  <h2 class="element-detail-card__symbol">{{ element.symbol }}</h2>
                  <p class="element-detail-card__name">{{ element.name }}</p>
                </div>
              </div>

              <span class="badge badge-primary">{{ categoryLabel(element.category) }}</span>

              <dl class="element-detail-card__list">
                <div>
                  <dt>Número atómico</dt>
                  <dd>{{ element.atomicNumber }}</dd>
                </div>
                <div>
                  <dt>Símbolo</dt>
                  <dd>{{ element.symbol }}</dd>
                </div>
                <div>
                  <dt>Categoría</dt>
                  <dd>{{ categoryLabel(element.category) }}</dd>
                </div>
                <div>
                  <dt>Grupo</dt>
                  <dd>{{ element.group }}</dd>
                </div>
                <div>
                  <dt>Periodo</dt>
                  <dd>{{ periodLabel(element.period) }}</dd>
                </div>
              </dl>
            </aside>
          }
        </section>
      </main>
    </div>
  `,
})
export class PeriodicTableComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly elements = PERIODIC_ELEMENTS;
  readonly categories = PERIODIC_CATEGORIES;
  readonly filters: readonly FilterOption[] = [
    { id: 'all', label: 'Todos', categories: null },
    { id: 'metal', label: 'Metales', categories: ['metal', 'lanthanide', 'actinide'] },
    { id: 'nonmetal', label: 'No metales', categories: ['nonmetal'] },
    { id: 'metalloid', label: 'Metaloides', categories: ['metalloid'] },
    { id: 'noble', label: 'Gases nobles', categories: ['noble'] },
    { id: 'halogen', label: 'Halógenos', categories: ['halogen'] },
    { id: 'transition', label: 'Metales de transición', categories: ['transition'] },
  ];

  readonly query = signal('');
  readonly activeFilter = signal<FilterOption['id']>('all');
  readonly selectedElement = signal<PeriodicElement | null>(null);

  readonly currentUser = computed(() => this.authService.currentUser());
  readonly userName = computed(() => this.currentUser()?.username ?? 'Usuario');
  readonly userRoleLabel = computed(() => roleLabel(this.currentUser()?.role ?? null));
  readonly userInitials = computed(() => buildInitials(this.userName()));
  readonly navItems = computed(() => navItemsForRole(this.currentUser()?.role ?? null));

  readonly visibleElements = computed(() => this.elements.filter((element) => this.matchesElement(element)));

  updateQuery(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.query.set(input.value);
  }

  setFilter(filter: FilterOption['id']): void {
    this.activeFilter.set(filter);
  }

  selectElement(element: PeriodicElement): void {
    this.selectedElement.set(element);
  }

  clearSelection(): void {
    this.selectedElement.set(null);
  }

  matchesElement(element: PeriodicElement): boolean {
    const filter = this.filters.find((item) => item.id === this.activeFilter());
    if (filter?.categories !== null && filter?.categories.includes(element.category) === false) {
      return false;
    }

    const query = normalize(this.query());
    if (query.length === 0) {
      return true;
    }

    return (
      normalize(element.name).includes(query) ||
      element.symbol.toLowerCase().includes(query) ||
      String(element.atomicNumber).startsWith(query)
    );
  }

  gridRow(element: PeriodicElement): number {
    if (element.gridRow === 'lan') {
      return 9;
    }
    if (element.gridRow === 'act') {
      return 10;
    }
    return element.gridRow;
  }

  categoryClass(category: PeriodicElementCategory): string {
    return this.categories.find((item) => item.id === category)?.className ?? '';
  }

  legendSwatchClasses(className: string): string {
    return `periodic-legend__swatch ${className}`;
  }

  elementClasses(element: PeriodicElement): string {
    const classes = ['periodic-element', this.categoryClass(element.category)];
    if (!this.matchesElement(element)) {
      classes.push('periodic-element--dimmed');
    }
    if (this.selectedElement()?.atomicNumber === element.atomicNumber) {
      classes.push('periodic-element--selected');
    }
    return classes.join(' ');
  }

  categoryLabel(category: PeriodicElementCategory): string {
    return this.categories.find((item) => item.id === category)?.label ?? category;
  }

  periodLabel(period: PeriodicElement['period']): string {
    if (period === 'lantanidos') {
      return 'Serie de lantánidos';
    }
    if (period === 'actinidos') {
      return 'Serie de actínidos';
    }
    return String(period);
  }

  handleLogout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
  }
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function roleLabel(role: UserRole | null): string {
  if (role === 'ADMINISTRADOR') {
    return 'Admin';
  }
  if (role === 'DOCENTE') {
    return 'Docente';
  }
  return 'Estudiante';
}

function navItemsForRole(role: UserRole | null): readonly SidebarNavItem[] {
  if (role === 'ADMINISTRADOR') {
    return [
      { label: 'Inicio', icon: 'home', route: '/admin-dashboard' },
      { label: 'Gestión de docentes', icon: 'badge', route: '/admin/teachers' },
      { label: 'Elementos químicos', icon: 'table_chart', route: '/periodic-table' },
      { label: 'Usuarios y roles', icon: 'manage_accounts', route: '/admin-dashboard/users', disabled: true },
      { label: 'Contenidos químicos', icon: 'auto_stories', route: '/admin-dashboard/content', disabled: true },
      { label: 'Grupos químicos', icon: 'hub', route: '/admin-dashboard/groups', disabled: true },
      { label: 'Logs del sistema', icon: 'terminal', route: '/admin-dashboard/logs', disabled: true },
      { label: 'Estado del sistema', icon: 'monitor_heart', route: '/admin-dashboard/system', disabled: true },
    ];
  }

  if (role === 'DOCENTE') {
    return [
      { label: 'Inicio', icon: 'home', route: '/teacher-dashboard' },
      { label: 'Mis estudiantes', icon: 'group', route: '/teacher/students' },
      { label: 'Evaluaciones', icon: 'quiz', route: '/teacher-dashboard/evaluations', disabled: true },
      { label: 'Resultados', icon: 'analytics', route: '/teacher-dashboard/results', disabled: true },
      { label: 'Restablecer contraseñas', icon: 'lock_reset', route: '/teacher/passwords' },
    ];
  }

  return [
    { label: 'Inicio', icon: 'home', route: '/student-dashboard' },
    { label: 'Tabla periódica', icon: 'science', route: '/periodic-table' },
    { label: 'Conceptos químicos', icon: 'menu_book', route: '/student-dashboard/concepts', disabled: true },
    { label: 'Formar compuestos', icon: 'biotech', route: '/student-dashboard/compounds', disabled: true },
    { label: 'Mis evaluaciones', icon: 'assignment', route: '/student-dashboard/evaluations', disabled: true },
    { label: 'Mis resultados', icon: 'bar_chart', route: '/student-dashboard/results', disabled: true },
  ];
}

function buildInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((part) => part.length > 0);
  if (parts.length === 0) {
    return 'US';
  }
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
