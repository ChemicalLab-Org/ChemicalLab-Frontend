/**
 * Modelos de la trazabilidad de un intento para la vista del docente.
 * Reflejan los DTOs del backend `AttemptTraceabilityResponse` y `AttemptEventResponse`
 * de `GET /api/evaluations/teacher/attempts/{attemptId}/traceability`.
 *
 * Es trazabilidad del comportamiento del intento (tiempo usado, salidas de pestaña, uso
 * de herramientas, estado final), separada de los logs generales de auditoría. Nunca
 * incluye respuestas correctas, claves ni datos sensibles.
 */

import { AttemptEventType } from './student-evaluation.models';
import { AttemptStatus } from './student-evaluation.models';

/** Evento individual de la línea de tiempo de un intento. */
export interface AttemptEventResponse {
  readonly id: number;
  readonly eventType: AttemptEventType;
  readonly description: string | null;
  /** Metadata segura del evento (p. ej. "tool=PERIODIC_TABLE"); puede ser null. */
  readonly metadata: string | null;
  readonly occurredAt: string;
}

/** Resumen de trazabilidad de un intento más su línea de tiempo de eventos. */
export interface AttemptTraceabilityResponse {
  readonly attemptId: number;
  readonly evaluationId: number;
  readonly evaluationTitle: string;
  readonly studentId: number;
  readonly studentCode: string;
  readonly studentName: string;
  readonly finalStatus: AttemptStatus;
  readonly startedAt: string | null;
  readonly submittedAt: string | null;
  /** Tiempo usado en segundos, calculado en el backend con los timestamps del intento. */
  readonly timeUsedSeconds: number | null;
  readonly trackTabExit: boolean;
  readonly totalEvents: number;
  /** Salidas de pestaña/ventana (TAB_HIDDEN + WINDOW_BLUR). */
  readonly tabExitCount: number;
  /** Regresos a la pestaña/ventana (TAB_VISIBLE + WINDOW_FOCUS). */
  readonly tabReturnCount: number;
  /** Veces que el estudiante intentó salir del intento (EXIT_ATTEMPTED). */
  readonly exitAttemptCount: number;
  /** Herramientas permitidas consultadas (p. ej. ["PERIODIC_TABLE"]). */
  readonly toolsUsed: string[];
  /** Línea de tiempo cronológica de eventos del intento. */
  readonly events: AttemptEventResponse[];
}
