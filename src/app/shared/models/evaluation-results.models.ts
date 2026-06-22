/**
 * Modelos de resultados y calificaciones de evaluaciones.
 * Reflejan los DTOs del backend bajo /api/evaluations/teacher y /student
 * (TeacherEvaluationResultsResponse, TeacherStudentResultResponse,
 * TeacherAttemptResultDetailResponse, TeacherAnswerResultResponse,
 * StudentResultSummaryResponse, StudentAttemptResultDetailResponse,
 * StudentAnswerResultResponse).
 *
 * Regla de seguridad reflejada aquí: para el estudiante, `correctOptionText` y
 * `explanation` solo llegan con valor cuando `canViewDetailedFeedback` es true.
 * Por eso esos campos se modelan como opcionales/anulables.
 */

import { AttemptStatus } from './student-evaluation.models';

// ─── Docente ──────────────────────────────────────────────────────────────

/** Fila de resultado de un estudiante en una evaluación, vista por el docente. */
export interface TeacherStudentResultResponse {
  readonly attemptId: number;
  readonly studentId: number;
  readonly studentCode: string;
  readonly studentName: string;
  readonly grade: string;
  readonly section: string;
  readonly attemptNumber: number;
  readonly status: AttemptStatus;
  readonly score: number | null;
  readonly maxScore: number | null;
  readonly percentage: number | null;
  readonly submittedAt: string | null;
  readonly gradedAt: string | null;
}

/** Resultados de una evaluación: agregados + lista de intentos, para el docente. */
export interface TeacherEvaluationResultsResponse {
  readonly evaluationId: number;
  readonly title: string;
  readonly topic: string | null;
  readonly maxScore: number;
  readonly totalAttempts: number;
  readonly averageScore: number | null;
  readonly averagePercentage: number | null;
  readonly highestScore: number | null;
  readonly lowestScore: number | null;
  readonly approvedCount: number;
  readonly failedCount: number;
  readonly results: TeacherStudentResultResponse[];
}

/** Solo los agregados de una evaluación (endpoint /results/summary). */
export interface TeacherEvaluationResultsSummaryResponse {
  readonly evaluationId: number;
  readonly title: string;
  readonly topic: string | null;
  readonly maxScore: number;
  readonly totalAttempts: number;
  readonly averageScore: number | null;
  readonly averagePercentage: number | null;
  readonly highestScore: number | null;
  readonly lowestScore: number | null;
  readonly approvedCount: number;
  readonly failedCount: number;
}

/** Corrección de una pregunta dentro del detalle de un intento, para el docente. */
export interface TeacherAnswerResultResponse {
  readonly questionId: number;
  readonly questionText: string;
  readonly selectedOptionId: number | null;
  readonly selectedOptionText: string | null;
  readonly correctOptionId: number | null;
  readonly correctOptionText: string | null;
  readonly correct: boolean | null;
  readonly points: number;
  readonly pointsAwarded: number;
  readonly explanation: string | null;
}

/** Detalle del resultado de un intento de un estudiante, para el docente. */
export interface TeacherAttemptResultDetailResponse {
  readonly attemptId: number;
  readonly evaluationId: number;
  readonly evaluationTitle: string;
  readonly studentId: number;
  readonly studentCode: string;
  readonly studentName: string;
  readonly grade: string;
  readonly section: string;
  readonly attemptNumber: number;
  readonly status: AttemptStatus;
  readonly score: number | null;
  readonly maxScore: number | null;
  readonly percentage: number | null;
  readonly startedAt: string | null;
  readonly submittedAt: string | null;
  readonly gradedAt: string | null;
  readonly answers: TeacherAnswerResultResponse[];
}

// ─── Estudiante ───────────────────────────────────────────────────────────

/** Resumen de la calificación de un intento propio del estudiante. */
export interface StudentResultSummaryResponse {
  readonly attemptId: number;
  readonly evaluationId: number;
  readonly evaluationTitle: string;
  readonly topic: string | null;
  readonly attemptNumber: number;
  readonly status: AttemptStatus;
  readonly score: number | null;
  readonly maxScore: number | null;
  readonly percentage: number | null;
  readonly submittedAt: string | null;
  readonly canViewDetailedFeedback: boolean;
  readonly attemptsUsed: number;
  readonly maxAttempts: number;
}

/**
 * Corrección de una pregunta dentro del resultado, para el estudiante.
 * `correctOptionText` y `explanation` solo traen valor cuando el backend autoriza la
 * retroalimentación detallada; en caso contrario llegan en null.
 */
export interface StudentAnswerResultResponse {
  readonly questionId: number;
  readonly questionText: string;
  readonly selectedOptionText: string | null;
  readonly correct: boolean | null;
  readonly points: number;
  readonly pointsAwarded: number;
  readonly correctOptionText: string | null;
  readonly explanation: string | null;
}

/** Detalle del resultado de un intento propio del estudiante. */
export interface StudentAttemptResultDetailResponse {
  readonly attemptId: number;
  readonly evaluationId: number;
  readonly evaluationTitle: string;
  readonly topic: string | null;
  readonly attemptNumber: number;
  readonly status: AttemptStatus;
  readonly score: number | null;
  readonly maxScore: number | null;
  readonly percentage: number | null;
  readonly submittedAt: string | null;
  readonly canViewDetailedFeedback: boolean;
  readonly answers: StudentAnswerResultResponse[];
}
