import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdminActivity,
  SupervisionAssignment,
  SupervisionConcept,
  SupervisionEvaluation,
  SupervisionSummary,
} from '../../shared/models';

/**
 * Servicio del panel administrativo de supervisión académica. Consume los endpoints
 * de solo lectura `/api/admin/academic-supervision/**` (resumen, contenidos,
 * evaluaciones, asignaciones y actividad). El token JWT lo agrega el authInterceptor,
 * por lo que aquí no se manipula el token.
 *
 * Ninguna respuesta de este servicio expone la clave de respuestas de las
 * evaluaciones: solo se consultan metadatos.
 */
@Injectable({ providedIn: 'root' })
export class AcademicSupervisionService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/admin/academic-supervision`;

  /** Resumen académico general del sistema. */
  getSummary(): Observable<SupervisionSummary> {
    return this.http.get<SupervisionSummary>(`${this.baseUrl}/summary`);
  }

  /** Contenidos conceptuales con sus metadatos y secciones asignadas. */
  listConcepts(): Observable<SupervisionConcept[]> {
    return this.http.get<SupervisionConcept[]>(`${this.baseUrl}/concepts`);
  }

  /** Evaluaciones con sus metadatos (sin clave de respuestas). */
  listEvaluations(): Observable<SupervisionEvaluation[]> {
    return this.http.get<SupervisionEvaluation[]>(`${this.baseUrl}/evaluations`);
  }

  /** Vista unificada de asignaciones de contenidos y evaluaciones. */
  listAssignments(): Observable<SupervisionAssignment[]> {
    return this.http.get<SupervisionAssignment[]>(`${this.baseUrl}/assignments`);
  }

  /** Actividad reciente del sistema (registros existentes). */
  getActivity(): Observable<AdminActivity> {
    return this.http.get<AdminActivity>(`${this.baseUrl}/activity`);
  }
}
