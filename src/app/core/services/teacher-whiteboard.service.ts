import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  WhiteboardGlobalInteractionRequest,
  WhiteboardParticipantInteractionRequest,
  WhiteboardParticipantResponse,
  WhiteboardSessionCreateRequest,
  WhiteboardSessionDetailResponse,
  WhiteboardSessionResponse,
} from '../../shared/models';

/**
 * Servicio REST de la pizarra interactiva para el rol DOCENTE.
 * Consume los endpoints bajo /api/whiteboards/teacher. El token JWT lo agrega el
 * authInterceptor; el docente se identifica en el backend a partir del usuario
 * autenticado, nunca de la URL. El transporte en vivo del dibujo va por WebSocket
 * (ver TeacherWhiteboardRealtimeService); este servicio solo gestiona la sesión.
 */
@Injectable({ providedIn: 'root' })
export class TeacherWhiteboardService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/whiteboards/teacher`;

  /** Lista las sesiones de pizarra del docente autenticado (activas, pausadas, cerradas). */
  listSessions(): Observable<WhiteboardSessionResponse[]> {
    return this.http.get<WhiteboardSessionResponse[]>(this.baseUrl);
  }

  /** Crea una nueva sesión (nombre, grado, sección, descripción opcional). Nace ACTIVE. */
  createSession(request: WhiteboardSessionCreateRequest): Observable<WhiteboardSessionResponse> {
    return this.http.post<WhiteboardSessionResponse>(this.baseUrl, request);
  }

  /** Detalle de una sesión propia: metadata más la lista de participantes. */
  getSessionDetail(sessionId: number): Observable<WhiteboardSessionDetailResponse> {
    return this.http.get<WhiteboardSessionDetailResponse>(`${this.baseUrl}/${sessionId}`);
  }

  /** Pausa una sesión activa (bloquea el dibujo). */
  pauseSession(sessionId: number): Observable<WhiteboardSessionResponse> {
    return this.http.post<WhiteboardSessionResponse>(`${this.baseUrl}/${sessionId}/pause`, {});
  }

  /** Reanuda una sesión pausada. */
  resumeSession(sessionId: number): Observable<WhiteboardSessionResponse> {
    return this.http.post<WhiteboardSessionResponse>(`${this.baseUrl}/${sessionId}/resume`, {});
  }

  /**
   * Finaliza la sesión enviando la captura final del lienzo como imagen (PNG/JPG).
   * El backend la recibe en multipart bajo la parte "snapshot". CLOSED es terminal.
   */
  closeSession(sessionId: number, snapshot: Blob, fileName: string): Observable<WhiteboardSessionResponse> {
    const formData = new FormData();
    formData.append('snapshot', snapshot, fileName);
    return this.http.post<WhiteboardSessionResponse>(`${this.baseUrl}/${sessionId}/close`, formData);
  }

  /** Activa/desactiva el permiso global de interacción de la sesión. */
  updateGlobalInteraction(
    sessionId: number,
    request: WhiteboardGlobalInteractionRequest
  ): Observable<WhiteboardSessionResponse> {
    return this.http.patch<WhiteboardSessionResponse>(
      `${this.baseUrl}/${sessionId}/interaction`,
      request
    );
  }

  /** Cambia el permiso individual de interacción de un alumno (FOLLOW_GLOBAL/ALLOWED/BLOCKED). */
  updateParticipantInteraction(
    sessionId: number,
    studentId: number,
    request: WhiteboardParticipantInteractionRequest
  ): Observable<WhiteboardParticipantResponse> {
    return this.http.patch<WhiteboardParticipantResponse>(
      `${this.baseUrl}/${sessionId}/participants/${studentId}/interaction`,
      request
    );
  }

  /** Lista los participantes (alumnos unidos) de una sesión. */
  listParticipants(sessionId: number): Observable<WhiteboardParticipantResponse[]> {
    return this.http.get<WhiteboardParticipantResponse[]>(
      `${this.baseUrl}/${sessionId}/participants`
    );
  }

  /** Descarga la captura final de una sesión cerrada como imagen (blob). */
  getSnapshot(sessionId: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${sessionId}/snapshot`, { responseType: 'blob' });
  }
}
