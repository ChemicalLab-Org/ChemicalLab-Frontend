import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeacherWhiteboardEditorComponent } from '../../features/teacher/whiteboards/teacher-whiteboard-editor.component';
import { StudentWhiteboardViewerComponent } from '../../features/student/whiteboards/student-whiteboard-viewer.component';
import { TeacherWhiteboardRealtimeService } from '../../core/services/teacher-whiteboard-realtime.service';
import { StudentWhiteboardRealtimeService } from '../../core/services/student-whiteboard-realtime.service';
import { AuthService } from '../../core/services/auth.service';
import { Subject } from 'rxjs';
import { signal } from '@angular/core';
import { environment } from '../../../environments/environment';

describe.each(['teacher', 'student'] as const)('T03 verified state reconciliation: %s', role => {
  let component: any;
  let http: HttpTestingController;
  let sent: any[];
  beforeEach(() => {
    sent = [];
    const realtime = { connectionState: signal('connected'), errors: new Subject(), drawEvents: new Subject(),
      controlEvents: new Subject(), resyncRequests: new Subject(), accessLost: new Subject(),
      sendDraw: vi.fn(event => sent.push(event)), disconnect: vi.fn(), connect: vi.fn(), sendPresence: vi.fn() };
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: TeacherWhiteboardRealtimeService, useValue: realtime },
      { provide: StudentWhiteboardRealtimeService, useValue: realtime },
      { provide: AuthService, useValue: { currentUser: signal({ userId: 7, username: 'fictitious' }) } },
    ] });
    component = TestBed.runInInjectionContext(() => role === 'teacher' ? new TeacherWhiteboardEditorComponent() : new StudentWhiteboardViewerComponent());
    http = TestBed.inject(HttpTestingController);
    component.sessionId = 12;
    component.session.set({ status: 'ACTIVE', canInteract: true });
    vi.spyOn(component, 'clearCanvas').mockImplementation(() => {});
    vi.spyOn(component, 'renderStroke').mockImplementation(() => {});
  });
  afterEach(() => { http.verify(); vi.restoreAllMocks(); });
  function objectEvent(kind: string, x: number, revision: number, clientEventId = 'remote'): any {
    return { sessionId: 12, revision, ownerUserId: 7, actorRole: 'ESTUDIANTE', actorDisplayName: 'Fictitious',
      occurredAt: '', clientEventId, eventType: kind === 'STROKE' ? 'DRAW' : kind,
      tool: kind === 'TEXT' ? 'TEXT' : kind === 'SHAPE' ? 'RECTANGLE' : 'PEN',
      textId: kind === 'TEXT' ? 'object' : null, shapeId: kind === 'SHAPE' ? 'object' : null,
      strokeId: kind === 'STROKE' ? 'object' : null, strokeIndex: null,
      points: [{ x, y: 1 }, { x: x + 10, y: 11 }], color: '#123456', strokeWidth: 4, eraserSize: null,
      fontSize: 24, runs: [{ text: 'Fictitious', bold: false, italic: false, underline: false }] };
  }
  function localEdit(kind: string, x: number): any {
    const event = objectEvent(kind, x, 0);
    if (kind === 'TEXT') {
      const item = { id: 'object', wx: x, wy: 1, color: event.color, size: 24, runs: event.runs };
      component.textItems.set([item]); component.broadcastTextUpsert(item);
    } else if (kind === 'SHAPE') {
      const item = { id: 'object', type: 'RECTANGLE', x1: x, y1: 1, x2: x + 10, y2: 11, color: event.color, strokeWidth: 4 };
      component.shapeItems.set([item]); component.broadcastShapeUpsert(item);
    } else {
      const item = { id: 'object', eventType: 'DRAW', color: event.color, strokeWidth: 4, eraserSize: null, points: event.points };
      component.boardStrokes = [item]; component.broadcastStrokeRestore(item, 0);
    }
    return sent.at(-1);
  }
  function visibleX(kind: string): number | undefined {
    return kind === 'TEXT' ? component.textItems()[0]?.wx : kind === 'SHAPE' ? component.shapeItems()[0]?.x1 : component.boardStrokes[0]?.points[0].x;
  }
  function visible(kind: string): any[] {
    return kind === 'TEXT' ? component.textItems() : kind === 'SHAPE' ? component.shapeItems() : component.boardStrokes;
  }
  function deletion(kind: string, revision: number, clientEventId = 'remote-delete'): any {
    return { ...objectEvent(kind, 0, revision, clientEventId), eventType: kind + '_DELETE' };
  }
  function localDelete(kind: string): any {
    if (kind === 'TEXT') { component.textItems.set([]); component.broadcastTextDelete('object'); }
    else if (kind === 'SHAPE') { component.shapeItems.set([]); component.broadcastShapeDelete('object'); }
    else { component.boardStrokes = []; component.broadcastStrokeDelete({ id: 'object', eventType: 'DRAW' }); }
    return sent.at(-1);
  }
  function snapshot(kind: string, x: number, revision: number): any {
    const event = objectEvent(kind, x, revision);
    return { v: 1, revision,
      texts: kind === 'TEXT' ? [{ id: 'object', ownerUserId: 7, wx: x, wy: 1, color: event.color, size: 24, runs: event.runs }] : [],
      shapes: kind === 'SHAPE' ? [{ id: 'object', ownerUserId: 7, type: 'RECTANGLE', x1: x, y1: 1, x2: x + 10, y2: 11, color: event.color, strokeWidth: 4 }] : [],
      strokes: kind === 'STROKE' ? [{ id: 'object', ownerUserId: 7, eventType: 'DRAW', color: event.color, strokeWidth: 4, eraserSize: null, points: event.points }] : [],
    };
  }
  it.each(['TEXT', 'SHAPE', 'STROKE'])('reconciles a remote edit followed by our confirmed %s edit', kind => {
    component.boardStateReady.set(true);
    component.onRemoteDraw(objectEvent(kind, 1, 1));
    const local = localEdit(kind, 10);
    component.onRemoteDraw(objectEvent(kind, 20, 2));
    component.onRemoteDraw({ ...objectEvent(kind, 10, 3), ...local, revision: 3 });
    expect(visibleX(kind)).toBe(10);
    expect(component.appliedRevision).toBe(3);
    expect(visible(kind)).toHaveLength(1);
    expect(component.confirmedOwners.get(kind + ':object')).toBe(7);
    expect(component.reconciliation.pendingCount).toBe(0);
  });
  it.each(['TEXT', 'SHAPE', 'STROKE'])('preserves later pending %s operations between remote events and acknowledgements', kind => {
    component.boardStateReady.set(true); component.onRemoteDraw(objectEvent(kind, 1, 1));
    const first = localEdit(kind, 10);
    component.onRemoteDraw(objectEvent(kind, 20, 2));
    const second = localEdit(kind, 30);
    component.onRemoteDraw({ ...objectEvent(kind, 10, 3), ...first, revision: 3 });
    expect(visibleX(kind)).toBe(30); expect(component.appliedRevision).toBe(3);
    component.onRemoteDraw(objectEvent(kind, 40, 4));
    expect(visibleX(kind)).toBe(30); expect(component.appliedRevision).toBe(4);
    component.onRemoteDraw({ ...objectEvent(kind, 30, 5), ...second, revision: 5 });
    expect(visibleX(kind)).toBe(30); expect(component.appliedRevision).toBe(5);
    expect(visible(kind)).toHaveLength(1); expect(component.reconciliation.pendingCount).toBe(0);
    expect(component.confirmedOwners.get(kind + ':object')).toBe(7);
  });
  it.each(['TEXT', 'SHAPE', 'STROKE'])('reconciles interleaved legitimate %s deletion and restoration', kind => {
    component.boardStateReady.set(true); component.onRemoteDraw(objectEvent(kind, 1, 1));
    const removed = localDelete(kind);
    component.onRemoteDraw(objectEvent(kind, 20, 2));
    expect(visible(kind)).toEqual([]);
    const restored = localEdit(kind, 30);
    const deleteAck = { ...deletion(kind, 3), ...removed, revision: 3 };
    component.onRemoteDraw(deleteAck);
    component.onRemoteDraw(deletion(kind, 4));
    expect(visibleX(kind)).toBe(30); expect(component.appliedRevision).toBe(4);
    component.onRemoteDraw({ ...objectEvent(kind, 30, 5), ...restored, revision: 5 });
    component.onRemoteDraw(objectEvent(kind, 40, 6));
    const final = JSON.parse(JSON.stringify(visible(kind)));
    component.onRemoteDraw(deleteAck); // old delete must never undo a later confirmed restoration
    expect(visible(kind)).toEqual(final); expect(visibleX(kind)).toBe(40);
    expect(component.appliedRevision).toBe(6); expect(visible(kind)).toHaveLength(1);
    expect(component.reconciliation.pendingCount).toBe(0);
  });
  it.each(['TEXT', 'SHAPE', 'STROKE'])('retires %s acknowledgements included in a snapshot and replays arrivals during recovery', kind => {
    component.boardStateReady.set(true); component.onRemoteDraw(objectEvent(kind, 1, 1));
    const first = localEdit(kind, 10), second = localEdit(kind, 30);
    const remote = objectEvent(kind, 20, 3);
    component.onRemoteDraw(remote); // missing revision 2 triggers one snapshot, preserving both intentions
    component.onRemoteDraw({ ...objectEvent(kind, 10, 2), ...first, revision: 2 });
    component.onRemoteDraw(objectEvent(kind, 40, 4));
    http.expectOne(`${environment.apiUrl}/whiteboards/${role}/12/state`).flush({ revision: 3, stateJson: JSON.stringify(snapshot(kind, 20, 3)) });
    expect(visibleX(kind)).toBe(30); expect(component.appliedRevision).toBe(4);
    expect(component.reconciliation.pendingCount).toBe(1);
    const ownAck = { ...objectEvent(kind, 30, 5), ...second, revision: 5 };
    component.onRemoteDraw(ownAck);
    const final = JSON.parse(JSON.stringify(visible(kind)));
    component.onRemoteDraw(remote); component.onRemoteDraw(ownAck);
    expect(visible(kind)).toEqual(final); expect(visibleX(kind)).toBe(30);
    expect(visible(kind)).toHaveLength(1); expect(component.appliedRevision).toBe(5);
    expect(component.reconciliation.pendingCount).toBe(0);
    http.expectNone(`${environment.apiUrl}/whiteboards/${role}/12/state`);
  });
  it('does not loop on a snapshot that cannot fill a revision gap', () => {
    component.boardStateReady.set(true); component.onRemoteDraw(objectEvent('TEXT', 1, 1));
    localEdit('TEXT', 10); component.onRemoteDraw(objectEvent('TEXT', 20, 4));
    component.onRemoteDraw(objectEvent('TEXT', 30, 5));
    http.expectOne(`${environment.apiUrl}/whiteboards/${role}/12/state`).flush({ revision: 2, stateJson: JSON.stringify(snapshot('TEXT', 2, 2)) });
    expect(component.boardStateReady()).toBe(false); expect(component.appliedRevision).toBe(2);
    expect(visibleX('TEXT')).toBe(10); expect(component.reconciliation.pendingCount).toBe(1);
    expect(component.queuedRemoteDrawEvents.map((event: any) => event.revision)).toEqual([4, 5]);
    http.expectNone(`${environment.apiUrl}/whiteboards/${role}/12/state`);
  });
  it('keeps stroke order and eraser identity without painting duplicate records on acknowledgement', () => {
    component.boardStateReady.set(true); component.onRemoteDraw(objectEvent('STROKE', 1, 1));
    const eraser = { ...objectEvent('STROKE', 2, 2), eventType: 'ERASE', tool: 'ERASER', strokeId: 'eraser', eraserSize: 24 };
    component.onRemoteDraw(eraser);
    const local = { id: 'object', eventType: 'DRAW', color: '#123456', strokeWidth: 4, eraserSize: null, points: [{ x: 10, y: 1 }] };
    component.boardStrokes[0] = local; component.broadcastStrokeRestore(local, 0);
    const pending = sent.at(-1);
    local.points[0].x = 999; // subsequent UI mutation cannot rewrite the payload already sent
    component.onRemoteDraw({ ...objectEvent('STROKE', 20, 3), strokeIndex: 0 });
    expect(component.boardStrokes[0].points[0].x).toBe(10);
    component.onRemoteDraw({ ...objectEvent('STROKE', 10, 4), ...pending, points: [{ x: 10, y: 1 }], revision: 4 });
    expect(component.boardStrokes.map((item: any) => item.id)).toEqual(['object', 'eraser']);
    expect(component.boardStrokes.map((item: any) => item.eventType)).toEqual(['DRAW', 'ERASE']);
    expect(component.appliedRevision).toBe(4);
  });
  it('removes rejected optimistic objects and history, restores the server snapshot and drops old queued events', () => {
    component.textItems.set([{ id: 'optimistic', runs: [], size: 24 }]);
    component.reconciliation.track({ eventType: 'TEXT_DELETE', textId: 'verified', clientEventId: 'optimistic-event' });
    component.undoStack.set([{ id: 'optimistic-undo' }]);
    component.resynchronize('rejected');
    expect(component.canDraw()).toBe(false);
    component.onRemoteDraw({ revision: 4, eventType: 'TEXT_DELETE', textId: 'verified' });
    http.expectOne(`${environment.apiUrl}/whiteboards/${role}/12/state`).flush({ sessionId: 12, revision: 4,
      stateJson: JSON.stringify({ v: 1, revision: 4, strokes: [], shapes: [], texts: [
        { id: 'verified', ownerUserId: 7, wx: 1, wy: 1, color: '#123456', size: 24, runs: [] },
      ] }) });
    expect(component.textItems().map((item: any) => item.id)).toEqual(['verified']);
    expect(component.undoStack()).toEqual([]); expect(component.reconciliation.pendingCount).toBe(0);
    expect(component.boardStateReady()).toBe(true);
    if (role === 'student') {
      expect(component.ownsObject('TEXT', 'verified')).toBe(true);
      expect(component.ownsObject('TEXT', 'unknown')).toBe(false);
    }
  });
  it('keeps the in-progress stroke visible when a concurrent event rebuilds the canvas', () => {
    component.boardStateReady.set(true);
    component.tool.set('PEN'); component.drawing = true;
    component.currentStroke = [{ x: 50, y: 50 }, { x: 60, y: 60 }];
    component.onRemoteDraw(objectEvent('STROKE', 1, 1));
    expect(component.renderStroke).toHaveBeenLastCalledWith(component.currentStroke, component.activeColor(), component.activeWidth());
    expect(component.boardStrokes).toHaveLength(1);
    expect(component.appliedRevision).toBe(1); expect(sent).toEqual([]);
  });
  it.each(['TEXT', 'SHAPE'])('keeps an active %s drag over an earlier own acknowledgement until pointer-up publishes it', kind => {
    component.boardStateReady.set(true); component.tool.set('SELECT');
    component.onRemoteDraw(objectEvent(kind, 1, 1)); const first = localEdit(kind, 10);
    const pointer = { target: document.createElement('div'), pointerId: 1, clientX: 0, clientY: 0,
      preventDefault: vi.fn(), stopPropagation: vi.fn() };
    if (kind === 'TEXT') {
      component.onTextItemPointerDown(visible(kind)[0], pointer);
      component.onTextItemPointerMove({ ...pointer, clientX: 20 });
    } else {
      component.onShapePointerDown(visible(kind)[0], pointer);
      component.onShapePointerMove({ ...pointer, clientX: 20 });
    }
    expect(visibleX(kind)).toBe(30);
    component.onRemoteDraw({ ...objectEvent(kind, 10, 2), ...first, revision: 2 });
    expect(visibleX(kind)).toBe(30);
    if (kind === 'TEXT') component.onTextItemPointerUp(pointer); else component.onShapePointerUp(pointer);
    const moved = sent.at(-1); expect(moved.points[0].x).toBe(30);
    component.onRemoteDraw({ ...objectEvent(kind, 30, 3), ...moved, revision: 3 });
    expect(visibleX(kind)).toBe(30); expect(component.appliedRevision).toBe(3);
    expect(component.reconciliation.pendingCount).toBe(0);
  });
  it('can undo and redo a stroke after its acknowledgement without comparing server ownership to UI history', () => {
    component.boardStateReady.set(true); component.tool.set('PEN');
    component.publishStroke([{ x: 10, y: 1 }, { x: 20, y: 11 }]);
    const created = sent.at(-1);
    component.onRemoteDraw({ ...objectEvent('STROKE', 10, 1), ...created, revision: 1 });
    expect(component.undoWhiteboardAction()).toBe(true);
    expect(component.boardStrokes).toEqual([]);
    const removed = sent.at(-1); expect(removed.eventType).toBe('STROKE_DELETE');
    component.onRemoteDraw({ ...deletion('STROKE', 2), ...removed, revision: 2 });
    expect(component.redoWhiteboardAction()).toBe(true);
    const restored = sent.at(-1);
    component.onRemoteDraw({ ...objectEvent('STROKE', 10, 3), ...restored, revision: 3 });
    expect(component.boardStrokes).toHaveLength(1);
    expect(component.boardStrokes[0].id).toBe(created.strokeId);
    expect(component.boardStrokes[0].points).toEqual(created.points);
    expect(component.confirmedOwners.get('STROKE:' + created.strokeId)).toBe(7);
    expect(component.appliedRevision).toBe(3); expect(component.reconciliation.pendingCount).toBe(0);
  });
  it('does not repeat a local delete side effect over a later pending restoration and edit', () => {
    component.boardStateReady.set(true); component.onRemoteDraw(objectEvent('TEXT', 1, 1));
    const removed = localDelete('TEXT'); const restored = localEdit('TEXT', 30);
    component.editingTextId.set('object'); component.selectedTextId.set('object');
    component.onRemoteDraw({ ...deletion('TEXT', 2), ...removed, revision: 2 });
    expect(component.editingTextId()).toBe('object'); expect(component.selectedTextId()).toBe('object');
    expect(visibleX('TEXT')).toBe(30);
    component.onRemoteDraw({ ...objectEvent('TEXT', 30, 3), ...restored, revision: 3 });
    expect(visibleX('TEXT')).toBe(30); expect(component.appliedRevision).toBe(3);
  });
  if (role === 'teacher') it('keeps history for an operation sent after our pending clear', () => {
    component.boardStateReady.set(true); component.onRemoteDraw(objectEvent('TEXT', 1, 1));
    component.confirmClear(); const cleared = sent.at(-1);
    component.tool.set('PEN'); component.publishStroke([{ x: 10, y: 1 }]); const stroke = sent.at(-1);
    component.onRemoteDraw(objectEvent('TEXT', 20, 2));
    component.onRemoteDraw({ ...objectEvent('TEXT', 0, 3), ...cleared, revision: 3 });
    expect(component.textItems()).toEqual([]); expect(component.boardStrokes).toHaveLength(1);
    expect(component.undoStack()).toHaveLength(1);
    component.onRemoteDraw({ ...objectEvent('STROKE', 10, 4), ...stroke, revision: 4 });
    expect(component.boardStrokes).toHaveLength(1); expect(component.appliedRevision).toBe(4);
    expect(component.undoWhiteboardAction()).toBe(true); expect(component.boardStrokes).toEqual([]);
  });
  it('keeps drawing blocked if authoritative state cannot be fetched', () => {
    component.resynchronize('rejected');
    http.expectOne(`${environment.apiUrl}/whiteboards/${role}/12/state`).flush({}, { status: 503, statusText: 'Unavailable' });
    expect(component.boardStateReady()).toBe(false); expect(component.canDraw()).toBe(false);
  });
  it('fetches state on a revision gap instead of applying out of order edits', () => {
    component.boardStateReady.set(true); component.appliedRevision = 2;
    component.onRemoteDraw({ revision: 4, eventType: 'CLEAR' });
    expect(component.boardStateReady()).toBe(false);
    http.expectOne(`${environment.apiUrl}/whiteboards/${role}/12/state`).flush({ revision: 4, stateJson: null });
    expect(component.appliedRevision).toBe(4);
  });
});
