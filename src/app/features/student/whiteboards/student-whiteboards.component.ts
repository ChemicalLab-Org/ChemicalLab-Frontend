import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { StudentWhiteboardService } from '../../../core/services/student-whiteboard.service';
import {
  SidebarComponent,
  SidebarNavItem,
} from '../../../shared/components/sidebar/sidebar.component';
import { STUDENT_NAV_ITEMS } from '../../../shared/components/sidebar/student-nav';
import {
  ApiError,
  WhiteboardHistoryItemResponse,
  WhiteboardSessionStatus,
  WhiteboardStudentSessionResponse,
} from '../../../shared/models';

type WhiteboardTab = 'live' | 'history';

/**
 * Pantalla «Pizarra interactiva» del estudiante. Dos pestañas:
 *
 * <ul>
 *   <li><strong>Sesiones en vivo:</strong> sesiones ACTIVE/PAUSED de su grado/sección; el alumno
 *       se une o continúa en una pizarra en vivo.</li>
 *   <li><strong>Historial:</strong> sesiones CLOSED de su grado/sección, con su captura final.</li>
 * </ul>
 *
 * <p>El backend solo devuelve sesiones del grado/sección del estudiante, de modo que aquí no se
 * filtra por grado/sección en el cliente. El visor en vivo y la captura final viven en componentes
 * propios (carga diferida por la dependencia WebSocket).</p>
 */
