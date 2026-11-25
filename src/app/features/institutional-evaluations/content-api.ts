import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ClassChoice, Page } from './catalog-api';

export interface ContentChoice extends ClassChoice { canCreate: boolean; }
export interface RevisionKey { contentId: number; revisionId: number; }
export interface ContentRow extends RevisionKey {
  number: number;
  version: number;
  status: 'DRAFT' | 'PUBLISHED';
  title: string;
  category: string;
  canEdit: boolean;
  canPublish: boolean;
  canAssign: boolean;
  assigned: boolean;
}
export interface Delivery extends RevisionKey {
  deliveryId: number;
  number: number;
  title: string;
  category: string;
}
export interface ContentLink { title: string | null; url: string; }
export interface ContentText {
  title: string;
  category: string;
  summary: string | null;
  explanation: string | null;
  formationSteps: string[];
  keyPoints: string[];
  examples: string[];
  suggestedActivity: string | null;
  links: ContentLink[];
}
export interface ContentFile { id: number; name: string; title: string | null; mime: string; size: number; preview: boolean; }
export interface ContentDetail extends RevisionKey {
  number: number;
  version: number;
  status: ContentRow['status'];
  text: ContentText;
  file: ContentFile | null;
  materialCount: number;
}
export interface Receipt extends Omit<ContentDetail, 'text' | 'materialCount'> {
  deliveryId: number | null;
  recipients: number | null;
}

@Injectable({ providedIn: 'root' })
export class InstitutionalContentApi {
  private readonly http = inject(HttpClient);
  private readonly root = environment.apiUrl + '/institutions';

  capability() {
    return this.http.get<{ enabled: boolean }>(this.root + '/content-runtime');
  }

  choices(after: number) {
    return this.http.get<Page<ContentChoice>>(this.root + '/content-catalog/NEW/v1/classes', { params: { after } });
  }

  library(scope: ClassChoice, after: number) {
    return this.http.get<Page<ContentRow>>(this.base(scope) + '/library', { params: { after } });
  }

  assigned(scope: ClassChoice, after: number) {
    return this.http.get<Page<Delivery>>(this.base(scope) + '/assigned', { params: { after } });
  }

  detail(scope: ClassChoice, key: RevisionKey, deliveryId?: number) {
    return this.http.get<ContentDetail>(this.revision(scope, key, deliveryId));
  }

  command(scope: ClassChoice, text: ContentText) {
    return this.http.post<Receipt>(this.base(scope) + '/library', { operationId: crypto.randomUUID(), text });
  }

  edit(scope: ClassChoice, key: ContentDetail, text: ContentText) {
    return this.http.put<Receipt>(this.revision(scope, key), { operationId: crypto.randomUUID(), version: key.version, text });
  }

  transition(scope: ClassChoice, key: RevisionKey & { version: number }, action: 'publish' | 'successor' | 'assign' | 'remove-file') {
    return this.http.post<Receipt>(this.revision(scope, key) + '/' + action, {
      operationId: crypto.randomUUID(), version: key.version,
    });
  }

  upload(scope: ClassChoice, key: ContentDetail, file: File, title: string) {
    const body = new FormData();
    body.append('operationId', crypto.randomUUID());
    body.append('version', String(key.version));
    body.append('file', file);
    if (title.trim()) body.append('title', title.trim());
    return this.http.post<Receipt>(this.revision(scope, key) + '/file', body);
  }

  download(scope: ClassChoice, key: RevisionKey, file: number, preview: boolean, deliveryId?: number) {
    return this.http.get(this.revision(scope, key, deliveryId) + '/files/' + file, {
      params: { preview }, responseType: 'blob',
    });
  }

  private base(scope: ClassChoice) {
    return `${this.root}/${scope.institutionId}/classes/${scope.classId}/contents/NEW/v1`;
  }

  private revision(scope: ClassChoice, key: RevisionKey, deliveryId?: number) {
    const path = deliveryId === undefined ? '/library' : `/assigned/${deliveryId}/contents`;
    return `${this.base(scope)}${path}/${key.contentId}/revisions/${key.revisionId}`;
  }
}
