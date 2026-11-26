import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  AgreementAction, AgreementDecision, AgreementItem, AgreementOverview, AgreementsService, AgreementText, FamilyStatus,
} from '../../core/services/agreements.service';
import { AuthService } from '../../core/services/auth.service';
import { AgreementReadingComponent } from './agreement-reading.component';

@Component({
  imports: [RouterLink, DatePipe, AgreementReadingComponent],
  templateUrl: './agreement-account.html',
  styleUrl: './agreements.scss',
})
export class AgreementAccountComponent {
  private readonly agreements = inject(AgreementsService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = inject(AuthService);
  protected readonly overview = signal<AgreementOverview | null>(null);
  protected readonly history = signal<AgreementDecision[]>([]);
  protected readonly familyStatus = signal<FamilyStatus[]>([]);
  protected readonly showReviews = signal(false);
  protected readonly nextBefore = signal<number | null>(null);
  protected readonly historyLoading = signal(false);
  protected readonly historyError = signal(false);
  protected readonly selected = signal<AgreementItem | null>(null);
  protected readonly text = signal<AgreementText | null>(null);
  protected readonly checked = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly status = signal('');
  private readonly requests = new Map<AgreementAction, string>();

  protected readonly actions: Record<AgreementAction, string> = {
    ACCEPT: 'Aceptación', ACKNOWLEDGE: 'Constancia de lectura', GRANT: 'Autorización',
    DECLINE: 'Rechazo', WITHDRAW: 'Retirada',
  };
  protected readonly kinds = {
    TERMS: 'Términos de uso', NOTICE: 'Aviso de privacidad', CONSENT: 'Consentimiento por finalidad',
    INSTITUTIONAL: 'Acuerdo institucional',
  };
  protected readonly familyLabels: Record<FamilyStatus['status'], string> = {
    PENDING: 'Pendiente de verificación', VERIFIED: 'Verificada', DENIED: 'Rechazada',
    WITHDRAWN: 'Retirada', NOT_REQUIRED: 'El colegio confirmó otro fundamento', EXPIRED: 'Vencida',
  };

  constructor() {
    this.loadOverview();
    this.loadHistory();
  }

  protected loadOverview() {
    this.error.set('');
    this.agreements.overview().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (overview) => {
        this.overview.set(overview);
        if (!overview.enabled) return;
        this.agreements.familyStatus().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: (status) => this.familyStatus.set(status),
          error: () => this.error.set('No se pudo consultar el estado de las autorizaciones escolares.'),
        });
        if (!overview.globalBlocked && !this.auth.requiresPasswordChange()) {
          this.agreements.reviewPermissions().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (permissions) => this.showReviews.set(permissions.platform || permissions.schools.length > 0),
            error: () => this.showReviews.set(false),
          });
        }
      },
      error: () => this.error.set('No se pudieron consultar los acuerdos de la cuenta.'),
    });
  }

  protected loadHistory(before?: number) {
    this.historyLoading.set(true);
    this.historyError.set(false);
    this.agreements.history(before).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (page) => {
        this.history.update((current) => before === undefined ? page.decisions : [...current, ...page.decisions]);
        this.nextBefore.set(page.nextBefore);
        this.historyLoading.set(false);
      },
      error: () => {
        this.historyError.set(true);
        this.historyLoading.set(false);
      },
    });
  }

  protected open(item: AgreementItem) {
    this.checked.set(false);
    this.error.set('');
    this.status.set('');
    this.text.set(null);
    this.requests.clear();
    this.selected.set(this.selected() === item ? null : item);
    if (!this.selected()) return;
    this.agreements.text(item.document.id, false).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (text) => { if (this.selected() === item) this.text.set(text); },
      error: () => {
        if (this.selected() !== item) return;
        this.selected.set(null);
        this.error.set('No se pudo abrir esta versión del documento.');
      },
    });
  }

  protected submit(item: AgreementItem, action: AgreementAction) {
    if (this.saving() || this.selected() !== item || !this.text() || !item.decisionAuthority) return;
    if ((action === 'ACCEPT' || action === 'ACKNOWLEDGE' || action === 'GRANT') && !this.checked()) return;
    const requestId = this.requests.get(action) ?? crypto.randomUUID();
    this.requests.set(action, requestId);
    this.error.set('');
    this.status.set('');
    this.saving.set(true);
    this.agreements.submit(item, action, requestId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.selected.set(null);
        this.text.set(null);
        this.status.set('Tu decisión quedó registrada.');
        this.loadOverview();
        this.loadHistory();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        if (error.status === 409 || error.status === 403) {
          this.selected.set(null);
          this.loadOverview();
        }
        this.error.set(error.error?.message ?? 'No se pudo confirmar el registro. Puedes intentarlo otra vez.');
      },
    });
  }
}
