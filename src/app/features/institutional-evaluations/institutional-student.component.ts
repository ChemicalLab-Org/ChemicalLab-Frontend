import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Answer, Attempt, AttemptReceipt, AttemptRow, ClassChoice, Correction, DeliveryRow,
  EvaluationView, Page, Publication,
} from './catalog-api';

@Component({
  selector: 'app-institutional-student',
  imports: [DatePipe, FormsModule],
  templateUrl: './institutional-student.component.html',
  styleUrl: './institutional-evaluations.scss',
})
export class InstitutionalStudentComponent extends EvaluationView implements OnInit {
  readonly scope = input.required<ClassChoice>();
  readonly deliveries = signal<Page<DeliveryRow> | null>(null);
  readonly selected = signal<DeliveryRow | null>(null);
  readonly attempts = signal<Page<AttemptRow> | null>(null);
  readonly attempt = signal<Attempt | null>(null);
  readonly publication = signal<Publication | null>(null);
  readonly correction = signal<Correction | null>(null);
  readonly message = signal('');
  readonly questions = computed(() => {
    const publication = this.publication();
    const attempt = this.attempt();
    if (!publication || !attempt || attempt.status !== 'IN_PROGRESS') return [];
    const questions = new Map(publication.questions.map(question => [question.id, question]));
    const order = publication.questionDisplayMode === 'ONE_BY_ONE'
      ? attempt.questionOrder.slice(attempt.currentQuestionIndex, attempt.currentQuestionIndex + 1)
      : attempt.questionOrder;
    return order.flatMap(id => questions.has(id) ? [questions.get(id)!] : []);
  });
  responses: Record<number, { text: string; option: number | null }> = {};

  ngOnInit(): void { this.loadDeliveries(); }

  loadDeliveries(after = 0): void {
    this.resetDetails();
    this.run(this.api.catalog<DeliveryRow>(this.scope(), 'own-deliveries', after), page => this.deliveries.set(page));
  }

  open(delivery: DeliveryRow): void {
    this.resetDetails();
    this.selected.set(delivery);
    this.loadAttempts(delivery);
  }

  loadAttempts(delivery: DeliveryRow, after = 0): void {
    this.run(this.api.catalog<AttemptRow>(this.scope(), `own-deliveries/${delivery.deliveryId}/attempts`, after),
      page => this.attempts.set(page));
  }

  start(delivery: DeliveryRow): void {
    this.correction.set(null);
    this.run(this.api.command<AttemptReceipt>('POST', this.base(delivery) + '/own-attempts'), receipt => {
      this.selected.update(row => row && { ...row, activeAttempt: true, remainingAttempts: row.remainingAttempts - 1 });
      this.attempts.set(null);
      this.recover(delivery, receipt.attemptId);
    });
  }

  recover(delivery: DeliveryRow, attemptId: number): void {
    this.correction.set(null);
    this.message.set('');
    this.run(this.api.read<Attempt>(this.ownUrl(delivery, attemptId)), attempt => {
      this.attempt.set(attempt);
      this.responses = {};
      for (const answer of attempt.answers) {
        this.responses[answer.questionId] = { text: answer.answerText ?? '', option: answer.selectedOptionId ?? null };
      }
      if (attempt.status === 'IN_PROGRESS' && delivery.windowOpen && !this.publication()
          && (!attempt.deadline || Date.parse(attempt.deadline) > Date.now())) {
        this.run(this.api.read<Publication>(this.base(delivery)), publication => {
          for (const question of publication.questions) this.responses[question.id] ??= { text: '', option: null };
          this.publication.set(publication);
        });
      } else if (this.publication()) {
        for (const question of this.publication()!.questions) this.responses[question.id] ??= { text: '', option: null };
      }
    });
  }

  save(delivery: DeliveryRow, attempt: Attempt, questionId: number): void {
    const answer = this.answer(delivery, questionId);
    if (!answer) return;
    this.run(this.api.command<AttemptReceipt>('POST', this.ownUrl(delivery, attempt.attemptId) + '/answers', { answer }),
      receipt => {
        if (this.publication()?.questionDisplayMode === 'ONE_BY_ONE') {
          this.recover(delivery, receipt.attemptId);
        } else {
          this.attempt.update(current => current && {
            ...current, answers: [...current.answers.filter(existing => existing.questionId !== questionId), answer],
          });
          this.message.set('Respuesta guardada.');
        }
      });
  }

  submit(delivery: DeliveryRow, attempt: Attempt): void {
    const answers = this.publication()?.questionDisplayMode === 'ALL_AT_ONCE'
      ? attempt.questionOrder.flatMap(id => {
          const answer = this.answer(delivery, id);
          return answer ? [answer] : [];
        })
      : [];
    this.run(this.api.command<AttemptReceipt>('POST', this.ownUrl(delivery, attempt.attemptId) + '/submit', { answers }),
      receipt => {
        this.attempt.set({ ...attempt, ...receipt });
        this.selected.update(row => row && { ...row, activeAttempt: false });
        this.publication.set(null);
        this.responses = {};
        this.message.set('Intento enviado.');
        this.loadAttempts(delivery);
      });
  }

  result(delivery: DeliveryRow, attemptId: number): void {
    this.correction.set(null);
    this.run(this.api.read<Correction>(this.ownUrl(delivery, attemptId) + '/correction'), correction => {
      this.correction.set(correction);
    }, 'La política académica todavía no permite consultar este resultado, o el acceso dejó de estar vigente.');
  }

  private answer(delivery: DeliveryRow, questionId: number): Answer | null {
    const response = this.responses[questionId];
    if (!response) return null;
    const key = { questionId, revisionId: delivery.revisionId };
    if (response.option !== null) return { ...key, selectedOptionId: response.option };
    if (response.text.trim()) return { ...key, answerText: response.text };
    return null;
  }

  private base(delivery: DeliveryRow): string { return this.api.execution(this.scope(), delivery); }

  private ownUrl(delivery: DeliveryRow, attemptId: number): string {
    return this.base(delivery) + `/own-attempts/${attemptId}`;
  }

  protected override clearRestricted(): void {
    this.resetDetails();
    this.deliveries.set(null);
  }

  private resetDetails(): void {
    this.selected.set(null);
    this.attempts.set(null);
    this.attempt.set(null);
    this.publication.set(null);
    this.correction.set(null);
    this.responses = {};
    this.message.set('');
  }
}
