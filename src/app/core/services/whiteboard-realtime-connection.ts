import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Client, IMessage } from '@stomp/stompjs';
import { Subject } from 'rxjs';
import SockJS from 'sockjs-client';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { SessionCleanupService } from './session-cleanup.service';
import { WhiteboardControlEventResponse, WhiteboardDrawEventRequest, WhiteboardDrawEventResponse,
  WhiteboardTopicMessage, isWhiteboardControlEvent } from '../../shared/models';

export type WhiteboardConnectionState = 'disconnected' | 'connecting' | 'connected';
export type WhiteboardConnectionFailure = 'session' | 'access' | 'network' | 'protocol';

/** Shared transport contract; teacher and pupil still have separate connections and lifecycles. */
@Injectable()
export class WhiteboardRealtimeConnection {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private client: Client | null = null;
  private sessionId: number | null = null;
  readonly connectionState = signal<WhiteboardConnectionState>('disconnected');
  readonly failure = signal<WhiteboardConnectionFailure | null>(null);
  private readonly drawEvents$ = new Subject<WhiteboardDrawEventResponse>();
  private readonly controlEvents$ = new Subject<WhiteboardControlEventResponse>();
  private readonly errors$ = new Subject<string>();
  private readonly resync$ = new Subject<'connected' | 'rejected'>();
  private readonly accessLost$ = new Subject<void>();
  readonly drawEvents = this.drawEvents$.asObservable();
  readonly controlEvents = this.controlEvents$.asObservable();
  readonly errors = this.errors$.asObservable();
  readonly resyncRequests = this.resync$.asObservable();
  readonly accessLost = this.accessLost$.asObservable();

  constructor() { inject(SessionCleanupService).register(() => this.disconnect()); }

  connect(sessionId: number): void {
    if (this.client !== null && this.sessionId === sessionId) return;
    this.disconnect();
    if (!this.auth.getToken()) { this.failure.set('session'); return; }
    this.sessionId = sessionId;
    this.failure.set(null);
    this.connectionState.set('connecting');
    let attemptToken: string | null = null;
    const client = new Client({
      webSocketFactory: () => new SockJS(environment.wsUrl),
      reconnectDelay: 4000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      beforeConnect: async () => {
        if (this.client !== client) return;
        attemptToken = this.auth.getToken();
        if (!attemptToken) { this.stop('session'); return; }
        client.connectHeaders = { Authorization: `Bearer ${attemptToken}` };
      },
      onConnect: () => {
        if (this.client !== client) return;
        this.failure.set(null);
        this.connectionState.set('connected');
        client.subscribe('/user/queue/whiteboard-errors', message => this.handleError(message));
        client.subscribe(`/topic/whiteboards/${sessionId}`, message => this.handleTopic(message));
        this.sendPresence(); // both roles have an explicit presence contract
        this.resync$.next('connected');
      },
      onWebSocketClose: (event: CloseEvent) => {
        if (this.client !== client) return;
        if (event.code === 4001) { this.invalidSession(attemptToken); return; }
        if (event.code === 4003) {
          this.stop('access');
          this.errors$.next('Ya no tienes acceso en vivo a esta pizarra, o la sesión fue finalizada.');
          this.accessLost$.next();
          return;
        }
        this.failure.set('network');
        this.connectionState.set('connecting');
        this.errors$.next('Conexión interrumpida. Se reintentará y se recuperará el estado guardado.');
      },
      onStompError: () => {
        if (this.client !== client) return;
        // Some proxies hide close codes. Ask the persistent HTTP policy before invalidating a session.
        const token = attemptToken;
        this.http.get(`${environment.apiUrl}/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).subscribe({
          next: () => {
            if (this.client !== client || this.auth.getToken() !== token) return;
            this.stop('protocol');
            this.errors$.next('El servidor rechazó la conexión a la pizarra. Vuelve a abrirla para comprobar tu acceso.');
          },
          error: (error: unknown) => {
            if (this.client !== client || this.auth.getToken() !== token) return;
            if (error instanceof HttpErrorResponse && error.status === 401) this.invalidSession(token);
            else { this.failure.set('network'); this.errors$.next('No se pudo verificar la conexión. Se reintentará.'); }
          },
        });
      },
      onWebSocketError: () => {
        if (this.client !== client) return;
        this.failure.set('network');
        this.errors$.next('No se pudo conectar con el servidor de la pizarra.');
      },
    });
    this.client = client;
    client.activate();
  }

  reconnect(sessionId: number): void { this.disconnect(); this.connect(sessionId); }
  sendDraw(event: WhiteboardDrawEventRequest): void {
    if (!this.client?.connected || this.sessionId === null) return;
    this.client.publish({ destination: `/app/whiteboards/${this.sessionId}/draw`, body: JSON.stringify(event) });
  }
  sendPresence(): void {
    if (!this.client?.connected || this.sessionId === null) return;
    this.client.publish({ destination: `/app/whiteboards/${this.sessionId}/presence`, body: '' });
  }
  disconnect(): void {
    const previous = this.client;
    this.client = null;
    this.sessionId = null;
    this.connectionState.set('disconnected');
    if (previous) { previous.reconnectDelay = 0; void previous.deactivate(); }
  }
  private stop(reason: WhiteboardConnectionFailure): void { this.disconnect(); this.failure.set(reason); }
  private invalidSession(token: string | null): void {
    this.stop('session');
    if (token !== this.auth.getToken()) return;
    this.auth.clearLocalSession();
    this.auth.sessionNotice.set('Tu sesión expiró o fue revocada. Inicia sesión de nuevo.');
    void this.router.navigateByUrl('/auth/login');
  }
  private handleTopic(message: IMessage): void {
    let payload: WhiteboardTopicMessage;
    try { payload = JSON.parse(message.body) as WhiteboardTopicMessage; } catch { return; }
    if (isWhiteboardControlEvent(payload)) this.controlEvents$.next(payload);
    else this.drawEvents$.next(payload);
  }
  private handleError(message: IMessage): void {
    let error = 'La pizarra rechazó la última acción. Se recuperará el estado guardado.';
    try { error = (JSON.parse(message.body) as { error?: string }).error ?? error; } catch { /* generic error */ }
    this.errors$.next(error);
    this.resync$.next('rejected');
  }
}
