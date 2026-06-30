import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  WhiteboardHistoryItemResponse,
  WhiteboardStudentSessionResponse,
} from '../../shared/models';

/**
 * Servicio REST de la pizarra interactiva para el rol ESTUDIANTE.
 *
 * <p>Consume los endpoints bajo {@code /api/whiteboards/student}. El token JWT lo agrega el
 * authInterceptor; el estudiante se identifica en el backend a partir del usuario autenticado,
 * nunca de la URL. El backend solo devuelve sesiones del grado/sección del estudiante, así que
 * este servicio no necesita (ni debe) filtrar por grado/sección en el cliente.</p>
 *
 * <p>El transporte en vivo del dibujo va por WebSocket (ver StudentWhiteboardRealtimeService);
 * este servicio solo gestiona la lista, la unión, el detalle, el historial y la captura final.</p>
 */
@Injectable({ providedIn: 'root' })
export class StudentWhiteboardService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/whiteboards/student`;

  /** Lista las sesiones ACTIVE/PAUSED disponibles para el grado/sección del estudiante. */
  listActiveSessions(): Observable<WhiteboardStudentSessionResponse[]> {
    return this.http.get<WhiteboardStudentSessionResponse[]>(`${this.baseUrl}/active`);
  }

  /**
   * Une al estudiante a una sesión en vivo (idempotente en el backend). Devuelve el detalle de la
   * sesión con el permiso efectivo actual del estudiante.
   */
  joinSession(sessionId: number): Observable<WhiteboardStudentSessionResponse> {
    return this.http.post<WhiteboardStudentSessionResponse>(`${this.baseUrl}/${sessionId}/join`, {});
  }

  /** Obtiene el detalle de una sesión visible para el estudiante (recalcula joined/canInteract). */
  getSessionDetail(sessionId: number): Observable<WhiteboardStudentSessionResponse> {
    return this.http.get<WhiteboardStudentSessionResponse>(`${this.baseUrl}/${sessionId}`);
  }

  /** Lista el historial de sesiones cerradas del grado/sección del estudiante. */
  listHistory(): Observable<WhiteboardHistoryItemResponse[]> {
    return this.http.get<WhiteboardHistoryItemResponse[]>(`${this.baseUrl}/history`);
  }

  /** Descarga la captura final de una sesión cerrada como imagen (blob) para mostrarla/guardarla. */
  getSnapshot(sessionId: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${sessionId}/snapshot`, { responseType: 'blob' });
  }
}
