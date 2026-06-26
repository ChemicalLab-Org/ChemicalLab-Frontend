import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { UsageMetricsService } from '../../core/services/usage-metrics.service';
import { ExamSessionService } from '../../core/services/exam-session.service';
import { SidebarComponent, SidebarNavItem } from '../../shared/components/sidebar/sidebar.component';
import { EXAM_EXIT_ACTION, STUDENT_NAV_ITEMS, examNavItems } from '../../shared/components/sidebar/student-nav';
import { TEACHER_NAV_ITEMS } from '../../shared/components/sidebar/teacher-nav';
import { ADMIN_NAV_ITEMS } from '../../shared/components/sidebar/admin-nav';
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
  schematicShells,
} from './data/elements-data';

interface PropertyRow {
  readonly label: string;
  readonly value: string;
  readonly mono: boolean;
}

/** Punto 2D dentro del lienzo SVG. */
interface Point {
  readonly x: number;
  readonly y: number;
}

/** Órbita elíptica del modelo de Bohr. */
interface BohrOrbit {
  readonly rx: number;
  readonly ry: number;
}

/** Etiqueta de capa ("8e⁻") situada junto a una órbita. */
interface ShellLabel extends Point {
  readonly text: string;
}

/** Geometría completa del modelo de Bohr esquemático. */
interface BohrGeometry {
  readonly orbits: readonly BohrOrbit[];
  readonly electrons: readonly Point[];
  readonly labels: readonly ShellLabel[];
}

/** Órbita inclinada para la vista 3D, con sus dos mitades dibujadas como path. */
interface Orbit3D {
  readonly transform: string;
  readonly backPath: string;
  readonly frontPath: string;
}

/** Electrón con profundidad simulada para la vista 3D. */
interface Electron3D extends Point {
  readonly r: number;
  readonly opacity: number;
}

/** Geometría completa de la visualización 3D esquemática. */
interface Atom3DGeometry {
  readonly orbits: readonly Orbit3D[];
  readonly electronsBack: readonly Electron3D[];
  readonly electronsFront: readonly Electron3D[];
}

/** Dimensiones del lienzo de las visualizaciones atómicas. */
const ATOM_VIEW = { width: 320, height: 200, cx: 160, cy: 100 } as const;

