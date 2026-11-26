import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TeacherWhiteboardService } from '../../core/services/teacher-whiteboard.service';
import { StudentWhiteboardService } from '../../core/services/student-whiteboard.service';
import { TeacherWhiteboardRealtimeService } from '../../core/services/teacher-whiteboard-realtime.service';
import { StudentWhiteboardRealtimeService } from '../../core/services/student-whiteboard-realtime.service';
import { WhiteboardViewContext } from '../../core/services/whiteboard-view-context';
import { WhiteboardSessionStatus } from '../../shared/models';
import { QueryPage } from '../../shared/models/query-page.models';
import { TeacherWhiteboardEditorComponent } from '../teacher/whiteboards/teacher-whiteboard-editor.component';
import { StudentWhiteboardViewerComponent } from '../student/whiteboards/student-whiteboard-viewer.component';
import { StudentWhiteboardRecordComponent } from '../student/whiteboards/student-whiteboard-record.component';
import { ClassChoice, EvaluationView } from './catalog-api';

interface BoardRow { id: number; name: string; status: WhiteboardSessionStatus }

@Component({
  selector: 'app-institutional-whiteboards-scope',
  providers: [
    WhiteboardViewContext, TeacherWhiteboardService, StudentWhiteboardService,
    TeacherWhiteboardRealtimeService, StudentWhiteboardRealtimeService,
  ],
  imports: [FormsModule, TeacherWhiteboardEditorComponent, StudentWhiteboardViewerComponent, StudentWhiteboardRecordComponent],
  templateUrl: './institutional-whiteboards-scope.component.html',
  styleUrl: './institutional-evaluations.scss',
})
export class InstitutionalWhiteboardsScopeComponent extends EvaluationView implements OnInit {
  readonly scope = input.required<ClassChoice>();
  readonly teacher = input.required<boolean>();
  readonly boards = signal<QueryPage<BoardRow> | null>(null);
  readonly openBoard = signal<BoardRow | null>(null);
  readonly history = signal(false);
  readonly selected = computed(() => this.openBoard() ? [this.openBoard()!] : []);
  readonly creating = signal(false);
  readonly status: Record<WhiteboardSessionStatus, string> = {
    ACTIVE: 'Activa', PAUSED: 'Pausada', CLOSED: 'Finalizada',
  };
  title = '';
  description = '';
  private readonly context = inject(WhiteboardViewContext);
  private readonly teacherApi = inject(TeacherWhiteboardService);
  private readonly studentApi = inject(StudentWhiteboardService);

  ngOnInit(): void {
    this.context.select(this.scope());
    this.load();
  }

  load(page = 0): void {
    const request = this.teacher() ? this.teacherApi.listSessions(page) :
      this.history() ? this.studentApi.listHistory(page) : this.studentApi.listActiveSessions(page);
    this.run<QueryPage<BoardRow>>(request, boards => this.boards.set(boards));
  }

  setHistory(history: boolean): void {
    this.history.set(history);
    this.boards.set(null);
    this.load();
  }

  create(): void {
    this.run(this.teacherApi.createSession({ name: this.title.trim(), description: this.description.trim(), grade: '', section: '' }), board => {
      this.title = '';
      this.description = '';
      this.creating.set(false);
      this.openBoard.set(board);
    });
  }

  back(): void {
    this.openBoard.set(null);
    this.boards.set(null);
    this.load();
  }

  openCapture(board: BoardRow): void {
    this.history.set(true);
    this.openBoard.set({ ...board, status: 'CLOSED' });
  }

  protected override clearRestricted(): void {
    this.boards.set(null);
    this.openBoard.set(null);
    this.creating.set(false);
    this.title = '';
    this.description = '';
  }
}
