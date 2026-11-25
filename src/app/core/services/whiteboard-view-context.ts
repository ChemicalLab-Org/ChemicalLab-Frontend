import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export const boardCapabilityUrl = `${environment.apiUrl}/institutions/whiteboards/v1/capability`;

/** Provided by the selected class view and discarded with its descendants. */
@Injectable()
export class WhiteboardViewContext {
  private scope: { institutionId: number; classId: number } | null = null;

  select(scope: { institutionId: number; classId: number }): void {
    if (this.scope) throw new Error('Whiteboard scope is already selected.');
    this.scope = { institutionId: scope.institutionId, classId: scope.classId };
  }

  get path(): string {
    if (!this.scope) throw new Error('Missing whiteboard scope.');
    return `/institutions/${this.scope.institutionId}/classes/${this.scope.classId}/whiteboards/v1`;
  }

  connectHeader(id: number, role: 'teacher' | 'student'): string {
    if (!this.scope) throw new Error('Missing whiteboard scope.');
    return `${this.scope.institutionId}/${this.scope.classId}/${id}/${role}`;
  }

  command(): { headers: Record<string, string> } {
    return { headers: { 'Idempotency-Key': crypto.randomUUID() } };
  }
}
