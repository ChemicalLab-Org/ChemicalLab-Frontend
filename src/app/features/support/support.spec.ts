import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { ExamSessionService } from '../../core/services/exam-session.service';
import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';

@Component({ template: '' })
class RouteStub {}

describe('Ayuda y soporte', () => {
  beforeEach(() => {
    const support = routes.find(route => route.path === 'soporte')!;
    TestBed.configureTestingModule({
      providers: [provideRouter([
        support,
        { path: 'evaluations', component: RouteStub },
        { path: 'other', component: RouteStub },
      ])],
    });
  });

  it('muestra la ayuda pública y conserva el intento activo al navegar a ella', async () => {
    const harness = await RouterTestingHarness.create('/soporte');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('Ayuda y soporte');
    expect(harness.routeNativeElement?.querySelector('a[href="mailto:carlosjun.45@gmail.com"]')?.textContent)
      .toContain('carlosjun.45@gmail.com');
    TestBed.inject(ExamSessionService).start({
      attemptId: 1, evaluationId: 1, allowChemicalCalculator: false, allowPeriodicTable: false,
    });
    await harness.navigateByUrl('/other');
    await harness.navigateByUrl('/soporte');
    expect(TestBed.inject(Router).url).toBe('/evaluations');
    expect(TestBed.inject(ExamSessionService).attemptId()).toBe(1);
  });

  it('retira el acceso del menú durante el intento y deja de observar al destruirlo', async () => {
    const harness = await RouterTestingHarness.create('/other');
    const sidebar = TestBed.createComponent(SidebarComponent);
    for (const [name, value] of Object.entries({ navItems: [], userName: '', userRole: '', userInitials: '' })) {
      sidebar.componentRef.setInput(name, value);
    }
    sidebar.detectChanges();
    expect(sidebar.nativeElement.querySelector('a[href="/soporte"]')).not.toBeNull();
    TestBed.inject(ExamSessionService).start({
      attemptId: 1, evaluationId: 1, allowChemicalCalculator: false, allowPeriodicTable: false,
    });
    sidebar.detectChanges();
    expect(sidebar.nativeElement.querySelector('a[href="/soporte"]')).toBeNull();
    const menu = sidebar.componentInstance;
    sidebar.destroy();
    await harness.navigateByUrl('/evaluations');
    expect(menu.activeUrl()).toBe('/other');
  });
});
