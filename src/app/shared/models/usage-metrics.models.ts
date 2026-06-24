import { UserRole } from './auth.models';

/** Módulo funcional al que pertenece una métrica de uso. */
export type UsageModule =
  | 'DASHBOARD'
  | 'PERIODIC_TABLE'
  | 'COMPOUNDS'
  | 'CONCEPTS'
  | 'EVALUATIONS'
  | 'RESULTS'
  | 'ADMIN'
  | 'USERS'
  | 'SYSTEM_STATUS';

/** Tipo de interacción registrada como métrica de uso. */
export type UsageEventType =
  | 'MODULE_ACCESS'
  | 'IMPORTANT_CLICK'
  | 'CONTENT_VIEW'
  | 'EVALUATION_OPENED'
  | 'EVALUATION_STARTED'
  | 'COMPOUND_FORMATION_USED'
  | 'PERIODIC_ELEMENT_VIEWED'
  | 'RESULTS_VIEWED';

/**
 * Cuerpo del registro de una métrica de uso. El usuario y el rol NO se envían: el backend
 * los resuelve del token. La metadata es opcional, corta y nunca debe contener datos
 * sensibles (contraseñas, tokens, respuestas ni claves de evaluación).
 */
export interface RecordUsageEventRequest {
  readonly module: UsageModule;
  readonly eventType: UsageEventType;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly description?: string;
  readonly metadata?: Record<string, string>;
}

/** Vista segura de un evento de uso para el panel administrativo. */
export interface UsageEventResponse {
  readonly id: number;
  readonly userId: number;
  readonly username: string;
  readonly userRole: UserRole;
  readonly module: UsageModule;
  readonly eventType: UsageEventType;
  readonly resourceType: string | null;
  readonly resourceId: string | null;
  readonly description: string | null;
  readonly metadata: string | null;
  readonly occurredAt: string;
}

/** Conteo de eventos para una clave concreta (módulo, tipo de evento o rol). */
export interface UsageCountResponse {
  readonly key: string;
  readonly count: number;
}

/** Resumen agregado de métricas de uso. */
export interface UsageMetricsSummaryResponse {
  readonly totalEvents: number;
  readonly byModule: UsageCountResponse[];
  readonly byEventType: UsageCountResponse[];
  readonly byRole: UsageCountResponse[];
}

/** Etiquetas amigables por módulo. */
export const USAGE_MODULE_LABELS: Record<UsageModule, string> = {
  DASHBOARD: 'Panel principal',
  PERIODIC_TABLE: 'Tabla periódica',
  COMPOUNDS: 'Formación de compuestos',
  CONCEPTS: 'Contenidos conceptuales',
  EVALUATIONS: 'Evaluaciones',
  RESULTS: 'Resultados',
  ADMIN: 'Administración',
  USERS: 'Usuarios y roles',
  SYSTEM_STATUS: 'Estado del sistema',
};

/** Etiquetas amigables por tipo de evento. */
export const USAGE_EVENT_TYPE_LABELS: Record<UsageEventType, string> = {
  MODULE_ACCESS: 'Acceso a módulo',
  IMPORTANT_CLICK: 'Clic relevante',
  CONTENT_VIEW: 'Contenido visto',
  EVALUATION_OPENED: 'Evaluación abierta',
  EVALUATION_STARTED: 'Evaluación iniciada',
  COMPOUND_FORMATION_USED: 'Uso de formación de compuestos',
  PERIODIC_ELEMENT_VIEWED: 'Elemento visto',
  RESULTS_VIEWED: 'Resultados vistos',
};

/** Etiquetas de rol para la vista de métricas. */
export const USAGE_ROLE_LABELS: Record<UserRole, string> = {
  ADMINISTRADOR: 'Administrador',
  DOCENTE: 'Docente',
  ESTUDIANTE: 'Estudiante',
};