@Component({
  selector: 'app-student-whiteboards',
  standalone: true,
  imports: [SidebarComponent],
  styleUrls: ['./student-whiteboards.component.scss'],
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
              Únete a las pizarras en vivo de tu clase y revisa las sesiones finalizadas.
            </p>
          </div>
          <button type="button" class="btn btn-secondary" (click)="reloadCurrent()">
            <span class="material-icons">refresh</span>
            Actualizar
          </button>
        </header>

        <nav class="tabs" role="tablist">
          <button
            type="button"
            class="tabs__tab"
            role="tab"
            [class.tabs__tab--active]="tab() === 'live'"
            [attr.aria-selected]="tab() === 'live'"
            (click)="selectTab('live')"
          >
            <span class="material-icons">sensors</span>
            Sesiones en vivo
          </button>
          <button
            type="button"
            class="tabs__tab"
            role="tab"
            [class.tabs__tab--active]="tab() === 'history'"
            [attr.aria-selected]="tab() === 'history'"
            (click)="selectTab('history')"
          >
            <span class="material-icons">history</span>
            Historial
          </button>
        </nav>

        @if (tab() === 'live') {
          <!-- ── Sesiones en vivo ─────────────────────────────────────────────── -->
          @if (liveLoading()) {
            <div class="loading-state">
              <div class="loading-state__spinner"></div>
              <div class="loading-state__label">Cargando sesiones en vivo…</div>
            </div>
          } @else if (liveError()) {
            <div class="error-state">
              <div class="error-state__icon"><span class="material-icons">error_outline</span></div>
              <h2 class="error-state__title">No se pudieron cargar las sesiones</h2>
              <p class="error-state__desc">{{ liveError() }}</p>
              <button type="button" class="btn btn-secondary" (click)="loadLive()">Reintentar</button>
            </div>
          } @else if (liveSessions().length === 0) {
            <div class="empty-state">
              <div class="empty-state__icon"><span class="material-icons">draw</span></div>
              <h2 class="empty-state__title">No hay sesiones de pizarra activas por ahora.</h2>
              <p class="empty-state__desc">
                Cuando tu docente abra una pizarra para tu grado y sección, aparecerá aquí.
              </p>
            </div>
          } @else {
            <section class="section-grid">
              @for (s of liveSessions(); track s.id) {
                <article
                  class="card session-card"
                  [class.session-card--active]="s.status === 'ACTIVE'"
                  [class.session-card--paused]="s.status === 'PAUSED'"
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
                      <span class="material-icons">person</span>{{ s.teacherName }}
                    </span>
                    <span class="meta-chip">
                      <span class="material-icons">school</span>{{ s.grade }}° · {{ s.section }}
                    </span>
                  </div>

                  <div class="session-card__pills">
                    @if (s.status === 'ACTIVE') {
                      <span class="pill pill--live"><span class="status-dot"></span>En vivo</span>
                    }
                    @if (s.canInteract) {
                      <span class="pill pill--interact">
                        <span class="material-icons">edit</span>Puedes interactuar
                      </span>
                    } @else {
                      <span class="pill pill--read">
                        <span class="material-icons">visibility</span>Solo lectura
                      </span>
                    }
                  </div>

                  <dl class="session-card__dates">
                    <div>
                      <dt>Inicio</dt>
                      <dd>{{ formatDate(s.startedAt ?? s.createdAt) }}</dd>
                    </div>
                  </dl>

                  <div class="session-card__actions">
                    <button type="button" class="btn btn-primary btn-sm" title="Entrar a la pizarra" (click)="openLive(s)">
                      <span class="material-icons">login</span>
                      {{ s.joined ? 'Continuar' : 'Unirse' }}
                    </button>
                  </div>
                </article>
              }
            </section>
          }
        } @else {
          <!-- ── Historial ────────────────────────────────────────────────────── -->
          @if (historyLoading()) {
            <div class="loading-state">
              <div class="loading-state__spinner"></div>
              <div class="loading-state__label">Cargando historial…</div>
            </div>
          } @else if (historyError()) {
            <div class="error-state">
              <div class="error-state__icon"><span class="material-icons">error_outline</span></div>
              <h2 class="error-state__title">No se pudo cargar el historial</h2>
              <p class="error-state__desc">{{ historyError() }}</p>
              <button type="button" class="btn btn-secondary" (click)="loadHistory()">Reintentar</button>
            </div>
          } @else if (historyItems().length === 0) {
            <div class="empty-state">
              <div class="empty-state__icon"><span class="material-icons">inventory_2</span></div>
              <h2 class="empty-state__title">No tienes sesiones cerradas registradas.</h2>
              <p class="empty-state__desc">
                Las pizarras que tu docente finalice aparecerán aquí con su captura final.
              </p>
            </div>
          } @else {
            <section class="section-grid">
              @for (h of historyItems(); track h.id) {
                <article class="card session-card session-card--closed">
                  <div class="session-card__top">
                    <h3 class="session-card__name">{{ h.name }}</h3>
                    <span class="badge badge-neutral">
                      <span class="status-dot"></span>Finalizada
                    </span>
                  </div>

                  <div class="session-card__meta">
                    <span class="meta-chip">
                      <span class="material-icons">person</span>{{ h.teacherName }}
                    </span>
                    <span class="meta-chip">
                      <span class="material-icons">school</span>{{ h.grade }}° · {{ h.section }}
                    </span>
                  </div>

                  <div class="session-card__pills">
                    @if (h.snapshotAvailable) {
                      <span class="pill pill--snapshot">
                        <span class="material-icons">image</span>Captura disponible
                      </span>
                    } @else {
                      <span class="pill pill--read">
                        <span class="material-icons">image_not_supported</span>Sin captura
                      </span>
                    }
                  </div>

                  <dl class="session-card__dates">
                    <div>
                      <dt>Finalizada</dt>
                      <dd>{{ formatDate(h.closedAt) }}</dd>
                    </div>
                  </dl>

                  <div class="session-card__actions">
                    <button type="button" class="btn btn-secondary btn-sm" title="Ver registro y captura final" (click)="openHistory(h)">
                      <span class="material-icons">history</span>
                      Ver registro
                    </button>
                  </div>
                </article>
              }
            </section>
          }
        }
      </main>
    </div>
  `,
})
export class StudentWhiteboardsComponent {
  private readonly authService = inject(AuthService);
  private readonly whiteboardService = inject(StudentWhiteboardService);
  private readonly router = inject(Router);

  readonly navItems: readonly SidebarNavItem[] = STUDENT_NAV_ITEMS;
  readonly userRole = 'Estudiante';

  readonly tab = signal<WhiteboardTab>('live');

  readonly liveSessions = signal<WhiteboardStudentSessionResponse[]>([]);
  readonly liveLoading = signal<boolean>(false);
  readonly liveError = signal<string | null>(null);

  readonly historyItems = signal<WhiteboardHistoryItemResponse[]>([]);
  readonly historyLoading = signal<boolean>(false);
  readonly historyError = signal<string | null>(null);
  private historyLoaded = false;

  private readonly currentUser = this.authService.currentUser;
  readonly userName = computed<string>(() => this.currentUser()?.username ?? 'Estudiante');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  constructor() {
    this.loadLive();
  }

  selectTab(tab: WhiteboardTab): void {
    this.tab.set(tab);
    if (tab === 'history' && !this.historyLoaded) {
      this.loadHistory();
    }
  }

  /** Recarga la pestaña activa (botón Actualizar). */
  reloadCurrent(): void {
    if (this.tab() === 'live') {
      this.loadLive();
    } else {
      this.loadHistory();
    }
  }

  loadLive(): void {
    this.liveLoading.set(true);
    this.liveError.set(null);
    this.whiteboardService.listActiveSessions().subscribe({
      next: (sessions) => {
        this.liveSessions.set(sessions);
        this.liveLoading.set(false);
      },
      error: (err: unknown) => {
        this.liveError.set(this.extractError(err, 'Ocurrió un error al cargar las sesiones.'));
        this.liveLoading.set(false);
      },
    });
  }

  loadHistory(): void {
    this.historyLoading.set(true);
    this.historyError.set(null);
    this.whiteboardService.listHistory().subscribe({
      next: (items) => {
        this.historyItems.set(items);
        this.historyLoading.set(false);
        this.historyLoaded = true;
      },
      error: (err: unknown) => {
        this.historyError.set(this.extractError(err, 'Ocurrió un error al cargar el historial.'));
        this.historyLoading.set(false);
      },
    });
  }

  openLive(session: WhiteboardStudentSessionResponse): void {
    void this.router.navigate(['/student/whiteboards', session.id]);
  }

  openHistory(item: WhiteboardHistoryItemResponse): void {
    void this.router.navigate(['/student/whiteboards', item.id, 'registro']);
  }

  handleLogout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
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
