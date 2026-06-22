import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdminActivity,
  AdminSummary,
  AdminUser,
  UserResponse,
} from '../../shared/models';

/**
 * Servicio del panel administrativo. Consume los endpoints de solo lectura
 * `/api/admin/**` (resumen, usuarios y actividad) y reutiliza los endpoints
 * generales de activación/desactivación de usuarios. El token JWT lo agrega el
 * authInterceptor, por lo que aquí no se manipula el token.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly adminUrl = `${environment.apiUrl}/admin`;
  private readonly usersUrl = `${environment.apiUrl}/users`;

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

  /** Reactiva un usuario previamente desactivado. */
  activateUser(userId: number): Observable<UserResponse> {
    return this.http.patch<UserResponse>(`${this.usersUrl}/${userId}/activate`, {});
  }

  /** Desactiva un usuario (no lo elimina). */
  deactivateUser(userId: number): Observable<UserResponse> {
    return this.http.patch<UserResponse>(`${this.usersUrl}/${userId}/deactivate`, {});
  }
}
