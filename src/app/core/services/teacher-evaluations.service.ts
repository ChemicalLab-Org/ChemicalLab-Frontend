import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AssignEvaluationRequest,
  AttemptTraceabilityResponse,
  CreateEvaluationRequest,
  CreateQuestionRequest,
  EvaluationAssignmentResponse,
  EvaluationDetailResponse,
  EvaluationResponse,
  ManualGradeRequest,
  PendingReviewAttemptResponse,
  QuestionResponse,
  TeacherAttemptResultDetailResponse,
  TeacherAttemptReviewResponse,
  TeacherEvaluationResultsResponse,
  TeacherEvaluationResultsSummaryResponse,
  UpdateEvaluationRequest,
  UpdateQuestionRequest,
} from '../../shared/models';

/**
 * Servicio para la gestión docente de evaluaciones.
 * Consume los endpoints del backend bajo /api/evaluations/teacher. El token JWT lo
 * agrega el authInterceptor, por lo que aquí no se manipula el token. El docente
 * se identifica en el backend a partir del usuario autenticado, no de la URL.
 */
@Injectable({ providedIn: 'root' })
export class TeacherEvaluationsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/evaluations/teacher`;

  /** Lista las evaluaciones del docente autenticado. */
  listTeacherEvaluations(): Observable<EvaluationResponse[]> {
    return this.http.get<EvaluationResponse[]>(this.baseUrl);
  }

  /** Obtiene el detalle completo de una evaluación propia (preguntas y asignaciones). */
  getTeacherEvaluation(evaluationId: number): Observable<EvaluationDetailResponse> {
    return this.http.get<EvaluationDetailResponse>(`${this.baseUrl}/${evaluationId}`);
  }

  /** Crea una nueva evaluación (queda en estado DRAFT). */
  createEvaluation(request: CreateEvaluationRequest): Observable<EvaluationResponse> {
    return this.http.post<EvaluationResponse>(this.baseUrl, request);
  }

  /** Actualiza los datos generales de una evaluación existente. */
  updateEvaluation(
    evaluationId: number,
    request: UpdateEvaluationRequest
  ): Observable<EvaluationResponse> {
    return this.http.put<EvaluationResponse>(`${this.baseUrl}/${evaluationId}`, request);
  }

  /** Agrega una pregunta con sus alternativas a una evaluación. */
  addQuestion(
    evaluationId: number,
    request: CreateQuestionRequest
  ): Observable<QuestionResponse> {
    return this.http.post<QuestionResponse>(
      `${this.baseUrl}/${evaluationId}/questions`,
      request
    );
  }

  /** Edita una pregunta y sus alternativas. */
  updateQuestion(
    evaluationId: number,
    questionId: number,
    request: UpdateQuestionRequest
  ): Observable<QuestionResponse> {
    return this.http.put<QuestionResponse>(
      `${this.baseUrl}/${evaluationId}/questions/${questionId}`,
      request
    );
  }

  /** Desactiva una pregunta de una evaluación. */
  deactivateQuestion(
    evaluationId: number,
    questionId: number
  ): Observable<QuestionResponse> {
    return this.http.patch<QuestionResponse>(
      `${this.baseUrl}/${evaluationId}/questions/${questionId}/deactivate`,
      {}
    );
  }

  /** Publica una evaluación (DRAFT → PUBLISHED). Devuelve el detalle actualizado. */
  publishEvaluation(evaluationId: number): Observable<EvaluationDetailResponse> {
    return this.http.patch<EvaluationDetailResponse>(
      `${this.baseUrl}/${evaluationId}/publish`,
      {}
    );
  }

  /** Archiva una evaluación (DRAFT o PUBLISHED → ARCHIVED). */
  archiveEvaluation(evaluationId: number): Observable<EvaluationResponse> {
    return this.http.patch<EvaluationResponse>(
      `${this.baseUrl}/${evaluationId}/archive`,
      {}
    );
  }

  /** Asigna una evaluación publicada a un grado/sección. */
  assignEvaluation(
    evaluationId: number,
    request: AssignEvaluationRequest
  ): Observable<EvaluationAssignmentResponse> {
    return this.http.post<EvaluationAssignmentResponse>(
      `${this.baseUrl}/${evaluationId}/assignments`,
      request
    );
  }

  /** Desactiva una asignación activa de una evaluación. */
  deactivateAssignment(
    evaluationId: number,
    assignmentId: number
  ): Observable<EvaluationAssignmentResponse> {
    return this.http.patch<EvaluationAssignmentResponse>(
      `${this.baseUrl}/${evaluationId}/assignments/${assignmentId}/deactivate`,
      {}
    );
  }

  /** Resultados de una evaluación propia: agregados más la lista de intentos. */
  getEvaluationResults(
    evaluationId: number
  ): Observable<TeacherEvaluationResultsResponse> {
    return this.http.get<TeacherEvaluationResultsResponse>(
      `${this.baseUrl}/${evaluationId}/results`
    );
  }

  /** Solo los agregados de resultados de una evaluación propia. */
  getEvaluationResultsSummary(
    evaluationId: number
  ): Observable<TeacherEvaluationResultsSummaryResponse> {
    return this.http.get<TeacherEvaluationResultsSummaryResponse>(
      `${this.baseUrl}/${evaluationId}/results/summary`
    );
  }

  /** Detalle del resultado de un intento de un estudiante (solo de evaluaciones propias). */
  getTeacherAttemptResult(
    attemptId: number
  ): Observable<TeacherAttemptResultDetailResponse> {
    return this.http.get<TeacherAttemptResultDetailResponse>(
      `${this.baseUrl}/attempts/${attemptId}/result`
    );
  }

  /**
   * Trazabilidad de un intento: resumen (tiempo usado, estado final, salidas/regresos de
   * pestaña, intentos de salida, herramientas consultadas) y línea de tiempo de eventos.
   * Solo de intentos de evaluaciones propias; no incluye respuestas ni claves.
   */
  getAttemptTraceability(attemptId: number): Observable<AttemptTraceabilityResponse> {
    return this.http.get<AttemptTraceabilityResponse>(
      `${this.baseUrl}/attempts/${attemptId}/traceability`
    );
  }

  // ─── Revisión manual de preguntas abiertas ─────────────────────────────────

  /** Bandeja de intentos del docente pendientes de revisión manual. */
  listPendingManualReview(): Observable<PendingReviewAttemptResponse[]> {
    return this.http.get<PendingReviewAttemptResponse[]>(`${this.baseUrl}/manual-review`);
  }

  /** Detalle de un intento para revisar sus respuestas abiertas. */
  getAttemptReview(attemptId: number): Observable<TeacherAttemptReviewResponse> {
    return this.http.get<TeacherAttemptReviewResponse>(
      `${this.baseUrl}/attempts/${attemptId}/review`
    );
  }

  /** Asigna puntaje y retroalimentación a una respuesta abierta. */
  gradeOpenAnswer(
    attemptId: number,
    answerId: number,
    request: ManualGradeRequest
  ): Observable<TeacherAttemptReviewResponse> {
    return this.http.patch<TeacherAttemptReviewResponse>(
      `${this.baseUrl}/attempts/${attemptId}/answers/${answerId}/manual-grade`,
      request
    );
  }

  /** Cierra la revisión de un intento y recalcula su nota final. */
  completeReview(attemptId: number): Observable<TeacherAttemptReviewResponse> {
    return this.http.patch<TeacherAttemptReviewResponse>(
      `${this.baseUrl}/attempts/${attemptId}/complete-review`,
      {}
    );
  }
}
