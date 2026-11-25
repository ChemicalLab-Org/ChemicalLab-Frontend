import { Component, OnInit, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AttemptReceipt, AttemptRow, ClassChoice, Draft, DraftOption, DraftPayload, DraftQuestion,
  EnrollmentRow, EvaluationView, Page, Review, RevisionReceipt, RevisionRow,
} from './catalog-api';

@Component({
  selector: 'app-institutional-teacher',
  imports: [FormsModule],
  templateUrl: './institutional-teacher.component.html',
  styleUrl: './institutional-evaluations.scss',
})
export class InstitutionalTeacherComponent extends EvaluationView implements OnInit {
  readonly scope = input.required<ClassChoice>();
  readonly tab = signal<'revisions' | 'attempts'>('revisions');
  readonly revisions = signal<Page<RevisionRow> | null>(null);
  readonly attempts = signal<Page<AttemptRow> | null>(null);
  readonly draft = signal<Draft | null>(null);
  readonly assignment = signal<RevisionRow | null>(null);
  readonly enrollments = signal<Page<EnrollmentRow> | null>(null);
  readonly recipients = signal<Set<number>>(new Set());
  readonly selectedAttempt = signal<AttemptRow | null>(null);
  readonly review = signal<Review | null>(null);
  readonly message = signal('');
  newTitle = '';
  newMaximum = 1;
  startsAt = '';
  dueAt = '';
  gradeFields: Record<number, { score: number | null; feedback: string }> = {};

  ngOnInit(): void { this.loadRevisions(); }

  switchTab(tab: 'revisions' | 'attempts'): void {
    this.clearRestricted();
    this.error.set('');
    this.tab.set(tab);
    if (tab === 'revisions') this.loadRevisions();
    else this.loadAttempts();
  }

  loadRevisions(after = 0): void {
    this.run(this.api.catalog<RevisionRow>(this.scope(), 'revisions', after), page => this.revisions.set(page));
  }

  loadAttempts(after = 0): void {
    this.run(this.api.catalog<AttemptRow>(this.scope(), 'reviewable-attempts', after), page => this.attempts.set(page));
  }

  create(): void {
    const payload: DraftPayload = {
      resource: { title: this.newTitle.trim(), max_attempts: this.newMaximum, question_display_mode: 'ALL_AT_ONCE' },
      questions: [],
      options: [],
    };
    this.resetDetails();
    this.run(this.api.command<RevisionReceipt>('POST', this.api.authoring(this.scope()), { payload }), receipt => {
      this.newTitle = '';
      this.draft.set({ ...receipt, payload });
      this.message.set('Borrador creado.');
      this.loadRevisions();
    });
  }

  openDraft(row: RevisionRow): void {
    this.resetDetails();
    this.run(this.api.read<Draft>(this.api.authoring(this.scope(), row)), draft => this.draft.set(draft));
  }

  addQuestion(draft: Draft, type: DraftQuestion['question_type']): void {
    const id = Math.max(0, ...draft.payload.questions.map(question => question.id)) + 1;
    draft.payload.questions.push({
      id, question_text: '', question_type: type, points: 1, order_index: draft.payload.questions.length, required: true,
    });
    if (type === 'MULTIPLE_CHOICE') {
      this.addOption(draft, id);
      this.addOption(draft, id);
    }
  }

  removeQuestion(draft: Draft, id: number): void {
    draft.payload.questions = draft.payload.questions.filter(question => question.id !== id);
    draft.payload.questions.forEach((question, index) => question.order_index = index);
    draft.payload.options = draft.payload.options.filter(option => option.question_id !== id);
  }

  options(draft: Draft, id: number): DraftOption[] {
    return draft.payload.options.filter(option => option.question_id === id);
  }

  addOption(draft: Draft, questionId: number): void {
    const id = Math.max(0, ...draft.payload.options.map(option => option.id)) + 1;
    const options = this.options(draft, questionId);
    draft.payload.options.push({ id, question_id: questionId, option_text: '', order_index: options.length,
      correct: options.length === 0 });
  }

  markCorrect(draft: Draft, questionId: number, id: number): void {
    this.options(draft, questionId).forEach(option => option.correct = option.id === id);
  }

