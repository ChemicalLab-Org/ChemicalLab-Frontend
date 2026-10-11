import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentEvaluationsComponent } from './student-evaluations.component';
import { StudentResultsComponent } from './student-results.component';
import { AuthService } from '../../../core/services/auth.service';
import { UsageMetricsService } from '../../../core/services/usage-metrics.service';
import { ExamSessionService } from '../../../core/services/exam-session.service';
import { environment } from '../../../../environments/environment';
import { AttemptResponse, StudentEvaluationDetailResponse, StudentEvaluationResponse } from '../../../shared/models';
import { academicTimestamp } from '../../../shared/utils/academic-time.util';

describe('T05 server windows and hidden results', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<StudentEvaluationsComponent>;
  const base = `${environment.apiUrl}/evaluations/student`;
  const route = { snapshot: { queryParamMap: convertToParamMap({}) } };
  const listing = (extra: Partial<StudentEvaluationResponse> = {}): StudentEvaluationResponse => ({
    id: 1, title: 'Examen ficticio', description: null, instructions: null, topic: null,
    timeLimitMinutes: null, maxAttempts: 2, allowChemicalCalculator: false, allowPeriodicTable: false,
    trackTabExit: false, questionDisplayMode: 'ALL_AT_ONCE', randomizeQuestions: false, questionCount: 1,
    assignmentId: 2, startAt: '2030-06-03T10:00:00', dueAt: '2030-06-03T10:05:00', attemptStatus: null,
    attemptsUsed: 0, accessState: 'AVAILABLE', canStart: true, inProgressAttemptId: null,
    serverNow: '2030-06-03T10:00:00', ...extra,
  });
  const detail = (extra: Partial<StudentEvaluationDetailResponse> = {}): StudentEvaluationDetailResponse => ({
    ...listing(), questionsVisible: true,
    questions: [{ id: 3, questionText: 'ENUNCIADO-FICTICIO', questionType: 'MULTIPLE_CHOICE', points: 4,
      orderIndex: 0, required: true, options: [{ id: 4, optionText: 'Opción propia', orderIndex: 0 }] }], ...extra,
  });
  const attempt = (extra: Partial<AttemptResponse> = {}): AttemptResponse => ({
    id: 42, evaluationId: 1, assignmentId: 2, status: 'IN_PROGRESS', attemptNumber: 1,
    startedAt: '2030-06-03T10:00:00', submittedAt: null, questionOrder: [3], currentQuestionIndex: 0,
    allowChemicalCalculator: false, allowPeriodicTable: false, answers: [], score: null, maxScore: null,
    canAnswer: true, answerDeadlineAt: null, correctionVisible: false, serverNow: '2030-06-03T10:00:00', ...extra,
  });
  beforeEach(() => {
    sessionStorage.clear(); route.snapshot.queryParamMap = convertToParamMap({});
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ActivatedRoute, useValue: route },
      { provide: AuthService, useValue: { currentUser: signal({ username: 'ficticio' }), currentRole: signal('ESTUDIANTE'), logout: vi.fn() } },
      { provide: UsageMetricsService, useValue: { trackEvaluationOpened: vi.fn(), trackEvaluationStarted: vi.fn(), trackResultsViewed: vi.fn() } },
    ] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { fixture?.destroy(); http.verify(); vi.restoreAllMocks(); sessionStorage.clear(); });
  function create(ev = listing()) {
    fixture = TestBed.createComponent(StudentEvaluationsComponent); fixture.detectChanges();
    http.expectOne(base).flush([ev]); fixture.detectChanges(); return fixture.componentInstance;
  }
  function resume(mode: 'ALL_AT_ONCE' | 'ONE_BY_ONE' = 'ALL_AT_ONCE') {
    const ev = listing({ attemptStatus: 'IN_PROGRESS', canStart: false, inProgressAttemptId: 42 });
    const component = create(ev); component.continueAttempt(ev);
    http.expectOne(`${base}/attempts/42`).flush(attempt());
    http.expectOne(`${base}/1`).flush(detail({ questionDisplayMode: mode })); fixture.detectChanges();
    return component;
  }
  it('shows scheduled metadata without questions or a start button', () => {
    const ev = listing({ accessState: 'SCHEDULED', canStart: false }); const component = create(ev);
    expect(fixture.nativeElement.textContent).toContain('Programada');
    const button = [...fixture.nativeElement.querySelectorAll('button')].find((b: any) => b.textContent.includes('Ver programación')) as HTMLButtonElement;
    button.click(); http.expectOne(`${base}/1`).flush(detail({ accessState: 'SCHEDULED', questionsVisible: false, questions: [] })); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Evaluación programada');
    expect(fixture.nativeElement.textContent).not.toContain('ENUNCIADO-FICTICIO');
    expect(component.canStart(ev)).toBe(false);
    expect([...fixture.nativeElement.querySelectorAll('button')].some((b: any) => /Iniciar evaluación/.test(b.textContent))).toBe(false);
  });
  it('uses server admission despite a different browser clock', () => {
    const component = create(); vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2050-01-01T00:00:00Z'));
    expect(component.canStart(listing())).toBe(true);
    expect(component.canStart(listing({ canStart: false, accessState: 'EXPIRED' }))).toBe(false);
    expect(academicTimestamp('2030-06-03T10:00:00')).toBe(Date.parse('2030-06-03T15:00:00Z'));
  });
  it('refreshes scheduled admission using new server responses', () => {
    const ev = listing({ accessState: 'SCHEDULED', canStart: false }); const component = create(ev);
    component.openEvaluation(ev);
    http.expectOne(`${base}/1`).flush(detail({ accessState: 'SCHEDULED', questionsVisible: false, questions: [] }));
    component.reloadDetail();
    http.expectOne(`${base}/1`).flush(detail()); http.expectOne(base).flush([listing()]); fixture.detectChanges();
    expect(component.canStart(component.selected()!)).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Iniciar evaluación');
  });
  it('resumes by server attempt ID without device storage and closes on rejected save', () => {
    const component = resume(); expect(component.view()).toBe('take');
    expect(TestBed.inject(ExamSessionService).isActive()).toBe(true);
    component.selectOption(3, 4);
    http.expectOne(`${base}/attempts/42/answers`).flush({ message: 'La ventana cerró.' }, { status: 400, statusText: 'Bad Request' });
    http.expectOne(`${base}/attempts/42`).flush(attempt({ status: 'GRADED', canAnswer: false, submittedAt: '2030-06-03T10:05:00' }));
    http.expectOne(base).flush([listing({ accessState: 'EXPIRED', canStart: false, attemptStatus: 'GRADED' })]); fixture.detectChanges();
    expect(component.view()).toBe('submitted'); expect(TestBed.inject(ExamSessionService).isActive()).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('ENUNCIADO-FICTICIO');
    expect(fixture.nativeElement.textContent).toContain('respuestas recibidas dentro de la ventana');
  });
  it('does not advance sequentially when the server rejects the boundary', () => {
    const component = resume('ONE_BY_ONE'); component.selectOption(3, 4); component.advanceOrFinish();
    http.expectOne(`${base}/attempts/42/answers`).flush({ message: 'La ventana cerró.' }, { status: 400, statusText: 'Bad Request' });
    http.expectOne(`${base}/attempts/42`).flush(attempt({ status: 'PENDING_MANUAL_REVIEW', canAnswer: false }));
    http.expectOne(base).flush([]); expect(component.currentIndex()).toBe(0); expect(component.view()).toBe('submitted');
  });
  it('recovers a direct URL after reload without creating a new attempt', () => {
    route.snapshot.queryParamMap = convertToParamMap({ attempt: '42' }); const component = create();
    http.expectOne(`${base}/attempts/42`).flush(attempt()); http.expectOne(`${base}/1`).flush(detail());
    expect(component.view()).toBe('take'); http.expectNone(`${base}/1/attempts`);
  });
  it('renders absent scores and correction without inventing zero or an error mark', () => {
    const resultFixture = TestBed.createComponent(StudentResultsComponent); resultFixture.detectChanges();
    http.expectOne(`${base}/results`).flush([]);
    const component = resultFixture.componentInstance;
    expect(component.formatGrade(undefined as any)).toBe('—'); expect(component.pctBadge(null)).toBe('badge-neutral');
    component.detail.set({ reviewLocked: false, gradeClosed: true, canViewDetailedFeedback: true, reviewAvailable: true,
      evaluationTitle: 'Ficticio', finalScore: null, score: null, maxScore: null, percentage: null, answers: [{
        questionId: 3, questionText: 'Ficticio', questionType: 'MULTIPLE_CHOICE', selectedOptionText: 'Mi opción',
        answerText: null, correct: null, points: 4, pointsAwarded: null, reviewed: false,
        teacherFeedback: null, correctOptionText: null, explanation: null,
      }] } as any);
    component.view.set('detail'); resultFixture.detectChanges();
    expect(resultFixture.nativeElement.querySelector('.answer__icon--bad')).toBeNull();
    expect(resultFixture.nativeElement.textContent).toContain('—'); resultFixture.destroy();
  });
});
