import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export type AgreementAction = 'ACCEPT' | 'ACKNOWLEDGE' | 'GRANT' | 'DECLINE' | 'WITHDRAW';

export interface AgreementDocument {
  id: number;
  code: string;
  version: number;
  kind: 'TERMS' | 'NOTICE' | 'CONSENT' | 'INSTITUTIONAL';
  title: string;
  sha256: string;
  changeSummary: string;
  publishedAt: string;
  institutionId: number | null;
  institutionName: string | null;
  required: boolean;
}

export interface AgreementText {
  document: AgreementDocument;
  body: string;
}

export interface AgreementItem {
  document: AgreementDocument;
  subjectId: number | null;
  decisionAuthority: 'SELF' | 'REVIEWED_SELF' | 'GUARDIAN' | 'INSTITUTION' | null;
  currentAction: AgreementAction | null;
}

export interface AgreementOverview {
  enabled: boolean;
  globalBlocked: boolean;
  items: AgreementItem[];
}

export interface AgreementDecision {
  id: number;
  subjectId: number | null;
  actorId: number;
  action: AgreementAction;
  recordedAt: string;
  document: AgreementDocument;
}

export interface AgreementHistory {
  decisions: AgreementDecision[];
  nextBefore: number | null;
}

export interface FamilyStatus {
  institutionId: number;
  institutionName: string;
  status: 'PENDING' | 'VERIFIED' | 'DENIED' | 'WITHDRAWN' | 'NOT_REQUIRED' | 'EXPIRED';
  validUntil: string | null;
}

export interface ReviewPermissions {
  platform: boolean;
  schools: { id: number; name: string }[];
}

export interface ReviewEntry {
  id: number;
  reviewerId: number;
  result: string;
  basis: string | null;
  evidenceReference: string;
  validUntil: string | null;
  recordedAt: string;
}

@Injectable({ providedIn: 'root' })
export class AgreementsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/agreements`;

  documents() {
    return this.http.get<AgreementDocument[]>(`${this.base}/public`);
  }

  text(id: number, publicDocument: boolean) {
    const path = publicDocument ? 'public' : 'account/versions';
    return this.http.get<AgreementText>(`${this.base}/${path}/${id}`);
  }

  overview() {
    return this.http.get<AgreementOverview>(`${this.base}/account`);
  }

  history(before?: number) {
    return this.http.get<AgreementHistory>(`${this.base}/account/history`, {
      params: before === undefined ? {} : { before },
    });
  }

  submit(item: AgreementItem, action: AgreementAction, requestId: string) {
    return this.http.post<AgreementDecision>(`${this.base}/account/versions/${item.document.id}/decisions`, {
      subjectId: item.subjectId,
      action,
      requestId,
    });
  }

  familyStatus() {
    return this.http.get<FamilyStatus[]>(`${this.base}/account/family-status`);
  }

  reviewPermissions() {
    return this.http.get<ReviewPermissions>(`${this.base}/review/permissions`);
  }

  reviewHistory(type: 'directors' | 'families', institution: number, membership: number, document?: number, before?: number) {
    const params: Record<string, number> = {};
    if (document !== undefined) params['document'] = document;
    if (before !== undefined) params['before'] = before;
    return this.http.get<ReviewEntry[]>(`${this.base}/review/${type}/${institution}/${membership}`, { params });
  }

  recordReview(type: 'directors' | 'families', institution: number, membership: number, body: object) {
    return this.http.post<ReviewEntry>(`${this.base}/review/${type}/${institution}/${membership}`, body);
  }
}
