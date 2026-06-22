import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AuditLogFilters,
  AuditLogPageResponse,
  AuditLogResponse,
  AuditLogSummaryResponse,
} from '../../shared/models';

/**
 * Servicio del visor de logs / trazabilidad. Consume los endpoints de solo lectura
 * `/api/admin/logs` (listado paginado con filtros, detalle y resumen). El token JWT lo
 * agrega el authInterceptor, por lo que aquí no se manipula el token.
 */
@Injectable({ providedIn: 'root' })
export class AdminLogsService {
  private readonly http = inject(HttpClient);
  private readonly logsUrl = `${environment.apiUrl}/admin/logs`;

  /** Lista los logs con filtros y paginación. */
  listLogs(filters: AuditLogFilters): Observable<AuditLogPageResponse> {
    let params = new HttpParams();

    if (filters.category) params = params.set('category', filters.category);
    if (filters.eventType) params = params.set('eventType', filters.eventType);
    if (filters.severity) params = params.set('severity', filters.severity);
    if (filters.actorRole) params = params.set('actorRole', filters.actorRole);
    if (filters.search && filters.search.trim()) params = params.set('search', filters.search.trim());
    if (filters.from) params = params.set('from', filters.from);
    if (filters.to) params = params.set('to', filters.to);
    if (filters.page !== undefined && filters.page !== null) params = params.set('page', String(filters.page));
    if (filters.size !== undefined && filters.size !== null) params = params.set('size', String(filters.size));

    return this.http.get<AuditLogPageResponse>(this.logsUrl, { params });
  }

  /** Detalle de un log por id. */
  getLogById(id: number): Observable<AuditLogResponse> {
    return this.http.get<AuditLogResponse>(`${this.logsUrl}/${id}`);
  }

  /** Resumen de conteos por severidad y módulo. */
  getLogSummary(): Observable<AuditLogSummaryResponse> {
    return this.http.get<AuditLogSummaryResponse>(`${this.logsUrl}/summary`);
  }
}
