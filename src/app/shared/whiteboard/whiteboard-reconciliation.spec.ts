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
  beforeEach(() => {
    const realtime = { connectionState: signal('connected'), errors: new Subject(), drawEvents: new Subject(),
      controlEvents: new Subject(), resyncRequests: new Subject(), accessLost: new Subject(),
      sendDraw: vi.fn(), disconnect: vi.fn(), connect: vi.fn(), sendPresence: vi.fn() };
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
  it('removes rejected optimistic objects and history, restores the server snapshot and drops old queued events', () => {
    component.textItems.set([{ id: 'optimistic', runs: [], size: 24 }]);
    component.ownEventIds.add('optimistic-event');
    component.undoStack.set([{ id: 'optimistic-undo' }]);
    component.resynchronize('rejected');
    expect(component.canDraw()).toBe(false);
    component.onRemoteDraw({ revision: 4, eventType: 'TEXT_DELETE', textId: 'verified' });
    http.expectOne(`${environment.apiUrl}/whiteboards/${role}/12/state`).flush({ sessionId: 12, revision: 4,
      stateJson: JSON.stringify({ v: 1, revision: 4, strokes: [], shapes: [], texts: [
        { id: 'verified', ownerUserId: 7, wx: 1, wy: 1, color: '#123456', size: 24, runs: [] },
      ] }) });
    expect(component.textItems().map((item: any) => item.id)).toEqual(['verified']);
    expect(component.undoStack()).toEqual([]); expect(component.ownEventIds.size).toBe(0);
    expect(component.boardStateReady()).toBe(true);
    if (role === 'student') {
      expect(component.ownsObject('TEXT', 'verified')).toBe(true);
      expect(component.ownsObject('TEXT', 'unknown')).toBe(false);
    }
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
