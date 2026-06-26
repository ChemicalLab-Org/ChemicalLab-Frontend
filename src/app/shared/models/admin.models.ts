/**
 * Modelos del panel administrativo.
 * Reflejan los DTOs del backend (AdminSummaryResponse, AdminUserResponse,
 * AdminActivityResponse) y la respuesta de activación/desactivación de usuarios.
 */
import { UserRole } from './auth.models';

/** Resumen de métricas generales del sistema. */
export interface AdminSummary {
  readonly totalUsers: number;
  readonly totalAdmins: number;
  readonly totalTeachers: number;
  readonly totalStudents: number;
  readonly activeUsers: number;
  readonly inactiveUsers: number;
  readonly activeTeachers: number;
  readonly activeStudents: number;
  readonly totalConcepts: number;
  readonly publishedConcepts: number;
  readonly totalEvaluations: number;
  readonly publishedEvaluations: number;
  readonly submittedAttempts: number;
}

/** Vista unificada de un usuario para el panel administrativo. */
export interface AdminUser {
  readonly userId: number;
  readonly fullName: string;
  /** Nombres del perfil (docente/estudiante); null para administradores. */
  readonly names: string | null;
  /** Apellidos del perfil (docente/estudiante); null para administradores. */
  readonly lastNames: string | null;
  readonly username: string;
  readonly code: string | null;
  readonly email: string | null;
  readonly role: UserRole;
  readonly active: boolean;
  readonly temporaryPassword: boolean;
  readonly createdAt: string | null;
  /** Id de cuenta del docente responsable (solo estudiantes); null en otros roles. */
  readonly teacherUserId: number | null;
  /** Grado (solo estudiantes). */
  readonly grade: string | null;
  /** Sección (solo estudiantes). */
  readonly section: string | null;
  /** Cuenta del propio administrador autenticado: no admite acciones peligrosas. */
  readonly protectedAccount: boolean;
}

/** Respuesta al restablecer la contraseña de un usuario desde el panel admin. */
export interface AdminPasswordResetResponse {
  readonly message: string;
  /** Contraseña temporal generada (texto plano, de un solo uso). */
  readonly temporaryPassword: string;
}

/**
 * Payload para crear un usuario desde el panel administrativo. Los campos aplicables
 * dependen del rol; el backend genera la contraseña temporal y la devuelve una vez.
 */
export interface CreateUserRequest {
  readonly role: UserRole;
  readonly names?: string;
  readonly lastNames?: string;
  readonly username?: string;
  readonly email?: string;
  readonly grade?: string;
  readonly section?: string;
  readonly studentCode?: string;
  readonly teacherUserId?: number;
}

/** Payload para actualizar los datos básicos de un usuario desde el panel administrativo. */
export interface UpdateUserRequest {
  readonly names?: string;
  readonly lastNames?: string;
  readonly email?: string;
  readonly grade?: string;
  readonly section?: string;
  readonly teacherUserId?: number;
}

/** Respuesta al crear un usuario: datos del usuario y la contraseña temporal de un solo uso. */
export interface AdminUserCreatedResponse {
  readonly user: AdminUser;
  /** Contraseña temporal generada (texto plano, de un solo uso). */
  readonly temporaryPassword: string;
}

/** Opción de docente (activo) para asignar como docente responsable de un estudiante. */
export interface TeacherOption {
  readonly userId: number;
  readonly fullName: string;
  readonly username: string;
}

/** Elemento simple de actividad reciente. */
export interface AdminActivityItem {
  readonly title: string;
  readonly subtitle: string | null;
  readonly timestamp: string | null;
}

/** Actividad reciente basada en registros existentes. */
export interface AdminActivity {
  readonly recentUsers: AdminActivityItem[];
  readonly recentEvaluations: AdminActivityItem[];
  readonly recentConcepts: AdminActivityItem[];
}

/** Respuesta del backend al activar/desactivar un usuario. */
export interface UserResponse {
  readonly id: number;
  readonly username: string;
  readonly email: string | null;
  readonly role: UserRole;
  readonly active: boolean;
  readonly temporaryPassword: boolean;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}
