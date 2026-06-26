import { Injectable, computed, signal } from '@angular/core';

/**
 * Contexto del intento de evaluación en curso. Guarda qué herramientas (módulos de
 * apoyo existentes) puede usar el estudiante durante el examen.
 */
export interface ExamSessionContext {
  readonly attemptId: number;
  readonly evaluationId: number;
  /** Permite usar el módulo de Formación de compuestos (`/compounds`) durante el intento. */
  readonly allowChemicalCalculator: boolean;
  /** Permite usar el módulo de Tabla periódica (`/periodic-table`) durante el intento. */
  readonly allowPeriodicTable: boolean;
}

/**
 * Estado global de "intento de evaluación en curso".
 *
 * Mientras hay un intento activo, el estudiante no navega libremente: la barra lateral
 * se reemplaza por un menú de examen (volver al intento, herramientas permitidas y salir)
 * y el {@link examActiveGuard} solo deja entrar a las herramientas habilitadas; cualquier
 * otra ruta vuelve al intento.
 *
 * Es un control de navegación **dentro de la SPA**, no un bloqueo del navegador. El
 * estado es en memoria: si el estudiante recarga, vuelve a la lista de evaluaciones y
 * debe retomar el intento explícitamente (el intento sigue vivo en el backend).
 */
@Injectable({ providedIn: 'root' })
export class ExamSessionService {
  private readonly context = signal<ExamSessionContext | null>(null);

  /** true mientras hay un intento en curso. */
  readonly active = computed(() => this.context() !== null);
  readonly attemptId = computed<number | null>(() => this.context()?.attemptId ?? null);
  readonly evaluationId = computed<number | null>(() => this.context()?.evaluationId ?? null);
  readonly calculatorAllowed = computed(() => this.context()?.allowChemicalCalculator === true);
  readonly periodicTableAllowed = computed(() => this.context()?.allowPeriodicTable === true);

  start(context: ExamSessionContext): void {
    this.context.set(context);
  }

  end(): void {
    this.context.set(null);
  }

  isActive(): boolean {
    return this.context() !== null;
  }
}
