import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  AcidNonMetalItem,
  BinaryNonMetalItem,
  CentralElementItem,
  MetalCatalogItem,
  OxoanionItem,
} from '../models/chemistry.models';

/**
 * Servicio que consume los catálogos del motor químico
 * (`/api/chemistry/catalog/*`). El backend es la fuente de verdad: aquí no se
 * mantienen listas químicas, solo se obtienen del servidor. El `authInterceptor`
 * agrega el token JWT, por lo que no se manipula la cabecera de autorización.
 */
@Injectable({ providedIn: 'root' })
export class ChemistryCatalogService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/chemistry/catalog`;

  /** Metales con sus valencias permitidas. */
  metals(): Observable<MetalCatalogItem[]> {
    return this.http.get<MetalCatalogItem[]>(`${this.baseUrl}/metals`);
  }

  /** No metales válidos para sales binarias. */
  binaryNonMetals(): Observable<BinaryNonMetalItem[]> {
    return this.http.get<BinaryNonMetalItem[]>(`${this.baseUrl}/binary-nonmetals`);
  }

  /** No metales que forman ácido hidrácido. */
  acidNonMetals(): Observable<AcidNonMetalItem[]> {
    return this.http.get<AcidNonMetalItem[]>(`${this.baseUrl}/acid-nonmetals`);
  }

  /** Elementos centrales disponibles para grupos oxácidos. */
  oxoanionCentralElements(): Observable<CentralElementItem[]> {
    return this.http.get<CentralElementItem[]>(`${this.baseUrl}/oxoanion-central-elements`);
  }

  /** Oxoaniones (grupos oxácidos). El backend incluye su elemento central. */
  oxoanions(): Observable<OxoanionItem[]> {
    return this.http.get<OxoanionItem[]>(`${this.baseUrl}/oxoanions`);
  }
}