/** Inclinaciones (en grados) reutilizadas por las órbitas de la vista 3D. */
const ORBIT_3D_ROTATIONS: readonly number[] = [-22, 18, -8, 26, -16, 10, -24];

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
        (onAction)="handleSidebarAction($event)"
      />

      <main class="main">
        @if (examActive()) {
          <div class="alert alert-info" role="status">
            <span class="material-icons">science</span>
            <span>
              Estás consultando la tabla periódica durante una evaluación.
              <button type="button" class="link-btn" (click)="backToAttempt()">Volver al intento</button>
            </span>
          </div>
        }

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

                <!-- Modelo atómico (SVG esquemático tipo Bohr) -->
                <section class="detail-section">
                  <h2 class="detail-section__title">Modelo atómico</h2>
                  <div class="atom-stage">
                    @if (bohrGeometry(); as bohr) {
                      <svg
                        class="atom-stage__canvas"
                        viewBox="0 0 320 200"
                        role="img"
                        [attr.aria-label]="'Modelo atómico esquemático de ' + el.name"
                      >
                        <defs>
                          <radialGradient id="bohr-nucleus" cx="0.4" cy="0.35">
                            <stop offset="0%" stop-color="oklch(0.85 0.115 168)" />
                            <stop offset="60%" stop-color="oklch(0.64 0.120 168)" />
                            <stop offset="100%" stop-color="oklch(0.47 0.100 172)" />
                          </radialGradient>
                          <radialGradient id="bohr-electron" cx="0.35" cy="0.35">
                            <stop offset="0%" stop-color="oklch(1 0 0)" />
                            <stop offset="100%" stop-color="oklch(0.85 0.020 250)" />
                          </radialGradient>
                          <filter id="bohr-glow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="1.2" />
                          </filter>
                        </defs>

                        @for (orbit of bohr.orbits; track $index) {
                          <ellipse
                            cx="160"
                            cy="100"
                            [attr.rx]="orbit.rx"
                            [attr.ry]="orbit.ry"
                            fill="none"
                            stroke="oklch(1 0 0 / 0.28)"
                            stroke-width="1"
                            [attr.stroke-dasharray]="$index === 0 ? '0' : '2 4'"
                          />
                        }

                        <circle cx="160" cy="100" r="14" fill="url(#bohr-nucleus)" filter="url(#bohr-glow)" />
                        <circle
                          cx="160"
                          cy="100"
                          r="14"
                          fill="url(#bohr-nucleus)"
                          stroke="oklch(1 0 0 / 0.35)"
                          stroke-width="1"
                        />
                        <text
                          x="160"
                          y="104"
                          text-anchor="middle"
                          font-size="10"
                          font-weight="800"
                          fill="#ffffff"
                          font-family="var(--font-mono)"
                        >
                          {{ nucleusSymbol() }}
                        </text>

                        @for (electron of bohr.electrons; track $index) {
                          <circle
                            [attr.cx]="electron.x"
                            [attr.cy]="electron.y"
                            r="5"
                            fill="oklch(1 0 0 / 0.20)"
                            filter="url(#bohr-glow)"
                          />
                          <circle [attr.cx]="electron.x" [attr.cy]="electron.y" r="3" fill="url(#bohr-electron)" />
                        }

                        @for (label of bohr.labels; track $index) {
                          <text
                            [attr.x]="label.x"
                            [attr.y]="label.y"
                            text-anchor="middle"
                            font-size="9"
                            fill="oklch(0.85 0.020 250 / 0.7)"
                            font-family="var(--font-mono)"
                            font-weight="600"
                          >
                            {{ label.text }}
                          </text>
                        }
                      </svg>
                    }
                    <p class="atom-stage__caption">Representación esquemática del modelo atómico.</p>
                  </div>
                </section>

                <!-- Visualización 3D (SVG estilizado, sin librerías externas) -->
                <section class="detail-section">
                  <h2 class="detail-section__title">Visualización 3D</h2>
                  <div class="atom-stage">
                    @if (atom3dGeometry(); as atom) {
                      <svg
                        class="atom-stage__canvas"
                        viewBox="0 0 320 200"
                        role="img"
                        [attr.aria-label]="'Visualización 3D referencial de ' + el.name"
                      >
                        <defs>
                          <radialGradient id="atom-sphere" cx="0.32" cy="0.28" r="0.85">
                            <stop offset="0%" stop-color="oklch(0.97 0.030 168)" />
                            <stop offset="18%" stop-color="oklch(0.85 0.085 168)" />
                            <stop offset="55%" stop-color="oklch(0.60 0.115 170)" />
                            <stop offset="100%" stop-color="oklch(0.30 0.065 175)" />
                          </radialGradient>
                          <radialGradient id="atom-specular" cx="0.30" cy="0.25" r="0.18">
                            <stop offset="0%" stop-color="oklch(1 0 0 / 0.95)" />
                            <stop offset="60%" stop-color="oklch(1 0 0 / 0.20)" />
                            <stop offset="100%" stop-color="oklch(1 0 0 / 0)" />
                          </radialGradient>
                          <radialGradient id="atom-halo" cx="0.5" cy="0.5" r="0.5">
                            <stop offset="0%" stop-color="oklch(0.85 0.115 168 / 0.55)" />
                            <stop offset="50%" stop-color="oklch(0.70 0.120 168 / 0.20)" />
                            <stop offset="100%" stop-color="oklch(0.70 0.120 168 / 0)" />
                          </radialGradient>
                          <radialGradient id="atom-e3d" cx="0.30" cy="0.28" r="0.85">
                            <stop offset="0%" stop-color="oklch(1 0 0)" />
                            <stop offset="40%" stop-color="oklch(0.92 0.030 250)" />
                            <stop offset="100%" stop-color="oklch(0.55 0.060 250)" />
                          </radialGradient>
                          <radialGradient id="atom-shadow" cx="0.5" cy="0.5" r="0.5">
                            <stop offset="0%" stop-color="oklch(0 0 0 / 0.55)" />
                            <stop offset="100%" stop-color="oklch(0 0 0 / 0)" />
                          </radialGradient>
                        </defs>

                        <ellipse cx="160" cy="100" rx="80" ry="80" fill="url(#atom-halo)" />

                        @for (orbit of atom.orbits; track $index) {
                          <g [attr.transform]="orbit.transform">
                            <path [attr.d]="orbit.backPath" fill="none" stroke="oklch(0.65 0.020 250 / 0.30)" stroke-width="1" />
                          </g>
                        }

                        @for (electron of atom.electronsBack; track $index) {
                          <g [attr.opacity]="electron.opacity">
                            <circle [attr.cx]="electron.x" [attr.cy]="electron.y" [attr.r]="electron.r + 1" fill="oklch(0.85 0.025 250 / 0.25)" />
                            <circle [attr.cx]="electron.x" [attr.cy]="electron.y" [attr.r]="electron.r" fill="url(#atom-e3d)" />
                          </g>
                        }

                        <ellipse cx="164" cy="130" rx="28" ry="6" fill="url(#atom-shadow)" />

                        <circle cx="160" cy="100" r="28" fill="url(#atom-sphere)" />
                        <circle cx="160" cy="100" r="28" fill="url(#atom-specular)" />
                        <circle cx="160" cy="100" r="28" fill="none" stroke="oklch(1 0 0 / 0.12)" stroke-width="0.8" />
                        <text
                          x="160"
                          y="105"
                          text-anchor="middle"
                          font-size="14"
                          font-weight="800"
                          fill="#ffffff"
                          font-family="system-ui, sans-serif"
                        >
                          {{ nucleusSymbol() }}
                        </text>

                        @for (orbit of atom.orbits; track $index) {
                          <g [attr.transform]="orbit.transform">
                            <path [attr.d]="orbit.frontPath" fill="none" stroke="oklch(0.85 0.025 250 / 0.55)" stroke-width="1" />
                          </g>
                        }

                        @for (electron of atom.electronsFront; track $index) {
                          <g [attr.opacity]="electron.opacity">
                            <circle [attr.cx]="electron.x" [attr.cy]="electron.y" [attr.r]="electron.r + 1" fill="oklch(0.85 0.025 250 / 0.25)" />
                            <circle [attr.cx]="electron.x" [attr.cy]="electron.y" [attr.r]="electron.r" fill="url(#atom-e3d)" />
                          </g>
                        }
                      </svg>
                    }
                    <p class="atom-stage__caption">Visualización 3D referencial.</p>
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
                  (click)="goToCompounds()"
                >
                  Usar en formación de compuestos
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
  private readonly usageMetrics = inject(UsageMetricsService);
  private readonly examSession = inject(ExamSessionService);

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

  /** Símbolo que se dibuja en el núcleo de las visualizaciones. */
  readonly nucleusSymbol = computed<string>(() => this.selectedElement()?.symbol ?? '');

  /** Geometría del modelo de Bohr (órbitas, electrones y etiquetas de capa). */
  readonly bohrGeometry = computed<BohrGeometry>(() => {
    const el = this.selectedElement();
    if (el === null) {
      return { orbits: [], electrons: [], labels: [] };
    }
    const shells = this.shellsFor(el);
    const { cx, cy } = ATOM_VIEW;
    const count = shells.length;
    const rxMin = 32;
    const rxMax = 132;

    const orbits: BohrOrbit[] = shells.map((_, i) => {
      const rx = count <= 1 ? rxMin : rxMin + ((rxMax - rxMin) * i) / (count - 1);
      return { rx, ry: rx * 0.64 };
    });

    const electrons: Point[] = [];
    const labels: ShellLabel[] = [];
    shells.forEach((electronCount, i) => {
      const orbit = orbits[i];
      for (let j = 0; j < electronCount; j++) {
        const t = (j / electronCount) * Math.PI * 2 + i * 0.3;
        electrons.push({
          x: cx + orbit.rx * Math.cos(t),
          y: cy + orbit.ry * Math.sin(t),
        });
      }
      labels.push({ x: cx, y: cy - orbit.ry - 5, text: `${electronCount}e⁻` });
    });

    return { orbits, electrons, labels };
  });

  /** Geometría de la vista 3D esquemática (órbitas inclinadas con profundidad). */
  readonly atom3dGeometry = computed<Atom3DGeometry>(() => {
    const el = this.selectedElement();
    if (el === null) {
      return { orbits: [], electronsBack: [], electronsFront: [] };
    }
    const shells = this.shellsFor(el);
    const { cx, cy } = ATOM_VIEW;
    const count = shells.length;
    const rxMin = 56;
    const rxMax = 124;

    const orbits: Orbit3D[] = [];
    const electronsBack: Electron3D[] = [];
    const electronsFront: Electron3D[] = [];

    shells.forEach((electronCount, i) => {
      const rx = count <= 1 ? rxMin : rxMin + ((rxMax - rxMin) * i) / (count - 1);
      const ry = 14 + (i % 3) * 8;
      const rotate = ORBIT_3D_ROTATIONS[i % ORBIT_3D_ROTATIONS.length];
      const angle = (rotate * Math.PI) / 180;

      orbits.push({
        transform: `rotate(${rotate} ${cx} ${cy})`,
        backPath: `M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx + rx} ${cy}`,
        frontPath: `M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 0 ${cx + rx} ${cy}`,
      });

      for (let j = 0; j < electronCount; j++) {
        const t = (j / electronCount) * Math.PI * 2 + i * 0.45;
        const lx = rx * Math.cos(t);
        const ly = ry * Math.sin(t);
        const x = cx + lx * Math.cos(angle) - ly * Math.sin(angle);
        const y = cy + lx * Math.sin(angle) + ly * Math.cos(angle);
        const depth = Math.sin(t + angle);
        const electron: Electron3D = {
          x,
          y,
          r: 4 + depth * 1.2,
          opacity: 0.55 + (depth + 1) * 0.225,
        };
        if (depth < 0) {
          electronsBack.push(electron);
        } else {
          electronsFront.push(electron);
        }
      }
    });

    return { orbits, electronsBack, electronsFront };
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

  /** Durante un intento activo, el menú lateral pasa al modo examen. */
  readonly examActive = computed<boolean>(() => this.examSession.isActive());
  readonly navItems = computed<readonly SidebarNavItem[]>(() => {
    if (this.examSession.isActive()) {
      return examNavItems(
        this.examSession.calculatorAllowed(),
        this.examSession.periodicTableAllowed()
      );
    }
    return buildNavItems(this.authService.currentRole());
  });

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
    const element = this.elements.find((el) => el.atomicNumber === atomicNumber);
    if (element) {
      this.usageMetrics.trackElementViewed(element.symbol, element.atomicNumber, element.category);
    }
  }

  closePanel(): void {
    this.selectedAtomicNumber.set(null);
  }

  goToCompounds(): void {
    void this.router.navigateByUrl('/compounds');
  }

  handleLogout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
  }

  /** Vuelve al intento sin finalizarlo (no se pierde el progreso). */
  backToAttempt(): void {
    void this.router.navigateByUrl('/evaluations');
  }

  /** "Salir del intento" desde el menú de examen: lo gestiona la pantalla del intento. */
  handleSidebarAction(action: string): void {
    if (action === EXAM_EXIT_ACTION) {
      void this.router.navigate(['/evaluations'], { queryParams: { exit: '1' } });
    }
  }

  private detailFor(element: PeriodicElement): ElementDetail {
    return ELEMENT_DETAILS[element.atomicNumber] ?? {};
  }

  /**
   * Capas de electrones para las visualizaciones: usa el dato real si existe
   * en el detalle del elemento; si no, una distribución esquemática derivada
   * del número atómico.
   */
  private shellsFor(element: PeriodicElement): readonly number[] {
    return this.detailFor(element).shells ?? schematicShells(element.atomicNumber);
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
  if (parts.length === 0) {
    return '??';
  }
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
