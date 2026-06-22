/**
 * Modelos de logs / trazabilidad del sistema.
 * Reflejan los DTOs del backend (AuditLogResponse, AuditLogSummaryResponse) y la
 * respuesta paginada del endpoint /api/admin/logs.
 */
import { UserRole } from './auth.models';

/** Módulo del sistema al que pertenece un evento. */
export type LogCategory =
  | 'AUTH'
  | 'USER_MANAGEMENT'
  | 'CONCEPT_CONTENT'
  | 'EVALUATION'
  | 'RESULTS'
  | 'ADMIN'
  | 'SYSTEM';

/** Nivel de severidad de un evento. */
export type LogSeverity = 'INFO' | 'WARNING' | 'ERROR';

/** Tipo de evento registrado. */
export type LogEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DEACTIVATED'
  | 'USER_REACTIVATED'
  | 'PASSWORD_RESET'
  | 'CONCEPT_CREATED'
  | 'CONCEPT_UPDATED'
  | 'CONCEPT_PUBLISHED'
  | 'CONCEPT_ARCHIVED'
  | 'CONCEPT_ASSIGNED'
  | 'EVALUATION_CREATED'
  | 'EVALUATION_UPDATED'
  | 'EVALUATION_PUBLISHED'
  | 'EVALUATION_ARCHIVED'
  | 'EVALUATION_ASSIGNED'
  | 'EVALUATION_ATTEMPT_STARTED'
  | 'EVALUATION_ATTEMPT_SUBMITTED'
  | 'RESULT_VIEWED'
  | 'SYSTEM_HEALTH_CHECK'
  | 'ADMIN_ACTION';

/** Evento de trazabilidad tal como lo devuelve el backend. */
export interface AuditLogResponse {
  readonly id: number;
  readonly eventType: LogEventType;
  readonly category: LogCategory;
  readonly severity: LogSeverity;
  readonly actorUserId: number | null;
  readonly actorUsername: string | null;
  readonly actorRole: UserRole | null;
  readonly targetType: string | null;
  readonly targetId: number | null;
  readonly targetLabel: string | null;
  readonly action: string | null;
  readonly description: string | null;
  readonly metadata: string | null;
  readonly createdAt: string;
}

/** Resumen agregado de eventos para las tarjetas del panel. */
export interface AuditLogSummaryResponse {
  readonly totalLogs: number;
  readonly infoCount: number;
  readonly warningCount: number;
  readonly errorCount: number;
  readonly authEvents: number;
  readonly userEvents: number;
  readonly evaluationEvents: number;
  readonly conceptEvents: number;
}

/** Respuesta paginada del listado de logs. */
export interface AuditLogPageResponse {
  readonly content: AuditLogResponse[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
  readonly first: boolean;
  readonly last: boolean;
}

/** Filtros aplicables al listado de logs. */
export interface AuditLogFilters {
  readonly category?: LogCategory | null;
  readonly eventType?: LogEventType | null;
  readonly severity?: LogSeverity | null;
  readonly actorRole?: UserRole | null;
  readonly search?: string | null;
  readonly from?: string | null;
  readonly to?: string | null;
  readonly page?: number;
  readonly size?: number;
}

/** Etiquetas amigables por categoría. */
export const LOG_CATEGORY_LABELS: Record<LogCategory, string> = {
  AUTH: 'Autenticación',
  USER_MANAGEMENT: 'Gestión de usuarios',
  CONCEPT_CONTENT: 'Contenidos conceptuales',
  EVALUATION: 'Evaluaciones',
  RESULTS: 'Resultados',
  ADMIN: 'Administración',
  SYSTEM: 'Sistema',
};

/** Etiquetas amigables por severidad. */
export const LOG_SEVERITY_LABELS: Record<LogSeverity, string> = {
  INFO: 'Información',
  WARNING: 'Advertencia',
  ERROR: 'Error',
};

/** Etiquetas amigables por tipo de evento. */
export const LOG_EVENT_TYPE_LABELS: Record<LogEventType, string> = {
  LOGIN_SUCCESS: 'Inicio de sesión',
  LOGIN_FAILED: 'Inicio de sesión fallido',
  LOGOUT: 'Cierre de sesión',
  USER_CREATED: 'Usuario creado',
  USER_UPDATED: 'Usuario actualizado',
  USER_DEACTIVATED: 'Usuario desactivado',
  USER_REACTIVATED: 'Usuario reactivado',
  PASSWORD_RESET: 'Contraseña restablecida',
  CONCEPT_CREATED: 'Contenido creado',
  CONCEPT_UPDATED: 'Contenido actualizado',
  CONCEPT_PUBLISHED: 'Contenido publicado',
  CONCEPT_ARCHIVED: 'Contenido archivado',
  CONCEPT_ASSIGNED: 'Contenido asignado',
  EVALUATION_CREATED: 'Evaluación creada',
  EVALUATION_UPDATED: 'Evaluación actualizada',
  EVALUATION_PUBLISHED: 'Evaluación publicada',
  EVALUATION_ARCHIVED: 'Evaluación archivada',
  EVALUATION_ASSIGNED: 'Evaluación asignada',
  EVALUATION_ATTEMPT_STARTED: 'Intento iniciado',
  EVALUATION_ATTEMPT_SUBMITTED: 'Intento enviado',
  RESULT_VIEWED: 'Resultado consultado',
  SYSTEM_HEALTH_CHECK: 'Chequeo de salud',
  ADMIN_ACTION: 'Acción administrativa',
};

/** Etiquetas amigables por rol del actor. */
export const ACTOR_ROLE_LABELS: Record<UserRole, string> = {
  ADMINISTRADOR: 'Administrador',
  DOCENTE: 'Docente',
  ESTUDIANTE: 'Estudiante',
};
