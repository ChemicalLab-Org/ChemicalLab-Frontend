import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConceptsComponent } from './concepts.component';
import { AuthService } from '../../core/services/auth.service';
import { UsageMetricsService } from '../../core/services/usage-metrics.service';
import { StudentWhiteboardService } from '../../core/services/student-whiteboard.service';
import { TeacherWhiteboardService } from '../../core/services/teacher-whiteboard.service';
import { environment } from '../../../environments/environment';
import { ConceptMaterialResponse, StudentConceptContentResponse } from '../../shared/models';
import { fileDownloadName } from '../../shared/utils/safe-file.util';

describe('T06 authenticated file delivery', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<ConceptsComponent>;
  const pdf: ConceptMaterialResponse = { materialId: 7, type: 'FILE', title: 'Guía ficticia',
    originalFileName: 'guia.pdf', contentType: 'application/pdf', fileSize: 500, url: null,
    previewAvailable: false, downloadUrl: '/api/concepts/10/materials/7/download' };
  const image = { ...pdf, materialId: 8, originalFileName: 'imagen.png', contentType: 'image/png', previewAvailable: true };
  const concept: StudentConceptContentResponse = { id: 10, title: 'T06 ficticio', category: 'Óxidos', summary: null,
    explanation: 'Ficticio', formationSteps: [], keyPoints: [], examples: [], suggestedActivity: null, materials: [pdf,image] };
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: AuthService, useValue: { currentUser: signal({ username: 'ficticio' }), currentRole: signal('ESTUDIANTE'), logout: vi.fn() } },
      { provide: UsageMetricsService, useValue: { trackContentView: vi.fn() } },
    ] });
    http = TestBed.inject(HttpTestingController);
    vi.stubGlobal('URL', Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => 'blob:fictitious'), revokeObjectURL: vi.fn(),
    }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fixture = TestBed.createComponent(ConceptsComponent); fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/concepts/student`).flush([concept]);
    fixture.componentInstance.selectConcept(10); fixture.detectChanges();
  });
  afterEach(() => { fixture?.destroy(); http?.verify(); vi.restoreAllMocks(); vi.unstubAllGlobals(); TestBed.resetTestingModule(); });
  const respond = (id: number, type: string) => http.expectOne(`${environment.apiUrl}/concepts/10/materials/${id}/download`)
    .flush(new Blob(['fictitious test response'], { type }));

  it('downloads PDF despite stale preview=true and renders no frame, embed or object', () => {
    fixture.componentInstance.previewFile({ ...pdf, previewAvailable: true }); respond(7,'application/pdf'); fixture.detectChanges();
    expect(fixture.componentInstance.previewSafeUrl()).toBeNull();
    expect(fixture.nativeElement.querySelector('iframe,embed,object')).toBeNull();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  });
  it('previews normalized images only in img, including fullscreen, and revokes on close', () => {
    fixture.componentInstance.previewFile(image); respond(8,'image/png'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img.material-preview__frame')?.getAttribute('src')).toBe('blob:fictitious');
    expect(fixture.nativeElement.querySelector('iframe,embed,object')).toBeNull();
    fixture.componentInstance.openFullscreen(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img.pdf-modal__frame')).not.toBeNull();
    fixture.componentInstance.closePreview(); fixture.detectChanges(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fictitious');
  });
  it('reads later material pages and keeps historical totals and download metadata',()=>{
    fixture.componentInstance.concepts.set([{...concept,materialsPage:{content:[pdf,image],number:0,size:25,totalElements:55,totalPages:3}}]);
    fixture.detectChanges();
    const next=Array.from(fixture.nativeElement.querySelectorAll('app-pagination button') as NodeListOf<HTMLButtonElement>).find(b=>b.textContent?.includes('Siguiente'))!;
    next.click();
    http.expectOne(r=>r.url===`${environment.apiUrl}/concepts/10/materials`&&r.params.get('page')==='1')
      .flush({content:[{...pdf,materialId:26,title:'Historical page two'}],number:1,size:25,totalElements:55,totalPages:3});
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Página 2 de 3 · 55 registros');
    expect(fixture.componentInstance.selectedConcept()?.materials[0].materialId).toBe(26);
  });

  it('does not promote a document response into a preview from image metadata', () => {
    fixture.componentInstance.previewFile(image); respond(8,'application/pdf'); fixture.detectChanges();
    expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(fixture.componentInstance.previewError()).toContain('PNG/JPG');
  });
  it('does not create an object URL after the viewer is closed while the response is pending', () => {
    fixture.componentInstance.previewFile(image); fixture.componentInstance.closeConcept(); respond(8,'image/png');
    expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(fixture.componentInstance.previewSafeUrl()).toBeNull();
  });
  it('preserves the displayed material on a rejected download', () => {
    fixture.componentInstance.downloadFile(pdf);
    http.expectOne(`${environment.apiUrl}/concepts/10/materials/7/download`).flush(new Blob(), { status: 400, statusText: 'Bad Request' });
    expect(fixture.componentInstance.selectedConcept()?.materials).toEqual([pdf,image]);
    expect(fixture.componentInstance.downloadingId()).toBeNull();
  });
  it('uses response MIME to create a safe canonical extension for historical names', () => {
    expect(fileDownloadName('../ficticio.html\r\n', 'application/pdf')).toBe('ficticio.pdf');
    expect(fileDownloadName('antiguo.png', 'image/jpeg')).toBe('antiguo.jpg');
    expect(fileDownloadName('ficticio.exe', 'text/html')).toBe('ficticio.bin');
  });
  it('rejects non-image snapshot blobs for both roles', () => {
    for (const service of [TestBed.inject(StudentWhiteboardService),TestBed.inject(TeacherWhiteboardService)]) {
      const errors = vi.fn(); service.getSnapshot(1).subscribe({error:errors});
      const request = http.expectOne(r => r.url.endsWith('/1/snapshot'));
      expect(request.request.responseType).toBe('blob');
      request.flush(new Blob(['fictitious'], {type:'text/html'})); expect(errors).toHaveBeenCalledOnce();
    }
  });
});
