import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { TeacherWhiteboardRealtimeService } from './teacher-whiteboard-realtime.service';
import { StudentWhiteboardRealtimeService } from './student-whiteboard-realtime.service';
import { environment } from '../../../environments/environment';

const transport = vi.hoisted(() => ({ clients: [] as any[] }));
vi.mock('@stomp/stompjs', () => ({
  Client: class {
    connected = true;
    connectHeaders: Record<string, string> = {};
    reconnectDelay = 4000;
    callbacks = new Map<string, (message: any) => void>();
    activate = vi.fn();
    deactivate = vi.fn().mockResolvedValue(undefined);
    publish = vi.fn();
    subscribe(destination: string, callback: (message: any) => void) { this.callbacks.set(destination, callback); }
    constructor(config: unknown) { Object.assign(this, config); transport.clients.push(this); }
  },
}));

describe.each([TeacherWhiteboardRealtimeService, StudentWhiteboardRealtimeService])('T03 realtime %s', Service => {
  let service: TeacherWhiteboardRealtimeService | StudentWhiteboardRealtimeService;
  let auth: AuthService;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    sessionStorage.clear(); transport.clients.length = 0;
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    auth = TestBed.inject(AuthService); http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    service = TestBed.inject(Service);
    sessionStorage.setItem('auth_token', 'first-token');
  });
  afterEach(() => { service.disconnect(); http.verify(); vi.restoreAllMocks(); sessionStorage.clear(); });
  async function connect() {
    service.connect(12); const client = transport.clients.at(-1);
    await client.beforeConnect(); client.onConnect(); return client;
  }
  it('reads the current token at every reconnect and subscribes only to the explicit destinations', async () => {
    const client = await connect();
    expect(client.connectHeaders.Authorization).toBe('Bearer first-token');
    sessionStorage.setItem('auth_token', 'replacement-token');
    await client.beforeConnect();
    expect(client.connectHeaders.Authorization).toBe('Bearer replacement-token');
    expect([...client.callbacks.keys()]).toEqual(['/user/queue/whiteboard-errors', '/topic/whiteboards/12']);
    expect(client.publish).toHaveBeenCalledWith({ destination: '/app/whiteboards/12/presence', body: '' });
  });
  it('stops retries and clears only the revoked platform session', async () => {
    const client = await connect(); client.onWebSocketClose({ code: 4001 });
    expect(auth.getToken()).toBeNull(); expect(client.reconnectDelay).toBe(0);
    expect(client.deactivate).toHaveBeenCalled(); expect(navigate).toHaveBeenCalledWith('/auth/login');
  });
  it('preserves a replacement token when an old socket receives a late revocation', async () => {
    const client = await connect(); sessionStorage.setItem('auth_token', 'new-token');
    client.onWebSocketClose({ code: 4001 });
    expect(auth.getToken()).toBe('new-token'); expect(navigate).not.toHaveBeenCalled();
  });
  it('stops an inaccessible board without logging out of the platform', async () => {
    const client = await connect(); const lost = vi.fn(); service.accessLost.subscribe(lost);
    client.onWebSocketClose({ code: 4003 });
    expect(service.failure()).toBe('access'); expect(client.reconnectDelay).toBe(0);
    expect(auth.getToken()).toBe('first-token'); expect(navigate).not.toHaveBeenCalled(); expect(lost).toHaveBeenCalledOnce();
  });
  it('keeps retries for a transient network failure', async () => {
    const client = await connect(); client.onWebSocketClose({ code: 1006 });
    expect(service.failure()).toBe('network'); expect(service.connectionState()).toBe('connecting');
    expect(client.reconnectDelay).toBe(4000); expect(auth.getToken()).toBe('first-token');
  });
  it('resynchronizes an ordinary drawing rejection without logout or reconnect', async () => {
    const client = await connect(); const resync = vi.fn(), errors = vi.fn();
    service.resyncRequests.subscribe(resync); service.errors.subscribe(errors);
    client.callbacks.get('/user/queue/whiteboard-errors')({ body: JSON.stringify({ code: 'DRAW_REJECTED', error: 'Solo tus objetos', resync: true }) });
    expect(resync).toHaveBeenCalledWith('rejected'); expect(errors).toHaveBeenCalledWith('Solo tus objetos');
    expect(auth.getToken()).toBe('first-token'); expect(client.deactivate).not.toHaveBeenCalled();
  });
  it('confirms an invalid session through HTTP when a proxy hides the close code', async () => {
    const client = await connect(); client.onStompError({});
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.getToken()).toBeNull(); expect(client.reconnectDelay).toBe(0);
  });
  it('correlates a rejection without confirming or erasing a later operation', async () => {
    const client = await connect(); const rejected = vi.fn(), resync = vi.fn(), draws = vi.fn();
    service.rejectedOperations.subscribe(rejected); service.resyncRequests.subscribe(resync); service.drawEvents.subscribe(draws);
    const event = { eventType: 'TEXT_DELETE', tool: 'TEXT', textId: 'mine', clientEventId: 'first' } as const;
    service.sendDraw(event); service.sendDraw({ ...event, clientEventId: 'later' });
    expect(client.publish).toHaveBeenCalledWith({ destination: '/app/whiteboards/12/draw', headers: { 'client-event-id': 'first' }, body: JSON.stringify(event) });
    client.callbacks.get('/user/queue/whiteboard-errors')({ body: JSON.stringify({ code: 'TRAFFIC_RATE_LIMITED', accepted: false, clientEventId: 'first' }) });
    expect(rejected).toHaveBeenCalledWith('first'); expect(resync).not.toHaveBeenCalled(); expect(draws).not.toHaveBeenCalled();
    expect((service as any).pending.size).toBe(1); expect((service as any).pending.has('later')).toBe(true);
  });
  it('retires unconfirmed operations after ten seconds and clears timers on disconnect', async () => {
    vi.useFakeTimers();
    try {
      const client = await connect(); const rejected = vi.fn(); service.rejectedOperations.subscribe(rejected);
      service.sendDraw({ eventType: 'CLEAR', tool: 'CLEAR', clientEventId: 'timeout' });
      vi.advanceTimersByTime(9999); expect(rejected).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1); expect(rejected).toHaveBeenCalledWith('timeout'); expect((service as any).pending.size).toBe(0);
      service.sendDraw({ eventType: 'CLEAR', tool: 'CLEAR', clientEventId: 'closed' }); service.disconnect();
      vi.advanceTimersByTime(10000); expect(rejected).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it('limits local pending operations and handles a transport limit without logout', async () => {
    const client = await connect(); const rejected = vi.fn(); service.rejectedOperations.subscribe(rejected);
    for (let i = 0; i < 129; i++) service.sendDraw({ eventType: 'CLEAR', tool: 'CLEAR', clientEventId: `id-${i}` });
    expect((service as any).pending.size).toBe(128); expect(rejected).toHaveBeenCalledWith('id-128');
    client.onWebSocketClose({ code: 4429 }); expect(auth.getToken()).toBe('first-token'); expect((service as any).pending.size).toBe(0);
    expect(client.reconnectDelay).toBe(4000); expect(service.connectionState()).toBe('connecting');
  });
  it('does not erase session state when verification encounters a transient error', async () => {
    const client = await connect(); client.onStompError({});
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({}, { status: 503, statusText: 'Unavailable' });
    expect(auth.getToken()).toBe('first-token'); expect(service.failure()).toBe('network');
  });
});
