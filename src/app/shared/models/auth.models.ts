/** Payload enviado al endpoint de login. */
export interface LoginRequest {
  readonly usernameOrEmail: string;
  readonly password: string;
}

/** Roles posibles de un usuario en el sistema. */
export type UserRole = 'ADMINISTRADOR' | 'DOCENTE' | 'ESTUDIANTE';

/** Respuesta del backend tras un login exitoso. Contiene el JWT y los datos del usuario. */
export interface AuthResponse {
  readonly token: string;
  readonly tokenType: string;
  readonly userId: number;
  readonly username: string;
  readonly email: string | null;
  readonly role: UserRole;
  readonly active: boolean;
  readonly temporaryPassword: boolean;
}

/** Payload para cambiar la contraseña del usuario autenticado. */
export interface ChangePasswordRequest {
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly confirmPassword: string;
}

/** Respuesta del backend tras un cambio de contraseña exitoso. */
export interface PasswordChangeResponse {
  readonly message: string;
  readonly temporaryPassword: boolean;
}
