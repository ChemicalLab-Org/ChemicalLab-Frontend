import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ConceptMaterialResponse,
  CreateMaterialLinkRequest,
} from '../../shared/models';

/**
 * Servicio de los materiales de apoyo de los contenidos conceptuales.
 *
 * - La gestión (subir/reemplazar archivo, agregar enlace, retirar material) la usa el
 *   docente y vive bajo `/api/concepts/teacher/{conceptId}/materials`.
 * - La descarga/visualización de archivos (`/api/concepts/{conceptId}/materials/{id}/download`)
 *   la usan tanto el docente como el estudiante: el backend valida el acceso por rol.
 *
 * El token JWT lo agrega el `authInterceptor`; aquí no se manipula. Para la descarga se
 * pide el archivo como `blob` autenticado y el componente crea un object URL seguro.
 */
@Injectable({ providedIn: 'root' })
export class ConceptMaterialsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/concepts`;

  /** Sube o reemplaza el archivo de apoyo de un contenido del docente. */
  uploadFile(
    conceptId: number,
    file: File,
    title?: string
  ): Observable<ConceptMaterialResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (title && title.trim().length > 0) {
      formData.append('title', title.trim());
    }
    return this.http.post<ConceptMaterialResponse>(
      `${this.baseUrl}/teacher/${conceptId}/materials/file`,
      formData
    );
  }

  /** Agrega un enlace externo de apoyo a un contenido del docente. */
  addLink(
    conceptId: number,
    request: CreateMaterialLinkRequest
  ): Observable<ConceptMaterialResponse> {
    return this.http.post<ConceptMaterialResponse>(
      `${this.baseUrl}/teacher/${conceptId}/materials/link`,
      request
    );
  }

  /** Retira un material (archivo o enlace) de un contenido del docente. */
  deleteMaterial(conceptId: number, materialId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.baseUrl}/teacher/${conceptId}/materials/${materialId}`
    );
  }

  /**
   * Descarga el archivo de un material como blob autenticado. Se usa tanto para
   * previsualizar PDF/imágenes (creando un object URL) como para descargar diapositivas.
   */
  downloadMaterial(conceptId: number, materialId: number): Observable<Blob> {
    return this.http.get(
      `${this.baseUrl}/${conceptId}/materials/${materialId}/download`,
      { responseType: 'blob' }
    );
  }
}
