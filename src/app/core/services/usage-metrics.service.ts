import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, EMPTY, catchError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  RecordUsageEventRequest,
  UsageCountResponse,
  UsageEventResponse,
  UsageEventType,
  UsageMetricsSummaryResponse,
  UsageModule,
  UsagePanelResponse,
  UserRole,
} from '../../shared/models';

/**
 * Servicio de métricas de usabilidad e interacción.
 *
 * <p>Envía eventos de uso al backend (`POST /api/usage-metrics/events`) y expone consultas
 * de solo lectura para el panel administrativo. Está separado de la trazabilidad/auditoría:
 * mide la interacción educativa, no acciones críticas de seguridad.</p>
 *
 * <p>El registro es <strong>silencioso</strong>: si falla, no rompe la navegación ni se le
 * muestra nada al usuario. Nunca se envían datos sensibles (el usuario y el rol los resuelve
 * el backend desde el token; la metadata se mantiene corta y sin contraseñas, tokens ni
 * respuestas de evaluación).</p>
 */
@Injectable({ providedIn: 'root' })
export class UsageMetricsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/usage-metrics`;
  private readonly adminUrl = `${environment.apiUrl}/admin/usage-metrics`;

  /** Ventana (ms) para evitar registrar el mismo acceso a módulo repetidas veces. */
  private static readonly MODULE_DEDUPE_MS = 1500;
  private lastModuleKey: string | null = null;
  private lastModuleAt = 0;

  // =========================================================================
  // REGISTRO (cualquier usuario autenticado)
  // =========================================================================

  /** Registra un evento de uso. Errores se ignoran para no afectar la navegación. */
  record(request: RecordUsageEventRequest): void {
    this.http
      .post<void>(`${this.baseUrl}/events`, request)
      .pipe(catchError(() => EMPTY))
      .subscribe();
  }

  /**
   * Registra el acceso a un módulo principal, evitando duplicados si el usuario navega
   * rápido (mismo módulo dentro de una ventana corta de tiempo).
   */
  trackModuleAccess(module: UsageModule): void {
    const now = Date.now();
    if (this.lastModuleKey === module && now - this.lastModuleAt < UsageMetricsService.MODULE_DEDUPE_MS) {
      return;
    }
    this.lastModuleKey = module;
    this.lastModuleAt = now;
    this.record({ module, eventType: 'MODULE_ACCESS' });
  }

  /** Abrió el detalle de un elemento de la tabla periódica. */
  trackElementViewed(symbol: string, atomicNumber: number, category?: string): void {
    const metadata: Record<string, string> = {
      symbol,
      atomicNumber: String(atomicNumber),
    };
    if (category) metadata['category'] = category;
    this.record({
      module: 'PERIODIC_TABLE',
      eventType: 'PERIODIC_ELEMENT_VIEWED',
      resourceType: 'ELEMENT',
      resourceId: symbol,
      metadata,
    });
  }

  /** Usó la formación de compuestos (intento o validación). */
  trackCompoundFormation(compoundType: string, success: boolean): void {
    this.record({
      module: 'COMPOUNDS',
      eventType: 'COMPOUND_FORMATION_USED',
      resourceType: 'COMPOUND',
      metadata: { compoundType, success: String(success) },
    });
  }

  /** Cambió la nomenclatura visible de un compuesto ya formado. */
  trackNomenclatureSelection(nomenclature: 'Tradicional' | 'Stock' | 'Sistemática'): void {
    this.record({
      module: 'COMPOUNDS',
      eventType: 'IMPORTANT_CLICK',
      resourceType: 'NOMENCLATURE',
      resourceId: nomenclature,
      description: 'Selección de nomenclatura',
      metadata: { nomenclature },
    });
  }

  /** Abrió o visualizó un contenido conceptual. */
  trackContentView(contentId: number, category?: string): void {
    const metadata: Record<string, string> = { contentId: String(contentId) };
    if (category) metadata['category'] = category;
    this.record({
      module: 'CONCEPTS',
      eventType: 'CONTENT_VIEW',
      resourceType: 'CONCEPT',
      resourceId: String(contentId),
      metadata,
    });
  }

  /** Abrió el detalle de una evaluación. */
  trackEvaluationOpened(evaluationId: number, questionCount?: number): void {
    const metadata: Record<string, string> = {};
    if (questionCount !== undefined) metadata['questionCount'] = String(questionCount);
    this.record({
      module: 'EVALUATIONS',
      eventType: 'EVALUATION_OPENED',
      resourceType: 'EVALUATION',
      resourceId: String(evaluationId),
      metadata,
    });
  }

  /** Inició un intento de evaluación. */
  trackEvaluationStarted(evaluationId: number): void {
    this.record({
      module: 'EVALUATIONS',
      eventType: 'EVALUATION_STARTED',
      resourceType: 'EVALUATION',
      resourceId: String(evaluationId),
    });
  }

  /** Visualizó el detalle de un resultado de evaluación. */
  trackResultsViewed(roleContext: UserRole, evaluationId?: number): void {
    const metadata: Record<string, string> = { roleContext };
    this.record({
      module: 'RESULTS',
      eventType: 'RESULTS_VIEWED',
      resourceType: evaluationId !== undefined ? 'EVALUATION' : undefined,
      resourceId: evaluationId !== undefined ? String(evaluationId) : undefined,
      metadata,
    });
  }

  // =========================================================================
  // CONSULTA (solo ADMINISTRADOR)
  // =========================================================================

  /**
   * Indicadores agregados (histórico total) del panel administrativo: actividad general,
   * pizarra, evaluaciones y trazabilidad. Solo conteos calculados sobre datos reales.
   */
  getPanel(): Observable<UsagePanelResponse> {
    return this.http.get<UsagePanelResponse>(`${this.adminUrl}/panel`);
  }

  getSummary(from?: string | null, to?: string | null): Observable<UsageMetricsSummaryResponse> {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return this.http.get<UsageMetricsSummaryResponse>(`${this.adminUrl}/summary`, { params });
  }

  getRecent(
    limit: number,
    module?: UsageModule | null,
    role?: UserRole | null,
    eventType?: UsageEventType | null,
  ): Observable<UsageEventResponse[]> {
    let params = new HttpParams().set('limit', String(limit));
    if (module) params = params.set('module', module);
    if (role) params = params.set('role', role);
    if (eventType) params = params.set('eventType', eventType);
    return this.http.get<UsageEventResponse[]>(`${this.adminUrl}/recent`, { params });
  }

  getByModule(from?: string | null, to?: string | null): Observable<UsageCountResponse[]> {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return this.http.get<UsageCountResponse[]>(`${this.adminUrl}/by-module`, { params });
  }

  getByRole(from?: string | null, to?: string | null): Observable<UsageCountResponse[]> {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return this.http.get<UsageCountResponse[]>(`${this.adminUrl}/by-role`, { params });
  }
}
