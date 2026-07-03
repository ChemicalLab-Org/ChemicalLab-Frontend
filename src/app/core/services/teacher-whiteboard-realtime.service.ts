import { Injectable, signal } from '@angular/core';
import { Client, IMessage } from '@stomp/stompjs';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  WhiteboardControlEventResponse,
  WhiteboardDrawEventRequest,
  WhiteboardDrawEventResponse,
  WhiteboardTopicMessage,
  isWhiteboardControlEvent,
} from '../../shared/models';

/** Estado de la conexión WebSocket/STOMP de la pizarra. */
export type WhiteboardConnectionState = 'disconnected' | 'connecting' | 'connected';

/**
 * Conexión WebSocket/STOMP de la pizarra en vivo.
 *
 * Se conecta al endpoint del backend ({@link environment.wsUrl}, derivado del transporte
 * WebSocket de SockJS) enviando el JWT en la cabecera Authorization del frame CONNECT, tal
 * como exige WhiteboardStompAuthChannelInterceptor. Tras conectar:
 *
 * - se suscribe a /topic/whiteboards/{sessionId}, donde el backend difunde tanto eventos de
 *   dibujo como de control; se separan por su eventType;
 * - se suscribe a la cola privada /user/queue/whiteboard-errors para los rechazos del backend;
 * - publica eventos de dibujo en /app/whiteboards/{sessionId}/draw y latidos de presencia en
 *   /app/whiteboards/{sessionId}/presence.
 *
 * No persiste datos sensibles ni expone el token. Una sola sesión activa a la vez.
 */
@Injectable({ providedIn: 'root' })
export class TeacherWhiteboardRealtimeService {
  private client: Client | null = null;
  private sessionId: number | null = null;

  /** Estado de conexión observable por el componente para el indicador visual. */
  readonly connectionState = signal<WhiteboardConnectionState>('disconnected');

  private readonly drawEvents$ = new Subject<WhiteboardDrawEventResponse>();
  private readonly controlEvents$ = new Subject<WhiteboardControlEventResponse>();
  private readonly errors$ = new Subject<string>();

  /** Eventos de dibujo difundidos por otros participantes (y el eco del propio docente). */
  readonly drawEvents = this.drawEvents$.asObservable();
  /** Eventos de control (pausa, reanudación, cierre, permisos) difundidos por el backend. */
  readonly controlEvents = this.controlEvents$.asObservable();
  /** Mensajes de error privados enviados por el backend al rechazar un evento. */
  readonly errors = this.errors$.asObservable();

  /** Conecta y se suscribe a los canales de la sesión indicada. Idempotente por sesión. */
  connect(sessionId: number): void {
    if (this.client !== null && this.sessionId === sessionId) {
      return;
    }
    this.disconnect();

    const token = localStorage.getItem('auth_token');
    if (token === null) {
      this.errors$.next('No hay una sesión autenticada para conectar la pizarra.');
      return;
    }

    this.sessionId = sessionId;
    this.connectionState.set('connecting');

    const client = new Client({
      brokerURL: environment.wsUrl,
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 4000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      onConnect: () => {
        this.connectionState.set('connected');
        client.subscribe(`/topic/whiteboards/${sessionId}`, (message: IMessage) =>
          this.handleTopicMessage(message)
        );
        client.subscribe('/user/queue/whiteboard-errors', (message: IMessage) =>
          this.handleErrorMessage(message)
        );
      },
      onWebSocketClose: () => {
        // Si el cliente sigue activo, stompjs reintentará según reconnectDelay.
        if (this.client !== null) {
          this.connectionState.set('connecting');
        }
      },
      onStompError: (frame) => {
        this.errors$.next(frame.headers['message'] ?? 'Error en la conexión de la pizarra.');
      },
      onWebSocketError: () => {
        this.errors$.next('No se pudo conectar con el servidor de la pizarra.');
      },
    });

    this.client = client;
    client.activate();
  }

  /**
   * Fuerza una reconexión limpia a la sesión indicada. A diferencia de {@link connect}, que es
   * idempotente y no hace nada si ya existe un cliente para la misma sesión, aquí se descarta el
   * cliente actual (que puede haber quedado en un estado intermedio de «conectando») y se crea uno
   * nuevo. Lo usa el botón «Reintentar conexión» cuando la conexión en vivo no se establece.
   */
  reconnect(sessionId: number): void {
    this.disconnect();
    this.connect(sessionId);
  }

  /** Publica un evento de dibujo en el canal de la sesión actual. */
  sendDraw(event: WhiteboardDrawEventRequest): void {
    if (this.client === null || !this.client.connected || this.sessionId === null) {
      return;
    }
    this.client.publish({
      destination: `/app/whiteboards/${this.sessionId}/draw`,
      body: JSON.stringify(event),
    });
  }

  /** Envía un latido de presencia al backend para la sesión actual. */
  sendPresence(): void {
    if (this.client === null || !this.client.connected || this.sessionId === null) {
      return;
    }
    this.client.publish({ destination: `/app/whiteboards/${this.sessionId}/presence`, body: '' });
  }

  /** Cierra la conexión y libera la suscripción. */
  disconnect(): void {
    if (this.client !== null) {
      const client = this.client;
      this.client = null;
      void client.deactivate();
    }
    this.sessionId = null;
    this.connectionState.set('disconnected');
  }

  private handleTopicMessage(message: IMessage): void {
    let payload: WhiteboardTopicMessage;
    try {
      payload = JSON.parse(message.body) as WhiteboardTopicMessage;
    } catch {
      return;
    }
    if (isWhiteboardControlEvent(payload)) {
      this.controlEvents$.next(payload);
    } else {
      this.drawEvents$.next(payload);
    }
  }

  private handleErrorMessage(message: IMessage): void {
    try {
      const parsed = JSON.parse(message.body) as { error?: string };
      this.errors$.next(parsed.error ?? 'La pizarra rechazó la última acción.');
    } catch {
      this.errors$.next('La pizarra rechazó la última acción.');
    }
  }
}
