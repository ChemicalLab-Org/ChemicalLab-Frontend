import { Injectable, signal } from '@angular/core';

/**
 * Estado global de "intento de evaluación en curso".
 *
 * Mientras hay un intento activo, el estudiante no debe navegar libremente a otros
 * módulos: la vista de intento usa un layout de examen sin barra lateral y el
 * {@link examActiveGuard} impide salir a otras rutas dentro de la aplicación.
 *
 * Es un control de navegación **dentro de la SPA**, no un bloqueo del navegador. El
 * estado es en memoria: si el estudiante recarga, vuelve a la lista de evaluaciones y
 * debe retomar el intento explícitamente.
 */
@Injectable({ providedIn: 'root' })
export class ExamSessionService {
  /** true mientras la vista de rendición está activa. */
  readonly active = signal(false);

  start(): void {
    this.active.set(true);
  }

  end(): void {
    this.active.set(false);
  }

  isActive(): boolean {
    return this.active();
  }
}
