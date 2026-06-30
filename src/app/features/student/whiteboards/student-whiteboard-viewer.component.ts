import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { StudentWhiteboardService } from '../../../core/services/student-whiteboard.service';
import { StudentWhiteboardRealtimeService } from '../../../core/services/student-whiteboard-realtime.service';
import {
  SidebarComponent,
  SidebarNavItem,
} from '../../../shared/components/sidebar/sidebar.component';
import { STUDENT_NAV_ITEMS } from '../../../shared/components/sidebar/student-nav';
import {
  ApiError,
  WhiteboardBoardStateSnapshot,
  WhiteboardControlEventResponse,
  WhiteboardDrawEventRequest,
  WhiteboardDrawEventResponse,
  WhiteboardPoint,
  WhiteboardSessionStatus,
  WhiteboardStudentSessionResponse,
  WhiteboardTextRun,
} from '../../../shared/models';

/**
 * Mismo espacio de coordenadas (workspace) que el editor docente, para que los trazos que llegan
 * por WebSocket se rendericen en la misma posición que dibujó el docente. El visor muestra solo una
 * parte y el alumno se desplaza con la herramienta «Mover».
 */
const WORKSPACE_WIDTH = 3200;
const WORKSPACE_HEIGHT = 2000;
const BOARD_BACKGROUND = '#ffffff';

const PEN_CURSOR =
  'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyOCIgaGVpZ2h0PSIyOCIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBkPSJNMyAxNy4yNVYyMWgzLjc1TDE3LjgxIDkuOTRsLTMuNzUtMy43NUwzIDE3LjI1eiIgZmlsbD0iIzFhMWExNiIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjEuMiIvPjxwYXRoIGQ9Ik0yMC43MSA3LjA0YTEgMSAwIDAgMCAwLTEuNDFsLTIuMzQtMi4zNGExIDEgMCAwIDAtMS40MSAwbC0xLjgzIDEuODMgMy43NSAzLjc1IDEuODMtMS44M3oiIGZpbGw9IiMxZDllNzUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLXdpZHRoPSIxLjIiLz48L3N2Zz4=") 3 25, crosshair';

/** Herramientas del estudiante: plumón, borrador y desplazamiento. «Borrar todo» es solo docente. */
type StudentTool = 'PEN' | 'ERASER' | 'MOVE';

/** Objeto de texto que el alumno solo visualiza (lo crea/mueve el docente). */
interface DisplayTextItem {
  readonly id: string;
  readonly wx: number;
  readonly wy: number;
  readonly color: string;
  readonly size: number;
  readonly runs: readonly WhiteboardTextRun[];
}

/**
 * Visor en vivo de la pizarra para el estudiante.
 *
 * <p>Al entrar: llama a {@code join}, carga el detalle, conecta el WebSocket y se suscribe al canal
 * de la sesión. Renderiza en tiempo real lo que dibuja el docente (y otros alumnos permitidos).</p>
 *
 * <p><strong>Interacción según permiso:</strong> el alumno solo ve las herramientas de dibujo si la
 * sesión está ACTIVE y tiene permiso efectivo ({@code canInteract} del backend). Reacciona a los
 * eventos de control: pausa, reanudación, cierre y cambios de interacción (global o individual);
 * ante un cambio de permiso vuelve a pedir el detalle para recalcular {@code canInteract} sin
 * depender de recargar la pantalla. El backend valida cada trazo de todos modos.</p>
 *
 * <p><strong>Limitación de estado inicial (pendiente 15.4):</strong> el backend no persiste los
 * trazos ni ofrece un snapshot de la sesión activa, así que un alumno que entra tarde ve la pizarra
 * en blanco y solo los trazos nuevos a partir de su conexión. No se simula un estado falso.</p>
 */
