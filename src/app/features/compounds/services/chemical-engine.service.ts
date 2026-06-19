import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  AcidRequest,
  CompoundResponse,
  ElementCompoundRequest,
  OxisaltRequest,
  SaltRequest,
} from '../models/chemistry.models';

/**
 * Servicio que consume el motor químico del backend (`/api/chemistry`).
 *
 * Usa `environment.apiUrl` (no hardcodea localhost) y deja que el
 * `authInterceptor` agregue el token JWT, por lo que aquí no se manipula
 * la cabecera de autorización.
 */
@Injectable({ providedIn: 'root' })
export class ChemicalEngineService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/chemistry`;

  /** Forma un óxido a partir de un elemento y su valencia. */
  generateOxide(request: ElementCompoundRequest): Observable<CompoundResponse> {
    return this.http.post<CompoundResponse>(`${this.baseUrl}/oxides`, request);
  }

  /** Forma un hidróxido a partir de un metal y su valencia. */
  generateHydroxide(request: ElementCompoundRequest): Observable<CompoundResponse> {
    return this.http.post<CompoundResponse>(`${this.baseUrl}/hydroxides`, request);
  }

  /** Forma un ácido (hidrácido u oxácido) según el tipo indicado. */
  generateAcid(request: AcidRequest): Observable<CompoundResponse> {
    return this.http.post<CompoundResponse>(`${this.baseUrl}/acids`, request);
  }

  /** Forma una sal binaria a partir de un metal y un no metal. */
  generateSalt(request: SaltRequest): Observable<CompoundResponse> {
    return this.http.post<CompoundResponse>(`${this.baseUrl}/salts`, request);
  }

  /** Forma una oxisal a partir de un metal y un grupo oxácido. */
  generateOxisalt(request: OxisaltRequest): Observable<CompoundResponse> {
    return this.http.post<CompoundResponse>(`${this.baseUrl}/oxisalts`, request);
  }
}
