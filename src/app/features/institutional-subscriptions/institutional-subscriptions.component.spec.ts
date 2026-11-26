import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { InstitutionalSubscriptionsComponent } from './institutional-subscriptions.component';

describe('institutional subscriptions', () => {
  it('shows server terms, isolates institution changes and sends only checkout confirmation', async () => {
    await TestBed.configureTestingModule({
      imports: [InstitutionalSubscriptionsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ institucion: 1 }) } } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(InstitutionalSubscriptionsComponent);
    const view = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    const root = '/api/institutions';
    const first = root + '/1/subscription/v1';
    const second = root + '/2/subscription/v1';
    const overview = {
      mode: 'MERCADO_PAGO_TEST', name: 'Colegio B', administrativeActive: true,
      canContract: true, canCancel: false, status: 'EXPIRED',
      plan: { version: 3, name: 'Plan HTTP', currency: 'PEN', monthlyAmount: 119, activeUsers: 140, storageBytes: 2_000_000_000 },
      activeUsers: 2, usedBytes: 5000,
    };
    http.expectOne('/api/subscriptions/v1/institutions?after=0')
      .flush({ enabled: true, schools: [{ id: 1, name: 'Colegio A' }, { id: 2, name: 'Colegio B' }], nextAfter: null });
    const older = http.expectOne(first);
    view.select(2);
    expect(older.cancelled).toBe(true);
    http.expectOne(second).flush(overview);
    http.expectOne(second + '/operations').flush([]);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.textContent).toContain('Modo de pruebas');
    expect(page.textContent).toContain('Plan HTTP');
    expect(page.textContent).toContain('2 de 140');
    view.confirmation = 'checkout';
    view.submit();
    const checkout = http.expectOne(second + '/checkout');
    expect(checkout.request.body).toEqual({ confirmed: true });
    checkout.flush({ ...overview, checkoutUrl: 'https://example.org/subscriptions/checkout' });
    http.expectOne(second + '/operations').flush([]);
    fixture.detectChanges();
    expect(page.querySelector('a[href*="example.org"]')).toBeNull();
    view.reload();
    http.expectOne(second).flush({
      ...overview, status: 'CHECKOUT_PENDING', canCancel: true,
      checkoutUrl: 'https://www.mercadopago.com.pe/subscriptions/checkout?preapproval_id=fictitious',
    });
    http.expectOne(second + '/operations').flush([]);
    fixture.detectChanges();
    expect(page.querySelector('a[href*="mercadopago.com.pe"]')).not.toBeNull();
    view.confirmation = 'cancel';
    view.submit();
    const cancellation = http.expectOne(second + '/cancel-renewal');
    expect(cancellation.request.body).toEqual({});
    cancellation.flush({ ...overview, status: 'CANCELLATION_PENDING', canContract: false });
    http.expectOne(second + '/operations').flush([]);
    fixture.detectChanges();
    expect(page.textContent).toContain('Cancelación en trámite');
    http.verify();
  });
});
