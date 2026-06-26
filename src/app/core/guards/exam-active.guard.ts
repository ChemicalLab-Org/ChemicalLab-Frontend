import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { ExamSessionService } from '../services/exam-session.service';

/**
 * Impide navegar a otros módulos mientras hay un intento de evaluación en curso.
 *
 * Si el estudiante intenta salir (clic en un enlace o URL manual) durante un intento
 * activo, se le redirige a la pantalla de evaluaciones (donde está su intento) en lugar
 * de permitir abandonar el examen. No bloquea login/logout: solo se aplica a los módulos
 * del estudiante. Es un control dentro de la aplicación, no un bloqueo del navegador.
 */
export const examActiveGuard: CanActivateFn = (): boolean | UrlTree => {
  const exam = inject(ExamSessionService);
  const router = inject(Router);

  if (exam.isActive()) {
    return router.parseUrl('/evaluations');
  }
  return true;
};
