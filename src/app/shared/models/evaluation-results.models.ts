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
import { QuestionType } from './evaluation.models';

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
  /** Cantidad de salidas de pestaña detectadas en el intento (0 si no aplica). */
  readonly tabExitCount: number;
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
  readonly questionType: QuestionType;
  readonly selectedOptionId: number | null;
  readonly selectedOptionText: string | null;
  readonly correctOptionId: number | null;
  readonly correctOptionText: string | null;
  /** Texto del estudiante en preguntas abiertas. */
  readonly answerText: string | null;
  readonly correct: boolean | null;
  readonly points: number;
  /** Puntaje obtenido; null en una abierta aún no revisada. */
  readonly pointsAwarded: number | null;
  readonly reviewed: boolean;
  readonly teacherFeedback: string | null;
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
  /** Cantidad de salidas de pestaña detectadas en el intento (0 si no aplica). */
  readonly tabExitCount: number;
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
  readonly questionType: QuestionType;
  readonly selectedOptionText: string | null;
  /** Texto propio del estudiante en preguntas abiertas. */
  readonly answerText: string | null;
  readonly correct: boolean | null;
  readonly points: number;
  /** Puntaje obtenido; null en una abierta aún no revisada por el docente. */
  readonly pointsAwarded: number | null;
  readonly reviewed: boolean;
  /** Retroalimentación del docente; solo llega tras revisar la respuesta abierta. */
  readonly teacherFeedback: string | null;
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

// ─── Revisión manual (docente) ──────────────────────────────────────────────

/** Fila de la bandeja de intentos pendientes de revisión manual. */
export interface PendingReviewAttemptResponse {
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
  readonly submittedAt: string | null;
  readonly openQuestionCount: number;
  readonly pendingOpenCount: number;
}

/** Respuesta abierta a revisar por el docente. */
export interface TeacherReviewAnswerResponse {
  /** null si el estudiante no dejó respuesta (igual debe calificarse). */
  readonly answerId: number | null;
  readonly questionId: number;
  readonly questionText: string;
  readonly maxPoints: number;
  /** Criterio de corrección (solo docente). */
  readonly expectedAnswer: string | null;
  readonly answerText: string | null;
  readonly reviewed: boolean;
  readonly awardedScore: number | null;
  readonly teacherFeedback: string | null;
}

/** Detalle de un intento para la revisión manual del docente. */
export interface TeacherAttemptReviewResponse {
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
  /** Puntaje provisional: alternativa única + abiertas ya revisadas. */
  readonly score: number | null;
  readonly maxScore: number | null;
  readonly submittedAt: string | null;
  readonly gradedAt: string | null;
  readonly pendingOpenCount: number;
  readonly openAnswers: TeacherReviewAnswerResponse[];
}

/** Calificación manual que el docente asigna a una respuesta abierta. */
export interface ManualGradeRequest {
  readonly score: number;
  readonly feedback?: string | null;
}
