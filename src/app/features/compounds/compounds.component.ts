import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TitleCasePipe } from '@angular/common';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { UsageMetricsService } from '../../core/services/usage-metrics.service';
import { ExamSessionService } from '../../core/services/exam-session.service';
import { AttemptEventService } from '../../core/services/attempt-event.service';
import { SidebarComponent, SidebarNavItem } from '../../shared/components/sidebar/sidebar.component';
import { EXAM_EXIT_ACTION, STUDENT_NAV_ITEMS, examNavItems } from '../../shared/components/sidebar/student-nav';
import { TEACHER_NAV_ITEMS } from '../../shared/components/sidebar/teacher-nav';
import { ADMIN_NAV_ITEMS } from '../../shared/components/sidebar/admin-nav';
import { UserRole } from '../../shared/models';
import { PERIODIC_ELEMENTS, PeriodicElement } from '../periodic-table/data/elements-data';
import { valenceOptionsFor } from './data/common-valences';
import { allowedElementSymbols } from './data/compound-element-rules';
import {
  AnimComponent,
  AnimKind,
  CompoundAnimationComponent,
} from './components/compound-animation/compound-animation.component';
import { ChemicalEngineService } from './services/chemical-engine.service';
import { ChemistryCatalogService } from './services/chemistry-catalog.service';
import {
  AcidNonMetalItem,
  AcidType,
  BinaryNonMetalItem,
  CentralElementItem,
  CompoundResponse,
  CompoundType,
  MetalCatalogItem,
  OxoanionItem,
} from './models/chemistry.models';

/** Metadatos visuales de cada tipo de compuesto (orden del diseño). */
interface CompoundTypeMeta {
  readonly id: CompoundType;
  readonly title: string;
  readonly desc: string;
  readonly icon: string;
  /** Tono de color, usado por el SCSS mediante el atributo data-tone. */
  readonly tone: string;
}

const COMPOUND_TYPES: readonly CompoundTypeMeta[] = [
  { id: 'oxides', title: 'Óxidos', desc: 'Elemento + Oxígeno', icon: 'bubble_chart', tone: 'orange' },
  { id: 'hydroxides', title: 'Hidróxidos', desc: 'Metal + Grupo OH⁻', icon: 'opacity', tone: 'blue' },
  { id: 'acids', title: 'Ácidos', desc: 'Hidrógeno + No metal', icon: 'water_drop', tone: 'teal' },
  { id: 'salts', title: 'Sales binarias', desc: 'Metal + No metal', icon: 'grain', tone: 'green' },
  { id: 'oxisalts', title: 'Oxisales', desc: 'Metal + Grupo oxácido', icon: 'hub', tone: 'violet' },
];

type FormStatus = 'idle' | 'loading' | 'success' | 'error';
type CatalogStatus = 'loading' | 'ready' | 'error';
type NomenclatureType = 'traditional' | 'stock' | 'systematic';

const NOMENCLATURE_OPTIONS: readonly { readonly value: NomenclatureType; readonly label: string }[] = [
  { value: 'traditional', label: 'Tradicional' },
  { value: 'stock', label: 'Stock' },
  { value: 'systematic', label: 'Sistemática' },
];

/** Opción simple de elemento para el selector (símbolo + nombre). */
interface ElementChoice {
  readonly symbol: string;
  readonly name: string;
}

