/**
 * Modelos de los contenidos conceptuales de química.
 * Reflejan los DTOs del backend (ConceptContentResponse, CreateConceptContentRequest,
 * UpdateConceptContentRequest, AssignConceptContentRequest, ConceptAssignmentResponse).
 */

/** Categorías temáticas de un contenido conceptual. */
export type ConceptCategory =
  | 'OXIDOS'
  | 'HIDROXIDOS'
  | 'ACIDOS'
  | 'SALES_BINARIAS'
  | 'OXISALES'
  | 'NOMENCLATURA'
  | 'GENERAL';

/** Estado del ciclo de vida de un contenido conceptual. */
export type ConceptStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/** Asignación de un contenido a un grado/sección. */
export interface ConceptAssignmentResponse {
  readonly id: number;
  readonly grade: string;
  readonly section: string;
  readonly active: boolean;
  readonly assignedAt: string;
}

/** Vista completa de un contenido conceptual para el docente. */
export interface ConceptContentResponse {
  readonly id: number;
  readonly title: string;
  readonly category: ConceptCategory;
  readonly summary: string | null;
  readonly explanation: string;
  readonly formationSteps: string[];
  readonly keyPoints: string[];
  readonly examples: string[];
  readonly status: ConceptStatus;
  readonly active: boolean;
  readonly createdByTeacherId: number;
  readonly createdByTeacherName: string;
  readonly assignments: ConceptAssignmentResponse[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Payload para crear un contenido conceptual. */
export interface CreateConceptContentRequest {
  readonly title: string;
  readonly category: ConceptCategory;
  readonly summary?: string;
  readonly explanation: string;
  readonly formationSteps: string[];
  readonly keyPoints: string[];
  readonly examples: string[];
}

/** Payload para actualizar un contenido conceptual existente. */
export type UpdateConceptContentRequest = CreateConceptContentRequest;

/** Payload para asignar un contenido a un grado/sección. */
export interface AssignConceptContentRequest {
  readonly grade: string;
  readonly section: string;
}

/** Vista reducida de un contenido conceptual para el estudiante. Solo expone el material publicado y asignado. */
export interface StudentConceptContentResponse {
  readonly id: number;
  readonly title: string;
  readonly category: ConceptCategory;
  readonly summary: string | null;
  readonly explanation: string;
  readonly formationSteps: string[];
  readonly keyPoints: string[];
  readonly examples: string[];
}
