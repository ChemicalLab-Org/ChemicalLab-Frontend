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
  WhiteboardBoardStateSnapshot,
  WhiteboardDrawEventRequest,
  WhiteboardDrawEventResponse,
  WhiteboardInteractionOverride,
  WhiteboardParticipantResponse,
  WhiteboardPoint,
  WhiteboardSessionResponse,
  WhiteboardSessionStatus,
  WhiteboardStrokeRecord,
  WhiteboardTextRun,
} from '../../../shared/models';
import {
  WhiteboardTextObject,
  caretToEnd,
  drawTextItem,
  eraserHitsText,
  localTextId,
  measureTextWidth,
  parseRuns,
  runsToHtml,
} from '../../../shared/whiteboard/whiteboard-text.util';

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

type DrawTool = 'PEN' | 'ERASER' | 'TEXT' | 'SELECT' | 'MOVE';

interface TextDraft {
  readonly screenX: number;
  readonly screenY: number;
  readonly wx: number;
  readonly wy: number;
}

/** Texto colocado sobre la pizarra como objeto movible (coordenadas del workspace). */
type TextItem = WhiteboardTextObject;

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
                <!-- Toolbar en dos filas fijas: la fila superior (herramientas + acciones) nunca
                     cambia, y las opciones de cada herramienta viven en una segunda fila de altura
                     constante. Así el lienzo y los botones Pausar/Finalizar no se desplazan al
                     cambiar de herramienta. -->
                <div class="toolbar">
                  <div class="toolbar__row">
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
                        <!-- Borrador en SVG inline: el set "Material Icons" clásico (el único cargado
                             en index.html) no incluye un glifo de borrador, por eso antes se veía un
                             recuadro vacío. -->
                        <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                          <path
                            fill="currentColor"
                            d="M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53c-1.56 1.56-4.09 1.56-5.66 0l-3.53-3.53c-.78-.79-.78-2.05 0-2.84L13.41 3.56c.79-.78 2.05-.78 2.83 0M4.22 15.58l3.54 3.53c.78.79 2.04.79 2.83 0l3.53-3.53-4.95-4.95-4.95 4.95Z"
                          />
                        </svg>
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
                        [class.tool-btn--active]="tool() === 'SELECT'"
                        [disabled]="!canDraw()"
                        title="Seleccionar"
                        (click)="selectTool('SELECT')"
                      >
                        <span class="material-icons">near_me</span>
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

                    <div class="toolbar__group toolbar__group--right">
                      <button
                        type="button"
                        class="tool-btn"
                        [class.tool-btn--active]="fullscreen()"
                        [title]="fullscreen() ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa'"
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

                  <div class="toolbar__row toolbar__row--options">
                    <div class="toolbar__group">
                      @if (tool() !== 'MOVE' && tool() !== 'SELECT') {
                        <label class="tool-field" title="Color">
                          <span class="material-icons">palette</span>
                          <input
                            type="color"
                            [value]="color()"
                            [disabled]="!canDraw()"
                            (mousedown)="keepEditorFocus()"
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
                        <label class="tool-field" title="Tamaño del texto">
                          <span class="material-icons">format_size</span>
                          <select
                            class="select tool-field__select"
                            [value]="textSize()"
                            [disabled]="!canDraw()"
                            (mousedown)="keepEditorFocus()"
                            (change)="onTextSize($event)"
                          >
                            @for (size of textSizes; track size) {
                              <option [value]="size">{{ size }}</option>
                            }
                          </select>
                        </label>

                        <div class="toolbar__group toolbar__group--tight">
                          <button
                            type="button"
                            class="tool-btn tool-btn--sm"
                            [class.tool-btn--active]="textBold()"
                            [disabled]="textDraft() === null"
                            title="Negrita (selecciona texto para aplicarlo a una parte)"
                            (mousedown)="$event.preventDefault()"
                            (click)="applyFormat('bold')"
                          >
                            <span class="material-icons">format_bold</span>
                          </button>
                          <button
                            type="button"
                            class="tool-btn tool-btn--sm"
                            [class.tool-btn--active]="textItalic()"
                            [disabled]="textDraft() === null"
                            title="Cursiva (selecciona texto para aplicarlo a una parte)"
                            (mousedown)="$event.preventDefault()"
                            (click)="applyFormat('italic')"
                          >
                            <span class="material-icons">format_italic</span>
                          </button>
                          <button
                            type="button"
                            class="tool-btn tool-btn--sm"
                            [class.tool-btn--active]="textUnderline()"
                            [disabled]="textDraft() === null"
                            title="Subrayado (selecciona texto para aplicarlo a una parte)"
                            (mousedown)="$event.preventDefault()"
                            (click)="applyFormat('underline')"
                          >
                            <span class="material-icons">format_underlined</span>
                          </button>
                        </div>
                      }
                    </div>

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

                  <!-- Textos como objetos sobre el lienzo: se pueden seleccionar y arrastrar con la
                       herramienta Seleccionar. Se posicionan en coordenadas del workspace + el pan, de modo
                       que siguen el desplazamiento de la pizarra. Se rasterizan solo en la captura
                       final. También se difunden en vivo por WebSocket. -->
                  @for (item of textItems(); track item.id) {
                    @if (editingTextId() !== item.id) {
                      <div
                        class="text-item"
                        [class.text-item--editable]="canSelectObject()"
                        [class.text-item--selected]="selectedTextId() === item.id"
                        [class.text-item--dragging]="draggingTextId() === item.id"
                        [style.left.px]="panX() + item.wx"
                        [style.top.px]="panY() + item.wy"
                        [style.color]="item.color"
                        [style.font-size.px]="item.size"
                        (pointerdown)="onTextItemPointerDown(item, $event)"
                        (pointermove)="onTextItemPointerMove($event)"
                        (pointerup)="onTextItemPointerUp($event)"
                        (pointercancel)="onTextItemPointerUp($event)"
                        (dblclick)="onTextItemDblClick(item, $event)"
                      >@for (run of item.runs; track $index) {<span
                          [style.font-weight]="run.bold ? 700 : 400"
                          [style.font-style]="run.italic ? 'italic' : 'normal'"
                          [style.text-decoration]="run.underline ? 'underline' : 'none'"
                        >{{ run.text }}</span>}</div>
                    }
                  }

                  @if (textDraft(); as draft) {
                    <!-- Editor temporal contenteditable: permite seleccionar partes del texto y
                         aplicar negrita/cursiva/subrayado solo a la selección (execCommand). Al
                         confirmar, su contenido se convierte en runs con estilo propio. -->
                    <div
                      #textEditor
                      class="text-input"
                      contenteditable="true"
                      data-placeholder="Escribe y pulsa Enter…"
                      [style.left.px]="draft.screenX"
                      [style.top.px]="draft.screenY"
                      [style.color]="color()"
                      [style.font-size.px]="textSize()"
                      (keydown.enter)="onEditorEnter($event)"
                      (keydown.escape)="onTextEscape($event)"
                      (keyup)="refreshFormatStates()"
                      (mouseup)="refreshFormatStates()"
                      (blur)="onEditorBlur()"
                    ></div>
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
  private readonly textEditorRef = viewChild<ElementRef<HTMLDivElement>>('textEditor');

  private sessionId = 0;
  private ctx: CanvasRenderingContext2D | null = null;
  private drawing = false;
  private currentStroke: WhiteboardPoint[] = [];
  /** clientEventId de eventos propios para no re-renderizar el eco que vuelve por el canal. */
  private readonly ownEventIds = new Set<string>();
  private snapshotObjectUrl: string | null = null;

  /**
   * Trazos acumulados (propios y de los alumnos) para reconstruir el estado del lienzo. Se guarda
   * de forma debounced en el backend (currentStateJson) para que un alumno que entra tarde o
   * recarga reconstruya lo ya dibujado. Se reinicia al limpiar la pizarra.
   */
  private boardStrokes: WhiteboardStrokeRecord[] = [];
  private stateSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly STATE_SAVE_DEBOUNCE_MS = 1000;
  private readonly boardStateReady = signal<boolean>(false);
  private queuedRemoteDrawEvents: WhiteboardDrawEventResponse[] = [];

  // Desplazamiento (pan) del lienzo dentro del visor.
  private panning = false;
  private panStart = { x: 0, y: 0, px: 0, py: 0 };
  readonly panX = signal<number>(0);
  readonly panY = signal<number>(0);

  // Cursor circular del borrador.
  readonly cursorPos = signal<{ x: number; y: number } | null>(null);

  // Edición de texto en curso (editor flotante contenteditable sobre el visor).
  readonly textDraft = signal<TextDraft | null>(null);

  // Textos colocados sobre la pizarra (objetos movibles).
  readonly textItems = signal<TextItem[]>([]);
  /** id del texto que se está reeditando (se oculta su objeto mientras se edita). */
  readonly editingTextId = signal<string | null>(null);
  /** id del texto seleccionado localmente. No se persiste ni se difunde. */
  readonly selectedTextId = signal<string | null>(null);
  /** id del texto que se está arrastrando, o null. */
  readonly draggingTextId = signal<string | null>(null);
  private textDragStart = { wx: 0, wy: 0, clientX: 0, clientY: 0 };
  /** Evita que el editor se confirme al tocar controles de tamaño/color (que roban el foco). */
  private keepEditorOpen = false;

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
  /** Tamaños de texto disponibles en el selector (estilo editor de texto). */
  readonly textSizes: readonly number[] = [12, 14, 16, 18, 24, 32, 48];
  // Estado activo de los botones B/I/U: refleja el formato de la selección actual del editor.
  readonly textBold = signal<boolean>(false);
  readonly textItalic = signal<boolean>(false);
  readonly textUnderline = signal<boolean>(false);

  readonly connectionState = this.realtime.connectionState;

  private readonly currentUser = this.authService.currentUser;
  readonly userName = computed<string>(() => this.currentUser()?.username ?? 'Docente');
  readonly userInitials = computed<string>(() => buildInitials(this.userName()));

  readonly isClosed = computed<boolean>(() => this.session()?.status === 'CLOSED');
  /** Solo se puede dibujar si la sesión está ACTIVE, el canal está conectado y el estado inicial cargó. */
  readonly canDraw = computed<boolean>(
    () =>
      this.session()?.status === 'ACTIVE' &&
      this.connectionState() === 'connected' &&
      this.boardStateReady()
  );

  /** Transform del lienzo según el desplazamiento actual (herramienta "Mover"). */
  readonly boardTransform = computed<string>(
    () => `translate(${this.panX()}px, ${this.panY()}px)`
  );

  /** Muestra el cursor circular del borrador (vista previa del área que se borrará). */
  readonly showEraserCursor = computed<boolean>(
    () => this.tool() === 'ERASER' && this.canDraw() && this.cursorPos() !== null && !this.panning
  );

  /** Los objetos solo se pueden seleccionar/mover con la herramienta Seleccionar y la sesión activa. */
  readonly canSelectObject = computed<boolean>(() => this.tool() === 'SELECT' && this.canDraw());

  /** La reedición de texto existente permanece ligada a la herramienta Texto. */
  readonly canEditText = computed<boolean>(() => this.tool() === 'TEXT' && this.canDraw());

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
    if (this.tool() === 'SELECT') {
      return 'pointer';
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
    this.flushStateSave();
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
          this.boardStateReady.set(false);
          this.queuedRemoteDrawEvents = [];
          this.loadSnapshot();
        } else {
          this.boardStateReady.set(false);
          this.queuedRemoteDrawEvents = [];
          this.realtime.connect(this.sessionId);
          // Tras renderizar el lienzo, centra la vista del workspace en el visor y restaura el
          // estado guardado (trazos + textos) para no perder la pizarra al recargar.
          requestAnimationFrame(() => {
            this.ensureCanvas();
            this.centerPan();
            this.loadBoardState();
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
    if (tool !== 'SELECT') {
      this.clearSelection();
    }
  }

  onColor(event: Event): void {
    this.color.set((event.target as HTMLInputElement).value);
    this.restoreEditorAfterToolbar();
  }

  onStrokeWidth(event: Event): void {
    this.strokeWidth.set(Number((event.target as HTMLInputElement).value));
  }

  onEraserSize(event: Event): void {
    this.eraserSize.set(Number((event.target as HTMLInputElement).value));
  }

  onTextSize(event: Event): void {
    this.textSize.set(Number((event.target as HTMLSelectElement).value));
    this.restoreEditorAfterToolbar();
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
    if (this.tool() === 'SELECT') {
      this.clearSelection();
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
    const start = this.toCanvasPoint(event);
    this.currentStroke = [start];
    this.renderStroke(this.currentStroke, this.activeColor(), this.activeWidth());
    if (this.tool() === 'ERASER') {
      this.eraseTextsAt(start);
    }
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
    // El borrador también elimina los objetos de texto que toca (no solo trazos del lienzo).
    if (this.tool() === 'ERASER') {
      this.eraseTextsAt(point);
    }
  }

  /**
   * Elimina los objetos de texto que el círculo del borrador toca en la posición indicada
   * (coordenadas del workspace) y difunde su eliminación por WebSocket para que el resto de
   * participantes los vean desaparecer. El estado guardado también se actualiza, de modo que al
   * recargar no reaparecen.
   */
  private eraseTextsAt(point: WhiteboardPoint): void {
    const items = this.textItems();
    if (items.length === 0) {
      return;
    }
    const ctx = this.ensureCanvas();
    if (ctx === null) {
      return;
    }
    const radius = this.eraserSize() / 2;
    const hit = items.filter((item) => eraserHitsText(ctx, item, point.x, point.y, radius));
    if (hit.length === 0) {
      return;
    }
    const hitIds = new Set(hit.map((i) => i.id));
    this.textItems.update((list) => list.filter((i) => !hitIds.has(i.id)));
    for (const id of hitIds) {
      this.broadcastTextDelete(id);
    }
    this.scheduleStateSave();
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

  // ─── Texto: editor con formato parcial (ver nota de WebSocket) ─────────────────

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
    this.editingTextId.set(null);
    this.resetFormatStates();
    this.textDraft.set({
      screenX: event.clientX - rect.left,
      screenY: event.clientY - rect.top,
      wx: wp.x,
      wy: wp.y,
    });
    setTimeout(() => {
      const editor = this.textEditorRef()?.nativeElement;
      if (editor) {
        editor.innerHTML = '';
        editor.focus();
      }
    }, 0);
  }

  /**
   * Confirma el texto en edición guardándolo como objeto movible. El contenido del editor
   * contenteditable se convierte en "runs" (fragmentos con su propio negrita/cursiva/subrayado),
   * de modo que el formato parcial se conserva. Los textos se difunden en vivo por WebSocket y se
   * rasterizan al generar la captura final.
   */
  commitText(): void {
    const draft = this.textDraft();
    if (draft === null) {
      return;
    }
    const editor = this.textEditorRef()?.nativeElement ?? null;
    const editingId = this.editingTextId();
    const runs = editor ? parseRuns(editor) : [];
    const plain = runs.map((r) => r.text).join('').trim();

    this.textDraft.set(null);
    this.editingTextId.set(null);
    if (editor) {
      editor.innerHTML = '';
    }

    if (plain === '') {
      // Edición que se dejó vacía: se elimina el texto existente (y se avisa a los alumnos).
      if (editingId !== null) {
        this.textItems.update((items) => items.filter((i) => i.id !== editingId));
        this.broadcastTextDelete(editingId);
        this.scheduleStateSave();
      }
      return;
    }
    if (!this.canDraw()) {
      return;
    }

    const base = { color: this.color(), size: this.textSize(), runs };
    let saved: TextItem;
    if (editingId !== null) {
      saved = { id: editingId, wx: draft.wx, wy: draft.wy, ...base };
      this.textItems.update((items) =>
        items.map((i) => (i.id === editingId ? { ...i, ...base } : i))
      );
    } else {
      saved = { id: localTextId(), wx: draft.wx, wy: draft.wy, ...base };
      this.textItems.update((items) => [...items, saved]);
    }
    // Difunde el texto en vivo para que el alumno lo vea sin recargar y lo guarda en el estado.
    this.broadcastTextUpsert(saved);
    this.scheduleStateSave();
  }

  cancelText(): void {
    // Si se cancela una reedición, el objeto original se conserva sin cambios.
    const editor = this.textEditorRef()?.nativeElement;
    if (editor) {
      editor.innerHTML = '';
    }
    this.textDraft.set(null);
    this.editingTextId.set(null);
  }

  /** Enter confirma el texto (evita el salto de línea del contenteditable). */
  onEditorEnter(event: Event): void {
    event.preventDefault();
    this.commitText();
  }

  /**
   * El editor pierde el foco. Si fue por tocar un control de la toolbar (tamaño/color), NO se
   * confirma el texto: el control aplicará su cambio y se devolverá el foco al editor.
   */
  onEditorBlur(): void {
    if (this.keepEditorOpen) {
      this.keepEditorOpen = false;
      return;
    }
    this.commitText();
  }

  /** mousedown sobre tamaño/color: marca que el editor debe seguir abierto pese al blur. */
  keepEditorFocus(): void {
    if (this.textDraft() !== null) {
      this.keepEditorOpen = true;
    }
  }

  /** Tras aplicar tamaño/color desde la toolbar, devuelve el foco al editor en curso. */
  private restoreEditorAfterToolbar(): void {
    this.keepEditorOpen = false;
    if (this.textDraft() === null) {
      return;
    }
    setTimeout(() => {
      const editor = this.textEditorRef()?.nativeElement;
      if (editor) {
        editor.focus();
        caretToEnd(editor);
      }
    }, 0);
  }

  /** Esc dentro del editor: cancela el texto sin afectar a la pantalla completa. */
  onTextEscape(event: Event): void {
    event.stopPropagation();
    this.cancelText();
  }

  /**
   * Aplica negrita/cursiva/subrayado a la SELECCIÓN actual del editor. Si no hay selección, queda
   * activado para el texto que se escriba a continuación (comportamiento nativo del contenteditable).
   * Se usa `execCommand`: está obsoleto pero es la vía nativa para editar formato sin librerías.
   */
  applyFormat(command: 'bold' | 'italic' | 'underline'): void {
    const editor = this.textEditorRef()?.nativeElement;
    if (this.textDraft() === null || !editor) {
      return;
    }
    editor.focus();
    try {
      document.execCommand(command);
    } catch {
      /* no-op: navegador sin soporte de execCommand */
    }
    this.refreshFormatStates();
  }

  /** Sincroniza el estado activo de los botones B/I/U con el formato de la selección. */
  refreshFormatStates(): void {
    const editor = this.textEditorRef()?.nativeElement;
    if (this.textDraft() === null || !editor || document.activeElement !== editor) {
      return;
    }
    try {
      this.textBold.set(document.queryCommandState('bold'));
      this.textItalic.set(document.queryCommandState('italic'));
      this.textUnderline.set(document.queryCommandState('underline'));
    } catch {
      /* no-op */
    }
  }

  private resetFormatStates(): void {
    this.textBold.set(false);
    this.textItalic.set(false);
    this.textUnderline.set(false);
  }

  // ─── Texto movible: selección, arrastre y reedición ──────────────────────────

  onTextItemPointerDown(item: TextItem, event: PointerEvent): void {
    if (!this.canSelectObject()) {
      return;
    }
    // Evita que el clic llegue al lienzo (crearía un texto nuevo) o inicie el pan.
    event.preventDefault();
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    this.selectedTextId.set(item.id);
    this.draggingTextId.set(item.id);
    this.textDragStart = {
      wx: item.wx,
      wy: item.wy,
      clientX: event.clientX,
      clientY: event.clientY,
    };
  }

  onTextItemPointerMove(event: PointerEvent): void {
    const id = this.draggingTextId();
    if (id === null) {
      return;
    }
    event.preventDefault();
    // El lienzo se muestra a escala 1:1, por lo que el desplazamiento en pantalla equivale al
    // desplazamiento en coordenadas del workspace.
    const dx = event.clientX - this.textDragStart.clientX;
    const dy = event.clientY - this.textDragStart.clientY;
    const item = this.textItems().find((i) => i.id === id);
    if (!item) {
      return;
    }
    const next = this.clampTextPosition(item, this.textDragStart.wx + dx, this.textDragStart.wy + dy);
    const wx = next.wx;
    const wy = next.wy;
    this.textItems.update((items) => items.map((i) => (i.id === id ? { ...i, wx, wy } : i)));
  }

  onTextItemPointerUp(event: PointerEvent): void {
    const id = this.draggingTextId();
    if (id === null) {
      return;
    }
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    this.draggingTextId.set(null);
    // Difunde la nueva posición del texto en vivo y la guarda en el estado del lienzo.
    const moved = this.textItems().find((i) => i.id === id);
    if (moved && (moved.wx !== this.textDragStart.wx || moved.wy !== this.textDragStart.wy)) {
      this.broadcastTextUpsert(moved);
      this.scheduleStateSave();
    }
  }

  /** Doble clic sobre un texto: lo reabre en el editor flotante para cambiar su contenido/estilo. */
  onTextItemDblClick(item: TextItem, event: Event): void {
    if (!this.canEditText()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.commitText();
    this.color.set(item.color);
    this.textSize.set(item.size);
    this.resetFormatStates();
    this.editingTextId.set(item.id);
    this.textDraft.set({
      screenX: this.panX() + item.wx,
      screenY: this.panY() + item.wy,
      wx: item.wx,
      wy: item.wy,
    });
    setTimeout(() => {
      const editor = this.textEditorRef()?.nativeElement;
      if (editor) {
        editor.innerHTML = runsToHtml(item.runs);
        editor.focus();
        caretToEnd(editor);
        this.refreshFormatStates();
      }
    }, 0);
  }

  private clearSelection(): void {
    this.selectedTextId.set(null);
    this.draggingTextId.set(null);
  }

  private clampTextPosition(item: TextItem, wx: number, wy: number): { wx: number; wy: number } {
    const ctx = this.ensureCanvas();
    const width = ctx === null ? 0 : measureTextWidth(ctx, item);
    const maxX = Math.max(0, WORKSPACE_WIDTH - width);
    const maxY = Math.max(0, WORKSPACE_HEIGHT - item.size);
    return {
      wx: Math.round(Math.max(0, Math.min(maxX, wx)) * 100) / 100,
      wy: Math.round(Math.max(0, Math.min(maxY, wy)) * 100) / 100,
    };
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
    this.boardStrokes = [];
    this.clearSelection();
    const clientEventId = this.newEventId();
    this.realtime.sendDraw({ eventType: 'CLEAR', tool: 'CLEAR', clientEventId });
    this.scheduleStateSave();
  }

  // ─── Acciones de sesión ───────────────────────────────────────────────────────

  pause(): void {
    this.busy.set(true);
    this.whiteboardService.pauseSession(this.sessionId).subscribe({
      next: (updated) => {
        this.session.set(updated);
        this.clearSelection();
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
    if (!this.boardStateReady()) {
      this.queuedRemoteDrawEvents.push(event);
      return;
    }
    this.applyRemoteDraw(event);
  }

  private applyRemoteDraw(event: WhiteboardDrawEventResponse): void {
    if (event.clientEventId !== null && this.ownEventIds.has(event.clientEventId)) {
      // Es el eco de un evento propio que ya se pintó localmente.
      this.ownEventIds.delete(event.clientEventId);
      return;
    }
    if (event.eventType === 'CLEAR') {
      this.clearCanvas();
      this.boardStrokes = [];
      this.scheduleStateSave();
      return;
    }
    // Texto de un estudiante (los ecos del propio docente se descartan arriba por clientEventId):
    // se inserta/actualiza o elimina en el lienzo del docente para que lo vea, y se guarda en el
    // estado para que la recarga y la captura final lo conserven.
    if (event.eventType === 'TEXT') {
      this.upsertRemoteText(event);
      this.scheduleStateSave();
      return;
    }
    if (event.eventType === 'TEXT_DELETE') {
      if (event.textId !== null) {
        const id = event.textId;
        if (this.selectedTextId() === id) {
          this.clearSelection();
        }
        this.textItems.update((items) => items.filter((i) => i.id !== id));
        this.scheduleStateSave();
      }
      return;
    }
    const points = (event.points ?? []) as WhiteboardPoint[];
    const isErase = event.eventType === 'ERASE';
    const color = isErase ? BOARD_BACKGROUND : event.color ?? '#000000';
    const width = isErase ? event.eraserSize ?? 24 : event.strokeWidth ?? 4;
    this.renderStroke(points, color, width);
    // Acumula el trazo de otros participantes en el estado para que la captura/recarga lo conserve.
    this.boardStrokes.push({
      eventType: isErase ? 'ERASE' : 'DRAW',
      color: isErase ? null : event.color ?? '#000000',
      strokeWidth: isErase ? null : event.strokeWidth ?? 4,
      eraserSize: isErase ? event.eraserSize ?? 24 : null,
      points,
    });
    this.scheduleStateSave();
  }

  private onControlEvent(event: { eventType: string; status: WhiteboardSessionStatus | null }): void {
    const current = this.session();
    if (current === null) {
      return;
    }
    switch (event.eventType) {
      case 'SESSION_PAUSED':
        this.session.set({ ...current, status: 'PAUSED' });
        this.clearSelection();
        this.showBanner('La sesión fue pausada.', 'warning');
        break;
      case 'SESSION_RESUMED':
        this.session.set({ ...current, status: 'ACTIVE' });
        this.showBanner('La sesión fue reanudada.', 'success');
        break;
      case 'SESSION_CLOSED':
        this.clearSelection();
        this.realtime.disconnect();
        this.reload();
        break;
      case 'INTERACTION_UPDATED':
      case 'PARTICIPANT_PERMISSION_UPDATED':
      case 'PARTICIPANT_JOINED':
        // Un alumno se unió o cambió un permiso: refresca el panel de participantes en vivo.
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
    // Los textos son objetos sobre la pizarra: "Borrar todo" también los retira.
    this.clearSelection();
    this.textItems.set([]);
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
    // Acumula el trazo propio en el estado guardado del lienzo.
    this.boardStrokes.push({
      eventType: isErase ? 'ERASE' : 'DRAW',
      color: isErase ? null : this.color(),
      strokeWidth: isErase ? null : this.strokeWidth(),
      eraserSize: isErase ? this.eraserSize() : null,
      points,
    });
    this.scheduleStateSave();
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

  /**
   * Genera la captura del lienzo (solo la pizarra/workspace), reescalada para un peso razonable.
   * Compone el bitmap de trazos y borrados con los textos colocados (que son objetos overlay), de
   * modo que la captura final incluye trazos, borrados y textos en su posición actual. No captura
   * la barra de herramientas, el panel de participantes ni ningún otro elemento de la interfaz.
   */
  private exportSnapshot(callback: (blob: Blob | null) => void): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) {
      callback(null);
      return;
    }
    // Composición a resolución completa: trazos/borrados (bitmap) + textos encima.
    const composed = document.createElement('canvas');
    composed.width = WORKSPACE_WIDTH;
    composed.height = WORKSPACE_HEIGHT;
    const cctx = composed.getContext('2d');
    if (cctx === null) {
      canvas.toBlob(callback, 'image/png');
      return;
    }
    cctx.drawImage(canvas, 0, 0);
    for (const item of this.textItems()) {
      drawTextItem(cctx, item);
    }

    if (composed.width <= SNAPSHOT_MAX_WIDTH) {
      composed.toBlob(callback, 'image/png');
      return;
    }
    const scale = SNAPSHOT_MAX_WIDTH / composed.width;
    const off = document.createElement('canvas');
    off.width = Math.round(composed.width * scale);
    off.height = Math.round(composed.height * scale);
    const octx = off.getContext('2d');
    if (octx === null) {
      composed.toBlob(callback, 'image/png');
      return;
    }
    octx.fillStyle = BOARD_BACKGROUND;
    octx.fillRect(0, 0, off.width, off.height);
    octx.drawImage(composed, 0, 0, off.width, off.height);
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

  // ─── Texto en vivo (difusión por WebSocket) ───────────────────────────────────

  /** Difunde un objeto de texto (crear/editar/mover) para que el alumno lo vea en vivo. */
  private broadcastTextUpsert(item: TextItem): void {
    const clientEventId = this.newEventId();
    this.realtime.sendDraw({
      eventType: 'TEXT',
      tool: 'TEXT',
      textId: item.id,
      color: item.color,
      fontSize: item.size,
      runs: item.runs as readonly WhiteboardTextRun[],
      points: [{ x: item.wx, y: item.wy }],
      clientEventId,
    });
  }

  /** Difunde la eliminación de un objeto de texto por su identificador. */
  private broadcastTextDelete(textId: string): void {
    const clientEventId = this.newEventId();
    this.realtime.sendDraw({ eventType: 'TEXT_DELETE', tool: 'TEXT', textId, clientEventId });
  }

  /** Inserta o actualiza en el lienzo del docente un texto recibido de un estudiante. */
  private upsertRemoteText(event: WhiteboardDrawEventResponse): void {
    const point = event.points?.[0];
    if (event.textId === null || !point || event.runs === null) {
      return;
    }
    const item: TextItem = {
      id: event.textId,
      wx: point.x,
      wy: point.y,
      color: event.color ?? '#1a1a16',
      size: event.fontSize ?? 32,
      runs: (event.runs ?? []) as readonly WhiteboardTextRun[],
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

  // ─── Estado actual del lienzo (persistencia para recarga / unión tardía) ───────

  /** Programa el guardado debounced del estado del lienzo (trazos + textos) en el backend. */
  private scheduleStateSave(): void {
    if (this.stateSaveTimer !== null) {
      clearTimeout(this.stateSaveTimer);
    }
    this.stateSaveTimer = setTimeout(
      () => this.flushStateSave(),
      TeacherWhiteboardEditorComponent.STATE_SAVE_DEBOUNCE_MS
    );
  }

  /** Guarda inmediatamente el estado pendiente (al destruir el componente o al vencer el debounce). */
  private flushStateSave(): void {
    if (this.stateSaveTimer !== null) {
      clearTimeout(this.stateSaveTimer);
      this.stateSaveTimer = null;
    }
    const session = this.session();
    if (session === null || session.status === 'CLOSED') {
      return;
    }
    const snapshot: WhiteboardBoardStateSnapshot = {
      v: 1,
      strokes: this.boardStrokes,
      texts: this.textItems().map((t) => ({
        id: t.id,
        wx: t.wx,
        wy: t.wy,
        color: t.color,
        size: t.size,
        runs: t.runs,
      })),
    };
    let json: string;
    try {
      json = JSON.stringify(snapshot);
    } catch {
      return;
    }
    // No reventar el tope del backend (~2 MB): si se excede, se omite el guardado (se reportará).
    if (json.length > 1_900_000) {
      return;
    }
    this.whiteboardService.saveBoardState(this.sessionId, json).subscribe({
      next: () => {
        /* estado guardado */
      },
      error: () => {
        /* silencioso: el dibujo en vivo no debe interrumpirse por un fallo al guardar el estado */
      },
    });
  }

  /** Restaura el estado guardado del lienzo (trazos + textos) al entrar o recargar. */
  private loadBoardState(): void {
    this.whiteboardService.getBoardState(this.sessionId).subscribe({
      next: (state) => {
        if (state.stateJson === null || state.stateJson.trim() === '') {
          this.finishBoardStateLoad();
          return;
        }
        let snapshot: WhiteboardBoardStateSnapshot;
        try {
          snapshot = JSON.parse(state.stateJson) as WhiteboardBoardStateSnapshot;
        } catch {
          this.finishBoardStateLoad();
          return;
        }
        this.replayBoardState(snapshot);
        this.finishBoardStateLoad();
      },
      error: () => {
        this.finishBoardStateLoad();
        /* silencioso: sin estado previo el docente sigue dibujando con normalidad */
      },
    });
  }

  /** Pinta los trazos y restaura los textos de una instantánea del lienzo. */
  private replayBoardState(snapshot: WhiteboardBoardStateSnapshot): void {
    const restored = (Array.isArray(snapshot.strokes) ? snapshot.strokes : []).map((s) => ({
      ...s,
      points: [...s.points],
    }));
    // Conserva los trazos en vivo que pudieran haber llegado mientras se cargaba el estado: el
    // estado guardado es previo a la carga, así que no se solapan; se vuelven a pintar tras limpiar.
    const pending = this.boardStrokes;
    const pendingTexts = this.textItems();
    this.clearCanvas();
    this.boardStrokes = [...restored, ...pending];
    for (const stroke of this.boardStrokes) {
      const isErase = stroke.eventType === 'ERASE';
      const color = isErase ? BOARD_BACKGROUND : stroke.color ?? '#000000';
      const width = isErase ? stroke.eraserSize ?? 24 : stroke.strokeWidth ?? 4;
      this.renderStroke(stroke.points, color, width);
    }
    const texts = Array.isArray(snapshot.texts) ? snapshot.texts : [];
    const restoredTexts = texts.map((t) => ({
      id: t.id,
      wx: t.wx,
      wy: t.wy,
      color: t.color,
      size: t.size,
      runs: t.runs,
    }));
    const mergedTexts = [...restoredTexts];
    for (const pendingText of pendingTexts) {
      const index = mergedTexts.findIndex((item) => item.id === pendingText.id);
      if (index === -1) {
        mergedTexts.push(pendingText);
      } else {
        mergedTexts[index] = pendingText;
      }
    }
    this.textItems.set(mergedTexts);
  }

  private finishBoardStateLoad(): void {
    this.boardStateReady.set(true);
    const queued = this.queuedRemoteDrawEvents;
    this.queuedRemoteDrawEvents = [];
    for (const event of queued) {
      this.applyRemoteDraw(event);
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
