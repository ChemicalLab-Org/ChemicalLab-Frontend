import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  StudentUsageDetailResponse,
  StudentUsageFilters,
  StudentUsageRecordsResponse,
} from '../../shared/models';

/**
 * Registro de uso por estudiante (Instrumento 3: ficha de registro automático de uso).
 *
 * <p>Consultas de solo lectura contra los endpoints administrativos
 * {@code GET /api/admin/student-usage-records} y
 * {@code GET /api/admin/student-usage-records/:userId}. Los filtros vacíos no se envían;
 * el backend valida los valores y responde 400 ante filtros inválidos.</p>
 */
@Injectable({ providedIn: 'root' })
export class StudentUsageService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/admin/student-usage-records`;

  getRecords(filters: StudentUsageFilters): Observable<StudentUsageRecordsResponse> {
    let params = new HttpParams();
    if (filters.role) params = params.set('role', filters.role);
    if (filters.search.trim()) params = params.set('search', filters.search.trim());
    if (filters.grade) params = params.set('grade', filters.grade);
    if (filters.section) params = params.set('section', filters.section);
    if (filters.from) params = params.set('from', filters.from);
    if (filters.to) params = params.set('to', filters.to);
    if (filters.module) params = params.set('module', filters.module);
    if (filters.onlyStudentsWithActivity) params = params.set('onlyStudentsWithActivity', 'true');
    return this.http.get<StudentUsageRecordsResponse>(this.baseUrl, { params });
  }

  getDetail(userId: number): Observable<StudentUsageDetailResponse> {
    return this.http.get<StudentUsageDetailResponse>(`${this.baseUrl}/${userId}`);
  }
}
