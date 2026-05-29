import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateStudentRequest,
  StudentResponse,
  UpdateStudentRequest,
} from '../../shared/models';

/**
 * Servicio para la gestión de estudiantes del docente.
 * Consume los endpoints existentes del backend. El token JWT lo agrega el authInterceptor,
 * por lo que aquí no se manipula el token.
 */
@Injectable({ providedIn: 'root' })
export class UserManagementService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/users`;

  /** Lista los estudiantes asociados a un docente. */
  listStudentsByTeacher(teacherUserId: number): Observable<StudentResponse[]> {
    return this.http.get<StudentResponse[]>(
      `${this.baseUrl}/teachers/${teacherUserId}/students`
    );
  }

  /** Registra un nuevo estudiante para el docente indicado. */
  createStudent(
    teacherUserId: number,
    request: CreateStudentRequest
  ): Observable<StudentResponse> {
    return this.http.post<StudentResponse>(
      `${this.baseUrl}/teachers/${teacherUserId}/students`,
      request
    );
  }

  /** Actualiza los datos de un estudiante existente. */
  updateStudent(
    teacherUserId: number,
    studentId: number,
    request: UpdateStudentRequest
  ): Observable<StudentResponse> {
    return this.http.put<StudentResponse>(
      `${this.baseUrl}/teachers/${teacherUserId}/students/${studentId}`,
      request
    );
  }

  /** Desactiva un estudiante (no lo elimina). */
  deactivateStudent(
    teacherUserId: number,
    studentId: number
  ): Observable<StudentResponse> {
    return this.http.patch<StudentResponse>(
      `${this.baseUrl}/teachers/${teacherUserId}/students/${studentId}/deactivate`,
      {}
    );
  }
}
