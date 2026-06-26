import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ConceptMaterialsService } from '../../core/services/concept-materials.service';
import { UsageMetricsService } from '../../core/services/usage-metrics.service';
import { SidebarComponent, SidebarNavItem } from '../../shared/components/sidebar/sidebar.component';
import { STUDENT_NAV_ITEMS } from '../../shared/components/sidebar/student-nav';
import { TEACHER_NAV_ITEMS } from '../../shared/components/sidebar/teacher-nav';
import { ADMIN_NAV_ITEMS } from '../../shared/components/sidebar/admin-nav';
import { StudentConceptsService } from './services/student-concepts.service';
import {
  ConceptCategory,
  ConceptMaterialResponse,
  StudentConceptContentResponse,
  UserRole,
} from '../../shared/models';

interface CategoryVisual {
  readonly iconName: string;
  readonly tone: { bg: string; fg: string };
}

// Etiquetas legibles para las categorías clásicas (se guardaban como código en mayúsculas).
// Las categorías personalizadas se muestran tal cual las escribió el docente.
const LEGACY_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  OXIDOS: 'Óxidos',
  HIDROXIDOS: 'Hidróxidos',
  ACIDOS: 'Ácidos',
  SALES_BINARIAS: 'Sales binarias',
  OXISALES: 'Oxisales',
  NOMENCLATURA: 'Nomenclatura',
  GENERAL: 'General',
};

// Ícono y color por categoría clásica; las personalizadas usan el aspecto por defecto.
const CATEGORY_CONFIG: Readonly<Record<string, CategoryVisual>> = {
  OXIDOS:       { iconName: 'local_fire_department', tone: { bg: '#fff4ed', fg: '#c2410c' } },
  HIDROXIDOS:   { iconName: 'opacity',               tone: { bg: '#eff6ff', fg: '#1d4ed8' } },
  ACIDOS:       { iconName: 'water_drop',            tone: { bg: '#f0fdf4', fg: '#15803d' } },
  SALES_BINARIAS: { iconName: 'grain',               tone: { bg: '#f0fdf4', fg: '#166534' } },
  OXISALES:     { iconName: 'hub',                   tone: { bg: '#faf5ff', fg: '#7e22ce' } },
  NOMENCLATURA: { iconName: 'menu_book',             tone: { bg: '#fff7ed', fg: '#c2410c' } },
  GENERAL:      { iconName: 'science',               tone: { bg: '#f0f9ff', fg: '#0369a1' } },
};

const DEFAULT_CATEGORY_CONFIG: CategoryVisual = {
  iconName: 'menu_book',
  tone: { bg: '#f0f9ff', fg: '#0369a1' },
};

// Solo las categorías químicas clásicas enlazan con el módulo de formación de compuestos.
const CATEGORIES_WITH_COMPOUNDS = new Set<string>([
  'OXIDOS', 'HIDROXIDOS', 'ACIDOS', 'SALES_BINARIAS', 'OXISALES',
]);

