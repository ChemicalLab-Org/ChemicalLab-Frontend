import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { TeacherWhiteboardService } from '../../../core/services/teacher-whiteboard.service';
import {
  SidebarComponent,
  SidebarNavItem,
} from '../../../shared/components/sidebar/sidebar.component';
import { TEACHER_NAV_ITEMS } from '../../../shared/components/sidebar/teacher-nav';
import {
  ApiError,
  WhiteboardSessionCreateRequest,
  WhiteboardSessionResponse,
  WhiteboardSessionStatus,
} from '../../../shared/models';

@Component({
  selector: 'app-teacher-whiteboards',
  standalone: true,
  imports: [ReactiveFormsModule, SidebarComponent],
  styleUrls: ['./teacher-whiteboards.component.scss'],
  template: `
    <div class="layout">
      <app-sidebar
        [navItems]="navItems"
        [userName]="userName()"
        [userRole]="userRole"
        [userInitials]="userInitials()"
        (onLogout)="handleLogout()"
      />

      <main class="main">
        <header class="page-header">
          <div>
            <h1 class="page-title">Pizarra interactiva</h1>
            <p class="page-description">
              Crea sesiones en vivo, dibuja y explica conceptos químicos con tu clase.
            </p>
          </div>
          <button type="button" class="btn btn-primary" (click)="openCreate()">
            <span class="material-icons">add</span>
            Crear sesión
          </button>
        </header>

        @if (successMessage()) {
          <div class="alert alert-success page-alert">
            <span class="material-icons">check_circle</span>
            {{ successMessage() }}
          </div>
        }

        @if (loading()) {
          <div class="loading-state">
            <div class="loading-state__spinner"></div>
            <div class="loading-state__label">Cargando sesiones…</div>
          </div>
        } @else if (error()) {
          <div class="error-state">
            <div class="error-state__icon"><span class="material-icons">error_outline</span></div>
            <h2 class="error-state__title">No se pudieron cargar las sesiones</h2>
            <p class="error-state__desc">{{ error() }}</p>
            <button type="button" class="btn btn-secondary" (click)="loadSessions()">Reintentar</button>
          </div>
        } @else if (sessions().length === 0) {
          <div class="empty-state">
            <div class="empty-state__icon"><span class="material-icons">draw</span></div>
            <h2 class="empty-state__title">Aún no tienes sesiones de pizarra</h2>
            <p class="empty-state__desc">
              Crea tu primera sesión para empezar a dibujar en vivo con tu grado y sección.
            </p>
            <button type="button" class="btn btn-primary" (click)="openCreate()">
              <span class="material-icons">add</span>
              Crear sesión
            </button>
          </div>
        } @else {
          <section class="section-grid">
            @for (s of sessions(); track s.id) {
              <article
                class="card session-card"
                [class.session-card--active]="s.status === 'ACTIVE'"
                [class.session-card--paused]="s.status === 'PAUSED'"
                [class.session-card--closed]="s.status === 'CLOSED'"
              >
                <div class="session-card__top">
                  <h3 class="session-card__name">{{ s.name }}</h3>
                  <span class="badge" [class]="statusBadgeClass(s.status)">
                    <span class="status-dot"></span>{{ statusLabel(s.status) }}
                  </span>
                </div>

                @if (s.description) {
                  <p class="session-card__desc">{{ s.description }}</p>
                }

                <div class="session-card__meta">
                  <span class="meta-chip">
                    <span class="material-icons">school</span>{{ s.grade }}° · {{ s.section }}
                  </span>
                  <span class="meta-chip">
                    <span class="material-icons">group</span>{{ s.participantCount }}
                  </span>
                </div>

                <dl class="session-card__dates">
                  <div>
                    <dt>Creada</dt>
                    <dd>{{ formatDate(s.createdAt) }}</dd>
                  </div>
                  @if (s.status === 'CLOSED' && s.closedAt) {
                    <div>
                      <dt>Finalizada</dt>
                      <dd>{{ formatDate(s.closedAt) }}</dd>
                    </div>
                  }
                </dl>

                <div class="session-card__actions">
                  @if (s.status === 'CLOSED') {
                    <button type="button" class="btn btn-secondary btn-sm" title="Ver registro de la sesión" (click)="openSession(s)">
                      <span class="material-icons">history</span>
                      Ver registro
                    </button>
                  } @else {
                    <button type="button" class="btn btn-primary btn-sm" title="Entrar a la sesión" (click)="openSession(s)">
                      <span class="material-icons">login</span>
                      Entrar
                    </button>
                    @if (s.status === 'ACTIVE') {
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        [disabled]="actionBusyId() === s.id"
                        title="Pausar sesión"
                        (click)="pause(s)"
                      >
                        <span class="material-icons">pause</span>
                        Pausar
                      </button>
                    } @else {
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        [disabled]="actionBusyId() === s.id"
                        title="Reanudar sesión"
                        (click)="resume(s)"
                      >
                        <span class="material-icons">play_arrow</span>
                        Reanudar
                      </button>
                    }
                  }
                </div>
              </article>
            }
          </section>
        }
      </main>
    </div>

    @if (formOpen()) {
      <div class="modal-overlay" (click)="closeForm()">
        <div class="modal modal--form" (click)="$event.stopPropagation()">
          <header class="modal__header">
            <h2 class="modal__title">Crear sesión de pizarra</h2>
            <button type="button" class="modal__close" aria-label="Cerrar" (click)="closeForm()">
              <span class="material-icons">close</span>
            </button>
          </header>

          <form [formGroup]="form" (ngSubmit)="submit()" class="modal__body">
            <div class="form-group form-group--full">
              <label class="form-label" for="wb-name">Nombre de la sesión</label>
              <input
                id="wb-name"
                class="input"
                formControlName="name"
                placeholder="ej. Enlace iónico — repaso"
                [class.input-error]="isInvalid('name')"
              />
              @if (isInvalid('name')) {
                <span class="form-error">Ingresa un nombre (máx. 150 caracteres).</span>
              }
            </div>

            <div class="form-grid">
              <div class="form-group">
                <label class="form-label" for="wb-grade">Grado</label>
                <select
                  id="wb-grade"
                  class="select"
                  formControlName="grade"
                  [class.input-error]="isInvalid('grade')"
                >
                  @for (g of gradeOptions; track g) {
                    <option [value]="g">{{ g }}° de secundaria</option>
                  }
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" for="wb-section">Sección</label>
                <input
                  id="wb-section"
                  class="input"
                  formControlName="section"
                  maxlength="1"
                  placeholder="A"
                  (input)="normalizeSection()"
                  [class.input-error]="isInvalid('section')"
                />
                @if (isInvalid('section')) {
                  <span class="form-error">La sección debe ser una sola letra (A-Z).</span>
                }
              </div>
            </div>

            <div class="form-group form-group--full">
              <label class="form-label" for="wb-desc">Descripción (opcional)</label>
              <textarea
                id="wb-desc"
                class="textarea"
                formControlName="description"
                rows="3"
                placeholder="Breve descripción de lo que explicarás en la sesión."
                [class.input-error]="isInvalid('description')"
              ></textarea>
              @if (isInvalid('description')) {
                <span class="form-error">La descripción no puede superar 1000 caracteres.</span>
              }
            </div>

            @if (formError()) {
              <div class="alert alert-danger modal__note">
                <span class="material-icons">error_outline</span>
                {{ formError() }}
              </div>
            }

            <div class="modal__actions">
              <button type="button" class="btn btn-secondary" (click)="closeForm()" [disabled]="saving()">
                Cancelar
              </button>
              <button type="submit" class="btn btn-primary" [disabled]="saving()">
                {{ saving() ? 'Creando…' : 'Crear y entrar' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class TeacherWhiteboardsComponent {
  private readonly authService = inject(AuthService);
  private readonly whiteboardService = inject(TeacherWhiteboardService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly navItems: readonly SidebarNavItem[] = TEACHER_NAV_ITEMS;
  readonly userRole = 'Docente';
  readonly gradeOptions = ['1', '2', '3', '4', '5', '6'];

  readonly sessions = signal<WhiteboardSessionResponse[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly actionBusyId = signal<number | null>(null);

  readonly formOpen = signal<boolean>(false);
  readonly saving = signal<boolean>(false);
  readonly formError = signal<string | null>(null);

  readonly form: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    grade: ['1', [Validators.required]],
    section: ['A', [Validators.required, Validators.pattern(/^[A-Za-z]$/)]],
    description: ['', [Validators.maxLength(1000)]],
  });

  private readonly currentUser = this.authService.currentUser;
  readonly userName = computed<string>(() => this.currentUser()?.username ?? 'Docente');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  constructor() {
    this.loadSessions();
  }

  loadSessions(): void {
    this.loading.set(true);
    this.error.set(null);
    this.whiteboardService.listSessions().subscribe({
      next: (sessions) => {
        this.sessions.set(sessions);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(this.extractError(err, 'Ocurrió un error al cargar las sesiones.'));
        this.loading.set(false);
      },
    });
  }

  openSession(session: WhiteboardSessionResponse): void {
    void this.router.navigate(['/teacher/whiteboards', session.id]);
  }

  pause(session: WhiteboardSessionResponse): void {
    this.actionBusyId.set(session.id);
    this.whiteboardService.pauseSession(session.id).subscribe({
      next: (updated) => this.onQuickActionDone(updated, 'Sesión pausada.'),
      error: (err: unknown) => this.onQuickActionError(err, 'No se pudo pausar la sesión.'),
    });
  }

  resume(session: WhiteboardSessionResponse): void {
    this.actionBusyId.set(session.id);
    this.whiteboardService.resumeSession(session.id).subscribe({
      next: (updated) => this.onQuickActionDone(updated, 'Sesión reanudada.'),
      error: (err: unknown) => this.onQuickActionError(err, 'No se pudo reanudar la sesión.'),
    });
  }

  openCreate(): void {
    this.formError.set(null);
    this.form.reset({ name: '', grade: '1', section: 'A', description: '' });
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.formError.set(null);
  }

  normalizeSection(): void {
    const control = this.form.controls['section'];
    const value = (control.value ?? '').toString().toUpperCase();
    if (value !== control.value) {
      control.setValue(value, { emitEvent: false });
    }
  }

  submit(): void {
    this.normalizeSection();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.formError.set(null);
    const raw = this.form.getRawValue();
    const description = (raw.description ?? '').trim();
    const request: WhiteboardSessionCreateRequest = {
      name: raw.name.trim(),
      grade: raw.grade,
      section: (raw.section ?? '').toString().toUpperCase(),
      ...(description !== '' ? { description } : {}),
    };

    this.whiteboardService.createSession(request).subscribe({
      next: (session) => {
        this.saving.set(false);
        this.formOpen.set(false);
        // Preferencia: entrar directo al editor de la sesión recién creada.
        void this.router.navigate(['/teacher/whiteboards', session.id]);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.formError.set(this.extractError(err, 'No se pudo crear la sesión.'));
      },
    });
  }

  handleLogout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
  }

  isInvalid(controlName: string): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.touched || control.dirty);
  }

  statusLabel(status: WhiteboardSessionStatus): string {
    switch (status) {
      case 'ACTIVE':
        return 'Activa';
      case 'PAUSED':
        return 'Pausada';
      case 'CLOSED':
        return 'Finalizada';
    }
  }

  statusBadgeClass(status: WhiteboardSessionStatus): string {
    switch (status) {
      case 'ACTIVE':
        return 'badge-success';
      case 'PAUSED':
        return 'badge-warning';
      case 'CLOSED':
        return 'badge-neutral';
    }
  }

  formatDate(iso: string | null): string {
    if (iso === null) {
      return '—';
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    return date.toLocaleString('es', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private onQuickActionDone(updated: WhiteboardSessionResponse, message: string): void {
    this.actionBusyId.set(null);
    this.sessions.update((list) => list.map((s) => (s.id === updated.id ? updated : s)));
    this.flashSuccess(message);
  }

  private onQuickActionError(err: unknown, fallback: string): void {
    this.actionBusyId.set(null);
    this.error.set(this.extractError(err, fallback));
  }

  private flashSuccess(message: string): void {
    this.successMessage.set(message);
    setTimeout(() => this.successMessage.set(null), 4000);
  }

  private extractError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const apiError = err.error as ApiError | null;
      if (apiError?.message) {
        return apiError.message;
      }
      if (err.status === 0) {
        return 'No se pudo conectar con el servidor.';
      }
    }
    return fallback;
  }
}

function buildInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) {
    return '??';
  }
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
