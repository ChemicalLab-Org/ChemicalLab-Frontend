import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AgreementsService, ReviewEntry, ReviewPermissions } from '../../core/services/agreements.service';

@Component({
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './agreement-reviews.html',
  styleUrl: './agreements.scss',
})
export class AgreementReviewsComponent {
  private readonly agreements = inject(AgreementsService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly permissions = signal<ReviewPermissions | null>(null);
  protected readonly entries = signal<ReviewEntry[] | null>(null);
  protected readonly busy = signal(false);
  protected readonly status = signal('');
  protected readonly error = signal('');
  protected type: 'directors' | 'families' = 'families';
  protected institution: number | null = null;
  protected membership: number | null = null;
  protected documentId: number | null = null;
  protected result = '';
  protected basis = '';
  protected reference = '';
  protected until = '';
  private pending: { key: string; id: string } | null = null;

  protected readonly results: Record<string, string> = {
    PENDING: 'Pendiente', VERIFIED: 'Verificada', DENIED: 'Rechazada', REVOKED: 'Revocada',
    WITHDRAWN: 'Retirada', NOT_REQUIRED: 'No exigible con el fundamento verificado',
  };
  protected readonly bases: Record<string, string> = {
    PARENT_OR_GUARDIAN: 'Patria potestad o tutela', CAPABLE_ADOLESCENT: 'Adolescente con capacidad verificada',
    INSTITUTION: 'Representación institucional',
  };

  constructor() {
    this.agreements.reviewPermissions().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (permissions) => {
        this.permissions.set(permissions);
        if (!permissions.platform && permissions.schools.length === 1) this.institution = permissions.schools[0].id;
      },
      error: () => this.error.set('No se pudieron consultar tus facultades de revisión.'),
    });
  }

  protected changeScope() {
    this.entries.set(null);
    this.error.set('');
    this.status.set('');
  }

  protected changeType() {
    this.result = '';
    this.changeScope();
  }

  protected load(before?: number) {
    if (!this.institution || !this.membership || (this.type === 'directors' && !this.documentId)) return;
    this.busy.set(true);
    this.error.set('');
    this.agreements.reviewHistory(this.type, this.institution, this.membership,
      this.type === 'directors' ? this.documentId ?? undefined : undefined, before)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (rows) => {
          this.entries.update((current) => before ? [...(current ?? []), ...rows] : rows);
          this.hasMore.set(rows.length === 30);
          this.busy.set(false);
        },
        error: (error: HttpErrorResponse) => this.showFailure(error),
      });
  }

  protected readonly hasMore = signal(false);

  protected save() {
    if (!this.institution || !this.membership) return;
    const validUntil = this.result === 'VERIFIED' && this.until ? new Date(this.until).toISOString() : null;
    const input = {
      result: this.result,
      evidenceReference: this.reference.trim(),
      validUntil,
      ...(this.type === 'directors' ? { documentId: this.documentId } : {
        basis: this.result === 'VERIFIED' ? this.basis : null,
      }),
    };
    const key = JSON.stringify([this.type, this.institution, this.membership, input]);
    const requestId = this.pending?.key === key ? this.pending.id : crypto.randomUUID();
    this.pending = { key, id: requestId };
    this.busy.set(true);
    this.error.set('');
    this.status.set('');
    this.agreements.recordReview(this.type, this.institution, this.membership, { ...input, requestId })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => {
          this.pending = null;
          this.status.set('La revisión quedó registrada.');
          this.load();
        },
        error: (error: HttpErrorResponse) => this.showFailure(error),
      });
  }

  private showFailure(error: HttpErrorResponse) {
    this.busy.set(false);
    this.error.set(error.error?.message ?? 'No se pudo completar la operación.');
  }
}
