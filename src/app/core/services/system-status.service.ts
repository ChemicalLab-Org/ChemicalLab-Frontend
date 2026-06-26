import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ServiceStatus = 'disponible' | 'con-problemas' | 'no-disponible' | 'no-informado';

export interface ServiceStatusItem {
  readonly name: string;
  readonly status: ServiceStatus;
  readonly detail?: string;
  readonly latencyMs?: number;
  readonly checkedAt: Date;
}

export interface SystemHealth {
  readonly backend: ServiceStatusItem;
  readonly database: ServiceStatusItem;
  readonly checkedAt: Date;
}

// Estructura de respuesta del endpoint /api/health del backend
interface HealthResponse {
  status?: string;
  backend?: { status?: string; framework?: string };
  database?: { status?: string; type?: string; latencyMs?: number; message?: string };
  timestamp?: string;
}

@Injectable({ providedIn: 'root' })
export class SystemStatusService {
  private readonly http = inject(HttpClient);

  // Usa siempre la URL configurada en el entorno — sin hardcodear localhost ni dominios públicos.
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
    // Si llegamos aquí, el backend respondió con HTTP 2xx → backend disponible.
    const backend: ServiceStatusItem = {
      name: 'Backend API',
      status: 'disponible',
      checkedAt,
    };

    const database: ServiceStatusItem = this.extractDatabaseStatus(res, checkedAt);

    return { backend, database, checkedAt };
  }

  private extractDatabaseStatus(res: HealthResponse, checkedAt: Date): ServiceStatusItem {
    const dbFromResponse = res?.database;

    if (dbFromResponse === undefined || dbFromResponse === null) {
      return { name: 'Base de datos', status: 'no-informado', checkedAt };
    }

    const rawStatus = dbFromResponse.status?.toUpperCase();
    const status: ServiceStatus =
      rawStatus === 'UP' ? 'disponible' :
      rawStatus === 'DOWN' ? 'no-disponible' : 'con-problemas';

    return {
      name: 'Base de datos',
      status,
      latencyMs: dbFromResponse.latencyMs,
      checkedAt,
    };
  }

  private buildUnavailable(checkedAt: Date): SystemHealth {
    return {
      backend: { name: 'Backend API', status: 'no-disponible', checkedAt },
      database: { name: 'Base de datos', status: 'no-informado', checkedAt },
      checkedAt,
    };
  }
}
