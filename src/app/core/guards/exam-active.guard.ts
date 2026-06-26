import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { ExamSessionService } from '../services/exam-session.service';

/**
 * Controla la navegación mientras hay un intento de evaluación en curso.
 *
 * Durante un intento activo solo se permite entrar a las herramientas de apoyo que el
 * docente habilitó: Formación de compuestos (`/compounds`) si la calculadora está
 * permitida y Tabla periódica (`/periodic-table`) si está permitida. Cualquier otra ruta
 * —o una herramienta no permitida, incluso por URL manual— redirige de vuelta al intento
 * (`/evaluations`), en lugar de dejar abandonar el examen.
 *
 * Es un control dentro de la aplicación, no un bloqueo del navegador. No afecta a docentes
 * ni administradores: para ellos nunca hay un intento activo.
 */
export const examActiveGuard: CanActivateFn = (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): boolean | UrlTree => {
  const exam = inject(ExamSessionService);
  const router = inject(Router);

  if (!exam.isActive()) {
    return true;
  }

  const path = state.url.split('?')[0].split('#')[0];
  if (path.startsWith('/compounds') && exam.calculatorAllowed()) {
    return true;
  }
  if (path.startsWith('/periodic-table') && exam.periodicTableAllowed()) {
    return true;
  }
  return router.parseUrl('/evaluations');
};
