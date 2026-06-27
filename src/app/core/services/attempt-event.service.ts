import { Injectable, inject } from '@angular/core';
import { ExamSessionService } from './exam-session.service';
import { StudentEvaluationsService } from './student-evaluations.service';
import { AttemptTool, RegisterAttemptEventRequest } from '../../shared/models';

/**
 * Servicio reutilizable para reportar eventos de trazabilidad del intento que no necesitan
 * respuesta en la UI: uso de herramientas permitidas e intento de salida. Toma el intento
 * activo del {@link ExamSessionService}, de modo que cualquier componente (intento,
 * formación de compuestos, tabla periódica) pueda registrar el evento con una sola llamada.
 *
 * El envío es **silencioso y tolerante a errores**: nunca interrumpe el intento ni muestra
 * errores técnicos al estudiante. Solo viaja metadata segura (herramienta y un origen
 * corto); jamás respuestas, claves ni datos sensibles. Si no hay un intento activo, no
 * hace nada.
 */
@Injectable({ providedIn: 'root' })
export class AttemptEventService {
  private readonly exam = inject(ExamSessionService);
  private readonly evaluations = inject(StudentEvaluationsService);

  /** Registra que el estudiante abrió una herramienta permitida durante el intento. */
  toolOpened(tool: AttemptTool): void {
    this.fire({ eventType: 'TOOL_OPENED', tool });
  }

  /** Registra que el estudiante volvió al intento desde una herramienta. */
  toolReturned(tool: AttemptTool): void {
    this.fire({ eventType: 'TOOL_RETURNED', tool });
  }

  /** Registra que el estudiante pulsó "Salir del intento" (intención de salida). */
  exitAttempted(): void {
    this.fire({ eventType: 'EXIT_ATTEMPTED', source: 'BUTTON_EXIT' });
  }

  private fire(request: RegisterAttemptEventRequest): void {
    const attemptId = this.exam.attemptId();
    if (attemptId === null) {
      return;
    }
    this.evaluations.registerAttemptEvent(attemptId, request).subscribe({
      error: () => {
        /* silencioso: la trazabilidad nunca interrumpe el intento */
      },
    });
  }
}
