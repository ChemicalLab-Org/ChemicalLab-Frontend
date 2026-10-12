import { QueryPage } from '../../shared/models/query-page.models';
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
  listConcepts(page=0,filters:Record<string,string|boolean>={}): Observable<QueryPage<SupervisionConcept>> {
    return this.http.get<QueryPage<SupervisionConcept>>(`${this.baseUrl}/concepts`,{params:{page,size:25,...filters}});
  }

  /** Evaluaciones con sus metadatos (sin clave de respuestas). */
  listEvaluations(page=0,filters:Record<string,string|boolean>={}): Observable<QueryPage<SupervisionEvaluation>> {
    return this.http.get<QueryPage<SupervisionEvaluation>>(`${this.baseUrl}/evaluations`,{params:{page,size:25,...filters}});
  }

  /** Vista unificada de asignaciones de contenidos y evaluaciones. */
  listAssignments(page=0,filters:Record<string,string|boolean>={}): Observable<QueryPage<SupervisionAssignment>> {
    return this.http.get<QueryPage<SupervisionAssignment>>(`${this.baseUrl}/assignments`,{params:{page,size:25,...filters}});
  }

  getOptions():Observable<{categories:string[];groups:{grade:string;section:string}[];activeConceptGroups:{grade:string;section:string}[];activeEvaluationGroups:{grade:string;section:string}[]}> {
    return this.http.get<{categories:string[];groups:{grade:string;section:string}[];activeConceptGroups:{grade:string;section:string}[];activeEvaluationGroups:{grade:string;section:string}[]}>(`${this.baseUrl}/options`);
  }
  /** Actividad reciente del sistema (registros existentes). */
  getActivity(): Observable<AdminActivity> {
    return this.http.get<AdminActivity>(`${this.baseUrl}/activity`);
  }
}
