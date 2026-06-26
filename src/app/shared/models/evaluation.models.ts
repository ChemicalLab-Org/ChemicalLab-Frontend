/**
 * Modelos del módulo de evaluaciones del docente.
 * Reflejan los DTOs del backend bajo /api/evaluations/teacher
 * (CreateEvaluationRequest, UpdateEvaluationRequest, CreateQuestionRequest,
 * UpdateQuestionRequest, CreateOptionRequest, AssignEvaluationRequest,
 * EvaluationResponse, EvaluationDetailResponse, QuestionResponse, OptionResponse,
 * EvaluationAssignmentResponse).
 */

/** Estado del ciclo de vida de una evaluación. */
export type EvaluationStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/** Tipo de pregunta. En el MVP solo se admite alternativa única. */
export type QuestionType = 'MULTIPLE_CHOICE';

/** Modo de presentación de las preguntas durante el intento. */
export type QuestionDisplayMode = 'ALL_AT_ONCE' | 'ONE_BY_ONE';

// ─── Requests ───────────────────────────────────────────────────────────────

/** Payload para crear una evaluación (queda en estado DRAFT). */
export interface CreateEvaluationRequest {
  readonly title: string;
  readonly description?: string;
  readonly instructions?: string;
  readonly topic?: string;
  readonly maxAttempts: number;
  readonly timeLimitMinutes?: number | null;
  /** Configuración avanzada del intento. */
  readonly allowChemicalCalculator?: boolean;
  readonly trackTabExit?: boolean;
  readonly questionDisplayMode?: QuestionDisplayMode;
  readonly randomizeQuestions?: boolean;
}

/** Payload para actualizar los datos generales de una evaluación. */
export type UpdateEvaluationRequest = CreateEvaluationRequest;

/** Payload de una alternativa de pregunta. */
export interface CreateOptionRequest {
  readonly optionText: string;
  readonly correct: boolean;
  readonly orderIndex?: number;
}

/** Payload para agregar una pregunta con sus alternativas. */
export interface CreateQuestionRequest {
  readonly questionText: string;
  readonly questionType: QuestionType;
  readonly points: number;
  readonly orderIndex?: number;
  readonly explanation?: string;
  readonly options: CreateOptionRequest[];
}

/** Payload para editar una pregunta y sus alternativas. */
export type UpdateQuestionRequest = CreateQuestionRequest;

/** Payload para asignar una evaluación a un grado/sección. */
export interface AssignEvaluationRequest {
  readonly grade: string;
  readonly section: string;
  /** Ventana de disponibilidad opcional (formato LocalDateTime: yyyy-MM-ddTHH:mm). */
  readonly startAt?: string | null;
  readonly dueAt?: string | null;
}

// ─── Responses ──────────────────────────────────────────────────────────────

/** Alternativa de una pregunta vista por el docente. */
export interface OptionResponse {
  readonly id: number;
  readonly optionText: string;
  readonly correct: boolean;
  readonly orderIndex: number;
}

/** Pregunta con sus alternativas, vista por el docente. */
export interface QuestionResponse {
  readonly id: number;
  readonly questionText: string;
  readonly questionType: QuestionType;
  readonly points: number;
  readonly orderIndex: number;
  readonly explanation: string | null;
  readonly options: OptionResponse[];
}

/** Asignación de una evaluación a un grado/sección. */
export interface EvaluationAssignmentResponse {
  readonly id: number;
  readonly grade: string;
  readonly section: string;
  readonly startAt: string | null;
  readonly dueAt: string | null;
  readonly active: boolean;
  readonly assignedAt: string;
}

/** Vista resumida de una evaluación para la lista del docente. */
export interface EvaluationResponse {
  readonly id: number;
  readonly title: string;
  readonly description: string | null;
  readonly instructions: string | null;
  readonly topic: string | null;
  readonly status: EvaluationStatus;
  readonly maxAttempts: number;
  readonly timeLimitMinutes: number | null;
  readonly allowChemicalCalculator: boolean;
  readonly trackTabExit: boolean;
  readonly questionDisplayMode: QuestionDisplayMode;
  readonly randomizeQuestions: boolean;
  readonly active: boolean;
  readonly questionCount: number;
  readonly assignmentCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Vista completa de una evaluación: incluye preguntas y asignaciones. */
export interface EvaluationDetailResponse {
  readonly id: number;
  readonly title: string;
  readonly description: string | null;
  readonly instructions: string | null;
  readonly topic: string | null;
  readonly status: EvaluationStatus;
  readonly maxAttempts: number;
  readonly timeLimitMinutes: number | null;
  readonly allowChemicalCalculator: boolean;
  readonly trackTabExit: boolean;
  readonly questionDisplayMode: QuestionDisplayMode;
  readonly randomizeQuestions: boolean;
  readonly active: boolean;
  readonly questions: QuestionResponse[];
  readonly assignments: EvaluationAssignmentResponse[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