@Component({
  selector: 'app-compounds',
  standalone: true,
  imports: [SidebarComponent, TitleCasePipe, CompoundAnimationComponent],
  styleUrls: ['./compounds.component.scss'],
  template: `
    <div class="layout">
      <app-sidebar
        [navItems]="navItems()"
        [userName]="userName()"
        [userRole]="userRoleLabel()"
        [userInitials]="userInitials()"
        (onLogout)="handleLogout()"
        (onAction)="handleSidebarAction($event)"
      />

      <main class="main">
        @if (examActive()) {
          <div class="alert alert-info" role="status">
            <span class="material-icons">science</span>
            <span>
              Estás usando esta herramienta durante una evaluación.
              <button type="button" class="link-btn" (click)="backToAttempt()">Volver al intento</button>
            </span>
          </div>
        }

        <header class="cmp-header">
          <h1 class="cmp-header__title">Formación de compuestos</h1>
          <p class="cmp-header__subtitle">
            Combina elementos químicos y valida la formación de compuestos usando el
            motor químico del sistema.
          </p>
        </header>

        <!-- Selector de tipo de compuesto -->
        <section class="type-grid" aria-label="Tipo de compuesto">
          @for (t of compoundTypes; track t.id) {
            <button
              type="button"
              class="type-card"
              [class.type-card--active]="selectedType() === t.id"
              [attr.data-tone]="t.tone"
              (click)="selectType(t.id)"
            >
              <span class="type-card__icon" [attr.data-tone]="t.tone">
                <span class="material-icons">{{ t.icon }}</span>
              </span>
              <span class="type-card__title">{{ t.title }}</span>
              <span class="type-card__desc">{{ t.desc }}</span>
            </button>
          }
        </section>

        <!-- Formulario + resultado -->
        <section class="cmp-grid">
          <!-- ===== Formulario ===== -->
          <form class="cmp-card" (submit)="onSubmit($event)">
            <div class="cmp-card__head">
              <h2 class="cmp-card__title">Configura el compuesto</h2>
              <p class="cmp-card__desc">
                Selecciona los reactivos y revisa el resultado en el panel de la derecha.
              </p>
            </div>

            @if (catalogStatus() === 'loading') {
              <div class="alert" role="status">
                <span class="material-icons">cloud_download</span>
                <span>Cargando catálogos del motor químico…</span>
              </div>
            } @else if (catalogStatus() === 'error') {
              <div class="alert alert-danger" role="alert">
                <span class="material-icons">error_outline</span>
                <span>
                  No se pudieron cargar los catálogos del motor químico.
                  <button type="button" class="link-btn" (click)="loadCatalogs()">Reintentar</button>
                </span>
              </div>
            } @else {

            <!-- Tipo de ácido (hidrácido / oxácido) -->
            @if (selectedType() === 'acids') {
              <div class="field">
                <label class="form-label">Tipo de ácido</label>
                <div class="valence-pills" role="group" aria-label="Tipo de ácido">
                  <button
                    type="button"
                    class="valence-pill"
                    [class.valence-pill--active]="acidType() === 'HYDRACID'"
                    (click)="selectAcidType('HYDRACID')"
                  >
                    Hidrácido
                  </button>
                  <button
                    type="button"
                    class="valence-pill"
                    [class.valence-pill--active]="acidType() === 'OXOACID'"
                    (click)="selectAcidType('OXOACID')"
                  >
                    Oxácido
                  </button>
                </div>
              </div>
            }

            <!-- Elemento / metal (óxidos, hidróxidos, sales, oxisales) -->
            @if (needsElement()) {
              <div class="field">
                <label class="form-label" for="element-select">{{ elementLabel() }}</label>
                <select
                  id="element-select"
                  class="select"
                  [value]="elementSymbol()"
                  (change)="onElementChange($event)"
                >
                  <option value="">Selecciona un elemento</option>
                  @for (el of availableElements(); track el.symbol) {
                    <option [value]="el.symbol">{{ el.symbol }} — {{ el.name | titlecase }}</option>
                  }
                </select>
              </div>

              @if (elementSymbol() !== '') {
                <div class="field">
                  <label class="form-label">{{ valenceLabel() }}</label>
                  @if (availableValences().length > 0) {
                    <div class="valence-pills" role="group" [attr.aria-label]="valenceLabel()">
                      @for (v of availableValences(); track v) {
                        <button
                          type="button"
                          class="valence-pill"
                          [class.valence-pill--active]="valence() === v"
                          (click)="selectValence(v)"
                        >
                          +{{ v }}
                        </button>
                      }
                    </div>
                  } @else {
                    <input
                      id="valence-input"
                      class="input"
                      type="number"
                      min="1"
                      max="7"
                      placeholder="Ej. 2"
                      [value]="valence() ?? ''"
                      (input)="onValenceInput($event)"
                    />
                    <p class="form-hint">
                      No hay valencias registradas para este elemento. Ingresa una valencia
                      manualmente.
                    </p>
                  }
                </div>
              }
            }

            <!-- No metal + carga (ácidos hidrácidos) -->
            @if (selectedType() === 'acids' && acidType() === 'HYDRACID') {
              <div class="field">
                <label class="form-label" for="acid-nonmetal-select">No metal</label>
                <select
                  id="acid-nonmetal-select"
                  class="select"
                  [value]="acidNonMetalSymbol()"
                  (change)="onAcidNonMetalChange($event)"
                >
                  <option value="">Selecciona un no metal</option>
                  @for (a of acidNonMetals(); track a.symbol) {
                    <option [value]="a.symbol">{{ a.symbol }} — {{ a.name | titlecase }}</option>
                  }
                </select>
              </div>

              @if (selectedAcidNonMetal(); as a) {
                <div class="field">
                  <label class="form-label">Carga del no metal</label>
                  <div class="valence-pills" role="group" aria-label="Carga del no metal">
                    <button type="button" class="valence-pill valence-pill--active" disabled>
                      -{{ a.charge }}
                    </button>
                  </div>
                </div>
              }
            }

            <!-- No metal + carga (sales binarias) -->
            @if (selectedType() === 'salts' && elementSymbol() !== '' && valence() !== null) {
              <div class="field">
                <label class="form-label" for="nonmetal-select">No metal</label>
                <select
                  id="nonmetal-select"
                  class="select"
                  [value]="nonMetalSymbol()"
                  (change)="onNonMetalChange($event)"
                >
                  <option value="">Selecciona un no metal</option>
                  @for (nm of binaryNonMetals(); track nm.symbol) {
                    <option [value]="nm.symbol">{{ nm.symbol }} — {{ nm.name | titlecase }}</option>
                  }
                </select>
              </div>

              @if (selectedNonMetal(); as nm) {
                <div class="field">
                  <label class="form-label">Carga del no metal</label>
                  <div class="valence-pills" role="group" aria-label="Carga del no metal">
                    <button type="button" class="valence-pill valence-pill--active" disabled>
                      -{{ nm.charge }}
                    </button>
                  </div>
                </div>
              }
            }

            <!-- Elemento central + grupo oxácido (oxisales y oxácidos) -->
            @if (needsOxoanion()) {
              <div class="field">
                <label class="form-label" for="central-select">Elemento central del grupo oxácido</label>
                <select
                  id="central-select"
                  class="select"
                  [value]="centralSymbol()"
                  (change)="onCentralChange($event)"
                >
                  <option value="">Selecciona un elemento central</option>
                  @for (c of centralElements(); track c.symbol) {
                    <option [value]="c.symbol">{{ c.symbol }} — {{ c.name | titlecase }}</option>
                  }
                </select>
              </div>

              @if (centralSymbol() !== '') {
                <div class="field">
                  <label class="form-label" for="group-select">Grupo oxácido</label>
                  <select
                    id="group-select"
                    class="select"
                    [value]="oxoanionKey()"
                    (change)="onGroupChange($event)"
                  >
                    <option value="">Selecciona un grupo</option>
                    @for (g of groupsForCentral(); track g.key) {
                      <option [value]="g.key">
                        {{ g.name | titlecase }} ({{ g.formula }}) — carga -{{ g.charge }}
                      </option>
                    }
                  </select>
                </div>
              }
            }

            @if (formError()) {
              <div class="alert alert-warning" role="alert">
                <span class="material-icons">info</span>
                <span>{{ formError() }}</span>
              </div>
            }

            <div class="cmp-actions">
              <button
                type="submit"
                class="btn btn-primary btn-lg cmp-actions__primary"
                [disabled]="status() === 'loading' || catalogStatus() !== 'ready'"
              >
                @if (status() === 'loading') {
                  Formando…
                } @else {
                  Formar compuesto
                }
              </button>
              <button type="button" class="btn btn-secondary" (click)="resetForm()">
                Nuevo intento
              </button>
            </div>

            }
          </form>

          <!-- ===== Resultado ===== -->
          <div class="result" [attr.data-state]="status()">
            @switch (status()) {
              @case ('loading') {
                <div class="result__placeholder">
                  <span class="material-icons result__spin">progress_activity</span>
                  <p>Consultando el motor químico…</p>
                </div>
              }
              @case ('error') {
                <div class="alert alert-danger result__error" role="alert">
                  <span class="material-icons">error_outline</span>
                  <span>{{ errorMessage() }}</span>
                </div>
              }
              @case ('success') {
                @if (result(); as r) {
                  <!-- Simulación visual en bucle, junto al resultado real. -->
                  <app-compound-animation
                    [components]="animComponents()"
                    [formula]="r.formula"
                  />

                  <div class="result__head">
                    <h2 class="cmp-card__title">Resultado</h2>
                    <span class="badge badge-success">
                      <span class="material-icons">check_circle</span>
                      Compuesto formado
                    </span>
                  </div>

                  <div class="result__formula-box">
                    <div class="result__formula">{{ r.formula }}</div>
                    <div class="result__name">{{ r.name }}</div>
                    <span class="badge badge-neutral result__type">{{ r.compoundType }}</span>
                  </div>

                  <div class="result__nomen">
                    <div class="nomen-selector">
                      <label class="form-label" for="nomenclature-select">
                        Nomenclatura a mostrar
                      </label>
                      <select
                        id="nomenclature-select"
                        class="select"
                        [value]="selectedNomenclature()"
                        (change)="onNomenclatureChange($event)"
                      >
                        @for (option of nomenclatureOptions; track option.value) {
                          <option [value]="option.value">{{ option.label }}</option>
                        }
                      </select>
                    </div>

                    <div class="nomen-item" aria-live="polite">
                      <span class="nomen-item__label">{{ selectedNomenclatureLabel() }}</span>
                      <span class="nomen-item__value">{{ selectedNomenclatureValue() }}</span>
                    </div>

                    @if (nomenclatureNotes(); as notes) {
                      <p class="nomen-note">
                        <span class="material-icons">info</span>
                        <span>{{ notes }}</span>
                      </p>
                    }
                  </div>

                  @if (r.explanation) {
                    <div class="result__explain">
                      <div class="result__explain-title">¿Cómo se formó?</div>
                      <p class="result__explain-text">{{ r.explanation }}</p>
                    </div>
                  }
                }
              }
              @default {
                @if (hasSelection()) {
                  <!-- Vista previa: muestra los componentes seleccionados antes de formar. -->
                  <app-compound-animation [components]="animComponents()" [formula]="null" />
                  <p class="result__hint">
                    Pulsa «Formar compuesto» para combinar los componentes y ver el resultado.
                  </p>
                } @else {
                  <div class="result__placeholder">
                    <span class="material-icons">science</span>
                    <p>Configura el compuesto y presiona «Formar compuesto» para ver el resultado.</p>
                  </div>
                }
              }
            }
          </div>
        </section>
      </main>
    </div>
  `,
})
export class CompoundsComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly engine = inject(ChemicalEngineService);
  private readonly catalog = inject(ChemistryCatalogService);
  private readonly usageMetrics = inject(UsageMetricsService);
  private readonly examSession = inject(ExamSessionService);
  private readonly attemptEvents = inject(AttemptEventService);

  readonly compoundTypes = COMPOUND_TYPES;
  readonly nomenclatureOptions = NOMENCLATURE_OPTIONS;
  private readonly elements: readonly PeriodicElement[] = PERIODIC_ELEMENTS;

  // ===== Catálogos del backend (fuente de verdad) =====
  readonly catalogStatus = signal<CatalogStatus>('loading');
  readonly metals = signal<readonly MetalCatalogItem[]>([]);
  readonly binaryNonMetals = signal<readonly BinaryNonMetalItem[]>([]);
  readonly acidNonMetals = signal<readonly AcidNonMetalItem[]>([]);
  readonly centralElements = signal<readonly CentralElementItem[]>([]);
  readonly oxoanions = signal<readonly OxoanionItem[]>([]);

  // ===== Estado del formulario =====
  readonly selectedType = signal<CompoundType>('oxides');
  readonly elementSymbol = signal<string>('');
  /** Valencia positiva seleccionada (o ingresada manualmente en óxidos), o null. */
  readonly valence = signal<number | null>(null);
  /** Tipo de ácido elegido (solo aplica al tipo «acids»). */
  readonly acidType = signal<AcidType>('HYDRACID');
  /** No metal elegido para ácidos hidrácidos (símbolo), o cadena vacía. */
  readonly acidNonMetalSymbol = signal<string>('');
  /** No metal elegido para sales binarias (símbolo), o cadena vacía. */
  readonly nonMetalSymbol = signal<string>('');
  /** Elemento central elegido para oxisales/oxácidos (símbolo), o cadena vacía. */
  readonly centralSymbol = signal<string>('');
  /** Clave del oxoanión elegido para oxisales/oxácidos, o cadena vacía. */
  readonly oxoanionKey = signal<string>('');

  readonly formError = signal<string>('');
  readonly status = signal<FormStatus>('idle');
  readonly result = signal<CompoundResponse | null>(null);
  readonly errorMessage = signal<string>('');
  readonly selectedNomenclature = signal<NomenclatureType>('traditional');
  readonly selectedNomenclatureLabel = computed<string>(
    () =>
      this.nomenclatureOptions.find((option) => option.value === this.selectedNomenclature())
        ?.label ?? 'Tradicional'
  );
  readonly selectedNomenclatureValue = computed<string>(() => {
    const value = this.result()?.nomenclature?.[this.selectedNomenclature()];
    return typeof value === 'string' && value.trim() !== '' ? value : 'No disponible';
  });
  readonly nomenclatureNotes = computed<string>(() => {
    const notes = this.result()?.nomenclature?.notes;
    return typeof notes === 'string' ? notes.trim() : '';
  });

  constructor() {
    this.loadCatalogs();
    // Trazabilidad del intento: si se abre la herramienta durante un intento activo, se
    // registra el uso (solo que se abrió la herramienta, nunca qué se formó).
    if (this.examSession.isActive()) {
      this.attemptEvents.toolOpened('COMPOUND_FORMATION');
    }
  }

  /** Carga todos los catálogos del backend en paralelo. */
  loadCatalogs(): void {
    this.catalogStatus.set('loading');
    forkJoin({
      metals: this.catalog.metals(),
      binaryNonMetals: this.catalog.binaryNonMetals(),
      acidNonMetals: this.catalog.acidNonMetals(),
      centralElements: this.catalog.oxoanionCentralElements(),
      oxoanions: this.catalog.oxoanions(),
    }).subscribe({
      next: (data) => {
        this.metals.set(data.metals);
        this.binaryNonMetals.set(data.binaryNonMetals);
        this.acidNonMetals.set(data.acidNonMetals);
        this.centralElements.set(data.centralElements);
        this.oxoanions.set(data.oxoanions);
        this.catalogStatus.set('ready');
      },
      error: () => this.catalogStatus.set('error'),
    });
  }

  // ===== Elemento / metal según el tipo =====

  /** Indica si el tipo actual usa metales del catálogo del backend. */
  private readonly isMetalType = computed<boolean>(() => {
    const type = this.selectedType();
    return type === 'hydroxides' || type === 'salts' || type === 'oxisalts';
  });

  /**
   * Elementos disponibles en el selector. Para óxidos se usan los elementos
   * locales con valencias (incluye no metales); para hidróxidos, sales y
   * oxisales se usan los metales del catálogo del backend.
   */
  readonly availableElements = computed<readonly ElementChoice[]>(() => {
    if (this.isMetalType()) {
      return this.metals().map((m) => ({ symbol: m.symbol, name: m.name }));
    }
    if (this.selectedType() === 'oxides') {
      const allowed = new Set(allowedElementSymbols('oxides'));
      return this.elements
        .filter((el) => allowed.has(el.symbol))
        .map((el) => ({ symbol: el.symbol, name: el.name }));
    }
    return [];
  });

  /** Nombre del elemento/metal seleccionado (del catálogo correspondiente). */
  readonly selectedElementName = computed<string>(() => {
    const symbol = this.elementSymbol();
    return this.availableElements().find((el) => el.symbol === symbol)?.name ?? symbol;
  });

  /** Metal del catálogo seleccionado (solo para tipos con metal), o null. */
  private readonly selectedMetal = computed<MetalCatalogItem | null>(
    () => this.metals().find((m) => m.symbol === this.elementSymbol()) ?? null
  );

  /** Valencias positivas disponibles del elemento/metal seleccionado. */
  readonly availableValences = computed<readonly number[]>(() => {
    const symbol = this.elementSymbol();
    if (symbol === '') {
      return [];
    }
    if (this.isMetalType()) {
      return this.selectedMetal()?.valences ?? [];
    }
    // Óxidos: valencias positivas del catálogo local, sin repetir.
    const element = this.elements.find((el) => el.symbol === symbol);
    if (element === undefined) {
      return [];
    }
    const seen = new Set<number>();
    const values: number[] = [];
    for (const option of valenceOptionsFor(element.symbol, element.atomicNumber)) {
      if (option.value > 0 && !seen.has(option.value)) {
        seen.add(option.value);
        values.push(option.value);
      }
    }
    return values;
  });

  // ===== Ácidos hidrácidos =====
  readonly selectedAcidNonMetal = computed<AcidNonMetalItem | null>(
    () => this.acidNonMetals().find((a) => a.symbol === this.acidNonMetalSymbol()) ?? null
  );

  // ===== Sales binarias =====
  readonly selectedNonMetal = computed<BinaryNonMetalItem | null>(
    () => this.binaryNonMetals().find((nm) => nm.symbol === this.nonMetalSymbol()) ?? null
  );

  // ===== Oxisales / oxácidos: elemento central + grupo =====
  /** Indica si el flujo actual necesita elegir un oxoanión. */
  readonly needsOxoanion = computed<boolean>(() => {
    if (this.selectedType() === 'oxisalts') {
      return this.elementSymbol() !== '' && this.valence() !== null;
    }
    return this.selectedType() === 'acids' && this.acidType() === 'OXOACID';
  });
  /** Grupos oxácidos del elemento central seleccionado. */
  readonly groupsForCentral = computed<readonly OxoanionItem[]>(() =>
    this.oxoanions().filter((g) => g.centralElement === this.centralSymbol())
  );
  /** Oxoanión seleccionado por su clave, o null. */
  readonly selectedOxoanion = computed<OxoanionItem | null>(
    () => this.oxoanions().find((g) => g.key === this.oxoanionKey()) ?? null
  );

  // ===== Campos requeridos según el tipo =====
  readonly needsElement = computed<boolean>(() => this.selectedType() !== 'acids');

  readonly elementLabel = computed<string>(() =>
    this.selectedType() === 'oxides' ? 'Elemento' : 'Metal'
  );
  readonly valenceLabel = computed<string>(() =>
    this.selectedType() === 'oxides' ? 'Valencia del elemento' : 'Valencia del metal'
  );

  // ===== Sidebar según el rol =====
  private readonly currentUser = computed(() => this.authService.currentUser());
  readonly userName = computed<string>(() => this.currentUser()?.username ?? 'Usuario');
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

  // ===== Simulación didáctica (capa visual sobre el resultado real) =====

  /**
   * Los dos reactivos a representar en la simulación, derivados solo de la
   * selección del usuario (símbolos, valencias y cargas ya presentes en el
   * formulario y los catálogos). No recalcula química: la fórmula final sigue
   * saliendo del backend. El `kind` solo determina el color de la partícula.
   */
  readonly animComponents = computed<readonly AnimComponent[]>(() => {
    const valence = this.valence() ?? 0;
    const mainPart: AnimComponent = {
      symbol: this.elementSymbol(),
      name: this.selectedElementName(),
      value: valence,
      sign: '+',
      kind: this.selectedType() === 'oxides' ? this.oxideElementKind(this.elementSymbol()) : 'metal',
    };
    switch (this.selectedType()) {
      case 'oxides':
        return [mainPart, { symbol: 'O', name: 'oxígeno', value: 2, sign: '-', kind: 'oxygen' }];
      case 'hydroxides':
        return [mainPart, { symbol: 'OH', name: 'hidroxilo', value: 1, sign: '-', kind: 'group' }];
      case 'salts': {
        const nm = this.selectedNonMetal();
        return [
          mainPart,
          { symbol: nm?.symbol ?? '', name: nm?.name ?? '', value: nm?.charge ?? 0, sign: '-', kind: 'nonmetal' },
        ];
      }
      case 'oxisalts': {
        const g = this.selectedOxoanion();
        return [
          mainPart,
          { symbol: g?.formula ?? '', name: g?.name ?? '', value: g?.charge ?? 0, sign: '-', kind: 'group' },
        ];
      }
      case 'acids': {
        const hydrogen: AnimComponent = { symbol: 'H', name: 'hidrógeno', value: 1, sign: '+', kind: 'hydrogen' };
        if (this.acidType() === 'HYDRACID') {
          const a = this.selectedAcidNonMetal();
          return [
            hydrogen,
            { symbol: a?.symbol ?? '', name: a?.name ?? '', value: a?.charge ?? 0, sign: '-', kind: 'nonmetal' },
          ];
        }
        const g = this.selectedOxoanion();
        return [
          hydrogen,
          { symbol: g?.formula ?? '', name: g?.name ?? '', value: g?.charge ?? 0, sign: '-', kind: 'group' },
        ];
      }
      default:
        return [];
    }
  });

  /** Hay una selección suficiente para mostrar la vista previa de la simulación. */
  readonly hasSelection = computed<boolean>(() => {
    const comps = this.animComponents();
    return comps.length === 2 && comps[0].symbol !== '' && comps[1].symbol !== '';
  });

  /** Color de un elemento de óxido según su categoría en la tabla periódica. */
  private oxideElementKind(symbol: string): AnimKind {
    const element = this.elements.find((el) => el.symbol === symbol);
    if (element === undefined) {
      return 'metal';
    }
    return element.category === 'nonmetal' ||
      element.category === 'halogen' ||
      element.category === 'metalloid'
      ? 'nonmetal'
      : 'metal';
  }

  selectType(type: CompoundType): void {
    if (type === this.selectedType()) {
      return;
    }
    this.selectedType.set(type);
    this.resetForm();
  }

  selectAcidType(type: AcidType): void {
    if (type === this.acidType()) {
      return;
    }
    this.acidType.set(type);
    // Limpia las selecciones del otro sub-flujo de ácido.
    this.acidNonMetalSymbol.set('');
    this.centralSymbol.set('');
    this.oxoanionKey.set('');
    this.formError.set('');
  }

  onElementChange(event: Event): void {
    this.elementSymbol.set((event.target as HTMLSelectElement).value);
    // Si el elemento tiene una única valencia disponible, se selecciona sola.
    const valences = this.availableValences();
    this.valence.set(valences.length === 1 ? valences[0] : null);
    // Reinicia las selecciones dependientes del metal/valencia.
    this.nonMetalSymbol.set('');
    this.centralSymbol.set('');
    this.oxoanionKey.set('');
  }

  selectValence(value: number): void {
    this.valence.set(value);
  }

  onValenceInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.valence.set(raw === '' ? null : Math.abs(Number(raw)));
  }

  onAcidNonMetalChange(event: Event): void {
    this.acidNonMetalSymbol.set((event.target as HTMLSelectElement).value);
  }

  onNonMetalChange(event: Event): void {
    this.nonMetalSymbol.set((event.target as HTMLSelectElement).value);
  }

  onCentralChange(event: Event): void {
    const central = (event.target as HTMLSelectElement).value;
    this.centralSymbol.set(central);
    // Si el elemento central tiene un único grupo, se selecciona solo.
    const groups = this.oxoanions().filter((g) => g.centralElement === central);
    this.oxoanionKey.set(groups.length === 1 ? groups[0].key : '');
  }

  onGroupChange(event: Event): void {
    this.oxoanionKey.set((event.target as HTMLSelectElement).value);
  }

  onNomenclatureChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'traditional' || value === 'stock' || value === 'systematic') {
      this.selectedNomenclature.set(value);
    }
  }

  resetForm(): void {
    this.elementSymbol.set('');
    this.valence.set(null);
    this.acidType.set('HYDRACID');
    this.acidNonMetalSymbol.set('');
    this.nonMetalSymbol.set('');
    this.centralSymbol.set('');
    this.oxoanionKey.set('');
    this.formError.set('');
    this.status.set('idle');
    this.result.set(null);
    this.errorMessage.set('');
    this.selectedNomenclature.set('traditional');
  }

  onSubmit(event?: Event): void {
    // Evita el envío nativo del formulario (que recargaría la página).
    event?.preventDefault();
    this.formError.set('');

    if (this.catalogStatus() !== 'ready') {
      this.formError.set('Aún se están cargando los catálogos del motor químico.');
      return;
    }

    const validationMessage = this.validateForm();
    if (validationMessage !== null) {
      this.formError.set(validationMessage);
      return;
    }

    const request$ = this.buildRequest();
    if (request$ === null) {
      this.formError.set('Completa los datos necesarios para formar el compuesto.');
      return;
    }

    this.status.set('loading');
    this.result.set(null);
    this.errorMessage.set('');
    this.selectedNomenclature.set('traditional');

    const compoundType = this.selectedType();
    request$.subscribe({
      next: (response) => {
        // Métrica de uso: el usuario intentó formar/validar un compuesto. Solo se registra
        // el tipo y el resultado (true/false); nunca el payload ni datos sensibles.
        this.usageMetrics.trackCompoundFormation(response.compoundType ?? compoundType, response.valid);
        if (response.valid) {
          // El resultado real y la simulación visual (en bucle) se muestran juntos.
          this.result.set(response);
          this.status.set('success');
        } else {
          this.status.set('error');
          this.errorMessage.set(
            response.explanation || 'La combinación seleccionada no forma un compuesto válido.'
          );
        }
      },
      error: (error: unknown) => {
        this.status.set('error');
        this.errorMessage.set(this.extractError(error));
      },
    });
  }

  /**
   * Valida los datos del formulario según el tipo de compuesto y devuelve un
   * mensaje claro si falta algo, o null si todo está completo.
   */
  private validateForm(): string | null {
    const type = this.selectedType();

    if (type === 'acids') {
      if (this.acidType() === 'HYDRACID') {
        return this.selectedAcidNonMetal() === null ? 'Selecciona un no metal.' : null;
      }
      // Oxácido
      if (this.centralSymbol() === '') {
        return 'Selecciona el elemento central del grupo oxácido.';
      }
      return this.selectedOxoanion() === null ? 'Selecciona un grupo oxácido.' : null;
    }

    // Resto de tipos requieren elemento + valencia
    if (this.elementSymbol() === '') {
      return 'Selecciona un elemento.';
    }
    const valence = this.valence();
    if (valence === null || valence < 1) {
      return this.availableValences().length > 0
        ? 'Selecciona una valencia para el elemento.'
        : 'Ingresa una valencia para el elemento.';
    }

    if (type === 'salts' && this.selectedNonMetal() === null) {
      return 'Selecciona un no metal.';
    }
    if (type === 'oxisalts') {
      if (this.centralSymbol() === '') {
        return 'Selecciona el elemento central del grupo oxácido.';
      }
      if (this.selectedOxoanion() === null) {
        return 'Selecciona un grupo oxácido.';
      }
    }

    return null;
  }

  /** Construye y devuelve la llamada al motor químico, o null si faltan datos. */
  private buildRequest() {
    const type = this.selectedType();

    if (type === 'oxides' || type === 'hydroxides') {
      const valence = this.valence();
      if (this.elementSymbol() === '' || valence === null || valence < 1) {
        return null;
      }
      const request = {
        elementSymbol: this.elementSymbol(),
        elementName: this.selectedElementName().toLowerCase(),
        valence,
      };
      return type === 'oxides'
        ? this.engine.generateOxide(request)
        : this.engine.generateHydroxide(request);
    }

    if (type === 'acids') {
      if (this.acidType() === 'HYDRACID') {
        const anion = this.selectedAcidNonMetal();
        if (anion === null) {
          return null;
        }
        return this.engine.generateAcid({ acidType: 'HYDRACID', nonMetalSymbol: anion.symbol });
      }
      const group = this.selectedOxoanion();
      if (group === null) {
        return null;
      }
      return this.engine.generateAcid({ acidType: 'OXOACID', oxoanionKey: group.key });
    }

    if (type === 'salts') {
      const valence = this.valence();
      const nonMetal = this.selectedNonMetal();
      if (this.elementSymbol() === '' || valence === null || valence < 1 || nonMetal === null) {
        return null;
      }
      return this.engine.generateSalt({
        metalSymbol: this.elementSymbol(),
        metalValence: valence,
        nonMetalSymbol: nonMetal.symbol,
      });
    }

    // oxisalts
    const valence = this.valence();
    const group = this.selectedOxoanion();
    if (this.elementSymbol() === '' || valence === null || valence < 1 || group === null) {
      return null;
    }
    return this.engine.generateOxisalt({
      metalSymbol: this.elementSymbol(),
      metalValence: valence,
      oxoanionKey: group.key,
    });
  }

  /** Traduce un error HTTP a un mensaje claro para el estudiante. */
  private extractError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      // Error de red o backend caído: status 0
      if (error.status === 0) {
        return 'No se pudo conectar con el motor químico. Inténtalo nuevamente.';
      }
      // El backend devuelve { valid:false, message } en errores químicos/validación
      const body = error.error as { message?: string } | null;
      if (body && typeof body.message === 'string' && body.message.trim() !== '') {
        return body.message;
      }
    }
    return 'No se pudo conectar con el motor químico. Inténtalo nuevamente.';
  }

  handleLogout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
  }

  /** Vuelve al intento sin finalizarlo (no se pierde el progreso). */
  backToAttempt(): void {
    if (this.examSession.isActive()) {
      this.attemptEvents.toolReturned('COMPOUND_FORMATION');
    }
    void this.router.navigateByUrl('/evaluations');
  }

  /** "Salir del intento" desde el menú de examen: lo gestiona la pantalla del intento. */
  handleSidebarAction(action: string): void {
    if (action === EXAM_EXIT_ACTION) {
      void this.router.navigate(['/evaluations'], { queryParams: { exit: '1' } });
    }
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
