import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { TeacherWhiteboardRealtimeService } from '../../core/services/teacher-whiteboard-realtime.service';
import { StudentWhiteboardRealtimeService } from '../../core/services/student-whiteboard-realtime.service';
import { TeacherWhiteboardEditorComponent } from '../../features/teacher/whiteboards/teacher-whiteboard-editor.component';
import { StudentWhiteboardViewerComponent } from '../../features/student/whiteboards/student-whiteboard-viewer.component';
import { environment } from '../../../environments/environment';

// Opt-in: JSON emitted by the backend WhiteboardBrowserFixture. No real account or endpoint is accepted.
const fixtureJson = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } })
  .process?.env['T03_LIVE_FIXTURE'];
type Fixture = { origin: string; boardId: number; teacher: string; student: string; password: string };

describe.skipIf(!fixtureJson)('T03 live component / STOMP / PostgreSQL reconciliation', () => {
  const peers: Peer[] = [];
  afterEach(async () => { await Promise.all(peers.splice(0).map(peer => peer.close())); vi.restoreAllMocks(); TestBed.resetTestingModule(); });
  it.each(['teacher', 'student'] as const)('matches the persisted state after interleaved edits and own acknowledgements: %s', async role => {
    const fixture = JSON.parse(fixtureJson!) as Fixture;
    expect(fixture.origin).toBe('http://127.0.0.1:18087');
    expect(fixture.teacher).toMatch(/^t03fixture\d+$/); expect(fixture.student).toMatch(/^t03fixture\d+$/);
    expect(fixture.password).toBe('FictitiousPass123');
    async function request(path: string, token?: string, body?: unknown): Promise<any> {
      const response = await fetch(fixture.origin + path, { method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body) });
      expect(response.status).toBe(200);
      return response.json();
    }
    const teacher = await request('/api/auth/login', undefined, { usernameOrEmail: fixture.teacher, password: fixture.password });
    const student = await request('/api/auth/login', undefined, { usernameOrEmail: fixture.student, password: fixture.password });
    const teacherPeer = new Peer(fixture), studentPeer = new Peer(fixture); peers.push(teacherPeer, studentPeer);
    await teacherPeer.connect(teacher.token); await studentPeer.connect(student.token);
    // Each sender observes its own barrier, proving both subscriptions are installed without sleeps.
    teacherPeer.send(text(`barrier-teacher-${role}`, 0, `barrier-teacher-${role}`));
    await teacherPeer.event(`barrier-teacher-${role}`);
    studentPeer.send(text(`barrier-student-${role}`, 0, `barrier-student-${role}`));
    await studentPeer.event(`barrier-student-${role}`);
    const id = `ack-${role}`;
    studentPeer.send(text(id, 1, `seed-${role}`)); // student owns it; both student and teacher may modify it
    await studentPeer.event(`seed-${role}`); await teacherPeer.event(`seed-${role}`);

    const own = role === 'teacher' ? teacherPeer : studentPeer;
    const remote = role === 'teacher' ? studentPeer : teacherPeer;
    const actor = role === 'teacher' ? teacher : student;
    const sent: any[] = [];
    const realtime = { connectionState: signal('connected'), errors: new Subject(), drawEvents: new Subject(),
      controlEvents: new Subject(), resyncRequests: new Subject(), accessLost: new Subject(),
      sendDraw: (event: unknown) => sent.push(event), connect: vi.fn(), disconnect: vi.fn(), sendPresence: vi.fn() };
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: AuthService, useValue: { currentUser: signal(actor) } },
      { provide: TeacherWhiteboardRealtimeService, useValue: realtime },
      { provide: StudentWhiteboardRealtimeService, useValue: realtime },
    ] });
    // Supply the authenticated initial state below; retain the real component and its full template.
    vi.spyOn(role === 'teacher' ? TeacherWhiteboardEditorComponent.prototype : StudentWhiteboardViewerComponent.prototype,
      'ngOnInit').mockImplementation(() => {});
    const view = role === 'teacher' ? TestBed.createComponent(TeacherWhiteboardEditorComponent)
      : TestBed.createComponent(StudentWhiteboardViewerComponent);
    const component: any = view.componentInstance;
    component.sessionId = fixture.boardId; component.session.set({ status: 'ACTIVE', canInteract: true });
    component.loading.set(false);
    vi.spyOn(component, 'ensureCanvas').mockReturnValue(null);
    vi.spyOn(component, 'renderStroke').mockImplementation(() => {}); // no canvas bitmap in jsdom
    const http = TestBed.inject(HttpTestingController);
    const statePath = `/api/whiteboards/${role}/${fixture.boardId}/state`;
    component.loadBoardState();
    http.expectOne(`${environment.apiUrl}/whiteboards/${role}/${fixture.boardId}/state`).flush(await request(statePath, actor.token));
    own.onEvent = event => component.onRemoteDraw(event);
    const visibleX = () => component.textItems().find((item: any) => item.id === id)?.wx;
    function optimistic(x: number): any {
      const item = { id, wx: x, wy: 1, color: '#123456', size: 24, runs: text(id, x, '').runs };
      component.textItems.update((items: any[]) => items.map(current => current.id === id ? item : current));
      component.broadcastTextUpsert(item);
      return sent.at(-1);
    }
    const a = optimistic(10); // held in this test's transport until B has committed
    remote.send(text(id, 20, `B-${role}`)); const b = await own.event(`B-${role}`);
    expect(visibleX()).toBe(10); expect(component.appliedRevision).toBe(b.revision);
    const later = optimistic(30);
    own.send(a); const ackA = await own.event(a.clientEventId);
    expect(visibleX()).toBe(30); expect(component.appliedRevision).toBe(ackA.revision);
    const intermediate = await request(statePath, actor.token);
    expect(JSON.parse(intermediate.stateJson).texts.find((item: any) => item.id === id).wx).toBe(10);
    remote.send(text(id, 40, `C-${role}`)); await own.event(`C-${role}`);
    expect(visibleX()).toBe(30);
    own.send(later); const finalAck = await own.event(later.clientEventId);
    const persisted = await request(statePath, actor.token);
    const snapshot = JSON.parse(persisted.stateJson);
    expect(component.textItems()).toEqual(snapshot.texts.map(({ ownerUserId, ...item }: any) => item));
    expect(visibleX()).toBe(30); expect(component.appliedRevision).toBe(persisted.revision);
    expect(component.appliedRevision).toBe(finalAck.revision);
    view.detectChanges();
    const rendered = Array.from(view.nativeElement.querySelectorAll('.text-item')) as HTMLElement[];
    expect(rendered.map(item => ({ text: item.textContent?.trim(), left: item.style.left, top: item.style.top })))
      .toEqual(snapshot.texts.map((item: any) => ({ text: item.runs.map((run: any) => run.text).join(''),
        left: `${component.toScreenX(item.wx)}px`, top: `${component.toScreenY(item.wy)}px` })));
    expect(component.confirmedOwners.get(`TEXT:${id}`)).toBe(student.userId);
    expect(component.reconciliation.pendingCount).toBe(0);
    component.onRemoteDraw(ackA); component.onRemoteDraw(finalAck); // duplicates cannot change the projection
    expect(visibleX()).toBe(30); expect(component.appliedRevision).toBe(persisted.revision);
    expect(teacherPeer.errors).toEqual([]); expect(studentPeer.errors).toEqual([]); http.verify();
  }, 30000);
});

