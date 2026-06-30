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
import { TeacherWhiteboardService } from '../../../core/services/teacher-whiteboard.service';
import { TeacherWhiteboardRealtimeService } from '../../../core/services/teacher-whiteboard-realtime.service';
import {
  SidebarComponent,
  SidebarNavItem,
} from '../../../shared/components/sidebar/sidebar.component';
import { TEACHER_NAV_ITEMS } from '../../../shared/components/sidebar/teacher-nav';
import {
  ApiError,
  WhiteboardDrawEventRequest,
  WhiteboardDrawEventResponse,
  WhiteboardInteractionOverride,
  WhiteboardParticipantResponse,
  WhiteboardPoint,
  WhiteboardSessionResponse,
  WhiteboardSessionStatus,
} from '../../../shared/models';

/**
 * Área de trabajo (workspace) de la pizarra: grande pero limitada (no infinita). Es la
 * resolución lógica del lienzo y el espacio de coordenadas que viaja por WebSocket, de modo que
 * todos los clientes comparten el mismo sistema de referencia. El docente se desplaza por ella
 * con la herramienta "Mover"; el visor muestra solo una parte.
 */
const WORKSPACE_WIDTH = 3200;
const WORKSPACE_HEIGHT = 2000;
const BOARD_BACKGROUND = '#ffffff';
/** Ancho máximo de la captura final (se reescala para mantener un peso razonable). */
const SNAPSHOT_MAX_WIDTH = 2400;

/**
 * Cursor del plumón: un lápiz dibujado en SVG (hotspot en la punta, abajo-izquierda) en vez del
 * cursor básico. Incluye "crosshair" como respaldo si el navegador no admite el cursor de imagen.
 */
const PEN_CURSOR =
  'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyOCIgaGVpZ2h0PSIyOCIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBkPSJNMyAxNy4yNVYyMWgzLjc1TDE3LjgxIDkuOTRsLTMuNzUtMy43NUwzIDE3LjI1eiIgZmlsbD0iIzFhMWExNiIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjEuMiIvPjxwYXRoIGQ9Ik0yMC43MSA3LjA0YTEgMSAwIDAgMCAwLTEuNDFsLTIuMzQtMi4zNGExIDEgMCAwIDAtMS40MSAwbC0xLjgzIDEuODMgMy43NSAzLjc1IDEuODMtMS44M3oiIGZpbGw9IiMxZDllNzUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLXdpZHRoPSIxLjIiLz48L3N2Zz4=") 3 25, crosshair';

type DrawTool = 'PEN' | 'ERASER' | 'TEXT' | 'MOVE';

interface TextDraft {
  readonly screenX: number;
  readonly screenY: number;
  readonly wx: number;
  readonly wy: number;
}

