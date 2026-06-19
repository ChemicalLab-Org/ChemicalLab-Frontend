import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { StudentConceptContentResponse } from '../../../shared/models';

@Injectable({ providedIn: 'root' })
export class StudentConceptsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/concepts/student`;

  listAssignedConcepts(): Observable<StudentConceptContentResponse[]> {
    return this.http.get<StudentConceptContentResponse[]>(this.baseUrl);
  }

  getAssignedConcept(conceptId: number): Observable<StudentConceptContentResponse> {
    return this.http.get<StudentConceptContentResponse>(`${this.baseUrl}/${conceptId}`);
  }
}
