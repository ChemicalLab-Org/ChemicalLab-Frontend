import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AttemptResponse,
  StartEvaluationAttemptRequest,
  StudentAttemptResultDetailResponse,
  StudentEvaluationDetailResponse,
  StudentEvaluationResponse,
  StudentResultSummaryResponse,
  SubmitEvaluationAnswerRequest,
  SubmitEvaluationAttemptRequest,
} from '../../shared/models';

/**
 * Servicio para las evaluaciones del estudiante.
 * Consume los endpoints del backend bajo /api/evaluations/student. El token JWT lo
 * agrega el authInterceptor, por lo que aquí no se manipula el token. El estudiante
 * (y su grado/sección) se resuelve en el backend a partir del usuario autenticado:
 * el frontend nunca envía grade ni section.
 */
@Injectable({ providedIn: 'root' })
export class StudentEvaluationsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/evaluations/student`;

  /** Lista las evaluaciones publicadas y asignadas a la sección del estudiante. */
  listStudentEvaluations(): Observable<StudentEvaluationResponse[]> {
    return this.http.get<StudentEvaluationResponse[]>(this.baseUrl);
  }

  /** Obtiene el detalle de una evaluación asignada (preguntas y alternativas). */
  getStudentEvaluation(evaluationId: number): Observable<StudentEvaluationDetailResponse> {
    return this.http.get<StudentEvaluationDetailResponse>(`${this.baseUrl}/${evaluationId}`);
  }

  /** Inicia un nuevo intento para la evaluación indicada. */
  startAttempt(
    evaluationId: number,
    request: StartEvaluationAttemptRequest = {}
  ): Observable<AttemptResponse> {
    return this.http.post<AttemptResponse>(
      `${this.baseUrl}/${evaluationId}/attempts`,
      request
    );
  }

  /** Obtiene un intento (en progreso o ya enviado) propio del estudiante. */
  getAttempt(attemptId: number): Observable<AttemptResponse> {
    return this.http.get<AttemptResponse>(`${this.baseUrl}/attempts/${attemptId}`);
  }

  /** Guarda o actualiza la respuesta a una pregunta dentro de un intento. */
  saveAnswer(
    attemptId: number,
    request: SubmitEvaluationAnswerRequest
  ): Observable<AttemptResponse> {
    return this.http.post<AttemptResponse>(
      `${this.baseUrl}/attempts/${attemptId}/answers`,
      request
    );
  }

  /** Envía un intento. Tras esto el intento queda calificado (GRADED) y no admite cambios. */
  submitAttempt(
    attemptId: number,
    request: SubmitEvaluationAttemptRequest = {}
  ): Observable<AttemptResponse> {
    return this.http.post<AttemptResponse>(
      `${this.baseUrl}/attempts/${attemptId}/submit`,
      request
    );
  }

  /** Lista las calificaciones de los intentos terminales del estudiante autenticado. */
  listStudentResults(): Observable<StudentResultSummaryResponse[]> {
    return this.http.get<StudentResultSummaryResponse[]>(`${this.baseUrl}/results`);
  }

  /** Obtiene el detalle del resultado de un intento propio. */
  getStudentAttemptResult(
    attemptId: number
  ): Observable<StudentAttemptResultDetailResponse> {
    return this.http.get<StudentAttemptResultDetailResponse>(
      `${this.baseUrl}/attempts/${attemptId}/result`
    );
  }
}