  removeOption(draft: Draft, questionId: number, id: number): void {
    draft.payload.options = draft.payload.options.filter(option => option.id !== id);
    this.options(draft, questionId).forEach((option, index) => option.order_index = index);
  }

  saveDraft(draft: Draft): void {
    const payload = structuredClone(draft.payload);
    this.run(this.api.command<RevisionReceipt>('PUT', this.api.authoring(this.scope(), draft),
      { expectedVersion: draft.version, payload }), receipt => {
      this.draft.set({ ...receipt, payload });
      this.message.set('Borrador guardado.');
      this.loadRevisions();
    });
  }

  publish(row: RevisionRow): void {
    this.resetDetails();
    this.run(this.api.command<RevisionReceipt>('POST', this.api.authoring(this.scope(), row) + '/publish',
      { expectedVersion: row.version }), () => {
      this.message.set('Revisión publicada.');
      this.loadRevisions();
    });
  }

  openAssignment(row: RevisionRow): void {
    this.resetDetails();
    this.assignment.set(row);
    this.loadEnrollments();
  }

  loadEnrollments(after = 0): void {
    this.run(this.api.catalog<EnrollmentRow>(this.scope(), 'enrollments', after), page => this.enrollments.set(page));
  }

  selectRecipient(id: number, checked: boolean): void {
    this.recipients.update(current => {
      const selected = new Set(current);
      if (checked && selected.size < 100) selected.add(id);
      if (!checked) selected.delete(id);
      return selected;
    });
  }

  assign(row: RevisionRow): void {
    const startsAt = new Date(this.startsAt);
    const dueAt = new Date(this.dueAt);
    if (!Number.isFinite(startsAt.valueOf()) || !Number.isFinite(dueAt.valueOf()) || startsAt >= dueAt) {
      this.error.set('El vencimiento debe ser posterior al comienzo.');
      return;
    }
    this.run(this.api.command<{ deliveryId: number }>('POST', this.api.assigning(this.scope(), row), {
      expectedRevisionVersion: row.version, startsAt: startsAt.toISOString(), dueAt: dueAt.toISOString(),
      enrollmentIds: [...this.recipients()],
    }), receipt => {
      this.resetDetails();
      this.message.set(`Entrega ${receipt.deliveryId} creada. Evaluación ${row.evaluationId}. Conciliación F08 pendiente.`);
      this.loadRevisions();
    });
  }

  openReview(row: AttemptRow): void {
    this.resetDetails();
    this.selectedAttempt.set(row);
    this.loadReview(row);
  }

  grade(row: AttemptRow, id: number): void {
    const fields = this.gradeFields[id];
    this.run(this.api.command<AttemptReceipt>('POST', this.reviewUrl(row) + '/answers/' + id,
      { score: fields.score, feedback: fields.feedback }), () => this.loadReview(row));
  }

  closeGrade(row: AttemptRow): void {
    this.run(this.api.command<AttemptReceipt>('POST', this.reviewUrl(row) + '/close'), () => {
      this.loadReview(row);
    });
  }

  private loadReview(row: AttemptRow): void {
    this.run(this.api.read<Review>(this.reviewUrl(row)), review => {
      this.gradeFields = Object.fromEntries(review.openAnswers.map(answer =>
        [answer.answerId, { score: answer.pointsAwarded, feedback: answer.teacherFeedback ?? '' }]));
      this.review.set(review);
    });
  }

  private reviewUrl(row: AttemptRow): string {
    return this.api.execution(this.scope(), row) + `/attempts/${row.attemptId}/review`;
  }

  protected override clearRestricted(): void {
    this.resetDetails();
    this.revisions.set(null);
    this.attempts.set(null);
    this.newTitle = '';
    this.newMaximum = 1;
  }

  private resetDetails(): void {
    this.draft.set(null);
    this.assignment.set(null);
    this.enrollments.set(null);
    this.recipients.set(new Set());
    this.startsAt = '';
    this.dueAt = '';
    this.selectedAttempt.set(null);
    this.review.set(null);
    this.gradeFields = {};
    this.message.set('');
  }
}