// Orden preferente de las categorías clásicas en los filtros; las demás van después.
const LEGACY_CATEGORY_ORDER: string[] = [
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
        <!-- Estado: cargando -->
        @if (loading()) {
          <header class="concepts-header">
            <h1 class="concepts-header__title">Contenidos conceptuales</h1>
            <p class="concepts-header__subtitle">
              Repasa los conceptos asignados por tu docente antes de formar compuestos químicos.
            </p>
          </header>
          <div class="page-state">
            <div class="page-state__spinner" role="status" aria-label="Cargando">
              <span class="material-icons page-state__spin-icon">autorenew</span>
            </div>
            <p class="page-state__title">Estamos cargando tus contenidos conceptuales...</p>
          </div>
        }

        <!-- Estado: error de carga -->
        @else if (loadError()) {
          <header class="concepts-header">
            <h1 class="concepts-header__title">Contenidos conceptuales</h1>
          </header>
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
          <header class="concepts-header">
            <h1 class="concepts-header__title">Contenidos conceptuales</h1>
          </header>
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

        <!-- ════════ VISTA DE DETALLE AMPLIA ════════ -->
        @else if (selectedConcept(); as concept) {
          <section class="detail-view">
            <button type="button" class="detail-view__back" (click)="closeConcept()">
              <span class="material-icons">arrow_back</span>
              Volver a contenidos
            </button>

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
            </div>

            <div class="detail-body">

              <!-- Resumen -->
              @if (concept.summary) {
                <div class="content-section">
                  <div class="content-section__label">Resumen</div>
                  <p class="content-section__text">{{ concept.summary }}</p>
                </div>
              }

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

              <!-- Actividad sugerida -->
              @if (concept.suggestedActivity) {
                <div class="content-section">
                  <div class="content-section__label">Actividad sugerida</div>
                  <p class="content-section__text">{{ concept.suggestedActivity }}</p>
                </div>
              }

              <!-- Materiales de apoyo -->
              @if (concept.materials.length > 0) {
                <div class="content-section">
                  <div class="content-section__label">Materiales de apoyo</div>

                  <!-- Archivos -->
                  @if (fileMaterials().length > 0) {
                    <h4 class="materials-subheading">
                      <span class="material-icons">folder</span> Archivos
                    </h4>
                    <div class="materials-grid">
                      @for (m of fileMaterials(); track m.materialId) {
                        <div class="material-card">
                          <div class="material-card__head">
                            <span class="material-icons material-card__icon">{{ materialIcon(m) }}</span>
                            <span class="material-card__title">{{ materialLabel(m) }}</span>
                          </div>
                          @if (m.fileSize) {
                            <span class="material-card__meta">{{ formatSize(m.fileSize) }}</span>
                          }
                          @if (m.previewAvailable) {
                            <div class="material-card__actions">
                              <button type="button" class="btn btn-primary btn-sm"
                                [disabled]="downloadingId() === m.materialId" (click)="previewFile(m)">
                                <span class="material-icons">visibility</span> Visualizar
                              </button>
                              <button type="button" class="btn btn-secondary btn-sm"
                                [disabled]="downloadingId() === m.materialId" (click)="downloadFile(m)">
                                <span class="material-icons">download</span> Descargar
                              </button>
                            </div>
                          } @else {
                            <p class="material-card__hint">
                              Este material contiene diapositivas. Puedes descargarlo para revisarlo.
                            </p>
                            <button type="button" class="btn btn-secondary btn-sm"
                              [disabled]="downloadingId() === m.materialId" (click)="downloadFile(m)">
                              <span class="material-icons">download</span> Descargar diapositivas
                            </button>
                          }
                        </div>
                      }
                    </div>
                  }

                  <!-- Enlaces -->
                  @if (linkMaterials().length > 0) {
                    <h4 class="materials-subheading">
                      <span class="material-icons">link</span> Enlaces de apoyo
                    </h4>
                    <div class="materials-grid">
                      @for (m of linkMaterials(); track m.materialId) {
                        <div class="material-card">
                          <div class="material-card__head">
                            <span class="material-icons material-card__icon">link</span>
                            <span class="material-card__title">{{ materialLabel(m) }}</span>
                          </div>
                          <p class="material-card__hint">Recurso externo de apoyo.</p>
                          <a class="btn btn-secondary btn-sm" [href]="m.url" target="_blank" rel="noopener noreferrer">
                            <span class="material-icons">open_in_new</span> Abrir enlace
                          </a>
                        </div>
                      }
                    </div>
                  }

                  <!-- Estado / visor del material seleccionado -->
                  @if (previewLoading()) {
                    <p class="material-card__hint">Cargando vista previa…</p>
                  }
                  @if (previewError()) {
                    <p class="material-preview__error">{{ previewError() }}</p>
                  }
                  @if (previewSafeUrl(); as safeUrl) {
                    <div class="material-preview">
                      <div class="material-preview__bar">
                        <span class="material-preview__name">
                          <span class="material-icons">picture_as_pdf</span>
                          {{ previewMaterial()?.originalFileName || 'Vista previa' }}
                        </span>
                        <div class="material-preview__tools">
                          <button type="button" class="btn btn-secondary btn-sm" (click)="openFullscreen()">
                            <span class="material-icons">fullscreen</span> Vista amplia
                          </button>
                          @if (previewMaterial(); as pm) {
                            <button type="button" class="btn btn-secondary btn-sm" (click)="downloadFile(pm)">
                              <span class="material-icons">download</span> Descargar
                            </button>
                          }
                          <button type="button" class="btn btn-ghost btn-sm" (click)="closePreview()"
                            aria-label="Cerrar vista previa">
                            <span class="material-icons">close</span>
                          </button>
                        </div>
                      </div>
                      <iframe class="material-preview__frame" [src]="safeUrl"
                        title="Vista previa del material"></iframe>
                    </div>
                  }
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
                  <button type="button" class="btn btn-primary" (click)="goToCompounds()">
                    Ir a formación de compuestos
                    <span class="material-icons">arrow_forward</span>
                  </button>
                </div>
              }
            </div>
          </section>
        }

        <!-- ════════ VISTA DE LISTADO ════════ -->
        @else {
          <header class="concepts-header">
            <h1 class="concepts-header__title">Contenidos conceptuales</h1>
            <p class="concepts-header__subtitle">
              Repasa los conceptos asignados por tu docente antes de formar compuestos químicos.
            </p>
          </header>

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

          <!-- Listado de conceptos a ancho completo -->
          <div class="concepts-list" role="list">
            @if (filtered().length > 0) {
              @for (concept of filtered(); track concept.id) {
                <button
                  type="button"
                  role="listitem"
                  class="concept-row"
                  (click)="selectConcept(concept.id)"
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
                      @if (materialCount(concept) > 0) {
                        <span class="concept-row__chip concept-row__chip--material">
                          <span class="material-icons">attach_file</span>
                          {{ materialCount(concept) }} material(es)
                        </span>
                      }
                      @for (ex of concept.examples.slice(0, 2); track ex) {
                        <span class="concept-row__chip">{{ truncate(ex, 24) }}</span>
                      }
                    </div>
                  </div>
                  <span class="material-icons concept-row__arrow">chevron_right</span>
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
        }
      </main>
    </div>

    <!-- ════════ MODAL: vista amplia del PDF ════════ -->
    @if (previewFullscreen()) {
      @if (previewSafeUrl(); as safeUrl) {
        <div class="pdf-modal" (click)="closeFullscreen()">
          <div class="pdf-modal__panel" (click)="$event.stopPropagation()">
            <div class="pdf-modal__bar">
              <span class="pdf-modal__name">
                <span class="material-icons">picture_as_pdf</span>
                {{ previewMaterial()?.originalFileName || 'Vista previa' }}
              </span>
              <div class="pdf-modal__tools">
                @if (previewMaterial(); as pm) {
                  <button type="button" class="btn btn-secondary btn-sm" (click)="downloadFile(pm)">
                    <span class="material-icons">download</span> Descargar
                  </button>
                }
                <button type="button" class="btn btn-secondary btn-sm" (click)="closeFullscreen()">
                  <span class="material-icons">close</span> Cerrar
                </button>
              </div>
            </div>
            <iframe class="pdf-modal__frame" [src]="safeUrl" title="Vista amplia del material"></iframe>
          </div>
        </div>
      }
    }
  `,
})
export class ConceptsComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly studentConceptsService = inject(StudentConceptsService);
  private readonly materialsService = inject(ConceptMaterialsService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly usageMetrics = inject(UsageMetricsService);

  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly concepts = signal<StudentConceptContentResponse[]>([]);

  readonly query = signal('');
  readonly activeCategory = signal<ConceptCategory | null>(null);
  readonly selectedId = signal<number | null>(null);

  // Vista previa de materiales (PDF/imágenes) y estado de descarga.
  readonly previewSafeUrl = signal<SafeResourceUrl | null>(null);
  readonly previewMaterial = signal<ConceptMaterialResponse | null>(null);
  readonly previewFullscreen = signal(false);
  readonly previewLoading = signal(false);
  readonly previewError = signal<string | null>(null);
  readonly downloadingId = signal<number | null>(null);

  // URL de objeto activa, necesaria para liberarla al cerrar/cambiar de contenido.
  private currentObjectUrl: string | null = null;

  readonly availableCategoryKeys = computed<ConceptCategory[]>(() => {
    const present = [...new Set(this.concepts().map((c) => c.category))];
    // Primero las clásicas en su orden preferente, luego las personalizadas alfabéticamente.
    const legacy = LEGACY_CATEGORY_ORDER.filter((k) => present.includes(k));
    const custom = present
      .filter((k) => !LEGACY_CATEGORY_ORDER.includes(k))
      .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    return [...legacy, ...custom];
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
        this.categoryLabel(c.category).toLowerCase().includes(q) ||
        (c.summary?.toLowerCase().includes(q) ?? false) ||
        (c.explanation?.toLowerCase().includes(q) ?? false) ||
        c.formationSteps.some((s) => s.toLowerCase().includes(q)) ||
        c.keyPoints.some((p) => p.toLowerCase().includes(q)) ||
        c.examples.some((e) => e.toLowerCase().includes(q)) ||
        (c.suggestedActivity?.toLowerCase().includes(q) ?? false)
      );
    });
  });

  readonly selectedConcept = computed<StudentConceptContentResponse | null>(() => {
    const id = this.selectedId();
    if (id === null) return null;
    return this.concepts().find((c) => c.id === id) ?? null;
  });

  // Materiales separados por tipo para la vista de detalle.
  readonly fileMaterials = computed<ConceptMaterialResponse[]>(
    () => this.selectedConcept()?.materials.filter((m) => m.type === 'FILE') ?? []
  );
  readonly linkMaterials = computed<ConceptMaterialResponse[]>(
    () => this.selectedConcept()?.materials.filter((m) => m.type === 'LINK') ?? []
  );

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
  }

  clearSearch(): void {
    this.query.set('');
  }

  setCategory(cat: ConceptCategory | null): void {
    this.activeCategory.set(cat);
  }

  selectConcept(id: number): void {
    this.clearPreview();
    this.selectedId.set(id);
    const concept = this.concepts().find((c) => c.id === id);
    if (concept) {
      this.usageMetrics.trackContentView(concept.id, concept.category);
    }
  }

  closeConcept(): void {
    this.selectedId.set(null);
    this.clearPreview();
  }

  resetFilters(): void {
    this.query.set('');
    this.activeCategory.set(null);
  }

  // ===========================================================================
  // Materiales de apoyo
  // ===========================================================================

  /** Previsualiza un PDF o imagen dentro del sistema usando un blob autenticado. */
  previewFile(material: ConceptMaterialResponse): void {
    const concept = this.selectedConcept();
    if (concept === null || material.type !== 'FILE') {
      return;
    }
    this.clearPreview();
    this.previewLoading.set(true);
    this.downloadingId.set(material.materialId);
    this.materialsService.downloadMaterial(concept.id, material.materialId).subscribe({
      next: (blob) => {
        this.downloadingId.set(null);
        this.previewLoading.set(false);
        const url = URL.createObjectURL(blob);
        this.currentObjectUrl = url;
        this.previewSafeUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
        this.previewMaterial.set(material);
      },
      error: () => {
        this.downloadingId.set(null);
        this.previewLoading.set(false);
        this.previewError.set('No se pudo cargar la vista previa. Intenta descargar el archivo.');
      },
    });
  }

  /** Descarga el archivo de un material como blob autenticado. */
  downloadFile(material: ConceptMaterialResponse): void {
    const concept = this.selectedConcept();
    if (concept === null || material.type !== 'FILE') {
      return;
    }
    this.downloadingId.set(material.materialId);
    this.previewError.set(null);
    this.materialsService.downloadMaterial(concept.id, material.materialId).subscribe({
      next: (blob) => {
        this.downloadingId.set(null);
        this.triggerDownload(blob, material.originalFileName ?? 'material');
      },
      error: () => {
        this.downloadingId.set(null);
        this.previewError.set('No se pudo descargar el material. Intenta nuevamente.');
      },
    });
  }

  /** Abre el visor del PDF a pantalla completa dentro del sistema. */
  openFullscreen(): void {
    if (this.previewSafeUrl() !== null) {
      this.previewFullscreen.set(true);
    }
  }

  closeFullscreen(): void {
    this.previewFullscreen.set(false);
  }

  closePreview(): void {
    this.clearPreview();
  }

  private clearPreview(): void {
    if (this.currentObjectUrl !== null) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
    this.previewSafeUrl.set(null);
    this.previewMaterial.set(null);
    this.previewFullscreen.set(false);
    this.previewLoading.set(false);
    this.previewError.set(null);
    this.downloadingId.set(null);
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

  materialCount(concept: StudentConceptContentResponse): number {
    return concept.materials.length;
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

  formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  ngOnDestroy(): void {
    this.clearPreview();
  }

  goToCompounds(): void {
    void this.router.navigateByUrl('/compounds');
  }

  handleLogout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
  }

  categoryLabel(cat: ConceptCategory): string {
    if (!cat) {
      return 'Sin categoría';
    }
    return LEGACY_CATEGORY_LABELS[cat] ?? cat;
  }

  private categoryVisual(cat: ConceptCategory): CategoryVisual {
    return CATEGORY_CONFIG[cat] ?? DEFAULT_CATEGORY_CONFIG;
  }

  conceptIcon(cat: ConceptCategory): string {
    return this.categoryVisual(cat).iconName;
  }

  conceptBg(cat: ConceptCategory): string {
    return this.categoryVisual(cat).tone.bg;
  }

  conceptFg(cat: ConceptCategory): string {
    return this.categoryVisual(cat).tone.fg;
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
