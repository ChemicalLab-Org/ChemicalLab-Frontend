import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InstitutionalEvaluationsComponent } from './institutional-evaluations.component';

describe('institutional evaluation context', () => {
  let http: HttpTestingController;
  const scopeA = {
    institutionId: 1, institutionName: 'A', classId: 10, className: 'A1', student: true, teacher: false,
  };
  const scopeB = {
    institutionId: 2, institutionName: 'B', classId: 20, className: 'B1', student: true, teacher: false,
  };
  const root = '/api/institutions';
  const suffix = '/evaluation-catalog/NEW/v1/own-deliveries';

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('destroys the previous scope, including an unanswered request and its displayed delivery', () => {
    const fixture = TestBed.createComponent(InstitutionalEvaluationsComponent);
    const view = fixture.componentInstance;
    fixture.detectChanges();
    http.expectOne(root + '/evaluation-catalog/NEW/v1/classes?after=0')
      .flush({ items: [scopeA, scopeB], nextAfter: null });
    view.chooseInstitution('1');
    view.chooseClass('10');
    fixture.detectChanges();
    http.expectOne(root + '/1/classes/10' + suffix + '?after=0').flush({
      items: [{ deliveryId: 1, evaluationId: 2, revisionId: 3, title: 'Solo A',
        windowOpen: true, remainingAttempts: 1, activeAttempt: false }],
      nextAfter: null,
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Solo A');
    const open = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')]
      .find(button => button.textContent?.trim() === 'Abrir entrega')!;
    open.click();
    const pending = http.expectOne(root + '/1/classes/10' + suffix + '/1/attempts?after=0');

    view.chooseInstitution('2');
    fixture.detectChanges();
    expect(pending.cancelled).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain('Solo A');
    view.chooseClass('10');
    fixture.detectChanges();
    http.expectNone(request => request.url.includes('/classes/10'));
    view.chooseClass('20');
    fixture.detectChanges();
    http.expectOne(root + '/2/classes/20' + suffix + '?after=0').flush({ items: [], nextAfter: null });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay entregas disponibles');
  });
});
