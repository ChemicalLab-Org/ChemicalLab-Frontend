/**
 * Modelos de gestión de docentes.
 * Reflejan los DTOs del backend (TeacherResponse, CreateTeacherRequest).
 */

/** Datos de un docente devueltos por el backend. */
export interface TeacherResponse {
  readonly id: number;
  readonly userId: number;
  readonly username: string;
  readonly email: string;
  readonly names: string;
  readonly lastNames: string;
  readonly active: boolean;
  readonly temporaryPassword: boolean;
}

/** Payload para registrar un docente. */
export interface CreateTeacherRequest {
  readonly names: string;
  readonly lastNames: string;
  readonly username: string;
  readonly email: string;
  readonly temporaryPassword: string;
}
