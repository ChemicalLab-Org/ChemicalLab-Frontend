import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ServiceStatus = 'disponible' | 'con-problemas' | 'no-disponible' | 'no-informado';

export interface ServiceStatusItem {
  readonly name: string;
  readonly status: ServiceStatus;
  readonly detail?: string;
  readonly checkedAt: Date;
}

export interface SystemHealth {
  readonly backend: ServiceStatusItem;
  readonly database: ServiceStatusItem;
  readonly checkedAt: Date;
}

interface HealthResponse {
  status?: string;
  message?: string;
  components?: Record<string, { status?: string }>;
  database?: { status?: string };
}

@Injectable({ providedIn: 'root' })
export class SystemStatusService {
  private readonly http = inject(HttpClient);

  // Usa siempre la URL configurada en el entorno — no hardcodear localhost ni dominios públicos.
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
    // Si llegamos aquí, el backend respondió con HTTP 2xx → Backend disponible.
    // No dependemos del valor del campo "status" porque cada backend puede usar convenciones distintas
    // (Spring Boot Actuator usa "UP", nuestro endpoint personalizado usa "OK", etc.).
    const backend: ServiceStatusItem = { name: 'Backend API', status: 'disponible', checkedAt };

    // Base de datos: solo marcamos estado si el backend lo reporta explícitamente.
    const database: ServiceStatusItem = this.extractDatabaseStatus(res, checkedAt);

    return { backend, database, checkedAt };
  }

  private extractDatabaseStatus(res: HealthResponse, checkedAt: Date): ServiceStatusItem {
    // Acepta varias estructuras de respuesta del backend
    const dbFromComponents =
      res?.components?.['db'] ??
      res?.components?.['datasource'] ??
      res?.components?.['postgres'];

    const dbFromRoot = res?.database;

    const rawStatus =
      dbFromComponents?.status?.toLowerCase() ??
      dbFromRoot?.status?.toLowerCase() ??
      null;

    if (rawStatus === null) {
      return { name: 'Base de datos', status: 'no-informado', checkedAt };
    }

    const status: ServiceStatus =
      rawStatus === 'up' || rawStatus === 'ok' || rawStatus === 'disponible'
        ? 'disponible'
        : rawStatus === 'down'
        ? 'no-disponible'
        : 'con-problemas';

    return { name: 'Base de datos', status, checkedAt };
  }

  private buildUnavailable(checkedAt: Date): SystemHealth {
    return {
      backend: { name: 'Backend API', status: 'no-disponible', checkedAt },
      database: { name: 'Base de datos', status: 'no-informado', checkedAt },
      checkedAt,
    };
  }
}
