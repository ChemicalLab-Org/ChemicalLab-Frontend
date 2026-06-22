import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ServiceStatus = 'disponible' | 'con-problemas' | 'no-disponible';

export interface ServiceStatusItem {
  readonly name: string;
  readonly status: ServiceStatus;
  readonly detail?: string;
  readonly checkedAt: Date;
}

export interface SystemHealth {
  readonly backend: ServiceStatusItem;
  readonly database?: ServiceStatusItem;
  readonly checkedAt: Date;
}

interface HealthResponse {
  status?: string;
  components?: Record<string, { status?: string }>;
}

@Injectable({ providedIn: 'root' })
export class SystemStatusService {
  private readonly http = inject(HttpClient);
  private readonly healthUrl = `${environment.apiUrl}/health`;

  checkHealth(): Observable<SystemHealth> {
    const now = new Date();
    return this.http.get<HealthResponse>(this.healthUrl).pipe(
      timeout(8000),
      map((res) => this.parseHealthResponse(res, now)),
      catchError(() => of(this.buildUnavailable(now)))
    );
  }

  private parseHealthResponse(res: HealthResponse, checkedAt: Date): SystemHealth {
    const overallStatus = res?.status?.toLowerCase();
    const backendStatus: ServiceStatus =
      overallStatus === 'up' ? 'disponible' :
      overallStatus === 'down' ? 'no-disponible' : 'con-problemas';

    const dbComponent = res?.components?.['db'] ?? res?.components?.['datasource'];
    let dbItem: ServiceStatusItem | undefined;
    if (dbComponent !== undefined) {
      const dbStatus = dbComponent.status?.toLowerCase();
      const dbServiceStatus: ServiceStatus =
        dbStatus === 'up' ? 'disponible' :
        dbStatus === 'down' ? 'no-disponible' : 'con-problemas';
      dbItem = { name: 'Base de datos', status: dbServiceStatus, checkedAt };
    }

    return {
      backend: { name: 'Backend API', status: backendStatus, checkedAt },
      database: dbItem,
      checkedAt,
    };
  }

  private buildUnavailable(checkedAt: Date): SystemHealth {
    return {
      backend: { name: 'Backend API', status: 'no-disponible', checkedAt },
      checkedAt,
    };
  }
}
