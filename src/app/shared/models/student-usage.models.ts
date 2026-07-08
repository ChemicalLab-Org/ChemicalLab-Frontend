import { UserRole } from './auth.models';
import { UsageEventType, UsageModule } from './usage-metrics.models';

/**
 * Indicadores consolidados de uso del sistema por usuario/estudiante, alineados con la
 * ficha de registro automático de uso de ChemicalLab (Instrumento 3). Los campos en
 * {@code null} significan «no disponible con los datos actuales» o «no aplica al rol»
 * y la vista debe mostrarlos como tal, nunca como cero.
 */
export interface StudentUsageRecord {
  readonly userId: number;
  readonly studentProfileId: number | null;
  readonly code: string | null;
  readonly username: string;
  readonly fullName: string | null;
  readonly role: UserRole;
  readonly grade: string | null;
  readonly section: string | null;
  /**
   * Tiempo total de uso ESTIMADO en minutos: el backend agrupa los momentos de actividad
   * registrados (logins, eventos de uso e hitos de intentos) en sesiones con un corte de
   * inactividad de 30 minutos y suma sus duraciones. Debe presentarse como estimación.
   */
  readonly totalUsageMinutes: number | null;
  readonly sessionsStarted: number | null;
  readonly visitedModulesCount: number | null;
  readonly visitedModules: UsageModule[];
  readonly assignedActivities: number | null;
  readonly completedActivities: number | null;
  readonly progressPercentage: number | null;
  readonly attemptsCount: number | null;
  readonly correctAnswers: number | null;
  readonly incorrectAnswers: number | null;
  readonly accuracyRate: number | null;
  readonly feedbackReceived: number | null;
  readonly technicalIncidentsCount: number | null;
  readonly technicalIncidentsSummary: string | null;
  readonly lastActivityAt: string | null;
}

/** Resumen para las tarjetas superiores del panel de registro de uso. */
export interface StudentUsageSummary {
  readonly totalUsers: number;
  readonly studentsWithActivity: number;
  readonly averageProgress: number | null;
  readonly averageAccuracy: number | null;
  readonly totalSessionsStarted: number;
  readonly topModule: UsageModule | null;
  readonly topModuleCount: number | null;
}

/** Respuesta del listado consolidado del registro de uso. */
export interface StudentUsageRecordsResponse {
  readonly summary: StudentUsageSummary;
  readonly records: StudentUsageRecord[];
}

/** Evento de uso reciente mostrado en el detalle (sin metadata ni payloads). */
export interface StudentUsageEventItem {
  readonly module: UsageModule;
  readonly eventType: UsageEventType;
  readonly resourceType: string | null;
  readonly description: string | null;
  readonly occurredAt: string;
}

/** Relación del usuario con una evaluación: asignación e intentos, sin respuestas. */
export interface StudentUsageEvaluationItem {
  readonly evaluationId: number;
  readonly title: string;
  readonly assigned: boolean;
  readonly attemptsCount: number;
  readonly completed: boolean;
  readonly lastAttemptAt: string | null;
}

/** Incidencia técnica atribuible al usuario (log de advertencia o error). */
export interface StudentUsageIncidentItem {
  readonly severity: 'WARNING' | 'ERROR';
  readonly eventType: string;
  readonly action: string | null;
  readonly description: string | null;
  readonly createdAt: string;
}

/** Detalle del registro de uso de un usuario concreto. */
export interface StudentUsageDetailResponse {
  readonly summary: StudentUsageRecord;
  readonly recentEvents: StudentUsageEventItem[];
  readonly evaluations: StudentUsageEvaluationItem[];
  readonly incidents: StudentUsageIncidentItem[];
}

/** Filtros del listado consolidado. Los valores vacíos no se envían al backend. */
export interface StudentUsageFilters {
  readonly role: string;
  readonly search: string;
  readonly grade: string;
  readonly section: string;
  readonly from: string;
  readonly to: string;
  readonly module: string;
  readonly onlyStudentsWithActivity: boolean;
}
