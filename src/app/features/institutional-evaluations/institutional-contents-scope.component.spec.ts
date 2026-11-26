import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { InstitutionalEvaluationsComponent } from './institutional-evaluations.component';

describe('institutional content context', () => {
  it('cancels a binary request and removes the previous institution’s metadata', async () => {
    await TestBed.configureTestingModule({
      imports: [InstitutionalEvaluationsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: { section: 'contents' } } } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(InstitutionalEvaluationsComponent);
    const http = TestBed.inject(HttpTestingController);
    const root = '/api/institutions';
    const scopeA = { institutionId: 1, institutionName: 'A', classId: 10, className: 'A1', student: true, teacher: false };
    const scopeB = { institutionId: 2, institutionName: 'B', classId: 20, className: 'B1', student: true, teacher: false };
    const first = root + '/1/classes/10/contents/NEW/v1/assigned';
    const second = root + '/2/classes/20/contents/NEW/v1/assigned';
    const detail = first + '/90/contents/12/revisions/13';

    fixture.detectChanges();
    http.expectOne(root + '/content-catalog/NEW/v1/classes?after=0').flush({ items: [scopeA, scopeB], nextAfter: null });
    const select = (institution: string, clazz: string) => {
      fixture.componentInstance.chooseInstitution(institution);
      fixture.componentInstance.chooseClass(clazz);
      fixture.detectChanges();
    };
    const click = (label: string) => {
      const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')]
        .find(item => item.textContent.trim() === label);
      expect(button).toBeDefined();
      button!.click();
      fixture.detectChanges();
    };
    select('1', '10');
    http.expectOne(first + '?after=0').flush({
      items: [{ deliveryId: 90, contentId: 12, revisionId: 13, number: 1, title: 'Solo A', category: 'Química' }],
      nextAfter: null,
    });
    fixture.detectChanges();
    click('Consultar contenido');
    http.expectOne(detail).flush({
      contentId: 12, revisionId: 13, version: 2, number: 1, status: 'PUBLISHED',
      text: { title: 'Solo A', category: 'Química', explanation: 'Texto A', formationSteps: [], keyPoints: [],
        examples: [], links: [{ title: 'Enlace A', url: 'https://example.org/A' }] },
      file: { id: 42, name: 'privado.png', mime: 'image/png', size: 20, preview: true }, materialCount: 2,
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Enlace A');
    http.expectNone(request => request.url.includes('/files/'));
    click('Vista previa');
    const pending = http.expectOne(detail + '/files/42?preview=true');

    select('2', '20');
    expect(pending.cancelled).toBe(true);
    http.expectOne(second + '?after=0').flush({ items: [], nextAfter: null });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Solo A');
    expect(fixture.nativeElement.textContent).not.toContain('Enlace A');
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    http.verify();
  });
});
