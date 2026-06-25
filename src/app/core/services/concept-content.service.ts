import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AssignConceptContentRequest,
  ConceptAssignmentResponse,
  ConceptContentResponse,
  CreateConceptContentRequest,
  UpdateConceptContentRequest,
} from '../../shared/models';

/**
 * Servicio para la gestión docente de contenidos conceptuales.
 * Consume los endpoints del backend bajo /api/concepts/teacher. El token JWT lo
 * agrega el authInterceptor, por lo que aquí no se manipula el token. El docente
 * se identifica en el backend a partir del usuario autenticado, no de la URL.
 */
@Injectable({ providedIn: 'root' })
export class ConceptContentService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/concepts/teacher`;

  /** Lista los contenidos conceptuales del docente autenticado. */
  listTeacherConcepts(): Observable<ConceptContentResponse[]> {
    return this.http.get<ConceptContentResponse[]>(this.baseUrl);
  }

  /** Categorías sugeridas (catálogo por defecto + las ya usadas por el docente). */
  listCategorySuggestions(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/categories`);
  }

  /** Obtiene el detalle de un contenido propio del docente. */
  getTeacherConcept(conceptId: number): Observable<ConceptContentResponse> {
    return this.http.get<ConceptContentResponse>(`${this.baseUrl}/${conceptId}`);
  }

  /** Crea un nuevo contenido conceptual (queda en estado DRAFT). */
  createConcept(
    request: CreateConceptContentRequest
  ): Observable<ConceptContentResponse> {
    return this.http.post<ConceptContentResponse>(this.baseUrl, request);
  }

  /** Actualiza un contenido conceptual existente. */
  updateConcept(
    conceptId: number,
    request: UpdateConceptContentRequest
  ): Observable<ConceptContentResponse> {
    return this.http.put<ConceptContentResponse>(
      `${this.baseUrl}/${conceptId}`,
      request
    );
  }

  /** Publica un contenido (DRAFT → PUBLISHED). */
  publishConcept(conceptId: number): Observable<ConceptContentResponse> {
    return this.http.patch<ConceptContentResponse>(
      `${this.baseUrl}/${conceptId}/publish`,
      {}
    );
  }

  /** Archiva un contenido (DRAFT o PUBLISHED → ARCHIVED). */
  archiveConcept(conceptId: number): Observable<ConceptContentResponse> {
    return this.http.patch<ConceptContentResponse>(
      `${this.baseUrl}/${conceptId}/archive`,
      {}
    );
  }

  /** Asigna un contenido publicado a un grado/sección. */
  assignConcept(
    conceptId: number,
    request: AssignConceptContentRequest
  ): Observable<ConceptAssignmentResponse> {
    return this.http.post<ConceptAssignmentResponse>(
      `${this.baseUrl}/${conceptId}/assignments`,
      request
    );
  }

  /** Desactiva una asignación activa de un contenido. */
  deactivateAssignment(
    conceptId: number,
    assignmentId: number
  ): Observable<ConceptAssignmentResponse> {
    return this.http.patch<ConceptAssignmentResponse>(
      `${this.baseUrl}/${conceptId}/assignments/${assignmentId}/deactivate`,
      {}
    );
  }
}
