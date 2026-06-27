/**
 * Modelos del módulo de evaluaciones del estudiante.
 * Reflejan los DTOs del backend bajo /api/evaluations/student
 * (StudentEvaluationResponse, StudentEvaluationDetailResponse,
 * StudentQuestionResponse, StudentOptionResponse, StartEvaluationAttemptRequest,
 * SubmitEvaluationAnswerRequest, SubmitEvaluationAttemptRequest, AttemptResponse).
 *
 * Importante: la vista del estudiante NUNCA expone cuál es la alternativa correcta.
 * Por eso estos modelos no incluyen el campo `correct`: aunque el backend lo
 * rellene tras enviar el intento, el frontend no lo modela ni lo muestra.
 */

import { QuestionDisplayMode, QuestionType } from './evaluation.models';

/** Estado de un intento de evaluación. */
export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED';

/**
 * Tipo de evento de trazabilidad de un intento. El frontend solo reporta incidencias de
 * foco, intento de salida y uso de herramientas; los hitos del ciclo de vida
 * (`ATTEMPT_*`, `TIME_EXPIRED`) los registra el backend y aparecen al consultar la
 * trazabilidad como docente.
 */
export type AttemptEventType =
  | 'TAB_HIDDEN'
  | 'TAB_VISIBLE'
  | 'WINDOW_BLUR'
  | 'WINDOW_FOCUS'
  | 'NAVIGATION_BLOCKED'
  | 'TOOL_OPENED'
  | 'TOOL_RETURNED'
  | 'EXIT_ATTEMPTED'
  | 'ATTEMPT_STARTED'
  | 'ATTEMPT_SUBMITTED'
  | 'TIME_EXPIRED'
  | 'ATTEMPT_EXITED';

/** Herramienta de apoyo permitida que el estudiante puede abrir durante un intento. */
export type AttemptTool = 'PERIODIC_TABLE' | 'COMPOUND_FORMATION';

// ─── Responses ──────────────────────────────────────────────────────────────

/** Vista resumida de una evaluación disponible para el estudiante. */
export interface StudentEvaluationResponse {
  readonly id: number;
  readonly title: string;
  readonly description: string | null;
  readonly instructions: string | null;
  readonly topic: string | null;
  readonly timeLimitMinutes: number | null;
  readonly maxAttempts: number;
  readonly allowChemicalCalculator: boolean;
  readonly allowPeriodicTable: boolean;
  readonly trackTabExit: boolean;
  readonly questionDisplayMode: QuestionDisplayMode;
  readonly randomizeQuestions: boolean;
  readonly questionCount: number;
  readonly assignmentId: number;
  readonly startAt: string | null;
  readonly dueAt: string | null;
  /** Estado del último intento del estudiante; null si aún no ha rendido. */
  readonly attemptStatus: AttemptStatus | null;
  readonly attemptsUsed: number;
}

/** Alternativa vista por el estudiante. No incluye el campo `correct`. */
export interface StudentOptionResponse {
  readonly id: number;
  readonly optionText: string;
  readonly orderIndex: number;
}

/** Pregunta vista por el estudiante, con sus alternativas y sin la respuesta correcta. */
export interface StudentQuestionResponse {
  readonly id: number;
  readonly questionText: string;
  readonly questionType: QuestionType;
  readonly points: number;
  readonly orderIndex: number;
  readonly options: StudentOptionResponse[];
}

/** Detalle de una evaluación asignada, con sus preguntas. */
export interface StudentEvaluationDetailResponse {
  readonly id: number;
  readonly title: string;
  readonly description: string | null;
  readonly instructions: string | null;
  readonly topic: string | null;
  readonly timeLimitMinutes: number | null;
  readonly allowChemicalCalculator: boolean;
  readonly allowPeriodicTable: boolean;
  readonly trackTabExit: boolean;
  readonly questionDisplayMode: QuestionDisplayMode;
  readonly randomizeQuestions: boolean;
  readonly questions: StudentQuestionResponse[];
  readonly assignmentId: number;
}

/**
 * Respuesta registrada dentro de un intento. De forma deliberada NO se modelan
 * los campos `correct` ni `pointsAwarded`: el estudiante no debe conocer la
 * corrección antes de la sesión de resultados.
 */
export interface StudentAnswerResponse {
  readonly id: number;
  readonly questionId: number;
  readonly selectedOptionId: number | null;
  readonly answeredAt: string;
}

/** Intento de evaluación del estudiante, con sus respuestas guardadas. */
export interface AttemptResponse {
  readonly id: number;
  readonly evaluationId: number;
  readonly assignmentId: number | null;
  readonly status: AttemptStatus;
  readonly attemptNumber: number;
  readonly startedAt: string;
  readonly submittedAt: string | null;
  /** Orden de las preguntas fijado para este intento (IDs). */
  readonly questionOrder: number[];
  /** Modo una por una: índice de la pregunta actual; las anteriores quedan bloqueadas. */
  readonly currentQuestionIndex: number;
  /** Si el estudiante puede usar el módulo de Formación de compuestos durante este intento. */
  readonly allowChemicalCalculator: boolean;
  /** Si el estudiante puede usar el módulo de Tabla periódica durante este intento. */
  readonly allowPeriodicTable: boolean;
  readonly answers: StudentAnswerResponse[];
}

// ─── Requests ───────────────────────────────────────────────────────────────

/**
 * Cuerpo opcional al iniciar un intento. La asignación la resuelve el backend a
 * partir del grado/sección del estudiante autenticado, por lo que puede omitirse.
 */
export interface StartEvaluationAttemptRequest {
  readonly assignmentId?: number | null;
}

/** Respuesta del estudiante a una pregunta de alternativa única. */
export interface SubmitEvaluationAnswerRequest {
  readonly questionId: number;
  /** Alternativa elegida. Puede ser null si se deja la pregunta en blanco. */
  readonly selectedOptionId: number | null;
}

/** Envío de un intento. Las respuestas son opcionales (pueden haberse guardado antes). */
export interface SubmitEvaluationAttemptRequest {
  readonly answers?: SubmitEvaluationAnswerRequest[];
}

/**
 * Cuerpo para reportar un evento de trazabilidad durante un intento: incidencia de foco
 * (solo si la evaluación tiene activada la detección de salida de pestaña), intento de
 * salida (`EXIT_ATTEMPTED`) o uso de una herramienta permitida (`TOOL_OPENED`/
 * `TOOL_RETURNED`). Solo admite metadata segura: la herramienta y un `source` corto que el
 * backend sanitiza. Nunca se envían respuestas, claves ni datos sensibles.
 */
export interface RegisterAttemptEventRequest {
  readonly eventType: AttemptEventType;
  readonly description?: string;
  /** Herramienta abierta (solo para TOOL_OPENED/TOOL_RETURNED). */
  readonly tool?: AttemptTool;
  /** Origen del evento (etiqueta corta, p. ej. BUTTON_EXIT, VISIBILITY_CHANGE). */
  readonly source?: string;
}

/** Resumen devuelto tras reportar una incidencia de foco. */
export interface AttemptEventSummaryResponse {
  readonly attemptId: number;
  /** true si el evento se registró; false si se descartó por duplicado/throttling. */
  readonly recorded: boolean;
  readonly totalEvents: number;
  /** Cantidad de "salidas" (pestaña oculta o ventana sin foco) del intento. */
  readonly tabExitCount: number;
}
