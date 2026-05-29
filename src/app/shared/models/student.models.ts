/**
 * Modelos de gestión de estudiantes.
 * Reflejan los DTOs del backend (StudentResponse, CreateStudentRequest, UpdateStudentRequest).
 */

/** Datos de un estudiante devueltos por el backend. */
export interface StudentResponse {
  readonly id: number;
  readonly userId: number;
  readonly studentCode: string;
  readonly username: string;
  readonly names: string;
  readonly lastNames: string;
  readonly grade: string;
  readonly section: string;
  readonly active: boolean;
  readonly temporaryPassword: boolean;
  readonly teacherId: number;
}

/** Payload para registrar un estudiante. El código es opcional: si no se envía, el backend lo genera. */
export interface CreateStudentRequest {
  readonly names: string;
  readonly lastNames: string;
  readonly studentCode?: string;
  readonly temporaryPassword: string;
  readonly grade: string;
  readonly section: string;
}

/** Payload para actualizar un estudiante existente. */
export interface UpdateStudentRequest {
  readonly names: string;
  readonly lastNames: string;
  readonly studentCode?: string;
  readonly grade: string;
  readonly section: string;
  readonly active: boolean;
}
