import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TitleCasePipe } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { SidebarComponent, SidebarNavItem } from '../../shared/components/sidebar/sidebar.component';
import { UserRole } from '../../shared/models';
import {
  PERIODIC_ELEMENTS,
  PeriodicElement,
  ValenceOption,
  valencesForElement,
} from '../periodic-table/data/elements-data';
import { ChemicalEngineService } from './services/chemical-engine.service';
import { CompoundResponse, CompoundType } from './models/chemistry.models';
import {
  ANION_OPTIONS,
  AnionOption,
  OXACID_GROUP_OPTIONS,
  OxacidGroupOption,
} from './data/compound-options';

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

@Component({
  selector: 'app-compounds',
  standalone: true,
  imports: [SidebarComponent, TitleCasePipe],
  styleUrls: ['./compounds.component.scss'],
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
          <form class="cmp-card" (ngSubmit)="onSubmit()">
            <div class="cmp-card__head">
              <h2 class="cmp-card__title">Configura el compuesto</h2>
              <p class="cmp-card__desc">
                Selecciona los reactivos y revisa el resultado en el panel de la derecha.
              </p>
            </div>

            <!-- Elemento / metal (óxidos, hidróxidos, sales, oxisales) -->
            @if (needsElement()) {
              <div class="field">
                <label class="form-label" [attr.for]="'element-select'">{{ elementLabel() }}</label>
                <select
                  id="element-select"
                  class="select"
                  [value]="elementSymbol()"
                  (change)="onElementChange($event)"
                >
                  <option value="">Selecciona un elemento</option>
                  @for (el of elements; track el.atomicNumber) {
                    <option [value]="el.symbol">{{ el.symbol }} — {{ el.name }}</option>
                  }
                </select>
              </div>

              @if (selectedElement()) {
                <div class="field">
                  <label class="form-label">{{ valenceLabel() }}</label>
                  @if (availableValences().length > 0) {
                    <div class="valence-pills" role="group" [attr.aria-label]="valenceLabel()">
                      @for (v of availableValences(); track v.label) {
                        <button
                          type="button"
                          class="valence-pill"
                          [class.valence-pill--active]="valence() === v.value"
                          (click)="selectValence(v.value)"
                        >
                          {{ v.label }}
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

            <!-- Anión (ácidos y sales binarias) -->
            @if (needsAnion()) {
              <div class="field">
                <label class="form-label" for="anion-select">
                  {{ selectedType() === 'acids' ? 'No metal' : 'No metal / Anión' }}
                </label>
                <select
                  id="anion-select"
                  class="select"
                  [value]="anionIndex() ?? ''"
                  (change)="onAnionChange($event)"
                >
                  <option value="">Selecciona un anión</option>
                  @for (a of anions; track a.symbol; let i = $index) {
                    <option [value]="i">
                      {{ a.anionName | titlecase }} ({{ a.symbol }}) — carga -{{ a.charge }}
                    </option>
                  }
                </select>
              </div>
            }

            <!-- Grupo oxácido (oxisales) -->
            @if (needsGroup()) {
              <div class="field">
                <label class="form-label" for="group-select">Grupo oxácido</label>
                <select
                  id="group-select"
                  class="select"
                  [value]="groupIndex() ?? ''"
                  (change)="onGroupChange($event)"
                >
                  <option value="">Selecciona un grupo</option>
                  @for (g of groups; track g.formula; let i = $index) {
                    <option [value]="i">
                      {{ g.name | titlecase }} ({{ g.formula }}) — carga -{{ g.charge }}
                    </option>
                  }
                </select>
              </div>
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
                [disabled]="status() === 'loading'"
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

                  @if (r.explanation) {
                    <div class="result__explain">
                      <div class="result__explain-title">¿Cómo se formó?</div>
                      <p class="result__explain-text">{{ r.explanation }}</p>
                    </div>
                  }
                }
              }
              @default {
                <div class="result__placeholder">
                  <span class="material-icons">science</span>
                  <p>Configura el compuesto y presiona «Formar compuesto» para ver el resultado.</p>
                </div>
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

  readonly compoundTypes = COMPOUND_TYPES;
  readonly elements: readonly PeriodicElement[] = PERIODIC_ELEMENTS;
  readonly anions: readonly AnionOption[] = ANION_OPTIONS;
  readonly groups: readonly OxacidGroupOption[] = OXACID_GROUP_OPTIONS;

  // ===== Estado del formulario =====
  readonly selectedType = signal<CompoundType>('oxides');
  readonly elementSymbol = signal<string>('');
  readonly valence = signal<number | null>(null);
  readonly anionIndex = signal<number | null>(null);
  readonly groupIndex = signal<number | null>(null);

  readonly formError = signal<string>('');
  readonly status = signal<FormStatus>('idle');
  readonly result = signal<CompoundResponse | null>(null);
  readonly errorMessage = signal<string>('');

  /** Elemento seleccionado actualmente (o null). */
  readonly selectedElement = computed<PeriodicElement | null>(() => {
    const symbol = this.elementSymbol();
    if (symbol === '') {
      return null;
    }
    return this.elements.find((el) => el.symbol === symbol) ?? null;
  });

  /** Valencias registradas del elemento seleccionado (vacío si no hay datos). */
  readonly availableValences = computed<readonly ValenceOption[]>(() => {
    const element = this.selectedElement();
    return element === null ? [] : valencesForElement(element.atomicNumber);
  });

  // ===== Campos requeridos según el tipo =====
  readonly needsElement = computed<boolean>(() => this.selectedType() !== 'acids');
  readonly needsAnion = computed<boolean>(
    () => this.selectedType() === 'acids' || this.selectedType() === 'salts'
  );
  readonly needsGroup = computed<boolean>(() => this.selectedType() === 'oxisalts');

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

  selectType(type: CompoundType): void {
    if (type === this.selectedType()) {
      return;
    }
    this.selectedType.set(type);
    this.resetForm();
  }

  onElementChange(event: Event): void {
    this.elementSymbol.set((event.target as HTMLSelectElement).value);
    // Si el elemento tiene una única valencia registrada, se selecciona sola.
    const valences = this.availableValences();
    this.valence.set(valences.length === 1 ? valences[0].value : null);
  }

  selectValence(value: number): void {
    this.valence.set(value);
  }

  onValenceInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.valence.set(raw === '' ? null : Number(raw));
  }

  onAnionChange(event: Event): void {
    const raw = (event.target as HTMLSelectElement).value;
    this.anionIndex.set(raw === '' ? null : Number(raw));
  }

  onGroupChange(event: Event): void {
    const raw = (event.target as HTMLSelectElement).value;
    this.groupIndex.set(raw === '' ? null : Number(raw));
  }

  resetForm(): void {
    this.elementSymbol.set('');
    this.valence.set(null);
    this.anionIndex.set(null);
    this.groupIndex.set(null);
    this.formError.set('');
    this.status.set('idle');
    this.result.set(null);
    this.errorMessage.set('');
  }

  onSubmit(): void {
    this.formError.set('');

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

    request$.subscribe({
      next: (response) => {
        if (response.valid) {
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
      return this.selectedAnion() === null ? 'Selecciona el anión o no metal.' : null;
    }

    // Resto de tipos requieren elemento + valencia
    if (this.selectedElement() === null) {
      return 'Selecciona un elemento.';
    }
    const valence = this.valence();
    if (valence === null || valence < 1) {
      return 'Selecciona una valencia para el elemento.';
    }

    if (type === 'salts' && this.selectedAnion() === null) {
      return 'Selecciona el anión o no metal.';
    }
    if (type === 'oxisalts' && this.selectedGroup() === null) {
      return 'Selecciona un grupo oxácido.';
    }

    return null;
  }

  /** Construye y devuelve la llamada al motor químico, o null si faltan datos. */
  private buildRequest() {
    const type = this.selectedType();

    if (type === 'oxides' || type === 'hydroxides') {
      const element = this.selectedElement();
      const valence = this.valence();
      if (element === null || valence === null || valence < 1) {
        return null;
      }
      const request = {
        elementSymbol: element.symbol,
        elementName: element.name.toLowerCase(),
        valence,
      };
      return type === 'oxides'
        ? this.engine.generateOxide(request)
        : this.engine.generateHydroxide(request);
    }

    if (type === 'acids') {
      const anion = this.selectedAnion();
      if (anion === null) {
        return null;
      }
      return this.engine.generateAcid({
        anionFormula: anion.symbol,
        anionName: anion.anionName,
        anionCharge: anion.charge,
        acidName: anion.acidName,
      });
    }

    if (type === 'salts') {
      const element = this.selectedElement();
      const valence = this.valence();
      const anion = this.selectedAnion();
      if (element === null || valence === null || valence < 1 || anion === null) {
        return null;
      }
      return this.engine.generateSalt({
        metalSymbol: element.symbol,
        metalName: element.name.toLowerCase(),
        metalValence: valence,
        nonMetalSymbol: anion.symbol,
        anionName: anion.anionName,
        anionCharge: anion.charge,
      });
    }

    // oxisalts
    const element = this.selectedElement();
    const valence = this.valence();
    const group = this.selectedGroup();
    if (element === null || valence === null || valence < 1 || group === null) {
      return null;
    }
    return this.engine.generateOxisalt({
      metalSymbol: element.symbol,
      metalName: element.name.toLowerCase(),
      metalValence: valence,
      groupFormula: group.formula,
      groupName: group.name,
      groupCharge: group.charge,
    });
  }

  private selectedAnion(): AnionOption | null {
    const i = this.anionIndex();
    return i === null ? null : this.anions[i] ?? null;
  }

  private selectedGroup(): OxacidGroupOption | null {
    const i = this.groupIndex();
    return i === null ? null : this.groups[i] ?? null;
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
}

function buildNavItems(role: UserRole | null): readonly SidebarNavItem[] {
  switch (role) {
    case 'DOCENTE':
      return [
        { label: 'Inicio', icon: 'home', route: '/teacher-dashboard' },
        { label: 'Mis estudiantes', icon: 'group', route: '/teacher/students' },
        { label: 'Tabla periódica', icon: 'science', route: '/periodic-table' },
        { label: 'Formación de compuestos', icon: 'biotech', route: '/compounds' },
        { label: 'Restablecer contraseñas', icon: 'lock_reset', route: '/teacher/passwords' },
      ];
    case 'ADMINISTRADOR':
      return [
        { label: 'Inicio', icon: 'home', route: '/admin-dashboard' },
        { label: 'Gestión de docentes', icon: 'badge', route: '/admin/teachers' },
        { label: 'Elementos químicos', icon: 'table_chart', route: '/periodic-table' },
        { label: 'Formación de compuestos', icon: 'biotech', route: '/compounds' },
      ];
    default:
      return [
        { label: 'Inicio', icon: 'home', route: '/student-dashboard' },
        { label: 'Tabla periódica', icon: 'science', route: '/periodic-table' },
        { label: 'Conceptos químicos', icon: 'menu_book', route: '/student-dashboard/concepts', disabled: true },
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
