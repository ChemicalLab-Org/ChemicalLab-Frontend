import { HttpClient } from '@angular/common/http';
import { Directive, DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Page<T> { items: T[]; nextAfter: number | null; }
export interface ClassChoice {
  institutionId: number;
  institutionName: string;
  classId: number;
  className: string;
  student: boolean;
  teacher: boolean;
}
export interface RevisionKey { evaluationId: number; revisionId: number; }
export interface DeliveryKey extends RevisionKey { deliveryId: number; }
export interface DeliveryRow extends DeliveryKey {
  title: string;
  startsAt: string;
  dueAt: string | null;
  windowOpen: boolean;
  remainingAttempts: number;
  activeAttempt: boolean;
}
export interface RevisionRow extends RevisionKey {
  revisionNumber: number;
  version: number;
  status: 'DRAFT' | 'PUBLISHED';
  title: string;
  canEdit: boolean;
  canPublish: boolean;
  canAssign: boolean;
}
export interface EnrollmentRow { enrollmentId: number; student: string; }
export interface AttemptRow extends DeliveryKey {
  attemptId: number;
  title: string;
  status: string;
  attemptNumber: number;
  student: string | null;
  gradeClosed: boolean;
}
export interface DraftQuestion {
  id: number;
  question_text: string;
  question_type: 'OPEN_TEXT' | 'MULTIPLE_CHOICE';
  points: number;
  order_index: number;
  required: boolean;
  expected_answer?: string;
}
export interface DraftOption {
  id: number;
  question_id: number;
  option_text: string;
  order_index: number;
  correct: boolean;
}
export interface DraftPayload {
  resource: { title: string; max_attempts: number; question_display_mode: 'ALL_AT_ONCE' | 'ONE_BY_ONE' };
  questions: DraftQuestion[];
  options: DraftOption[];
}
export interface Draft extends RevisionKey { version: number; payload: DraftPayload; }
export interface RevisionReceipt extends RevisionKey { version: number; status: RevisionRow['status']; }
export interface Publication {
  title: string;
  instructions: string | null;
  questionDisplayMode: 'ALL_AT_ONCE' | 'ONE_BY_ONE';
  questions: {
    id: number;
    questionText: string;
    questionType: 'OPEN_TEXT' | 'MULTIPLE_CHOICE';
    required: boolean;
    options: { id: number; optionText: string }[];
  }[];
}
export interface Answer { revisionId: number; questionId: number; selectedOptionId?: number; answerText?: string; }
export interface AttemptReceipt { attemptId: number; attemptNumber: number; status: string; gradeClosed: boolean; }
export interface Attempt extends Omit<AttemptReceipt, 'gradeClosed'> {
  deadline: string | null;
  currentQuestionIndex: number;
  questionOrder: number[];
  answers: Answer[];
}
export interface Review {
  status: string;
  finalScore: number | null;
  gradeClosed: boolean;
  openAnswers: {
    answerId: number;
    questionText: string;
    expectedAnswer: string | null;
    answerText: string | null;
    maxPoints: number;
    reviewed: boolean;
    pointsAwarded: number | null;
    teacherFeedback: string | null;
  }[];
}
export interface Correction {
  finalScore: number;
  overallFeedback: string | null;
  answers: {
    questionId: number;
    questionText: string;
    answerText: string | null;
    correctOptionText: string | null;
    explanation: string | null;
    teacherFeedback: string | null;
    pointsAwarded: number | null;
  }[];
}

@Injectable({ providedIn: 'root' })
export class InstitutionalCatalogApi {
  private readonly http = inject(HttpClient);
  private readonly root = `${environment.apiUrl}/institutions`;

  choices(after = 0): Observable<Page<ClassChoice>> {
    return this.page(`${this.root}/evaluation-catalog/NEW/v1/classes`, after);
  }

  catalog<T>(scope: ClassChoice, suffix: string, after = 0): Observable<Page<T>> {
    return this.page(`${this.base(scope)}/evaluation-catalog/NEW/v1/${suffix}`, after);
  }

  authoring(scope: ClassChoice, revision?: RevisionKey): string {
    const root = `${this.base(scope)}/evaluation-authoring/NEW/v1/evaluations`;
    return revision ? `${root}/${revision.evaluationId}/revisions/${revision.revisionId}` : root;
  }

  assigning(scope: ClassChoice, revision: RevisionKey): string {
    return `${this.base(scope)}/evaluation-assignments/NEW/v1/evaluations/${revision.evaluationId}/revisions/${revision.revisionId}/deliveries`;
  }

  execution(scope: ClassChoice, delivery: DeliveryKey): string {
    return `${this.base(scope)}/evaluation-execution/NEW/v1/evaluations/${delivery.evaluationId}/deliveries/${delivery.deliveryId}/revisions/${delivery.revisionId}`;
  }

  read<T>(url: string): Observable<T> {
    return this.http.get<T>(url);
  }

  command<T>(method: 'POST' | 'PUT', url: string, fields: object = {}): Observable<T> {
    const body = { ...fields, operationId: crypto.randomUUID() };
    return this.http.request<T>(method, url, { body });
  }

  private base(scope: ClassChoice): string {
    return `${this.root}/${scope.institutionId}/classes/${scope.classId}`;
  }

  private page<T>(url: string, after: number): Observable<Page<T>> {
    return this.http.get<Page<T>>(url, { params: { after } });
  }
}

@Directive()
export abstract class EvaluationView {
  protected readonly api = inject(InstitutionalCatalogApi);
  private readonly destroyRef = inject(DestroyRef);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly retry = signal<(() => void) | null>(null);

  protected run<T>(request: Observable<T>, accept: (value: T) => void, forbidden?: string): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.retry.set(null);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (value) => {
        this.busy.set(false);
        accept(value);
      },
      error: (failure: { status?: number; error?: { code?: string } }) => {
        this.busy.set(false);
        if (failure.status === 403) {
          if (failure.error?.code === 'ACADEMIC_AUTHORIZATION_REQUIRED' || failure.error?.code === 'AGREEMENTS_REQUIRED') {
            this.error.set('Consulta Mis acuerdos y privacidad para conocer la condición pendiente en este colegio.');
          } else {
            this.error.set(forbidden ?? 'El permiso, el estado o la ventana académica ya no permiten esta operación.');
          }
          if (!forbidden) this.clearRestricted();
        } else if (failure.status === 404) {
          this.error.set('El recorrido institucional no está habilitado en este entorno.');
          this.clearRestricted();
        } else if (failure.status === 409) {
          this.error.set('El estado cambió. Vuelve a consultar antes de repetir la operación.');
        } else if (failure.status === 400 || failure.status === 413) {
          this.error.set('Revisa los datos y los límites del formulario.');
        } else if (failure.status !== 401) {
          this.error.set('No se pudo confirmar la operación. Puedes repetir la misma solicitud.');
          this.retry.set(() => this.run(request, accept, forbidden));
        }
      },
    });
  }

  protected clearRestricted(): void {}
}