function text(id: string, x: number, marker: string): any {
  return { eventType: 'TEXT', tool: 'TEXT', textId: id, clientEventId: marker,
    points: [{ x, y: 1 }], color: '#123456', fontSize: 24,
    runs: [{ text: `Fictitious live ${id}`, bold: false, italic: false, underline: false }] };
}

class Peer {
  private socket?: { postMessage(message: string): void; terminate(): Promise<number> };
  private packets: string[] = [];
  private events: any[] = [];
  readonly errors: unknown[] = [];
  onEvent?: (event: any) => void;
  constructor(private readonly fixture: Fixture) {}
  async connect(token: string): Promise<void> {
    // Native WebSocket runs in a Node worker so jsdom's Event globals cannot cross realms.
    // Runtime import keeps this test-only transport out of Angular's browser bundle.
    const workerModule = 'node:worker_threads';
    const { Worker } = await import(/* @vite-ignore */ workerModule);
    const socket = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      const socket = new WebSocket(workerData);
      socket.onmessage = message => parentPort.postMessage(String(message.data));
      socket.onerror = () => parentPort.postMessage('transport-error');
      parentPort.on('message', frame => socket.send(frame));
    `, { eval: true, workerData: `${this.fixture.origin.replace('http:', 'ws:')}/ws/000/${crypto.randomUUID()}/websocket` });
    this.socket = socket;
    socket.on('error', () => this.errors.push('transport-worker-error'));
    socket.on('message', (packet: string) => {
      this.packets.push(packet);
      if (packet === 'transport-error') this.errors.push(packet);
      if (!packet.startsWith('a')) return;
      for (const frame of JSON.parse(packet.slice(1)) as string[]) {
        this.packets.push(frame);
        if (!frame.startsWith('MESSAGE')) continue;
        const event = JSON.parse(frame.slice(frame.indexOf('\n\n') + 2).replace(/\0$/, ''));
        if (event.code) this.errors.push(event);
        else if (event.revision !== undefined) { this.onEvent?.(event); this.events.push(event); }
      }
    });
    await this.until(() => this.packets.includes('o'));
    this.frame(`CONNECT\naccept-version:1.2\nheart-beat:0,0\nAuthorization:Bearer ${token}\n\n\0`);
    await this.until(() => this.packets.some(packet => packet.startsWith('CONNECTED')));
    this.frame(`SUBSCRIBE\nid:board\ndestination:/topic/whiteboards/${this.fixture.boardId}\n\n\0`);
    this.frame('SUBSCRIBE\nid:errors\ndestination:/user/queue/whiteboard-errors\n\n\0');
  }
  send(event: unknown): void { this.frame(`SEND\ndestination:/app/whiteboards/${this.fixture.boardId}/draw\ncontent-type:application/json\n\n${JSON.stringify(event)}\0`); }
  async event(id: string): Promise<any> { await this.until(() => this.events.some(event => event.clientEventId === id)); return this.events.find(event => event.clientEventId === id); }
  async close(): Promise<void> { this.onEvent = undefined; await this.socket?.terminate(); }
  private frame(frame: string): void { this.socket!.postMessage(JSON.stringify([frame])); }
  private async until(condition: () => boolean): Promise<void> {
    const end = Date.now() + 8000;
    while (!condition() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10));
    expect(condition(), 'Timed out waiting for the real SockJS/STOMP transport').toBe(true);
  }
}
