import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { UsageMetricsService } from './usage-metrics.service';

describe('UsageMetricsService', () => {
  let service: UsageMetricsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UsageMetricsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it.each(['Tradicional', 'Stock', 'Sistemática'] as const)(
    'registra la selección %s como interacción no evaluable',
    (nomenclature) => {
      service.trackNomenclatureSelection(nomenclature);

      const request = http.expectOne(`${environment.apiUrl}/usage-metrics/events`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        module: 'COMPOUNDS',
        eventType: 'IMPORTANT_CLICK',
        resourceType: 'NOMENCLATURE',
        resourceId: nomenclature,
        description: 'Selección de nomenclatura',
        metadata: { nomenclature },
      });
      request.flush(null);
    }
  );
});
