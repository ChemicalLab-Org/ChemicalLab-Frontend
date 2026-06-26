import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdminActivity,
  AdminPasswordResetResponse,
  AdminSummary,
  AdminUser,
  AdminUserCreatedResponse,
  CreateUserRequest,
  TeacherOption,
  UpdateUserRequest,
} from '../../shared/models';

/**
 * Servicio del panel administrativo. Consume los endpoints `/api/admin/**`
 * (resumen, usuarios, actividad y gestión completa de usuarios). El token JWT lo
 * agrega el authInterceptor, por lo que aquí no se manipula el token.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly adminUrl = `${environment.apiUrl}/admin`;

  /** Resumen de métricas generales del sistema. */
  getSummary(): Observable<AdminSummary> {
    return this.http.get<AdminSummary>(`${this.adminUrl}/summary`);
  }

  /** Listado unificado de todos los usuarios (admins, docentes y estudiantes). */
  listUsers(): Observable<AdminUser[]> {
    return this.http.get<AdminUser[]>(`${this.adminUrl}/users`);
  }

  /** Actividad reciente basada en registros existentes. */
  getActivity(): Observable<AdminActivity> {
    return this.http.get<AdminActivity>(`${this.adminUrl}/activity`);
  }

  /** Docentes activos disponibles como docente responsable de un estudiante. */
  getTeacherOptions(): Observable<TeacherOption[]> {
    return this.http.get<TeacherOption[]>(`${this.adminUrl}/users/teacher-options`);
  }

  /**
   * Crea un usuario (administrador, docente o estudiante). El backend genera la
   * contraseña temporal y la devuelve una sola vez en la respuesta.
   */
  createUser(request: CreateUserRequest): Observable<AdminUserCreatedResponse> {
    return this.http.post<AdminUserCreatedResponse>(`${this.adminUrl}/users`, request);
  }

  /** Actualiza los datos básicos de un usuario según su rol. */
  updateUser(userId: number, request: UpdateUserRequest): Observable<AdminUser> {
    return this.http.patch<AdminUser>(`${this.adminUrl}/users/${userId}`, request);
  }

  /** Reactiva un usuario previamente desactivado. */
  activateUser(userId: number): Observable<AdminUser> {
    return this.http.patch<AdminUser>(`${this.adminUrl}/users/${userId}/activate`, {});
  }

  /**
   * Desactiva un usuario (no lo elimina). El backend impide desactivar la propia
   * cuenta y al último administrador activo.
   */
  deactivateUser(userId: number): Observable<AdminUser> {
    return this.http.patch<AdminUser>(`${this.adminUrl}/users/${userId}/deactivate`, {});
  }

  /**
   * Restablece la contraseña de cualquier usuario administrable (docente, estudiante u
   * otro) por su id de cuenta. No depende del correo ni de quién creó al usuario.
   * Devuelve la contraseña temporal generada una sola vez.
   */
  resetUserPassword(userId: number): Observable<AdminPasswordResetResponse> {
    return this.http.patch<AdminPasswordResetResponse>(
      `${this.adminUrl}/users/${userId}/password/reset`,
      {}
    );
  }
}
