import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { StudentWhiteboardService } from '../../../core/services/student-whiteboard.service';
import {
  SidebarComponent,
  SidebarNavItem,
} from '../../../shared/components/sidebar/sidebar.component';
import { STUDENT_NAV_ITEMS } from '../../../shared/components/sidebar/student-nav';
import { ApiError, WhiteboardStudentSessionResponse } from '../../../shared/models';

/**
 * Visor del registro de una sesión cerrada para el estudiante: muestra la metadata y la captura
 * final en un contenedor amplio. Solo lectura: no permite editar, unirse, dibujar ni reabrir.
 *
 * <p>La captura se consume como Blob y se muestra mediante un object URL, que se revoca al destruir
 * el componente para evitar fugas de memoria. Si la sesión aún no está cerrada, se ofrece abrir el
 * visor en vivo en lugar de mostrar una captura inexistente.</p>
 */
@Component({
  selector: 'app-student-whiteboard-record',
  standalone: true,
  imports: [SidebarComponent],
  styleUrls: ['./student-whiteboard-record.component.scss'],
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
        <button type="button" class="back-link" (click)="goToList()">
          <span class="material-icons">arrow_back</span> Volver al historial
        </button>

        @if (loading()) {
          <div class="loading-state">
            <div class="loading-state__spinner"></div>
            <div class="loading-state__label">Cargando registro…</div>
          </div>
        } @else if (loadError()) {
          <div class="error-state">
            <div class="error-state__icon"><span class="material-icons">error_outline</span></div>
            <h2 class="error-state__title">No se pudo cargar el registro</h2>
            <p class="error-state__desc">{{ loadError() }}</p>
            <div class="error-state__actions">
              <button type="button" class="btn btn-secondary" (click)="reload()">Reintentar</button>
              <button type="button" class="btn btn-ghost" (click)="goToList()">Volver</button>
            </div>
          </div>
        } @else if (session(); as s) {
          <header class="record-header">
            <h1 class="record-header__name">{{ s.name }}</h1>
            <span class="badge badge-neutral"><span class="status-dot"></span>Finalizada</span>
          </header>

          @if (s.status !== 'CLOSED') {
            <!-- Aún en curso: el registro/captura no existe hasta que el docente la finalice. -->
            <div class="info-card card">
              <div class="info-card__icon"><span class="material-icons">sensors</span></div>
              <h2 class="info-card__title">Esta sesión todavía está en curso.</h2>
              <p class="info-card__desc">
                La captura final estará disponible cuando el docente finalice la sesión. Mientras
                tanto puedes unirte a la pizarra en vivo.
              </p>
              <button type="button" class="btn btn-primary" (click)="goToLive()">
                <span class="material-icons">login</span> Unirse a la sesión en vivo
              </button>
            </div>
          } @else {
            <section class="record-grid">
              <div class="card record-meta">
                <h2 class="card-title">Datos de la sesión</h2>
                <dl class="record-meta__list">
                  <div><dt>Docente</dt><dd>{{ s.teacherName }}</dd></div>
                  <div><dt>Grado / sección</dt><dd>{{ s.grade }}° · {{ s.section }}</dd></div>
                  <div><dt>Estado</dt><dd>Finalizada</dd></div>
                  <div><dt>Fecha de cierre</dt><dd>{{ formatDate(s.closedAt) }}</dd></div>
                  @if (s.description) {
                    <div class="record-meta__full"><dt>Descripción</dt><dd>{{ s.description }}</dd></div>
                  }
                </dl>
              </div>

              <div class="card record-snapshot">
                <div class="record-snapshot__head">
                  <h2 class="card-title">Captura final</h2>
                  @if (snapshotUrl(); as url) {
                    <button type="button" class="btn btn-secondary btn-sm" title="Descargar captura final" (click)="download(url, s.name)">
                      <span class="material-icons">download</span> Descargar
                    </button>
                  }
                </div>

                @if (snapshotUrl(); as url) {
                  <div class="record-snapshot__frame">
                    <img class="record-snapshot__img" [src]="url" alt="Captura final de la pizarra" />
                  </div>
                } @else if (snapshotLoading()) {
                  <div class="loading-state">
                    <div class="loading-state__spinner"></div>
                    <div class="loading-state__label">Cargando captura…</div>
                  </div>
                } @else {
                  <div class="record-snapshot__empty">
                    <span class="material-icons">image_not_supported</span>
                    <p>{{ snapshotError() ?? 'No hay una captura final disponible para esta sesión.' }}</p>
                  </div>
                }
              </div>
            </section>
          }
        }
      </main>
    </div>
  `,
})
export class StudentWhiteboardRecordComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly whiteboardService = inject(StudentWhiteboardService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly navItems: readonly SidebarNavItem[] = STUDENT_NAV_ITEMS;
  readonly userRole = 'Estudiante';

  private sessionId = 0;
  private snapshotObjectUrl: string | null = null;

  readonly session = signal<WhiteboardStudentSessionResponse | null>(null);
  readonly loading = signal<boolean>(true);
  readonly loadError = signal<string | null>(null);
  readonly snapshotUrl = signal<string | null>(null);
  readonly snapshotLoading = signal<boolean>(false);
  readonly snapshotError = signal<string | null>(null);

  private readonly currentUser = this.authService.currentUser;
  readonly userName = computed<string>(() => this.currentUser()?.username ?? 'Estudiante');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam !== null ? Number(idParam) : NaN;
    if (Number.isNaN(id)) {
      this.loadError.set('Sesión no válida.');
      this.loading.set(false);
      return;
    }
    this.sessionId = id;
    this.reload();
  }

  ngOnDestroy(): void {
    this.revokeSnapshotUrl();
  }

  reload(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.whiteboardService.getSessionDetail(this.sessionId).subscribe({
      next: (detail) => {
        this.session.set(detail);
        this.loading.set(false);
        if (detail.status === 'CLOSED' && detail.snapshotAvailable) {
          this.loadSnapshot();
        }
      },
      error: (err: unknown) => {
        this.loadError.set(this.extractError(err, 'No se pudo cargar el registro de la sesión.'));
        this.loading.set(false);
      },
    });
  }

  private loadSnapshot(): void {
    this.snapshotLoading.set(true);
    this.snapshotError.set(null);
    this.whiteboardService.getSnapshot(this.sessionId).subscribe({
      next: (blob) => {
        this.revokeSnapshotUrl();
        this.snapshotObjectUrl = URL.createObjectURL(blob);
        this.snapshotUrl.set(this.snapshotObjectUrl);
        this.snapshotLoading.set(false);
      },
      error: (err: unknown) => {
        this.snapshotLoading.set(false);
        this.snapshotError.set(this.extractError(err, 'No se pudo cargar la captura final.'));
      },
    });
  }

  /** Descarga la imagen de la captura usando el object URL ya cargado (sin nueva petición). */
  download(url: string, sessionName: string): void {
    const link = document.createElement('a');
    link.href = url;
    link.download = `pizarra-${this.slug(sessionName)}.png`;
    link.click();
  }

  private slug(name: string): string {
    return (
      name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || String(this.sessionId)
    );
  }

  goToList(): void {
    void this.router.navigate(['/student/whiteboards']);
  }

  goToLive(): void {
    void this.router.navigate(['/student/whiteboards', this.sessionId]);
  }

  handleLogout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
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

  private revokeSnapshotUrl(): void {
    if (this.snapshotObjectUrl !== null) {
      URL.revokeObjectURL(this.snapshotObjectUrl);
      this.snapshotObjectUrl = null;
    }
  }

  private extractError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const apiError = err.error as ApiError | null;
      if (apiError?.message) {
        return apiError.message;
      }
      if (err.status === 403) {
        return 'No tienes acceso a esta sesión de pizarra.';
      }
      if (err.status === 404) {
        return 'La sesión no existe o no está disponible para tu grado y sección.';
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