@Component({
  selector: 'app-student-whiteboard-viewer',
  standalone: true,
  imports: [SidebarComponent],
  styleUrls: ['./student-whiteboard-viewer.component.scss'],
  template: `
    <div class="layout" [class.layout--fullscreen]="fullscreen()">
      @if (!fullscreen()) {
        <app-sidebar
          [navItems]="navItems"
          [userName]="userName()"
          [userRole]="userRole"
          [userInitials]="userInitials()"
          (onLogout)="handleLogout()"
        />
      }

      <main class="main">
        @if (fullscreen()) {
          <!-- Salida de pantalla completa siempre visible (además de Escape). -->
          <button
            type="button"
            class="fs-exit"
            title="Salir de pantalla completa (Esc)"
            (click)="toggleFullscreen()"
          >
            <span class="material-icons">fullscreen_exit</span> Salir de pantalla completa
          </button>
        }

        @if (!fullscreen()) {
          <button type="button" class="back-link" (click)="goToList()">
            <span class="material-icons">arrow_back</span> Volver a la pizarra
          </button>
        }

        @if (loading()) {
          <div class="loading-state">
            <div class="loading-state__spinner"></div>
            <div class="loading-state__label">Entrando a la sesión…</div>
          </div>
        } @else if (loadError()) {
          <div class="error-state">
            <div class="error-state__icon"><span class="material-icons">error_outline</span></div>
            <h2 class="error-state__title">No se pudo abrir la sesión</h2>
            <p class="error-state__desc">{{ loadError() }}</p>
            <div class="error-state__actions">
              <button type="button" class="btn btn-secondary" (click)="reload()">Reintentar</button>
              <button type="button" class="btn btn-ghost" (click)="goToList()">Volver</button>
            </div>
          </div>
        } @else if (session(); as s) {
          @if (!fullscreen()) {
            <header class="viewer-header">
              <div class="viewer-header__info">
                <h1 class="viewer-header__name">{{ s.name }}</h1>
                <div class="viewer-header__tags">
                  <span class="badge" [class]="statusBadgeClass(s.status)">
                    <span class="status-dot"></span>{{ statusLabel(s.status) }}
                  </span>
                  <span class="meta-chip">
                    <span class="material-icons">person</span>{{ s.teacherName }}
                  </span>
                  <span class="meta-chip">
                    <span class="material-icons">school</span>{{ s.grade }}° · {{ s.section }}
                  </span>
                  @if (!isClosed()) {
                    <span class="conn" [class]="connClass()">
                      <span class="status-dot"></span>{{ connLabel() }}
                    </span>
                  }
                </div>
              </div>
            </header>
          }

          @if (banner()) {
            <div class="alert page-alert" [class]="bannerClass()">
              <span class="material-icons">{{ bannerIcon() }}</span>
              {{ banner() }}
            </div>
          }

          @if (isClosed()) {
            <!-- Sesión finalizada por el docente mientras se visualizaba -->
            <div class="finished-card card">
              <div class="finished-card__icon"><span class="material-icons">stop_circle</span></div>
              <h2 class="finished-card__title">La sesión fue finalizada por el docente.</h2>
              <p class="finished-card__desc">
                Ya no es posible dibujar ni unirse. Si el docente guardó una captura final, podrás
                consultarla en el historial.
              </p>
              <div class="finished-card__actions">
                @if (s.snapshotAvailable) {
                  <button type="button" class="btn btn-primary" (click)="goToRecord()">
                    <span class="material-icons">image</span> Ver captura final
                  </button>
                }
                <button type="button" class="btn btn-secondary" (click)="goToList()">
                  <span class="material-icons">history</span> Ir al historial
                </button>
              </div>
            </div>
          } @else {
            <!-- Indicador de permiso -->
            <div class="perm-banner" [class]="permClass()">
              <span class="material-icons">{{ permIcon() }}</span>
              <span>{{ permMessage() }}</span>
            </div>

            <div class="board-area">
              <!-- Barra de herramientas del estudiante (solo cuando puede interactuar) -->
              <div class="toolbar">
                <div class="toolbar__group">
                  @if (canDraw()) {
                    <button
                      type="button"
                      class="tool-btn"
                      [class.tool-btn--active]="tool() === 'PEN'"
                      title="Plumón"
                      (click)="selectTool('PEN')"
                    >
                      <span class="material-icons">edit</span>
                    </button>
                    <button
                      type="button"
                      class="tool-btn"
                      [class.tool-btn--active]="tool() === 'ERASER'"
                      title="Borrador"
                      (click)="selectTool('ERASER')"
                    >
                      <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path
                          fill="currentColor"
                          d="M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53c-1.56 1.56-4.09 1.56-5.66 0l-3.53-3.53c-.78-.79-.78-2.05 0-2.84L13.41 3.56c.79-.78 2.05-.78 2.83 0M4.22 15.58l3.54 3.53c.78.79 2.04.79 2.83 0l3.53-3.53-4.95-4.95-4.95 4.95Z"
                        />
                      </svg>
                    </button>
                  }
                  <button
                    type="button"
                    class="tool-btn"
                    [class.tool-btn--active]="tool() === 'MOVE'"
                    title="Mover pizarra"
                    (click)="selectTool('MOVE')"
                  >
                    <span class="material-icons">pan_tool</span>
                  </button>
                </div>

                <div class="toolbar__group toolbar__group--right">
                  <button
                    type="button"
                    class="tool-btn"
                    title="Pantalla completa"
                    (click)="toggleFullscreen()"
                  >
                    <span class="material-icons">fullscreen</span>
                  </button>
                </div>

                @if (canDraw() && tool() !== 'MOVE') {
                  <div class="toolbar__group">
                    <label class="tool-field" title="Color">
                      <span class="material-icons">palette</span>
                      <input type="color" [value]="color()" (input)="onColor($event)" />
                    </label>

                    @if (tool() === 'PEN') {
                      <label class="tool-field tool-field--range" title="Grosor del trazo">
                        <span class="material-icons">line_weight</span>
                        <input
                          type="range"
                          min="1"
                          max="24"
                          [value]="strokeWidth()"
                          (input)="onStrokeWidth($event)"
                        />
                        <span class="tool-field__value">{{ strokeWidth() }}</span>
                      </label>
                    } @else if (tool() === 'ERASER') {
                      <label class="tool-field tool-field--range" title="Tamaño del borrador">
                        <span class="material-icons">format_size</span>
                        <input
                          type="range"
                          min="8"
                          max="80"
                          [value]="eraserSize()"
                          (input)="onEraserSize($event)"
                        />
                        <span class="tool-field__value">{{ eraserSize() }}</span>
                      </label>
                    }
                  </div>
                }
              </div>

              <div #canvasWrap class="board-viewport">
                <canvas
                  #boardCanvas
                  class="board-canvas"
                  [style.transform]="boardTransform()"
                  [style.cursor]="canvasCursor()"
                  (pointerdown)="onPointerDown($event)"
                  (pointermove)="onPointerMove($event)"
                  (pointerup)="onPointerUp($event)"
                  (pointerleave)="onPointerLeave($event)"
                  (pointercancel)="onPointerUp($event)"
                ></canvas>

                @if (showEraserCursor()) {
                  <div
                    class="eraser-cursor"
                    [style.left.px]="cursorPos()!.x"
                    [style.top.px]="cursorPos()!.y"
                    [style.width.px]="eraserSize()"
                    [style.height.px]="eraserSize()"
                  ></div>
                }

                <!-- Textos del docente (solo lectura para el alumno): se posicionan en coordenadas
                     del workspace + el pan, de modo que siguen el desplazamiento de la pizarra. -->
                @for (item of textItems(); track item.id) {
                  <div
                    class="text-item"
                    [style.left.px]="panX() + item.wx"
                    [style.top.px]="panY() + item.wy"
                    [style.color]="item.color"
                    [style.font-size.px]="item.size"
                  >@for (run of item.runs; track $index) {<span
                      [style.font-weight]="run.bold ? 700 : 400"
                      [style.font-style]="run.italic ? 'italic' : 'normal'"
                      [style.text-decoration]="run.underline ? 'underline' : 'none'"
                    >{{ run.text }}</span>}</div>
                }

                @if (s.status === 'PAUSED') {
                  <div class="canvas-overlay">
                    <span class="material-icons">pause_circle</span>
                    <p>La sesión está pausada por el docente.</p>
                  </div>
                } @else if (connectionState() !== 'connected') {
                  <div class="canvas-overlay canvas-overlay--soft">
                    <span class="material-icons">sync</span>
                    <p>{{ connLabel() }} con la pizarra en vivo…</p>
                  </div>
                }
              </div>

              <p class="board-note">
                <span class="material-icons">info</span>
                Al entrar verás el estado actual de la pizarra y, a partir de ahí, lo que el docente
                vaya dibujando en vivo.
              </p>
            </div>
          }
        }
      </main>
    </div>
  `,
})
export class StudentWhiteboardViewerComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly whiteboardService = inject(StudentWhiteboardService);
  private readonly realtime = inject(StudentWhiteboardRealtimeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly navItems: readonly SidebarNavItem[] = STUDENT_NAV_ITEMS;
  readonly userRole = 'Estudiante';

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('boardCanvas');
  private readonly wrapRef = viewChild<ElementRef<HTMLDivElement>>('canvasWrap');

  private sessionId = 0;
  private ctx: CanvasRenderingContext2D | null = null;
  private drawing = false;
  private currentStroke: WhiteboardPoint[] = [];
  /** clientEventId de eventos propios para no re-renderizar el eco que vuelve por el canal. */
  private readonly ownEventIds = new Set<string>();

  // Desplazamiento (pan) del lienzo dentro del visor.
  private panning = false;
  private panStart = { x: 0, y: 0, px: 0, py: 0 };
  readonly panX = signal<number>(0);
  readonly panY = signal<number>(0);

  readonly cursorPos = signal<{ x: number; y: number } | null>(null);

  /** Textos del docente que el alumno solo visualiza (vía estado inicial y eventos en vivo). */
  readonly textItems = signal<DisplayTextItem[]>([]);

  readonly fullscreen = signal<boolean>(false);

  readonly session = signal<WhiteboardStudentSessionResponse | null>(null);
  readonly loading = signal<boolean>(true);
  readonly loadError = signal<string | null>(null);
  readonly banner = signal<string | null>(null);
  private readonly bannerTone = signal<'info' | 'success' | 'warning' | 'danger'>('info');

  // Herramientas
  readonly tool = signal<StudentTool>('MOVE');
  readonly color = signal<string>('#1d9e75');
  readonly strokeWidth = signal<number>(4);
  readonly eraserSize = signal<number>(28);

  readonly connectionState = this.realtime.connectionState;

  private readonly currentUser = this.authService.currentUser;
  readonly userName = computed<string>(() => this.currentUser()?.username ?? 'Estudiante');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  readonly isClosed = computed<boolean>(() => this.session()?.status === 'CLOSED');

  /** El estudiante puede dibujar si la sesión está ACTIVE, conectado y con permiso efectivo. */
  readonly canDraw = computed<boolean>(
    () =>
      this.session()?.status === 'ACTIVE' &&
      this.session()?.canInteract === true &&
      this.connectionState() === 'connected'
  );

  readonly boardTransform = computed<string>(
    () => `translate(${this.panX()}px, ${this.panY()}px)`
  );

  readonly showEraserCursor = computed<boolean>(
    () => this.tool() === 'ERASER' && this.canDraw() && this.cursorPos() !== null && !this.panning
  );

  readonly canvasCursor = computed<string>(() => {
    if (this.tool() === 'MOVE') {
      return this.panning ? 'grabbing' : 'grab';
    }
    if (!this.canDraw()) {
      return 'grab';
    }
    if (this.tool() === 'ERASER') {
      return 'none';
    }
    return PEN_CURSOR;
  });

  constructor() {
    // Inicializa el contexto del lienzo en cuanto el elemento existe en el DOM.
    effect(() => {
      if (this.canvasRef()) {
        this.ensureCanvas();
      }
    });
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam !== null ? Number(idParam) : NaN;
    if (Number.isNaN(id)) {
      this.loadError.set('Sesión no válida.');
      this.loading.set(false);
      return;
    }
    this.sessionId = id;

    this.realtime.drawEvents
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => this.onRemoteDraw(event));
    this.realtime.controlEvents
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => this.onControlEvent(event));
    this.realtime.errors
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((message) => this.showBanner(message, 'warning'));

    this.reload();
  }

  ngOnDestroy(): void {
    this.realtime.disconnect();
  }

  /** Entra a la sesión: une, carga el detalle y conecta el WebSocket si está en vivo. */
  reload(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.whiteboardService.joinSession(this.sessionId).subscribe({
      next: (detail) => this.onSessionLoaded(detail),
      error: (err: unknown) => {
        // El join solo falla legítimamente si la sesión está cerrada (no se puede unir): en ese
        // caso se carga el detalle para mostrar el estado real. Cualquier otro fallo del join SÍ
        // se reporta (un join silenciado dejaría al alumno sin participante: ni aparecería en el
        // panel del docente ni podría dibujar aunque tuviera permiso).
        this.whiteboardService.getSessionDetail(this.sessionId).subscribe({
          next: (detail) => {
            if (detail.status === 'CLOSED') {
              this.onSessionLoaded(detail);
            } else {
              this.loadError.set(this.extractError(err, 'No se pudo unir a la sesión.'));
              this.loading.set(false);
            }
          },
          error: () => {
            this.loadError.set(this.extractError(err, 'No se pudo abrir la sesión.'));
            this.loading.set(false);
          },
        });
      },
    });
  }

  private onSessionLoaded(detail: WhiteboardStudentSessionResponse): void {
    this.session.set(detail);
    this.loading.set(false);
    if (detail.status === 'CLOSED') {
      this.realtime.disconnect();
      return;
    }
    this.realtime.connect(this.sessionId);
    requestAnimationFrame(() => {
      this.ensureCanvas();
      this.centerPan();
      // Reconstruye el estado actual de la pizarra (trazos + textos) para no quedar en blanco al
      // unirse tarde o recargar; a partir de aquí siguen los eventos en vivo.
      this.loadBoardState();
    });
  }

  /** Carga y reproduce el estado actual del lienzo (trazos + textos) de la sesión en vivo. */
  private loadBoardState(): void {
    this.whiteboardService.getBoardState(this.sessionId).subscribe({
      next: (state) => {
        if (state.stateJson === null || state.stateJson.trim() === '') {
          return;
        }
        let snapshot: WhiteboardBoardStateSnapshot;
        try {
          snapshot = JSON.parse(state.stateJson) as WhiteboardBoardStateSnapshot;
        } catch {
          return;
        }
        this.replayBoardState(snapshot);
      },
      error: () => {
        /* silencioso: sin estado previo el alumno ve solo los eventos nuevos */
      },
    });
  }

  /** Pinta los trazos y muestra los textos de una instantánea del lienzo. */
  private replayBoardState(snapshot: WhiteboardBoardStateSnapshot): void {
    const strokes = Array.isArray(snapshot.strokes) ? snapshot.strokes : [];
    for (const stroke of strokes) {
      const isErase = stroke.eventType === 'ERASE';
      const color = isErase ? BOARD_BACKGROUND : stroke.color ?? '#000000';
      const width = isErase ? stroke.eraserSize ?? 24 : stroke.strokeWidth ?? 4;
      this.renderStroke(stroke.points, color, width);
    }
    const texts = Array.isArray(snapshot.texts) ? snapshot.texts : [];
    if (texts.length > 0) {
      this.textItems.set(
        texts.map((t) => ({
          id: t.id,
          wx: t.wx,
          wy: t.wy,
          color: t.color,
          size: t.size,
          runs: t.runs,
        }))
      );
    }
  }

  /** Re-consulta el detalle para recalcular el permiso efectivo tras un cambio de interacción. */
  private refreshDetail(): void {
    this.whiteboardService.getSessionDetail(this.sessionId).subscribe({
      next: (detail) => {
        this.session.set(detail);
        // Si perdió el permiso o se pausó, vuelve a «Mover» para no dejar una herramienta inválida.
        if (!this.canDraw() && this.tool() !== 'MOVE') {
          this.tool.set('MOVE');
        }
      },
      error: () => {
        /* silencioso: el siguiente evento o el botón de recarga lo resolverán */
      },
    });
  }

  // ─── Herramientas ───────────────────────────────────────────────────────────

  selectTool(tool: StudentTool): void {
    if (tool !== 'MOVE' && !this.canDraw()) {
      return;
    }
    this.tool.set(tool);
    if (tool !== 'ERASER') {
      this.cursorPos.set(null);
    }
  }

  onColor(event: Event): void {
    this.color.set((event.target as HTMLInputElement).value);
  }

  onStrokeWidth(event: Event): void {
    this.strokeWidth.set(Number((event.target as HTMLInputElement).value));
  }

  onEraserSize(event: Event): void {
    this.eraserSize.set(Number((event.target as HTMLInputElement).value));
  }

  /**
   * Alterna la pantalla completa. Es un modo CSS: no recrea el lienzo ni desconecta el WebSocket,
   * por lo que no se pierde el contenido ni la conexión. Tras el cambio de tamaño del visor,
   * re-encaja el desplazamiento para no perder la pizarra.
   */
  toggleFullscreen(): void {
    this.fullscreen.set(!this.fullscreen());
    requestAnimationFrame(() => this.setPan(this.panX(), this.panY()));
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.fullscreen()) {
      this.toggleFullscreen();
    }
  }

  // ─── Puntero: dibujo y desplazamiento ────────────────────────────────────────

  onPointerDown(event: PointerEvent): void {
    if (this.tool() === 'MOVE' || !this.canDraw()) {
      this.startPan(event);
      return;
    }
    const ctx = this.ensureCanvas();
    if (ctx === null) {
      return;
    }
    event.preventDefault();
    (event.target as HTMLCanvasElement).setPointerCapture?.(event.pointerId);
    this.drawing = true;
    this.currentStroke = [this.toCanvasPoint(event)];
    this.renderStroke(this.currentStroke, this.activeColor(), this.activeWidth());
  }

  onPointerMove(event: PointerEvent): void {
    if (this.panning) {
      this.updatePan(event);
      return;
    }
    if (this.tool() === 'ERASER') {
      this.updateCursorPos(event);
    }
    if (!this.drawing || !this.canDraw()) {
      return;
    }
    event.preventDefault();
    const point = this.toCanvasPoint(event);
    const previous = this.currentStroke[this.currentStroke.length - 1];
    this.currentStroke.push(point);
    if (previous) {
      this.renderSegment(previous, point, this.activeColor(), this.activeWidth());
    }
  }

  onPointerUp(event: PointerEvent): void {
    if (this.panning) {
      this.endPan(event);
      return;
    }
    if (!this.drawing) {
      return;
    }
    this.drawing = false;
    if (this.currentStroke.length === 0) {
      return;
    }
    const points = this.currentStroke;
    this.currentStroke = [];
    this.publishStroke(points);
  }

  onPointerLeave(event: PointerEvent): void {
    this.cursorPos.set(null);
    this.onPointerUp(event);
  }

  // ─── Desplazamiento (pan) ─────────────────────────────────────────────────────

  private startPan(event: PointerEvent): void {
    event.preventDefault();
    (event.target as HTMLCanvasElement).setPointerCapture?.(event.pointerId);
    this.panning = true;
    this.panStart = { x: event.clientX, y: event.clientY, px: this.panX(), py: this.panY() };
  }

  private updatePan(event: PointerEvent): void {
    const dx = event.clientX - this.panStart.x;
    const dy = event.clientY - this.panStart.y;
    this.setPan(this.panStart.px + dx, this.panStart.py + dy);
  }

  private endPan(event: PointerEvent): void {
    this.panning = false;
    (event.target as HTMLCanvasElement).releasePointerCapture?.(event.pointerId);
  }

  private setPan(x: number, y: number): void {
    const wrap = this.wrapRef()?.nativeElement;
    const viewW = wrap?.clientWidth ?? WORKSPACE_WIDTH;
    const viewH = wrap?.clientHeight ?? WORKSPACE_HEIGHT;
    const minX = Math.min(0, viewW - WORKSPACE_WIDTH);
    const minY = Math.min(0, viewH - WORKSPACE_HEIGHT);
    this.panX.set(Math.max(minX, Math.min(0, x)));
    this.panY.set(Math.max(minY, Math.min(0, y)));
  }

  private centerPan(): void {
    const wrap = this.wrapRef()?.nativeElement;
    const viewW = wrap?.clientWidth ?? WORKSPACE_WIDTH;
    const viewH = wrap?.clientHeight ?? WORKSPACE_HEIGHT;
    this.setPan((viewW - WORKSPACE_WIDTH) / 2, (viewH - WORKSPACE_HEIGHT) / 2);
  }

  private updateCursorPos(event: PointerEvent): void {
    const wrap = this.wrapRef()?.nativeElement;
    if (!wrap) {
      return;
    }
    const rect = wrap.getBoundingClientRect();
    this.cursorPos.set({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  }

  // ─── Eventos en vivo recibidos ────────────────────────────────────────────────

  private onRemoteDraw(event: WhiteboardDrawEventResponse): void {
    if (event.clientEventId !== null && this.ownEventIds.has(event.clientEventId)) {
      // Eco de un evento propio que ya se pintó localmente.
      this.ownEventIds.delete(event.clientEventId);
      return;
    }
    if (event.eventType === 'CLEAR') {
      this.clearCanvas();
      this.textItems.set([]);
      return;
    }
    // Texto en vivo del docente: crear/actualizar o eliminar el objeto de texto correspondiente.
    if (event.eventType === 'TEXT') {
      this.upsertText(event);
      return;
    }
    if (event.eventType === 'TEXT_DELETE') {
      if (event.textId !== null) {
        const id = event.textId;
        this.textItems.update((items) => items.filter((i) => i.id !== id));
      }
      return;
    }
    const points = (event.points ?? []) as WhiteboardPoint[];
    const isErase = event.eventType === 'ERASE';
    const color = isErase ? BOARD_BACKGROUND : event.color ?? '#000000';
    const width = isErase ? event.eraserSize ?? 24 : event.strokeWidth ?? 4;
    this.renderStroke(points, color, width);
  }

  /** Inserta o actualiza un objeto de texto a partir de un evento TEXT del docente. */
  private upsertText(event: WhiteboardDrawEventResponse): void {
    const point = event.points?.[0];
    if (event.textId === null || !point || event.runs === null) {
      return;
    }
    const item: DisplayTextItem = {
      id: event.textId,
      wx: point.x,
      wy: point.y,
      color: event.color ?? '#1a1a16',
      size: event.fontSize ?? 32,
      runs: event.runs ?? [],
    };
    this.textItems.update((items) => {
      const index = items.findIndex((i) => i.id === item.id);
      if (index === -1) {
        return [...items, item];
      }
      const next = [...items];
      next[index] = item;
      return next;
    });
  }

  private onControlEvent(event: WhiteboardControlEventResponse): void {
    const current = this.session();
    if (current === null) {
      return;
    }
    switch (event.eventType) {
      case 'SESSION_PAUSED':
        this.session.set({ ...current, status: 'PAUSED', canInteract: false });
        if (this.tool() !== 'MOVE') {
          this.tool.set('MOVE');
        }
        this.showBanner('La sesión está pausada por el docente.', 'warning');
        break;
      case 'SESSION_RESUMED':
        this.session.set({ ...current, status: 'ACTIVE' });
        this.showBanner('La sesión fue reanudada.', 'success');
        this.refreshDetail();
        break;
      case 'SESSION_CLOSED':
        this.realtime.disconnect();
        this.showBanner('La sesión fue finalizada por el docente.', 'warning');
        this.refreshDetail();
        break;
      case 'INTERACTION_UPDATED':
      case 'PARTICIPANT_PERMISSION_UPDATED':
        // El permiso efectivo se recalcula en el backend; pedimos el detalle actualizado.
        this.refreshDetail();
        break;
    }
  }

  // ─── Render del lienzo ────────────────────────────────────────────────────────

  private ensureCanvas(): CanvasRenderingContext2D | null {
    if (this.ctx !== null) {
      return this.ctx;
    }
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) {
      return null;
    }
    canvas.width = WORKSPACE_WIDTH;
    canvas.height = WORKSPACE_HEIGHT;
    const context = canvas.getContext('2d');
    if (context === null) {
      return null;
    }
    context.lineJoin = 'round';
    context.lineCap = 'round';
    this.ctx = context;
    this.clearCanvas();
    return context;
  }

  private clearCanvas(): void {
    const ctx = this.ctx ?? this.ensureCanvas();
    if (ctx === null) {
      return;
    }
    ctx.fillStyle = BOARD_BACKGROUND;
    ctx.fillRect(0, 0, WORKSPACE_WIDTH, WORKSPACE_HEIGHT);
  }

  private renderSegment(from: WhiteboardPoint, to: WhiteboardPoint, color: string, width: number): void {
    const ctx = this.ensureCanvas();
    if (ctx === null) {
      return;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  private renderStroke(points: readonly WhiteboardPoint[], color: string, width: number): void {
    const ctx = this.ensureCanvas();
    if (ctx === null || points.length === 0) {
      return;
    }
    if (points.length === 1) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  }

  private publishStroke(points: WhiteboardPoint[]): void {
    const clientEventId = this.newEventId();
    const isErase = this.tool() === 'ERASER';
    const event: WhiteboardDrawEventRequest = isErase
      ? { eventType: 'ERASE', tool: 'ERASER', eraserSize: this.eraserSize(), points, clientEventId }
      : {
          eventType: 'DRAW',
          tool: 'PEN',
          color: this.color(),
          strokeWidth: this.strokeWidth(),
          points,
          clientEventId,
        };
    this.realtime.sendDraw(event);
  }

  private toCanvasPoint(event: PointerEvent): WhiteboardPoint {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WORKSPACE_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * WORKSPACE_HEIGHT;
    return {
      x: Math.round(Math.max(0, Math.min(WORKSPACE_WIDTH, x)) * 100) / 100,
      y: Math.round(Math.max(0, Math.min(WORKSPACE_HEIGHT, y)) * 100) / 100,
    };
  }

  private activeColor(): string {
    return this.tool() === 'ERASER' ? BOARD_BACKGROUND : this.color();
  }

  private activeWidth(): number {
    return this.tool() === 'ERASER' ? this.eraserSize() : this.strokeWidth();
  }

  private newEventId(): string {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.ownEventIds.add(id);
    return id;
  }

  // ─── Navegación ───────────────────────────────────────────────────────────────

  goToList(): void {
    void this.router.navigate(['/student/whiteboards']);
  }

  goToRecord(): void {
    void this.router.navigate(['/student/whiteboards', this.sessionId, 'registro']);
  }

  handleLogout(): void {
    this.realtime.disconnect();
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
  }

  // ─── UI helpers ───────────────────────────────────────────────────────────────

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

  /** Mensaje del indicador de permiso, según el estado efectivo de la sesión. */
  permMessage(): string {
    const s = this.session();
    if (s === null) {
      return '';
    }
    if (s.status === 'PAUSED') {
      return 'Sesión pausada. No puedes dibujar hasta que el docente la reanude.';
    }
    if (this.canDraw()) {
      return 'Puedes interactuar: dibuja en la pizarra con el plumón o el borrador.';
    }
    return 'El docente no ha habilitado tu interacción. Puedes visualizar la pizarra.';
  }

  permClass(): string {
    const s = this.session();
    if (s?.status === 'PAUSED') {
      return 'perm-banner--paused';
    }
    return this.canDraw() ? 'perm-banner--interact' : 'perm-banner--read';
  }

  permIcon(): string {
    const s = this.session();
    if (s?.status === 'PAUSED') {
      return 'pause_circle';
    }
    return this.canDraw() ? 'edit' : 'visibility';
  }

  connLabel(): string {
    switch (this.connectionState()) {
      case 'connected':
        return 'Conectado';
      case 'connecting':
        return 'Reconectando';
      case 'disconnected':
        return 'Desconectado';
    }
  }

  connClass(): string {
    switch (this.connectionState()) {
      case 'connected':
        return 'conn--ok';
      case 'connecting':
        return 'conn--wait';
      case 'disconnected':
        return 'conn--off';
    }
  }

  bannerClass(): string {
    return `alert-${this.bannerTone()}`;
  }

  bannerIcon(): string {
    switch (this.bannerTone()) {
      case 'success':
        return 'check_circle';
      case 'warning':
        return 'warning';
      case 'danger':
        return 'error_outline';
      default:
        return 'info';
    }
  }

  private showBanner(message: string, tone: 'info' | 'success' | 'warning' | 'danger'): void {
    this.bannerTone.set(tone);
    this.banner.set(message);
    setTimeout(() => this.banner.set(null), 4500);
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
        return 'La sesión de pizarra no existe o no está disponible para tu grado y sección.';
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
