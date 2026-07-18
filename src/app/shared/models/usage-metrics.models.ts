import { UserRole } from './auth.models';

/** Módulo funcional al que pertenece una métrica de uso. */
export type UsageModule =
  | 'DASHBOARD'
  | 'PERIODIC_TABLE'
  | 'COMPOUNDS'
  | 'CONCEPTS'
  | 'EVALUATIONS'
  | 'WHITEBOARD'
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
  | 'RESULTS_VIEWED'
  | 'WHITEBOARD_SESSION_JOINED';

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
  WHITEBOARD: 'Pizarra interactiva',
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
  WHITEBOARD_SESSION_JOINED: 'Unión a sesión de pizarra',
};

/**
 * Etiquetas amigables por tipo de recurso registrado en un evento de uso. Las claves
 * corresponden a los valores que el backend guarda en {@code resourceType}.
 */
export const USAGE_RESOURCE_TYPE_LABELS: Record<string, string> = {
  WhiteboardSession: 'Sesión de pizarra',
  EVALUATION: 'Evaluación',
  CONCEPT: 'Contenido',
  ELEMENT: 'Elemento',
  COMPOUND: 'Formación de compuestos',
  NOMENCLATURE: 'Nomenclatura',
};

/**
 * Presenta el recurso de un evento con texto legible: "Sesión de pizarra #10",
 * "Evaluación #5", "Elemento Na", etc. Si el tipo no está mapeado, muestra el
 * valor original para no ocultar información.
 */
export function formatUsageResource(resourceType: string | null, resourceId: string | null): string {
  if (!resourceType && !resourceId) return '—';
  const label = resourceType ? (USAGE_RESOURCE_TYPE_LABELS[resourceType] ?? resourceType) : '';
  if (!resourceId) return label || '—';
  if (!label) return resourceId;
  // Los ids numéricos se presentan como "#id"; los simbólicos (p. ej. "Na") van tal cual.
  const idText = /^\d+$/.test(resourceId) ? `#${resourceId}` : resourceId;
  return `${label} ${idText}`;
}

/** Indicadores agregados (histórico total) del panel administrativo. Solo conteos. */
export interface UsagePanelResponse {
  readonly general: {
    readonly totalEvents: number;
    readonly activeUsers: number;
    readonly modulesUsed: number;
    readonly moduleAccessEvents: number;
    readonly compoundFormationEvents: number;
  };
  readonly whiteboard: {
    readonly sessionsCreated: number;
    readonly sessionsActive: number;
    readonly sessionsClosed: number;
    readonly sessionsWithSnapshot: number;
    readonly studentJoinEvents: number;
    readonly distinctStudents: number;
    readonly auditEvents: number;
  };
  readonly evaluations: {
    readonly published: number;
    readonly openedEvents: number;
    readonly startedEvents: number;
    readonly attemptsTotal: number;
    readonly attemptsSubmitted: number;
    readonly attemptsGraded: number;
    readonly resultViewEvents: number;
  };
  readonly traceability: {
    readonly auditTotal: number;
    readonly auditWarnings: number;
    readonly auditErrors: number;
    readonly loginSuccess: number;
    readonly loginFailed: number;
  };
}

/** Estado de un indicador del Project Charter en el panel de métricas. */
export type CharterIndicatorStatus =
  | 'Medido'
  | 'Parcial'
  | 'Pendiente de medición externa'
  | 'No disponible con datos actuales';

/** Fila de la sección "Indicadores del Project Charter". */
export interface CharterIndicator {
  readonly objective: string;
  readonly indicator: string;
  readonly value: string;
  readonly source: string;
  readonly status: CharterIndicatorStatus;
  readonly observation: string;
}

/** Etiquetas de rol para la vista de métricas. */
export const USAGE_ROLE_LABELS: Record<UserRole, string> = {
  ADMINISTRADOR: 'Administrador',
  DOCENTE: 'Docente',
  ESTUDIANTE: 'Estudiante',
};
