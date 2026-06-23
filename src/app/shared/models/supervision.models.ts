/**
 * Modelos del panel administrativo de supervisión académica.
 * Reflejan los DTOs de solo lectura del backend
 * (`/api/admin/academic-supervision/**`). Son vistas de metadatos: las
 * evaluaciones nunca incluyen preguntas ni la clave de respuestas.
 */
import { ConceptCategory, ConceptStatus } from './concept.models';
import { EvaluationStatus } from './evaluation.models';

/** Resumen académico general del sistema. */
export interface SupervisionSummary {
  readonly totalConcepts: number;
  readonly publishedConcepts: number;
  readonly totalEvaluations: number;
  readonly publishedEvaluations: number;
  readonly teachersWithActivity: number;
  readonly sectionsWithAssignments: number;
  readonly submittedAttempts: number;
}

/** Referencia a un grado/sección al que se asignó un recurso. */
export interface SupervisionSectionRef {
  readonly grade: string;
  readonly section: string;
  readonly active: boolean;
  readonly assignedAt: string | null;
}

/** Contenido conceptual visto en la supervisión (solo metadatos). */
export interface SupervisionConcept {
  readonly id: number;
  readonly title: string;
  readonly category: ConceptCategory;
  readonly status: ConceptStatus;
  readonly createdByTeacher: string | null;
  readonly assignmentCount: number;
  readonly sections: SupervisionSectionRef[];
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

/**
 * Evaluación vista en la supervisión (solo metadatos). De forma deliberada no
 * incluye preguntas, alternativas ni la clave de respuestas.
 */
export interface SupervisionEvaluation {
  readonly id: number;
  readonly title: string;
  readonly topic: string | null;
  readonly status: EvaluationStatus;
  readonly createdByTeacher: string | null;
  readonly questionCount: number;
  readonly assignmentCount: number;
  readonly submittedAttempts: number;
  readonly sections: SupervisionSectionRef[];
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

/** Tipo de recurso asignado en la vista unificada de asignaciones. */
export type SupervisionAssignmentType = 'CONTENIDO' | 'EVALUACION';

/** Asignación académica unificada (contenido o evaluación). */
export interface SupervisionAssignment {
  readonly type: SupervisionAssignmentType;
  readonly resourceId: number;
  readonly title: string;
  readonly createdByTeacher: string | null;
  readonly grade: string;
  readonly section: string;
  readonly active: boolean;
  readonly assignedAt: string | null;
}
