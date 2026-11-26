import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { Observable, Subject, finalize, takeUntil } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SessionControlsComponent } from '../../shared/session-controls.component';

interface School { id: number; name: string }
interface Options { enabled: boolean; schools: School[]; nextAfter: number | null }
interface Plan {
  version: number; name: string; currency: string; monthlyAmount: number; activeUsers: number; storageBytes: number;
}
interface Overview {
  mode: 'LOCAL_TEST' | 'MERCADO_PAGO_TEST';
  name: string;
  administrativeActive: boolean;
  canContract: boolean;
  canCancel: boolean;
  plan: Plan;
  activeUsers: number;
  usedBytes: number;
  status: string;
  trialStart: string | null;
  trialEnd: string | null;
  paidFrom: string | null;
  paidUntil: string | null;
  nextCharge: string | null;
  checkoutUrl: string | null;
}
interface Operation { id: number; event: string; outcome: string | null; recordedAt: string }

@Component({
  selector: 'app-institutional-subscriptions',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, FormsModule, RouterLink, SessionControlsComponent],
  templateUrl: './institutional-subscriptions.component.html',
  styleUrl: './institutional-subscriptions.component.scss',
})
export class InstitutionalSubscriptionsComponent {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly selectionChange = new Subject<void>();
  private readonly api = environment.apiUrl;
  private readonly initialSchool = Number(inject(ActivatedRoute).snapshot.queryParamMap.get('institucion'));

  readonly options = signal<Options | null>(null);
  readonly overview = signal<Overview | null>(null);
  readonly operations = signal<Operation[]>([]);
  readonly moreOperations = signal(false);
  readonly loading = signal(false);
  readonly writing = signal(false);
  readonly issue = signal('');
  readonly message = signal('');
  school: number | null = null;
  confirmation: 'checkout' | 'cancel' | null = null;

  readonly labels: Record<string, string> = {
    AWAITING_ENABLEMENT: 'Pendiente de habilitación',
    TRIAL: 'Prueba vigente', PAID: 'Período pagado vigente', CANCELLED_PAID: 'Renovación cancelada, período pagado vigente',
    EXPIRED: 'Sin vigencia', CANCELLATION_PENDING: 'Cancelación en trámite', AUTHORIZED_UNPAID: 'Cobro recurrente autorizado, pendiente de pago',
    RENEWAL_PAUSED: 'Renovación pausada', CHECKOUT_PENDING: 'Pendiente de autorización en Mercado Pago',
    VERIFYING: 'Verificando la solicitud de checkout',
    SCHOOL_VERIFIED: 'Institución verificada', AUTHORITY_VERIFIED: 'Representación comercial verificada',
    AUTHORITY_REVOKED: 'Representación comercial revocada', TRIAL_STARTED: 'Prueba iniciada',
    CHECKOUT_REQUESTED: 'Checkout solicitado', CHECKOUT_WITHDRAWN: 'Solicitud retirada',
    CHECKOUT_UNCERTAIN: 'Solicitud pendiente de reconciliación', CANCELLATION_REQUESTED: 'Cancelación solicitada',
    RECURRENCE_STATE: 'Estado de renovación actualizado', PAYMENT_STATE: 'Estado de pago actualizado',
    pending: 'Pendiente', authorized: 'Autorizada', cancelled: 'Cancelada', paused: 'Pausada',
    APPROVED: 'Aprobado', PENDING: 'Pendiente', FAILED: 'Fallido', REVERSED: 'Revertido',
  };

  constructor() { this.loadSchools(); }

  loadSchools(after = 0): void {
    this.issue.set('');
    this.http.get<Options>(`${this.api}/subscriptions/v1/institutions`, { params: { after } })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: options => {
          this.options.set({
            ...options,
            schools: after ? [...(this.options()?.schools ?? []), ...options.schools] : options.schools,
          });
          if (this.school === null && options.schools.some(school => school.id === this.initialSchool)) {
            this.select(this.initialSchool);
          } else if (!after && this.school === null && options.schools.length === 1 && options.nextAfter === null) {
            this.select(options.schools[0].id);
          }
        },
        error: failure => this.report(failure),
      });
  }

  select(id: number | null): void {
    this.selectionChange.next();
    this.school = id;
    this.overview.set(null);
    this.operations.set([]);
    this.moreOperations.set(false);
    this.confirmation = null;
    this.message.set('');
    this.issue.set('');
    if (id !== null) this.reload();
  }

  reload(): void {
    if (this.school === null || this.loading()) return;
    this.issue.set('');
    this.loading.set(true);
    this.read(this.http.get<Overview>(this.url()), value => {
      this.overview.set(value);
      this.loadOperations();
    }, () => this.loading.set(false));
  }

  loadOperations(before?: number): void {
    this.read(this.http.get<Operation[]>(`${this.url()}/operations`, { params: before ? { before } : {} }), rows => {
      this.operations.set(before ? [...this.operations(), ...rows] : rows);
      this.moreOperations.set(rows.length === 20);
    });
  }

  nextOperations(): void { this.loadOperations(this.operations().at(-1)?.id); }

  submit(): void {
    const action = this.confirmation;
    if (!action || this.school === null || this.writing()) return;
    this.confirmation = null;
    this.issue.set('');
    this.message.set('');
    this.writing.set(true);
    const command = action === 'checkout' ? { confirmed: true } : {};
    this.read(this.http.post<Overview>(`${this.url()}/${action === 'checkout' ? 'checkout' : 'cancel-renewal'}`, command),
      result => {
        this.overview.set(result);
        this.message.set(action === 'cancel' ? 'Solicitud recibida. El período ya pagado conserva su vigencia.'
          : result.checkoutUrl ? 'Checkout listo para abrir.' : 'Solicitud recibida. Consulta el estado antes de continuar.');
        this.loadOperations();
      }, () => this.writing.set(false));
  }

  checkoutAddress(value: Overview): string | null {
    if (!value.checkoutUrl) return null;
    try {
      const url = new URL(value.checkoutUrl);
      if (url.username || url.password) return null;
      if (value.mode === 'LOCAL_TEST') return url.protocol === 'http:' && url.hostname === '127.0.0.1' ? url.href : null;
      return url.origin === 'https://www.mercadopago.com.pe' && url.pathname === '/subscriptions/checkout' ? url.href : null;
    } catch { return null; }
  }

  private url(): string { return `${this.api}/institutions/${this.school}/subscription/v1`; }

  private read<T>(source: Observable<T>, next: (value: T) => void, finish = () => {}): void {
    source.pipe(takeUntil(this.selectionChange), takeUntilDestroyed(this.destroyRef), finalize(finish))
      .subscribe({ next, error: failure => this.report(failure) });
  }

  private report(failure: HttpErrorResponse): void {
    this.issue.set(failure.status === 403 ? 'Esta acción requiere representación comercial vigente.'
      : failure.status === 404 ? 'La suscripción solicitada no está disponible para esta cuenta.'
      : failure.status === 409 ? 'La operación no está disponible en el estado actual de la suscripción.'
      : 'No se pudo consultar o actualizar la suscripción. Vuelve a intentarlo.');
  }
}