@Component({
  selector: 'app-teacher-whiteboard-editor',
  standalone: true,
  imports: [SidebarComponent],
  styleUrls: ['./teacher-whiteboard-editor.component.scss'],
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
        @if (!fullscreen()) {
          <button type="button" class="back-link" (click)="goToList()">
            <span class="material-icons">arrow_back</span> Volver a las sesiones
          </button>
        }

        @if (loading()) {
          <div class="loading-state">
            <div class="loading-state__spinner"></div>
            <div class="loading-state__label">Cargando sesión…</div>
          </div>
        } @else if (loadError()) {
          <div class="error-state">
            <div class="error-state__icon"><span class="material-icons">error_outline</span></div>
            <h2 class="error-state__title">No se pudo cargar la sesión</h2>
            <p class="error-state__desc">{{ loadError() }}</p>
            <button type="button" class="btn btn-secondary" (click)="reload()">Reintentar</button>
          </div>
        } @else if (session(); as s) {
          @if (!fullscreen()) {
            <header class="editor-header">
              <div class="editor-header__info">
                <h1 class="editor-header__name">{{ s.name }}</h1>
                <div class="editor-header__tags">
                  <span class="badge" [class]="statusBadgeClass(s.status)">
                    <span class="status-dot"></span>{{ statusLabel(s.status) }}
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
            <!-- Modo historial: sesión finalizada, solo lectura -->
            <section class="closed-grid">
              <div class="card closed-meta">
                <h2 class="card-title">Registro de la sesión</h2>
                <dl class="closed-meta__list">
                  <div><dt>Estado</dt><dd>Finalizada</dd></div>
                  <div><dt>Grado / sección</dt><dd>{{ s.grade }}° · {{ s.section }}</dd></div>
                  <div><dt>Docente</dt><dd>{{ s.teacherName }}</dd></div>
                  <div><dt>Creada</dt><dd>{{ formatDate(s.createdAt) }}</dd></div>
                  <div><dt>Finalizada</dt><dd>{{ formatDate(s.closedAt) }}</dd></div>
                  @if (s.description) {
                    <div class="closed-meta__full"><dt>Descripción</dt><dd>{{ s.description }}</dd></div>
                  }
                </dl>
              </div>

              <div class="card closed-snapshot">
                <h2 class="card-title">Captura final</h2>
                @if (snapshotUrl(); as url) {
                  <img class="closed-snapshot__img" [src]="url" alt="Captura final de la pizarra" />
                } @else if (snapshotLoading()) {
                  <div class="loading-state"><div class="loading-state__spinner"></div></div>
                } @else {
                  <p class="card-description">No hay captura disponible para esta sesión.</p>
                }
              </div>
            </section>
          } @else {
            <!-- Editor en vivo -->
            <div class="editor-grid" [class.editor-grid--full]="fullscreen()">
              <div class="board-area">
                <div class="toolbar">
                  <div class="toolbar__group">
                    <button
                      type="button"
                      class="tool-btn"
                      [class.tool-btn--active]="tool() === 'PEN'"
                      [disabled]="!canDraw()"
                      title="Plumón"
                      (click)="selectTool('PEN')"
                    >
                      <span class="material-icons">edit</span>
                    </button>
                    <button
                      type="button"
                      class="tool-btn"
                      [class.tool-btn--active]="tool() === 'ERASER'"
                      [disabled]="!canDraw()"
                      title="Borrador"
                      (click)="selectTool('ERASER')"
                    >
                      <span class="material-icons">ink_eraser</span>
                    </button>
                    <button
                      type="button"
                      class="tool-btn"
                      [class.tool-btn--active]="tool() === 'TEXT'"
                      [disabled]="!canDraw()"
                      title="Texto"
                      (click)="selectTool('TEXT')"
                    >
                      <span class="material-icons">title</span>
                    </button>
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

                  <div class="toolbar__group">
                    @if (tool() !== 'MOVE') {
                      <label class="tool-field" title="Color">
                        <span class="material-icons">palette</span>
                        <input
                          type="color"
                          [value]="color()"
                          [disabled]="!canDraw()"
                          (input)="onColor($event)"
                        />
                      </label>
                    }

                    @if (tool() === 'PEN') {
                      <label class="tool-field tool-field--range" title="Grosor del trazo">
                        <span class="material-icons">line_weight</span>
                        <input
                          type="range"
                          min="1"
                          max="24"
                          [value]="strokeWidth()"
                          [disabled]="!canDraw()"
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
                          [disabled]="!canDraw()"
                          (input)="onEraserSize($event)"
                        />
                        <span class="tool-field__value">{{ eraserSize() }}</span>
                      </label>
                    } @else if (tool() === 'TEXT') {
                      <label class="tool-field tool-field--range" title="Tamaño del texto">
                        <span class="material-icons">format_size</span>
                        <input
                          type="range"
                          min="14"
                          max="96"
                          step="2"
                          [value]="textSize()"
                          [disabled]="!canDraw()"
                          (input)="onTextSize($event)"
                        />
                        <span class="tool-field__value">{{ textSize() }}</span>
                      </label>

                      <div class="toolbar__group toolbar__group--tight">
                        <button
                          type="button"
                          class="tool-btn tool-btn--sm"
                          [class.tool-btn--active]="textBold()"
                          [disabled]="!canDraw()"
                          title="Negrita"
                          (mousedown)="$event.preventDefault()"
                          (click)="textBold.set(!textBold())"
                        >
                          <span class="material-icons">format_bold</span>
                        </button>
                        <button
                          type="button"
                          class="tool-btn tool-btn--sm"
                          [class.tool-btn--active]="textItalic()"
                          [disabled]="!canDraw()"
                          title="Cursiva"
                          (mousedown)="$event.preventDefault()"
                          (click)="textItalic.set(!textItalic())"
                        >
                          <span class="material-icons">format_italic</span>
                        </button>
                        <button
                          type="button"
                          class="tool-btn tool-btn--sm"
                          [class.tool-btn--active]="textUnderline()"
                          [disabled]="!canDraw()"
                          title="Subrayado"
                          (mousedown)="$event.preventDefault()"
                          (click)="textUnderline.set(!textUnderline())"
                        >
                          <span class="material-icons">format_underlined</span>
                        </button>
                      </div>
                    }

                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      [disabled]="!canDraw()"
                      title="Borrar toda la pizarra"
                      (click)="askClear()"
                    >
                      <span class="material-icons">delete_sweep</span>
                      Borrar todo
                    </button>
                  </div>

                  <div class="toolbar__group toolbar__group--right">
                    <button
                      type="button"
                      class="tool-btn"
                      title="{{ fullscreen() ? 'Salir de pantalla completa' : 'Pantalla completa' }}"
                      (click)="toggleFullscreen()"
                    >
                      <span class="material-icons">{{ fullscreen() ? 'fullscreen_exit' : 'fullscreen' }}</span>
                    </button>
                    @if (s.status === 'ACTIVE') {
                      <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="pause()">
                        <span class="material-icons">pause</span> Pausar
                      </button>
                    } @else if (s.status === 'PAUSED') {
                      <button type="button" class="btn btn-primary btn-sm" [disabled]="busy()" (click)="resume()">
                        <span class="material-icons">play_arrow</span> Reanudar
                      </button>
                    }
                    <button type="button" class="btn btn-danger btn-sm" [disabled]="busy()" (click)="askFinalize()">
                      <span class="material-icons">stop_circle</span> Finalizar
                    </button>
                  </div>
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

                  @if (textDraft(); as draft) {
                    <input
                      #textEditor
                      class="text-input"
                      [value]="textValue()"
                      [style.left.px]="draft.screenX"
                      [style.top.px]="draft.screenY"
                      [style.color]="color()"
                      [style.font-size.px]="textSize()"
                      [style.font-weight]="textBold() ? 700 : 400"
                      [style.font-style]="textItalic() ? 'italic' : 'normal'"
                      [style.text-decoration]="textUnderline() ? 'underline' : 'none'"
                      placeholder="Escribe y pulsa Enter…"
                      (input)="onTextInput($event)"
                      (keydown.enter)="commitText()"
                      (keydown.escape)="onTextEscape($event)"
                      (blur)="commitText()"
                    />
                  }

                  @if (s.status === 'PAUSED') {
                    <div class="canvas-overlay">
                      <span class="material-icons">pause_circle</span>
                      <p>Sesión pausada. Reanúdala para volver a dibujar.</p>
                    </div>
                  } @else if (connectionState() !== 'connected') {
                    <div class="canvas-overlay canvas-overlay--soft">
                      <span class="material-icons">sync</span>
                      <p>Conectando con la pizarra en vivo…</p>
                    </div>
                  }
                </div>
              </div>

              @if (!fullscreen()) {
                <aside class="participants card">
                  <div class="participants__header">
                    <h2 class="card-title">Participantes</h2>
                    <button type="button" class="icon-btn" title="Actualizar" (click)="refreshParticipants()">
                      <span class="material-icons">refresh</span>
                    </button>
                  </div>

                  <label class="global-toggle">
                    <input
                      type="checkbox"
                      [checked]="s.interactionEnabled"
                      [disabled]="busy()"
                      (change)="toggleGlobalInteraction($event)"
                    />
                    <span class="global-toggle__text">
                      Interacción de todos los alumnos
                      <small>{{ s.interactionEnabled ? 'Habilitada' : 'Deshabilitada' }}</small>
                    </span>
                  </label>

                  @if (participants().length === 0) {
                    <p class="participants__empty">
                      Todavía no se ha unido ningún estudiante a esta sesión.
                    </p>
                  } @else {
                    <ul class="participants__list">
                      @for (p of participants(); track p.studentId) {
                        <li class="participant">
                          <div class="participant__info">
                            <div class="participant__avatar">{{ initials(p.studentName) }}</div>
                            <div>
                              <div class="participant__name">{{ p.studentName }}</div>
                              <div class="participant__perm" [class]="permClass(p)">
                                {{ permLabel(p) }}
                              </div>
                            </div>
                          </div>
                          <select
                            class="select participant__select"
                            [value]="p.interactionOverride"
                            [disabled]="busy()"
                            (change)="changeParticipant(p, $event)"
                          >
                            <option value="FOLLOW_GLOBAL">Según regla global</option>
                            <option value="ALLOWED">Permitir</option>
                            <option value="BLOCKED">Bloquear</option>
                          </select>
                        </li>
                      }
                    </ul>
                  }
                </aside>
              }
            </div>
          }
        }
      </main>
    </div>

    <!-- Confirmación: borrar todo -->
    @if (clearOpen()) {
      <div class="modal-overlay" (click)="clearOpen.set(false)">
        <div class="modal modal--confirm" (click)="$event.stopPropagation()">
          <div class="modal__warn-icon"><span class="material-icons">delete_sweep</span></div>
          <h2 class="modal__title">¿Borrar toda la pizarra?</h2>
          <p class="modal__text">
            Se limpiará el lienzo para ti y para todos los estudiantes conectados. Esta acción no se
            puede deshacer.
          </p>
          <div class="modal__actions">
            <button type="button" class="btn btn-secondary" (click)="clearOpen.set(false)">Cancelar</button>
            <button type="button" class="btn btn-danger" (click)="confirmClear()">Borrar todo</button>
          </div>
        </div>
      </div>
    }

    <!-- Confirmación: finalizar sesión -->
    @if (finalizeOpen()) {
      <div class="modal-overlay" (click)="finalizeOpen.set(false)">
        <div class="modal modal--confirm" (click)="$event.stopPropagation()">
          <div class="modal__warn-icon"><span class="material-icons">stop_circle</span></div>
          <h2 class="modal__title">¿Finalizar esta sesión?</h2>
          <p class="modal__text">
            Si finalizas esta sesión, ya no podrás reabrirla ni editarla. Se guardará una captura
            final para que los estudiantes la consulten en el historial. ¿Deseas continuar?
          </p>
          @if (finalizeError()) {
            <div class="alert alert-danger modal__note">
              <span class="material-icons">error_outline</span>{{ finalizeError() }}
            </div>
          }
          <div class="modal__actions">
            <button type="button" class="btn btn-secondary" (click)="finalizeOpen.set(false)" [disabled]="busy()">
              Cancelar
            </button>
            <button type="button" class="btn btn-danger" (click)="confirmFinalize()" [disabled]="busy()">
              {{ busy() ? 'Finalizando…' : 'Finalizar y guardar' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class TeacherWhiteboardEditorComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly whiteboardService = inject(TeacherWhiteboardService);
  private readonly realtime = inject(TeacherWhiteboardRealtimeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly navItems: readonly SidebarNavItem[] = TEACHER_NAV_ITEMS;
  readonly userRole = 'Docente';

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('boardCanvas');
  private readonly wrapRef = viewChild<ElementRef<HTMLDivElement>>('canvasWrap');
  private readonly textEditorRef = viewChild<ElementRef<HTMLInputElement>>('textEditor');

  private sessionId = 0;
  private ctx: CanvasRenderingContext2D | null = null;
  private drawing = false;
  private currentStroke: WhiteboardPoint[] = [];
  /** clientEventId de eventos propios para no re-renderizar el eco que vuelve por el canal. */
  private readonly ownEventIds = new Set<string>();
  private snapshotObjectUrl: string | null = null;

  // Desplazamiento (pan) del lienzo dentro del visor.
  private panning = false;
  private panStart = { x: 0, y: 0, px: 0, py: 0 };
  readonly panX = signal<number>(0);
  readonly panY = signal<number>(0);

  // Cursor circular del borrador.
  readonly cursorPos = signal<{ x: number; y: number } | null>(null);

  // Edición de texto en curso (entrada flotante sobre el visor).
  readonly textDraft = signal<TextDraft | null>(null);
  readonly textValue = signal<string>('');

  readonly fullscreen = signal<boolean>(false);

  readonly session = signal<WhiteboardSessionResponse | null>(null);
  readonly participants = signal<WhiteboardParticipantResponse[]>([]);
  readonly loading = signal<boolean>(true);
  readonly loadError = signal<string | null>(null);
  readonly busy = signal<boolean>(false);
  readonly banner = signal<string | null>(null);
  private readonly bannerTone = signal<'info' | 'success' | 'warning' | 'danger'>('info');

  readonly snapshotUrl = signal<string | null>(null);
  readonly snapshotLoading = signal<boolean>(false);

  readonly clearOpen = signal<boolean>(false);
  readonly finalizeOpen = signal<boolean>(false);
  readonly finalizeError = signal<string | null>(null);

  // Herramientas
  readonly tool = signal<DrawTool>('PEN');
  readonly color = signal<string>('#1d9e75');
  readonly strokeWidth = signal<number>(4);
  readonly eraserSize = signal<number>(28);
  readonly textSize = signal<number>(32);
  readonly textBold = signal<boolean>(false);
  readonly textItalic = signal<boolean>(false);
  readonly textUnderline = signal<boolean>(false);

  readonly connectionState = this.realtime.connectionState;

  private readonly currentUser = this.authService.currentUser;
  readonly userName = computed<string>(() => this.currentUser()?.username ?? 'Docente');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  readonly isClosed = computed<boolean>(() => this.session()?.status === 'CLOSED');
  /** Solo se puede dibujar si la sesión está ACTIVE y el canal está conectado. */
  readonly canDraw = computed<boolean>(
    () => this.session()?.status === 'ACTIVE' && this.connectionState() === 'connected'
  );

  /** Transform del lienzo según el desplazamiento actual (herramienta "Mover"). */
  readonly boardTransform = computed<string>(
    () => `translate(${this.panX()}px, ${this.panY()}px)`
  );

  /** Muestra el cursor circular del borrador (vista previa del área que se borrará). */
  readonly showEraserCursor = computed<boolean>(
    () => this.tool() === 'ERASER' && this.canDraw() && this.cursorPos() !== null && !this.panning
  );

  /** Cursor del lienzo según la herramienta y el estado de la sesión. */
  readonly canvasCursor = computed<string>(() => {
    if (this.tool() === 'MOVE') {
      return this.panning ? 'grabbing' : 'grab';
    }
    if (!this.canDraw()) {
      return 'not-allowed';
    }
    if (this.tool() === 'ERASER') {
      return 'none'; // el círculo de vista previa hace de cursor
    }
    if (this.tool() === 'TEXT') {
      return 'text';
    }
    return PEN_CURSOR;
  });

  constructor() {
    // Inicializa el contexto del lienzo en cuanto el elemento existe en el DOM (evita la
    // condición de carrera de hacerlo en ngAfterViewInit cuando aún estaba cargando la sesión).
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
    this.revokeSnapshotUrl();
  }

  reload(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.whiteboardService.getSessionDetail(this.sessionId).subscribe({
      next: (detail) => {
        this.session.set(detail.session);
        this.participants.set([...detail.participants]);
        this.loading.set(false);
        if (detail.session.status === 'CLOSED') {
          this.realtime.disconnect();
          this.loadSnapshot();
        } else {
          this.realtime.connect(this.sessionId);
          // Tras renderizar el lienzo, centra la vista del workspace en el visor.
          requestAnimationFrame(() => {
            this.ensureCanvas();
            this.centerPan();
          });
        }
      },
      error: (err: unknown) => {
        this.loadError.set(this.extractError(err, 'No se pudo cargar la sesión.'));
        this.loading.set(false);
      },
    });
  }

  // ─── Herramientas ───────────────────────────────────────────────────────────

  selectTool(tool: DrawTool): void {
    if (this.tool() === 'TEXT' && tool !== 'TEXT') {
      this.commitText();
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

  onTextSize(event: Event): void {
    this.textSize.set(Number((event.target as HTMLInputElement).value));
  }

  onTextInput(event: Event): void {
    this.textValue.set((event.target as HTMLInputElement).value);
  }

  toggleFullscreen(): void {
    this.fullscreen.set(!this.fullscreen());
    // Al cambiar el tamaño del visor, re-encaja el desplazamiento para no perder la pizarra.
    requestAnimationFrame(() => this.setPan(this.panX(), this.panY()));
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.textDraft() !== null) {
      this.cancelText();
    } else if (this.finalizeOpen()) {
      this.finalizeOpen.set(false);
    } else if (this.clearOpen()) {
      this.clearOpen.set(false);
    } else if (this.fullscreen()) {
      this.toggleFullscreen();
    }
  }

  // ─── Puntero: dibujo, texto y desplazamiento ──────────────────────────────────

  onPointerDown(event: PointerEvent): void {
    if (this.tool() === 'MOVE') {
      this.startPan(event);
      return;
    }
    if (this.tool() === 'TEXT') {
      this.placeText(event);
      return;
    }
    if (!this.canDraw()) {
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

  /** Limita el desplazamiento para que el lienzo no se salga por completo del visor. */
  private setPan(x: number, y: number): void {
    const wrap = this.wrapRef()?.nativeElement;
    const viewW = wrap?.clientWidth ?? WORKSPACE_WIDTH;
    const viewH = wrap?.clientHeight ?? WORKSPACE_HEIGHT;
    const minX = Math.min(0, viewW - WORKSPACE_WIDTH);
    const minY = Math.min(0, viewH - WORKSPACE_HEIGHT);
    this.panX.set(Math.max(minX, Math.min(0, x)));
    this.panY.set(Math.max(minY, Math.min(0, y)));
  }

  /** Centra la vista del workspace en el visor. */
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

  // ─── Texto (se rasteriza en el lienzo; ver nota de WebSocket) ──────────────────

  private placeText(event: PointerEvent): void {
    if (!this.canDraw()) {
      return;
    }
    // Si ya había un texto en edición, confírmalo antes de abrir otro.
    this.commitText();
    const wrap = this.wrapRef()?.nativeElement;
    if (!wrap) {
      return;
    }
    const rect = wrap.getBoundingClientRect();
    const wp = this.toCanvasPoint(event);
    this.textValue.set('');
    this.textDraft.set({
      screenX: event.clientX - rect.left,
      screenY: event.clientY - rect.top,
      wx: wp.x,
      wy: wp.y,
    });
    setTimeout(() => this.textEditorRef()?.nativeElement.focus(), 0);
  }

  /**
   * Confirma el texto en edición dibujándolo en el lienzo. El backend no define un eventType de
   * texto, por lo que el texto se rasteriza localmente: forma parte de la captura final pero no
   * se difunde en vivo por WebSocket (limitación documentada).
   */
  commitText(): void {
    const draft = this.textDraft();
    if (draft === null) {
      return;
    }
    const value = this.textValue().trim();
    this.textDraft.set(null);
    this.textValue.set('');
    if (value === '' || !this.canDraw()) {
      return;
    }
    const ctx = this.ensureCanvas();
    if (ctx === null) {
      return;
    }
    const size = this.textSize();
    ctx.save();
    ctx.font = this.canvasFont(size);
    ctx.fillStyle = this.color();
    ctx.textBaseline = 'top';
    ctx.fillText(value, draft.wx, draft.wy);
    if (this.textUnderline()) {
      const width = ctx.measureText(value).width;
      const underlineY = draft.wy + size * 1.08;
      ctx.strokeStyle = this.color();
      ctx.lineWidth = Math.max(1, size / 14);
      ctx.beginPath();
      ctx.moveTo(draft.wx, underlineY);
      ctx.lineTo(draft.wx + width, underlineY);
      ctx.stroke();
    }
    ctx.restore();
  }

  cancelText(): void {
    this.textDraft.set(null);
    this.textValue.set('');
  }

  /** Esc dentro del campo de texto: cancela el texto sin afectar a la pantalla completa. */
  onTextEscape(event: Event): void {
    event.stopPropagation();
    this.cancelText();
  }

  private canvasFont(size: number): string {
    const style = this.textItalic() ? 'italic ' : '';
    const weight = this.textBold() ? '700' : '400';
    return `${style}${weight} ${size}px "Plus Jakarta Sans", system-ui, sans-serif`;
  }

  // ─── Borrar todo ──────────────────────────────────────────────────────────────

  askClear(): void {
    if (!this.canDraw()) {
      return;
    }
    this.clearOpen.set(true);
  }

  confirmClear(): void {
    this.clearOpen.set(false);
    this.clearCanvas();
    const clientEventId = this.newEventId();
    this.realtime.sendDraw({ eventType: 'CLEAR', tool: 'CLEAR', clientEventId });
  }

  // ─── Acciones de sesión ───────────────────────────────────────────────────────

  pause(): void {
    this.busy.set(true);
    this.whiteboardService.pauseSession(this.sessionId).subscribe({
      next: (updated) => {
        this.session.set(updated);
        this.busy.set(false);
        this.showBanner('Sesión pausada. El dibujo está bloqueado.', 'warning');
      },
      error: (err: unknown) => this.onActionError(err, 'No se pudo pausar la sesión.'),
    });
  }

  resume(): void {
    this.busy.set(true);
    this.whiteboardService.resumeSession(this.sessionId).subscribe({
      next: (updated) => {
        this.session.set(updated);
        this.busy.set(false);
        this.showBanner('Sesión reanudada.', 'success');
      },
      error: (err: unknown) => this.onActionError(err, 'No se pudo reanudar la sesión.'),
    });
  }

  askFinalize(): void {
    this.commitText();
    this.finalizeError.set(null);
    this.finalizeOpen.set(true);
  }

  confirmFinalize(): void {
    this.busy.set(true);
    this.finalizeError.set(null);
    this.exportSnapshot((blob) => {
      if (blob === null) {
        this.busy.set(false);
        this.finalizeError.set('No se pudo generar la captura del lienzo.');
        return;
      }
      this.whiteboardService
        .closeSession(this.sessionId, blob, `pizarra-${this.sessionId}.png`)
        .subscribe({
          next: (updated) => {
            this.busy.set(false);
            this.finalizeOpen.set(false);
            this.fullscreen.set(false);
            this.realtime.disconnect();
            this.session.set(updated);
            this.participants.set([]);
            this.showBanner('Sesión finalizada. Se guardó la captura final.', 'success');
            this.loadSnapshot();
          },
          error: (err: unknown) => {
            this.busy.set(false);
            this.finalizeError.set(this.extractError(err, 'No se pudo finalizar la sesión.'));
          },
        });
    });
  }

  // ─── Participantes e interacción ──────────────────────────────────────────────

  toggleGlobalInteraction(event: Event): void {
    const enabled = (event.target as HTMLInputElement).checked;
    this.busy.set(true);
    this.whiteboardService
      .updateGlobalInteraction(this.sessionId, { interactionEnabled: enabled })
      .subscribe({
        next: (updated) => {
          this.session.set(updated);
          this.busy.set(false);
          this.refreshParticipants();
        },
        error: (err: unknown) => this.onActionError(err, 'No se pudo cambiar la interacción global.'),
      });
  }

  changeParticipant(participant: WhiteboardParticipantResponse, event: Event): void {
    const value = (event.target as HTMLSelectElement).value as WhiteboardInteractionOverride;
    this.busy.set(true);
    this.whiteboardService
      .updateParticipantInteraction(this.sessionId, participant.studentId, {
        interactionOverride: value,
      })
      .subscribe({
        next: (updated) => {
          this.participants.update((list) =>
            list.map((p) => (p.studentId === updated.studentId ? updated : p))
          );
          this.busy.set(false);
        },
        error: (err: unknown) =>
          this.onActionError(err, 'No se pudo cambiar el permiso del estudiante.'),
      });
  }

  refreshParticipants(): void {
    this.whiteboardService.listParticipants(this.sessionId).subscribe({
      next: (list) => this.participants.set(list),
      error: (err: unknown) =>
        this.showBanner(
          this.extractError(err, 'No se pudieron actualizar los participantes.'),
          'warning'
        ),
    });
  }

  // ─── Eventos en vivo recibidos ────────────────────────────────────────────────

  private onRemoteDraw(event: WhiteboardDrawEventResponse): void {
    if (event.clientEventId !== null && this.ownEventIds.has(event.clientEventId)) {
      // Es el eco de un evento propio que ya se pintó localmente.
      this.ownEventIds.delete(event.clientEventId);
      return;
    }
    if (event.eventType === 'CLEAR') {
      this.clearCanvas();
      return;
    }
    const points = (event.points ?? []) as WhiteboardPoint[];
    const isErase = event.eventType === 'ERASE';
    const color = isErase ? BOARD_BACKGROUND : event.color ?? '#000000';
    const width = isErase ? event.eraserSize ?? 24 : event.strokeWidth ?? 4;
    this.renderStroke(points, color, width);
  }

  private onControlEvent(event: { eventType: string; status: WhiteboardSessionStatus | null }): void {
    const current = this.session();
    if (current === null) {
      return;
    }
    switch (event.eventType) {
      case 'SESSION_PAUSED':
        this.session.set({ ...current, status: 'PAUSED' });
        this.showBanner('La sesión fue pausada.', 'warning');
        break;
      case 'SESSION_RESUMED':
        this.session.set({ ...current, status: 'ACTIVE' });
        this.showBanner('La sesión fue reanudada.', 'success');
        break;
      case 'SESSION_CLOSED':
        this.realtime.disconnect();
        this.reload();
        break;
      case 'INTERACTION_UPDATED':
      case 'PARTICIPANT_PERMISSION_UPDATED':
        this.refreshParticipants();
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
    const ctx = this.ensureCanvas();
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
    // getBoundingClientRect refleja el desplazamiento (translate), por lo que el punto resultante
    // es la coordenada real dentro del workspace, no la posición visible en el viewport.
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

  // ─── Captura final / historial ────────────────────────────────────────────────

  /** Genera la captura del lienzo (solo la pizarra), reescalada para un peso razonable. */
  private exportSnapshot(callback: (blob: Blob | null) => void): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) {
      callback(null);
      return;
    }
    if (canvas.width <= SNAPSHOT_MAX_WIDTH) {
      canvas.toBlob(callback, 'image/png');
      return;
    }
    const scale = SNAPSHOT_MAX_WIDTH / canvas.width;
    const off = document.createElement('canvas');
    off.width = Math.round(canvas.width * scale);
    off.height = Math.round(canvas.height * scale);
    const octx = off.getContext('2d');
    if (octx === null) {
      canvas.toBlob(callback, 'image/png');
      return;
    }
    octx.fillStyle = BOARD_BACKGROUND;
    octx.fillRect(0, 0, off.width, off.height);
    octx.drawImage(canvas, 0, 0, off.width, off.height);
    off.toBlob(callback, 'image/png');
  }

  private loadSnapshot(): void {
    if (this.session()?.snapshotAvailable !== true) {
      return;
    }
    this.snapshotLoading.set(true);
    this.whiteboardService.getSnapshot(this.sessionId).subscribe({
      next: (blob) => {
        this.revokeSnapshotUrl();
        this.snapshotObjectUrl = URL.createObjectURL(blob);
        this.snapshotUrl.set(this.snapshotObjectUrl);
        this.snapshotLoading.set(false);
      },
      error: () => {
        this.snapshotLoading.set(false);
      },
    });
  }

  private revokeSnapshotUrl(): void {
    if (this.snapshotObjectUrl !== null) {
      URL.revokeObjectURL(this.snapshotObjectUrl);
      this.snapshotObjectUrl = null;
    }
  }

  // ─── UI helpers ───────────────────────────────────────────────────────────────

  goToList(): void {
    void this.router.navigate(['/teacher/whiteboards']);
  }

  handleLogout(): void {
    this.realtime.disconnect();
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
  }

  initials(name: string): string {
    return buildInitials(name);
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

  permLabel(participant: WhiteboardParticipantResponse): string {
    switch (participant.interactionOverride) {
      case 'ALLOWED':
        return 'Permitido';
      case 'BLOCKED':
        return 'Bloqueado';
      case 'FOLLOW_GLOBAL':
        return 'Según regla global';
    }
  }

  permClass(participant: WhiteboardParticipantResponse): string {
    switch (participant.interactionOverride) {
      case 'ALLOWED':
        return 'participant__perm--allowed';
      case 'BLOCKED':
        return 'participant__perm--blocked';
      case 'FOLLOW_GLOBAL':
        return 'participant__perm--global';
    }
  }

  connLabel(): string {
    switch (this.connectionState()) {
      case 'connected':
        return 'En vivo';
      case 'connecting':
        return 'Conectando…';
      case 'disconnected':
        return 'Sin conexión';
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

  private showBanner(message: string, tone: 'info' | 'success' | 'warning' | 'danger'): void {
    this.bannerTone.set(tone);
    this.banner.set(message);
    setTimeout(() => this.banner.set(null), 4500);
  }

  private onActionError(err: unknown, fallback: string): void {
    this.busy.set(false);
    this.showBanner(this.extractError(err, fallback), 'danger');
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
