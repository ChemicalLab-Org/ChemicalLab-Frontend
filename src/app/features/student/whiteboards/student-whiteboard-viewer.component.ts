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
  WhiteboardShapeType,
  WhiteboardStrokeRecord,
  WhiteboardStudentSessionResponse,
  WhiteboardTextRun,
} from '../../../shared/models';
import {
  WhiteboardShapeObject,
  arrowHeadPoints,
  eraserHitsShape,
  isShapeTooSmall,
  localShapeId,
  moveShape,
  normalizedShapeBox,
} from '../../../shared/whiteboard/whiteboard-shape.util';
import {
  WhiteboardTextObject,
  caretToEnd,
  eraserHitsText,
  localTextId,
  measureTextWidth,
  parseRuns,
  runsToHtml,
} from '../../../shared/whiteboard/whiteboard-text.util';

/**
 * Mismo espacio de coordenadas (workspace) que el editor docente, para que los trazos que llegan
 * por WebSocket se rendericen en la misma posición que dibujó el docente. El visor muestra solo una
 * parte y el alumno se desplaza con la herramienta «Mover».
 */
const WORKSPACE_WIDTH = 3200;
const WORKSPACE_HEIGHT = 2000;
const BOARD_BACKGROUND = '#ffffff';
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;
const VIEW_FIT_PADDING = 48;
// Deshacer/rehacer queda desactivado temporalmente hasta estabilizar la sincronizacion colaborativa.
const UNDO_REDO_ENABLED = false;

const PEN_CURSOR =
  'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyOCIgaGVpZ2h0PSIyOCIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBkPSJNMyAxNy4yNVYyMWgzLjc1TDE3LjgxIDkuOTRsLTMuNzUtMy43NUwzIDE3LjI1eiIgZmlsbD0iIzFhMWExNiIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjEuMiIvPjxwYXRoIGQ9Ik0yMC43MSA3LjA0YTEgMSAwIDAgMCAwLTEuNDFsLTIuMzQtMi4zNGExIDEgMCAwIDAtMS40MSAwbC0xLjgzIDEuODMgMy43NSAzLjc1IDEuODMtMS44M3oiIGZpbGw9IiMxZDllNzUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLXdpZHRoPSIxLjIiLz48L3N2Zz4=") 3 25, crosshair';

/**
 * Herramientas del estudiante: plumón, borrador, texto y desplazamiento. «Borrar todo» es solo
 * docente. El texto del estudiante tiene el mismo comportamiento que el docente (formato parcial
 * negrita/cursiva/subrayado, mover, reeditar) reutilizando la lógica compartida
 * ({@link ../../../shared/whiteboard/whiteboard-text.util}), y se difunde por WebSocket.
 */
type ShapeTool = WhiteboardShapeType;
type StudentTool = 'PEN' | 'ERASER' | 'TEXT' | 'SELECT' | 'MOVE' | ShapeTool;

/** Texto en edición (editor flotante contenteditable sobre el visor). */
interface TextDraft {
  readonly wx: number;
  readonly wy: number;
}

/** Objeto de texto sobre la pizarra (propio del alumno o recibido del docente/otros). */
type DisplayTextItem = WhiteboardTextObject;
type DisplayShapeItem = WhiteboardShapeObject;
type UndoableObjectType = 'TEXT' | 'SHAPE' | 'STROKE';
type UndoableObject = DisplayTextItem | DisplayShapeItem | WhiteboardStrokeRecord;
type WhiteboardUndoActionType =
  | 'CREATE_OBJECT'
  | 'UPDATE_OBJECT'
  | 'MOVE_OBJECT'
  | 'DELETE_OBJECT'
  | 'CREATE_STROKE'
  | 'ERASE_STROKE';

interface WhiteboardUndoAction {
  readonly id: string;
  readonly actorId: number | string;
  readonly type: WhiteboardUndoActionType;
  readonly objectId: string;
  readonly objectType: UndoableObjectType;
  readonly before: UndoableObject | null;
  readonly after: UndoableObject | null;
  readonly strokeIndex?: number;
  readonly gestureId?: string;
  readonly timestamp: number;
}

const UNDO_STACK_LIMIT = 80;

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
                    <button
                      type="button"
                      class="tool-btn"
                      [class.tool-btn--active]="tool() === 'TEXT'"
                      title="Texto"
                      (click)="selectTool('TEXT')"
                    >
                      <span class="material-icons">title</span>
                    </button>
                    <button
                      type="button"
                      class="tool-btn"
                      [class.tool-btn--active]="tool() === 'RECTANGLE'"
                      title="Rectangulo"
                      (click)="selectTool('RECTANGLE')"
                    >
                      <span class="material-icons">crop_square</span>
                    </button>
                    <button
                      type="button"
                      class="tool-btn"
                      [class.tool-btn--active]="tool() === 'CIRCLE'"
                      title="Circulo"
                      (click)="selectTool('CIRCLE')"
                    >
                      <span class="material-icons">radio_button_unchecked</span>
                    </button>
                    <button
                      type="button"
                      class="tool-btn"
                      [class.tool-btn--active]="tool() === 'LINE'"
                      title="Linea"
                      (click)="selectTool('LINE')"
                    >
                      <span class="material-icons">horizontal_rule</span>
                    </button>
                    <button
                      type="button"
                      class="tool-btn"
                      [class.tool-btn--active]="tool() === 'ARROW'"
                      title="Flecha"
                      (click)="selectTool('ARROW')"
                    >
                      <span class="material-icons">arrow_forward</span>
                    </button>
                    <button
                      type="button"
                      class="tool-btn"
                      [class.tool-btn--active]="tool() === 'SELECT'"
                      title="Seleccionar"
                      (click)="selectTool('SELECT')"
                    >
                      <span class="material-icons">near_me</span>
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
                  <div class="zoom-control" aria-label="Zoom de pizarra">
                    <button
                      type="button"
                      class="tool-btn"
                      [disabled]="!canZoomOut()"
                      title="Alejar"
                      (click)="zoomOut()"
                    >
                      <span class="material-icons">remove</span>
                    </button>
                    <span class="zoom-control__value">{{ zoomPercent() }}%</span>
                    <button
                      type="button"
                      class="tool-btn"
                      [disabled]="!canZoomIn()"
                      title="Acercar"
                      (click)="zoomIn()"
                    >
                      <span class="material-icons">add</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    class="tool-btn"
                    title="Ajustar a pantalla"
                    (click)="fitView()"
                  >
                    <span class="material-icons">aspect_ratio</span>
                  </button>
                  <button
                    type="button"
                    class="tool-btn"
                    title="Centrar vista"
                    (click)="centerView()"
                  >
                    <span class="material-icons">center_focus_strong</span>
                  </button>
                  <button
                    type="button"
                    class="tool-btn"
                    title="Resetear vista"
                    (click)="resetView()"
                  >
                    <span class="material-icons">refresh</span>
                  </button>
                  @if (undoRedoEnabled) {
                    <button
                      type="button"
                      class="tool-btn"
                      [disabled]="!canUndo()"
                      title="Deshacer (Ctrl+Z)"
                      (click)="undoWhiteboardAction()"
                    >
                      <span class="material-icons">undo</span>
                    </button>
                    <button
                      type="button"
                      class="tool-btn"
                      [disabled]="!canRedo()"
                      title="Rehacer (Ctrl+Y / Ctrl+Shift+Z)"
                      (click)="redoWhiteboardAction()"
                    >
                      <span class="material-icons">redo</span>
                    </button>
                  }
                  <button
                    type="button"
                    class="tool-btn"
                    [class.tool-btn--active]="fullscreen()"
                    [title]="fullscreen() ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa'"
                    (click)="toggleFullscreen()"
                  >
                    <span class="material-icons">{{ fullscreen() ? 'fullscreen_exit' : 'fullscreen' }}</span>
                  </button>
                </div>

                @if (canDraw() && tool() !== 'MOVE' && tool() !== 'SELECT') {
                  <div class="toolbar__group">
                    <label class="tool-field" title="Color">
                      <span class="material-icons">palette</span>
                      <input
                        type="color"
                        [value]="color()"
                        (mousedown)="keepEditorFocus()"
                        (input)="onColor($event)"
                      />
                    </label>

                    @if (tool() === 'PEN' || isShapeTool(tool())) {
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
                    } @else if (tool() === 'TEXT') {
                      <label class="tool-field" title="Tamaño del texto">
                        <span class="material-icons">format_size</span>
                        <select
                          class="select tool-field__select"
                          [value]="textSize()"
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

                <svg
                  class="shape-layer"
                  [style.transform]="boardTransform()"
                  [attr.viewBox]="'0 0 ' + workspaceWidth + ' ' + workspaceHeight"
                  aria-hidden="true"
                >
                  @for (shape of shapeItems(); track shape.id) {
                    <g
                      class="shape-item"
                      [class.shape-item--interactive]="canSelectObject()"
                      [class.shape-item--selected]="selectedShapeId() === shape.id"
                      [class.shape-item--dragging]="draggingShapeId() === shape.id"
                      (pointerdown)="onShapePointerDown(shape, $event)"
                      (pointermove)="onShapePointerMove($event)"
                      (pointerup)="onShapePointerUp($event)"
                      (pointercancel)="onShapePointerUp($event)"
                    >
                      @if (shape.type === 'RECTANGLE') {
                        <rect
                          [attr.x]="shapeBox(shape).x"
                          [attr.y]="shapeBox(shape).y"
                          [attr.width]="shapeBox(shape).width"
                          [attr.height]="shapeBox(shape).height"
                          [attr.stroke]="shape.color"
                          [attr.stroke-width]="shape.strokeWidth"
                        />
                      } @else if (shape.type === 'CIRCLE') {
                        <ellipse
                          [attr.cx]="shapeBox(shape).x + shapeBox(shape).width / 2"
                          [attr.cy]="shapeBox(shape).y + shapeBox(shape).height / 2"
                          [attr.rx]="shapeBox(shape).width / 2"
                          [attr.ry]="shapeBox(shape).height / 2"
                          [attr.stroke]="shape.color"
                          [attr.stroke-width]="shape.strokeWidth"
                        />
                      } @else {
                        <line
                          class="shape-hit"
                          [attr.x1]="shape.x1"
                          [attr.y1]="shape.y1"
                          [attr.x2]="shape.x2"
                          [attr.y2]="shape.y2"
                          [attr.stroke-width]="shapeHitWidth(shape)"
                        />
                        <line
                          [attr.x1]="shape.x1"
                          [attr.y1]="shape.y1"
                          [attr.x2]="shape.x2"
                          [attr.y2]="shape.y2"
                          [attr.stroke]="shape.color"
                          [attr.stroke-width]="shape.strokeWidth"
                        />
                        @if (shape.type === 'ARROW') {
                          <polygon [attr.points]="shapeArrowPoints(shape)" [attr.fill]="shape.color" />
                        }
                      }
                    </g>
                  }

                  @if (shapePreview(); as preview) {
                    <g class="shape-preview">
                      @if (preview.type === 'RECTANGLE') {
                        <rect
                          [attr.x]="shapeBox(preview).x"
                          [attr.y]="shapeBox(preview).y"
                          [attr.width]="shapeBox(preview).width"
                          [attr.height]="shapeBox(preview).height"
                          [attr.stroke]="preview.color"
                          [attr.stroke-width]="preview.strokeWidth"
                        />
                      } @else if (preview.type === 'CIRCLE') {
                        <ellipse
                          [attr.cx]="shapeBox(preview).x + shapeBox(preview).width / 2"
                          [attr.cy]="shapeBox(preview).y + shapeBox(preview).height / 2"
                          [attr.rx]="shapeBox(preview).width / 2"
                          [attr.ry]="shapeBox(preview).height / 2"
                          [attr.stroke]="preview.color"
                          [attr.stroke-width]="preview.strokeWidth"
                        />
                      } @else {
                        <line
                          [attr.x1]="preview.x1"
                          [attr.y1]="preview.y1"
                          [attr.x2]="preview.x2"
                          [attr.y2]="preview.y2"
                          [attr.stroke]="preview.color"
                          [attr.stroke-width]="preview.strokeWidth"
                        />
                        @if (preview.type === 'ARROW') {
                          <polygon [attr.points]="shapeArrowPoints(preview)" [attr.fill]="preview.color" />
                        }
                      }
                    </g>
                  }
                </svg>

                @if (showEraserCursor()) {
                  <div
                    class="eraser-cursor"
                    [style.left.px]="cursorPos()!.x"
                    [style.top.px]="cursorPos()!.y"
                    [style.width.px]="eraserSize() * zoomLevel()"
                    [style.height.px]="eraserSize() * zoomLevel()"
                  ></div>
                }

                <!-- Textos sobre la pizarra (del alumno, del docente o de otros): se posicionan en
                     coordenadas del workspace + el pan. Con permiso, Seleccionar los mueve y Texto
                     permite crear/reeditar; si no, solo se visualizan. -->
                @for (item of textItems(); track item.id) {
                  @if (editingTextId() !== item.id) {
                    <div
                      class="text-item"
                      [class.text-item--editable]="canSelectObject() || canEditText()"
                      [class.text-item--selected]="selectedTextId() === item.id"
                      [class.text-item--dragging]="draggingTextId() === item.id"
                      [class.text-item--text-mode]="canEditText()"
                      [style.left.px]="toScreenX(item.wx)"
                      [style.top.px]="toScreenY(item.wy)"
                      [style.color]="item.color"
                      [style.font-size.px]="item.size * zoomLevel()"
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
                  <!-- Editor temporal contenteditable: permite seleccionar partes del texto y aplicar
                       negrita/cursiva/subrayado solo a la selección (execCommand). Al confirmar, su
                       contenido se convierte en runs con estilo propio y se difunde por WebSocket. -->
                  <div
                    #textEditor
                    class="text-input"
                    contenteditable="true"
                    data-placeholder="Escribe y pulsa Enter…"
                    [style.left.px]="toScreenX(draft.wx)"
                    [style.top.px]="toScreenY(draft.wy)"
                    [style.color]="color()"
                    [style.font-size.px]="textSize() * zoomLevel()"
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
  readonly workspaceWidth = WORKSPACE_WIDTH;
  readonly workspaceHeight = WORKSPACE_HEIGHT;
  readonly undoRedoEnabled = UNDO_REDO_ENABLED;

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('boardCanvas');
  private readonly wrapRef = viewChild<ElementRef<HTMLDivElement>>('canvasWrap');
  private readonly textEditorRef = viewChild<ElementRef<HTMLDivElement>>('textEditor');

  private sessionId = 0;
  private ctx: CanvasRenderingContext2D | null = null;
  private drawing = false;
  private currentStroke: WhiteboardPoint[] = [];
  private currentEraserGestureId: string | null = null;
  private shapeStart: WhiteboardPoint | null = null;
  /** clientEventId de eventos propios para no re-renderizar el eco que vuelve por el canal. */
  private readonly ownEventIds = new Set<string>();
  private readonly boardStateReady = signal<boolean>(false);
  private queuedRemoteDrawEvents: WhiteboardDrawEventResponse[] = [];
  private boardStrokes: WhiteboardStrokeRecord[] = [];
  private canInteractBeforePause: boolean | null = null;

  // Desplazamiento (pan) del lienzo dentro del visor.
  private panning = false;
  private panStart = { x: 0, y: 0, px: 0, py: 0 };
  readonly panX = signal<number>(0);
  readonly panY = signal<number>(0);
  readonly zoomLevel = signal<number>(1);
  readonly zoomPercent = computed<number>(() => Math.round(this.zoomLevel() * 100));
  readonly canZoomOut = computed<boolean>(() => this.zoomLevel() > ZOOM_MIN);
  readonly canZoomIn = computed<boolean>(() => this.zoomLevel() < ZOOM_MAX);

  readonly cursorPos = signal<{ x: number; y: number } | null>(null);

  /** Textos sobre la pizarra (propios del alumno o recibidos del docente/otros estudiantes). */
  readonly textItems = signal<DisplayTextItem[]>([]);
  /** id del texto que se está reeditando (se oculta su objeto mientras se edita). */
  readonly editingTextId = signal<string | null>(null);
  /** id del texto seleccionado localmente. No se persiste ni se difunde. */
  readonly selectedTextId = signal<string | null>(null);
  /** id del texto que se está arrastrando, o null. */
  readonly draggingTextId = signal<string | null>(null);
  private textDragStart = { wx: 0, wy: 0, clientX: 0, clientY: 0 };
  readonly shapeItems = signal<DisplayShapeItem[]>([]);
  readonly shapePreview = signal<DisplayShapeItem | null>(null);
  readonly selectedShapeId = signal<string | null>(null);
  readonly draggingShapeId = signal<string | null>(null);
  private shapeDragStart: { shape: DisplayShapeItem | null; clientX: number; clientY: number } = {
    shape: null,
    clientX: 0,
    clientY: 0,
  };
  /** Evita que el editor se confirme al tocar controles de tamaño/color (que roban el foco). */
  private keepEditorOpen = false;

  // Estado activo de los botones B/I/U: refleja el formato de la selección actual del editor.
  readonly textBold = signal<boolean>(false);
  readonly textItalic = signal<boolean>(false);
  readonly textUnderline = signal<boolean>(false);

  readonly fullscreen = signal<boolean>(false);
  private readonly undoStack = signal<WhiteboardUndoAction[]>([]);
  private readonly redoStack = signal<WhiteboardUndoAction[]>([]);

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
  readonly textSize = signal<number>(28);
  readonly textSizes: readonly number[] = [12, 14, 16, 18, 24, 32, 48];

  /** Texto del alumno en edición (input flotante). */
  readonly textDraft = signal<TextDraft | null>(null);

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
      this.connectionState() === 'connected' &&
      this.boardStateReady()
  );

  readonly boardTransform = computed<string>(
    () => `translate(${this.panX()}px, ${this.panY()}px) scale(${this.zoomLevel()})`
  );

  readonly showEraserCursor = computed<boolean>(
    () => this.tool() === 'ERASER' && this.canDraw() && this.cursorPos() !== null && !this.panning
  );

  /** Los objetos solo se pueden seleccionar/mover con la herramienta Seleccionar y permiso efectivo. */
  readonly canSelectObject = computed<boolean>(() => this.tool() === 'SELECT' && this.canDraw());

  /** La reedición de texto existente permanece ligada a la herramienta Texto. */
  readonly canEditText = computed<boolean>(() => this.tool() === 'TEXT' && this.canDraw());
  readonly canUndo = computed<boolean>(
    () => this.undoRedoEnabled && this.canDraw() && this.textDraft() === null && this.undoStack().length > 0
  );
  readonly canRedo = computed<boolean>(
    () => this.undoRedoEnabled && this.canDraw() && this.textDraft() === null && this.redoStack().length > 0
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
    if (this.tool() === 'SELECT') {
      return 'pointer';
    }
    if (this.tool() === 'TEXT') {
      return 'text';
    }
    if (this.isShapeTool(this.tool())) {
      return 'crosshair';
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
      this.boardStateReady.set(false);
      this.queuedRemoteDrawEvents = [];
      return;
    }
    this.boardStateReady.set(false);
    this.queuedRemoteDrawEvents = [];
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
        /* silencioso: sin estado previo el alumno ve solo los eventos nuevos */
      },
    });
  }

  /** Pinta los trazos y muestra los textos de una instantánea del lienzo. */
  private replayBoardState(snapshot: WhiteboardBoardStateSnapshot): void {
    this.clearCanvas();
    this.textItems.set([]);
    this.shapeItems.set([]);
    const strokes = Array.isArray(snapshot.strokes) ? snapshot.strokes : [];
    this.boardStrokes = strokes.map((stroke) => ({
      ...stroke,
      points: [...stroke.points],
    }));
    for (const stroke of this.boardStrokes) {
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
    const shapes = Array.isArray(snapshot.shapes) ? snapshot.shapes : [];
    if (shapes.length > 0) {
      this.shapeItems.set(
        shapes.map((shape) => ({
          id: shape.id,
          type: shape.type,
          x1: shape.x1,
          y1: shape.y1,
          x2: shape.x2,
          y2: shape.y2,
          color: shape.color,
          strokeWidth: shape.strokeWidth,
        }))
      );
    }
  }

  private finishBoardStateLoad(): void {
    this.boardStateReady.set(true);
    const queued = this.queuedRemoteDrawEvents;
    this.queuedRemoteDrawEvents = [];
    for (const event of queued) {
      this.applyRemoteDraw(event);
    }
  }

  /** Re-consulta el detalle para recalcular el permiso efectivo tras un cambio de interacción. */
  private refreshDetail(statusOverride: WhiteboardSessionStatus | null = null): void {
    this.whiteboardService.getSessionDetail(this.sessionId).subscribe({
      next: (detail) => {
        this.session.set(this.mergeSessionDetail(detail, statusOverride));
        // Si perdió el permiso o se pausó, vuelve a «Mover» para no dejar una herramienta inválida.
        if (!this.canDraw() && this.tool() !== 'MOVE') {
          this.cancelText();
          this.cancelShapePreview();
          this.clearSelection();
          this.tool.set('MOVE');
        }
      },
      error: () => {
        /* silencioso: el siguiente evento o el botón de recarga lo resolverán */
      },
    });
  }

  // ─── Herramientas ───────────────────────────────────────────────────────────

  private mergeSessionDetail(
    detail: WhiteboardStudentSessionResponse,
    statusOverride: WhiteboardSessionStatus | null
  ): WhiteboardStudentSessionResponse {
    if (statusOverride !== 'ACTIVE') {
      return detail;
    }
    const fallbackCanInteract =
      this.canInteractBeforePause ?? this.session()?.canInteract ?? detail.canInteract;
    const canInteract = detail.status === 'PAUSED' ? fallbackCanInteract : detail.canInteract;
    return { ...detail, status: 'ACTIVE', canInteract };
  }

  selectTool(tool: StudentTool): void {
    if (tool !== 'MOVE' && !this.canDraw()) {
      return;
    }
    if (this.tool() === 'TEXT' && tool !== 'TEXT') {
      this.commitText();
    }
    if (this.tool() !== tool) {
      this.cancelShapePreview();
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

  // ─── Texto: editor con formato parcial (igual que el docente, vía util compartido) ─────

  /** Abre el editor contenteditable en la posición indicada del lienzo. */
  private placeText(event: PointerEvent): void {
    if (!this.canDraw()) {
      return;
    }
    // Si ya había un texto en edición, confírmalo antes de abrir otro.
    this.commitText();
    const wp = this.toCanvasPoint(event);
    this.editingTextId.set(null);
    this.resetFormatStates();
    this.textDraft.set({
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
   * contenteditable se convierte en runs (fragmentos con su propio negrita/cursiva/subrayado),
   * conservando el formato parcial, y se difunde por WebSocket.
   */
  commitText(): void {
    const draft = this.textDraft();
    if (draft === null) {
      return;
    }
    const editor = this.textEditorRef()?.nativeElement ?? null;
    const editingId = this.editingTextId();
    const beforeEdit = editingId !== null ? this.textItems().find((item) => item.id === editingId) ?? null : null;
    const runs = editor ? parseRuns(editor) : [];
    const plain = runs.map((r) => r.text).join('').trim();

    this.textDraft.set(null);
    this.editingTextId.set(null);
    if (editor) {
      editor.innerHTML = '';
    }

    if (plain === '') {
      // Edición que se dejó vacía: se elimina el texto existente (y se avisa a los demás).
      if (editingId !== null && beforeEdit !== null) {
        this.textItems.update((items) => items.filter((i) => i.id !== editingId));
        this.recordUndoAction({
          type: 'DELETE_OBJECT',
          objectId: editingId,
          objectType: 'TEXT',
          before: this.cloneTextItem(beforeEdit),
          after: null,
        });
        this.broadcastTextDelete(editingId);
      }
      return;
    }
    if (!this.canDraw()) {
      return;
    }

    const base = { color: this.color(), size: this.textSize(), runs };
    let saved: DisplayTextItem;
    if (editingId !== null) {
      saved = { id: editingId, wx: draft.wx, wy: draft.wy, ...base };
      this.textItems.update((items) => items.map((i) => (i.id === editingId ? saved : i)));
      if (beforeEdit !== null && !this.sameObject(beforeEdit, saved)) {
        this.recordUndoAction({
          type: 'UPDATE_OBJECT',
          objectId: saved.id,
          objectType: 'TEXT',
          before: this.cloneTextItem(beforeEdit),
          after: this.cloneTextItem(saved),
        });
      }
    } else {
      saved = { id: localTextId(), wx: draft.wx, wy: draft.wy, ...base };
      this.textItems.update((items) => [...items, saved]);
      this.recordUndoAction({
        type: 'CREATE_OBJECT',
        objectId: saved.id,
        objectType: 'TEXT',
        before: null,
        after: this.cloneTextItem(saved),
      });
    }
    this.broadcastTextUpsert(saved);
  }

  cancelText(): void {
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

  /** Esc dentro del editor: cancela el texto sin afectar a la pantalla completa. */
  onTextEscape(event: Event): void {
    event.stopPropagation();
    this.cancelText();
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

  /**
   * Aplica negrita/cursiva/subrayado a la SELECCIÓN actual del editor (formato parcial). Usa
   * `execCommand`: obsoleto pero es la vía nativa para editar formato sin librerías.
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

  // ─── Texto movible: arrastre y reedición ──────────────────────────────────────

  onTextItemPointerDown(item: DisplayTextItem, event: PointerEvent): void {
    if (this.canEditText()) {
      event.preventDefault();
      event.stopPropagation();
      this.beginTextEdit(item);
      return;
    }
    if (!this.canSelectObject()) {
      return;
    }
    // Evita que el clic llegue al lienzo (crearía un texto nuevo) o inicie el pan.
    event.preventDefault();
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    this.selectedTextId.set(item.id);
    this.draggingTextId.set(item.id);
    this.textDragStart = { wx: item.wx, wy: item.wy, clientX: event.clientX, clientY: event.clientY };
  }

  onTextItemPointerMove(event: PointerEvent): void {
    const id = this.draggingTextId();
    if (id === null) {
      return;
    }
    event.preventDefault();
    const dx = (event.clientX - this.textDragStart.clientX) / this.zoomLevel();
    const dy = (event.clientY - this.textDragStart.clientY) / this.zoomLevel();
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
    // Difunde la nueva posición para que el docente y los demás la vean (manteniendo el formato).
    const moved = this.textItems().find((i) => i.id === id);
    if (moved && (moved.wx !== this.textDragStart.wx || moved.wy !== this.textDragStart.wy)) {
      this.recordUndoAction({
        type: 'MOVE_OBJECT',
        objectId: moved.id,
        objectType: 'TEXT',
        before: this.cloneTextItem({ ...moved, wx: this.textDragStart.wx, wy: this.textDragStart.wy }),
        after: this.cloneTextItem(moved),
      });
      this.broadcastTextUpsert(moved);
    }
  }

  /** Doble clic sobre un texto: lo reabre en el editor para cambiar su contenido/estilo. */
  onTextItemDblClick(item: DisplayTextItem, event: Event): void {
    if (!this.canEditText()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.beginTextEdit(item);
  }

  private beginTextEdit(item: DisplayTextItem): void {
    this.commitText();
    this.clearSelection();
    this.color.set(item.color);
    this.textSize.set(item.size);
    this.resetFormatStates();
    this.editingTextId.set(item.id);
    this.textDraft.set({
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

  /** Difunde un objeto de texto del alumno para que el docente y los demás lo vean en vivo. */
  private clearSelection(): void {
    this.selectedTextId.set(null);
    this.draggingTextId.set(null);
    this.selectedShapeId.set(null);
    this.draggingShapeId.set(null);
    this.shapeDragStart = { shape: null, clientX: 0, clientY: 0 };
  }

  private deleteSelectedObject(): boolean {
    if (this.deleteSelectedText()) {
      return true;
    }
    return this.deleteSelectedShape();
  }

  private deleteSelectedText(): boolean {
    const id = this.selectedTextId();
    if (id === null || !this.canDraw()) {
      return false;
    }
    const item = this.textItems().find((current) => current.id === id) ?? null;
    if (item === null) {
      this.clearSelection();
      return false;
    }
    this.textItems.update((items) => items.filter((item) => item.id !== id));
    this.clearSelection();
    this.recordUndoAction({
      type: 'DELETE_OBJECT',
      objectId: id,
      objectType: 'TEXT',
      before: this.cloneTextItem(item),
      after: null,
    });
    this.broadcastTextDelete(id);
    return true;
  }

  private deleteSelectedShape(): boolean {
    const id = this.selectedShapeId();
    if (id === null || !this.canDraw()) {
      return false;
    }
    const shape = this.shapeItems().find((current) => current.id === id) ?? null;
    if (shape === null) {
      this.clearSelection();
      return false;
    }
    this.shapeItems.update((items) => items.filter((shape) => shape.id !== id));
    this.clearSelection();
    this.recordUndoAction({
      type: 'DELETE_OBJECT',
      objectId: id,
      objectType: 'SHAPE',
      before: this.cloneShapeItem(shape),
      after: null,
    });
    this.broadcastShapeDelete(id);
    return true;
  }

  private clampTextPosition(
    item: DisplayTextItem,
    wx: number,
    wy: number
  ): { wx: number; wy: number } {
    const ctx = this.ensureCanvas();
    const width = ctx === null ? 0 : measureTextWidth(ctx, item);
    const maxX = Math.max(0, WORKSPACE_WIDTH - width);
    const maxY = Math.max(0, WORKSPACE_HEIGHT - item.size);
    return {
      wx: Math.round(Math.max(0, Math.min(maxX, wx)) * 100) / 100,
      wy: Math.round(Math.max(0, Math.min(maxY, wy)) * 100) / 100,
    };
  }

  private broadcastTextUpsert(item: DisplayTextItem): void {
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

  private startShape(event: PointerEvent, type: ShapeTool): void {
    event.preventDefault();
    (event.target as HTMLCanvasElement).setPointerCapture?.(event.pointerId);
    const start = this.toCanvasPoint(event);
    this.drawing = true;
    this.shapeStart = start;
    this.shapePreview.set({
      id: localShapeId(),
      type,
      x1: start.x,
      y1: start.y,
      x2: start.x,
      y2: start.y,
      color: this.color(),
      strokeWidth: this.strokeWidth(),
    });
  }

  private updateShapePreview(point: WhiteboardPoint): void {
    const preview = this.shapePreview();
    if (preview === null) {
      return;
    }
    this.shapePreview.set({ ...preview, x2: point.x, y2: point.y });
  }

  private cancelShapePreview(): void {
    this.shapeStart = null;
    this.shapePreview.set(null);
  }

  onShapePointerDown(shape: DisplayShapeItem, event: PointerEvent): void {
    if (!this.canSelectObject()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    (event.target as SVGElement).setPointerCapture?.(event.pointerId);
    this.selectedTextId.set(null);
    this.draggingTextId.set(null);
    this.selectedShapeId.set(shape.id);
    this.draggingShapeId.set(shape.id);
    this.shapeDragStart = { shape, clientX: event.clientX, clientY: event.clientY };
  }

  onShapePointerMove(event: PointerEvent): void {
    const id = this.draggingShapeId();
    const start = this.shapeDragStart.shape;
    if (id === null || start === null) {
      return;
    }
    event.preventDefault();
    const dx = (event.clientX - this.shapeDragStart.clientX) / this.zoomLevel();
    const dy = (event.clientY - this.shapeDragStart.clientY) / this.zoomLevel();
    const moved = moveShape(start, dx, dy, WORKSPACE_WIDTH, WORKSPACE_HEIGHT);
    this.shapeItems.update((items) => items.map((shape) => (shape.id === id ? moved : shape)));
  }

  onShapePointerUp(event: PointerEvent): void {
    const id = this.draggingShapeId();
    const start = this.shapeDragStart.shape;
    if (id === null || start === null) {
      return;
    }
    (event.target as SVGElement).releasePointerCapture?.(event.pointerId);
    this.draggingShapeId.set(null);
    this.shapeDragStart = { shape: null, clientX: 0, clientY: 0 };
    const moved = this.shapeItems().find((shape) => shape.id === id);
    if (
      moved &&
      (moved.x1 !== start.x1 || moved.y1 !== start.y1 || moved.x2 !== start.x2 || moved.y2 !== start.y2)
    ) {
      this.recordUndoAction({
        type: 'MOVE_OBJECT',
        objectId: moved.id,
        objectType: 'SHAPE',
        before: this.cloneShapeItem(start),
        after: this.cloneShapeItem(moved),
      });
      this.broadcastShapeUpsert(moved);
    }
  }

  private broadcastShapeUpsert(shape: DisplayShapeItem): void {
    const clientEventId = this.newEventId();
    this.realtime.sendDraw({
      eventType: 'SHAPE',
      tool: shape.type,
      shapeId: shape.id,
      color: shape.color,
      strokeWidth: shape.strokeWidth,
      points: [
        { x: shape.x1, y: shape.y1 },
        { x: shape.x2, y: shape.y2 },
      ],
      clientEventId,
    });
  }

  private broadcastShapeDelete(shapeId: string): void {
    const clientEventId = this.newEventId();
    this.realtime.sendDraw({ eventType: 'SHAPE_DELETE', tool: 'RECTANGLE', shapeId, clientEventId });
  }

  undoWhiteboardAction(): boolean {
    if (!this.undoRedoEnabled || !this.canUndo()) {
      return false;
    }
    const stack = this.undoStack();
    const actions = this.takeGestureActions(stack);
    const redoActions = this.prepareHistoryActions(actions, 'undo');
    this.undoStack.set(stack.slice(0, stack.length - actions.length));
    if (!this.applyHistoryActions(redoActions, 'undo')) {
      for (const action of redoActions) {
        this.discardObjectHistory(action);
      }
      this.showBanner('No se pudo deshacer: el objeto cambio en otra sesion.', 'warning');
      return true;
    }
    this.redoStack.update((items) => [...items, ...redoActions]);
    return true;
  }

  redoWhiteboardAction(): boolean {
    if (!this.undoRedoEnabled || !this.canRedo()) {
      return false;
    }
    const stack = this.redoStack();
    const actions = this.takeGestureActions(stack);
    const undoActions = this.prepareHistoryActions(actions, 'redo');
    this.redoStack.set(stack.slice(0, stack.length - actions.length));
    if (!this.applyHistoryActions(undoActions, 'redo')) {
      for (const action of undoActions) {
        this.discardObjectHistory(action);
      }
      this.showBanner('No se pudo rehacer: el objeto cambio en otra sesion.', 'warning');
      return true;
    }
    this.undoStack.update((items) => [...items, ...undoActions]);
    return true;
  }

  private takeGestureActions(stack: WhiteboardUndoAction[]): WhiteboardUndoAction[] {
    const last = stack[stack.length - 1];
    if (last?.gestureId === undefined) {
      return last ? [last] : [];
    }
    let start = stack.length - 1;
    while (start > 0 && stack[start - 1].gestureId === last.gestureId) {
      start--;
    }
    return stack.slice(start);
  }

  private applyHistoryActions(actions: WhiteboardUndoAction[], direction: 'undo' | 'redo'): boolean {
    const ordered = direction === 'undo' ? [...actions].reverse() : actions;
    for (const action of ordered) {
      if (!this.applyHistoryAction(action, direction)) {
        return false;
      }
    }
    return true;
  }

  private prepareHistoryActions(
    actions: WhiteboardUndoAction[],
    direction: 'undo' | 'redo'
  ): WhiteboardUndoAction[] {
    if (direction !== 'undo') {
      return actions;
    }
    return actions.map((action) => this.captureCurrentCreateState(action));
  }

  private recordUndoAction(
    action: Omit<WhiteboardUndoAction, 'id' | 'actorId' | 'timestamp'>
  ): void {
    if (!this.canDraw()) {
      return;
    }
    const fullAction: WhiteboardUndoAction = {
      ...action,
      id: this.localHistoryId(),
      actorId: this.currentUser()?.userId ?? this.userName(),
      timestamp: Date.now(),
    };
    this.undoStack.update((items) => [...items, fullAction].slice(-UNDO_STACK_LIMIT));
    this.redoStack.set([]);
  }

  private applyHistoryAction(action: WhiteboardUndoAction, direction: 'undo' | 'redo'): boolean {
    if (action.objectType === 'STROKE') {
      return this.applyStrokeHistoryAction(action, direction);
    }
    const expected = direction === 'undo' ? action.after : action.before;
    const target = direction === 'undo' ? action.before : action.after;
    const current = this.findUndoObject(action);
    if (!this.sameNullableObject(current, expected)) {
      return false;
    }
    this.applyUndoObjectState(action, target);
    return true;
  }

  private captureCurrentCreateState(action: WhiteboardUndoAction): WhiteboardUndoAction {
    if ((action.type !== 'CREATE_OBJECT' && action.type !== 'CREATE_STROKE') || action.before !== null) {
      return action;
    }
    const current = this.findUndoObject(action);
    if (current === null) {
      return action;
    }
    return {
      ...action,
      after: this.cloneUndoObjectForAction(action, current),
    };
  }

  private cloneUndoObjectForAction(
    action: WhiteboardUndoAction,
    object: UndoableObject
  ): UndoableObject {
    if (action.objectType === 'TEXT') {
      return this.cloneTextItem(object as DisplayTextItem);
    }
    if (action.objectType === 'SHAPE') {
      return this.cloneShapeItem(object as DisplayShapeItem);
    }
    return this.cloneStrokeRecord(object as WhiteboardStrokeRecord);
  }

  private applyUndoObjectState(action: WhiteboardUndoAction, object: UndoableObject | null): void {
    if (action.objectType === 'TEXT') {
      if (object === null) {
        if (this.editingTextId() === action.objectId) {
          this.cancelText();
        }
        this.textItems.update((items) => items.filter((item) => item.id !== action.objectId));
        if (this.selectedTextId() === action.objectId) {
          this.clearSelection();
        }
        this.broadcastTextDelete(action.objectId);
      } else {
        const item = this.cloneTextItem(object as DisplayTextItem);
        this.textItems.update((items) => this.upsertTextItem(items, item));
        this.broadcastTextUpsert(item);
      }
    } else if (object === null) {
      this.shapeItems.update((items) => items.filter((shape) => shape.id !== action.objectId));
      if (this.selectedShapeId() === action.objectId) {
        this.clearSelection();
      }
      this.broadcastShapeDelete(action.objectId);
    } else {
      const shape = this.cloneShapeItem(object as DisplayShapeItem);
      this.shapeItems.update((items) => this.upsertShapeItem(items, shape));
      this.broadcastShapeUpsert(shape);
    }
  }

  private findUndoObject(action: WhiteboardUndoAction): UndoableObject | null {
    if (action.objectType === 'TEXT') {
      const item = this.textItems().find((current) => current.id === action.objectId) ?? null;
      return item === null ? null : this.cloneTextItem(item);
    }
    if (action.objectType === 'STROKE') {
      const stroke = this.boardStrokes.find((current) => current.id === action.objectId) ?? null;
      return stroke === null ? null : this.cloneStrokeRecord(stroke);
    }
    const shape = this.shapeItems().find((current) => current.id === action.objectId) ?? null;
    return shape === null ? null : this.cloneShapeItem(shape);
  }

  private applyStrokeHistoryAction(action: WhiteboardUndoAction, direction: 'undo' | 'redo'): boolean {
    const target = direction === 'undo' ? action.before : action.after;
    const expected = direction === 'undo' ? action.after : action.before;
    if (target !== null && !this.isStrokeRecord(target)) {
      return false;
    }
    if (expected !== null && !this.isStrokeRecord(expected)) {
      return false;
    }
    const currentIndex = this.findStrokeIndex(action.objectId);
    if (target === null) {
      if (expected === null || currentIndex === -1) {
        return false;
      }
      const current = this.boardStrokes[currentIndex];
      if (!this.sameObject(current, expected)) {
        return false;
      }
      this.boardStrokes = this.boardStrokes.filter((_, index) => index !== currentIndex);
    } else {
      if (expected !== null || currentIndex !== -1) {
        return false;
      }
      const insertAt = Math.max(0, Math.min(action.strokeIndex ?? this.boardStrokes.length, this.boardStrokes.length));
      this.boardStrokes = [
        ...this.boardStrokes.slice(0, insertAt),
        this.cloneStrokeRecord(target),
        ...this.boardStrokes.slice(insertAt),
      ];
    }
    this.redrawCanvasFromStrokes();
    this.broadcastBoardRecompose();
    return true;
  }

  private findStrokeIndex(strokeId: string): number {
    return this.boardStrokes.findIndex((stroke) => stroke.id === strokeId);
  }

  private isStrokeRecord(value: UndoableObject): value is WhiteboardStrokeRecord {
    return 'eventType' in value && (value.eventType === 'DRAW' || value.eventType === 'ERASE');
  }

  private discardObjectHistory(action: WhiteboardUndoAction): void {
    this.undoStack.update((items) =>
      items.filter((item) => item.objectType !== action.objectType || item.objectId !== action.objectId)
    );
    this.redoStack.update((items) =>
      items.filter((item) => item.objectType !== action.objectType || item.objectId !== action.objectId)
    );
  }

  private clearUndoHistory(): void {
    this.undoStack.set([]);
    this.redoStack.set([]);
  }

  private upsertTextItem(items: DisplayTextItem[], item: DisplayTextItem): DisplayTextItem[] {
    const index = items.findIndex((current) => current.id === item.id);
    if (index === -1) {
      return [...items, item];
    }
    const next = [...items];
    next[index] = item;
    return next;
  }

  private upsertShapeItem(items: DisplayShapeItem[], shape: DisplayShapeItem): DisplayShapeItem[] {
    const index = items.findIndex((current) => current.id === shape.id);
    if (index === -1) {
      return [...items, shape];
    }
    const next = [...items];
    next[index] = shape;
    return next;
  }

  private sameNullableObject(a: UndoableObject | null, b: UndoableObject | null): boolean {
    if (a === null || b === null) {
      return a === b;
    }
    return this.sameObject(a, b);
  }

  private sameObject(a: UndoableObject, b: UndoableObject): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  private cloneTextItem(item: DisplayTextItem): DisplayTextItem {
    return {
      id: item.id,
      wx: item.wx,
      wy: item.wy,
      color: item.color,
      size: item.size,
      runs: item.runs.map((run) => ({ ...run })),
    };
  }

  private cloneShapeItem(shape: DisplayShapeItem): DisplayShapeItem {
    return { ...shape };
  }

  private cloneStrokeRecord(stroke: WhiteboardStrokeRecord): WhiteboardStrokeRecord {
    return {
      id: stroke.id,
      eventType: stroke.eventType,
      color: stroke.color,
      strokeWidth: stroke.strokeWidth,
      eraserSize: stroke.eraserSize,
      points: stroke.points.map((point) => ({ ...point })),
    };
  }

  private localHistoryId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `undo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private localStrokeId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `stroke-${crypto.randomUUID()}`
      : `stroke-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

  zoomOut(): void {
    this.setZoom(this.zoomLevel() - ZOOM_STEP);
  }

  zoomIn(): void {
    this.setZoom(this.zoomLevel() + ZOOM_STEP);
  }

  private setZoom(value: number): void {
    const next = Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value)) * 100) / 100;
    if (next === this.zoomLevel()) {
      return;
    }
    this.zoomLevel.set(next);
    this.setPan(this.panX(), this.panY());
  }

  fitView(): void {
    const wrap = this.wrapRef()?.nativeElement;
    const viewW = wrap?.clientWidth ?? WORKSPACE_WIDTH;
    const viewH = wrap?.clientHeight ?? WORKSPACE_HEIGHT;
    const fitZoom = Math.min(
      Math.max(1, viewW - VIEW_FIT_PADDING) / WORKSPACE_WIDTH,
      Math.max(1, viewH - VIEW_FIT_PADDING) / WORKSPACE_HEIGHT
    );
    this.cancelTransientNavigationState();
    this.zoomLevel.set(Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fitZoom)) * 100) / 100);
    this.centerPan();
  }

  centerView(): void {
    this.cancelTransientNavigationState();
    this.centerPan();
  }

  resetView(): void {
    this.cancelTransientNavigationState();
    this.zoomLevel.set(1);
    this.centerPan();
  }

  private cancelTransientNavigationState(): void {
    this.panning = false;
    this.cursorPos.set(null);
    this.cancelShapePreview();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.shapePreview() !== null) {
      this.cancelShapePreview();
    } else if (this.textDraft() !== null) {
      this.cancelText();
    } else if (this.fullscreen()) {
      this.toggleFullscreen();
    }
  }

  // ─── Puntero: dibujo y desplazamiento ────────────────────────────────────────

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (this.textDraft() !== null || this.isEditableTarget(event.target)) {
      return;
    }
    const key = event.key.toLowerCase();
    const modifier = event.ctrlKey || event.metaKey;
    const wantsUndo = modifier && key === 'z' && !event.shiftKey;
    const wantsRedo = modifier && (key === 'y' || (key === 'z' && event.shiftKey));
    if (wantsUndo || wantsRedo) {
      if (!this.undoRedoEnabled) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const applied = wantsUndo ? this.undoWhiteboardAction() : this.redoWhiteboardAction();
      if (applied) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (event.key !== 'Delete' && event.key !== 'Backspace') {
      return;
    }
    if (this.deleteSelectedObject()) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  onPointerDown(event: PointerEvent): void {
    const activeTool = this.tool();
    if (activeTool === 'MOVE' || !this.canDraw()) {
      this.startPan(event);
      return;
    }
    if (activeTool === 'SELECT') {
      this.clearSelection();
      return;
    }
    if (activeTool === 'TEXT') {
      this.placeText(event);
      return;
    }
    if (this.isShapeTool(activeTool)) {
      this.startShape(event, activeTool);
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
    this.currentEraserGestureId = this.tool() === 'ERASER' ? this.localHistoryId() : null;
    this.renderStroke(this.currentStroke, this.activeColor(), this.activeWidth());
    if (this.tool() === 'ERASER') {
      this.eraseTextsAt(start);
      this.eraseShapesAt(start);
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
    if (this.shapeStart !== null && this.isShapeTool(this.tool())) {
      this.updateShapePreview(this.toCanvasPoint(event));
      return;
    }
    const point = this.toCanvasPoint(event);
    const previous = this.currentStroke[this.currentStroke.length - 1];
    this.currentStroke.push(point);
    if (previous) {
      this.renderSegment(previous, point, this.activeColor(), this.activeWidth());
    }
    // El borrador también elimina los objetos de texto que toca (no solo trazos del lienzo).
    if (this.tool() === 'ERASER') {
      this.eraseTextsAt(point);
      this.eraseShapesAt(point);
    }
  }

  /**
   * Elimina los objetos de texto que el círculo del borrador toca y difunde su eliminación por
   * WebSocket para que el docente y los demás los vean desaparecer. Requiere permiso de dibujo.
   */
  private eraseTextsAt(point: WhiteboardPoint): void {
    if (!this.canDraw()) {
      return;
    }
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
    for (const item of hit) {
      this.recordUndoAction({
        type: 'DELETE_OBJECT',
        objectId: item.id,
        objectType: 'TEXT',
        before: this.cloneTextItem(item),
        after: null,
        gestureId: this.currentEraserGestureId ?? undefined,
      });
      this.broadcastTextDelete(item.id);
    }
  }

  private eraseShapesAt(point: WhiteboardPoint): void {
    if (!this.canDraw()) {
      return;
    }
    const shapes = this.shapeItems();
    if (shapes.length === 0) {
      return;
    }
    const radius = this.eraserSize() / 2;
    const hit = shapes.filter((shape) => eraserHitsShape(shape, point.x, point.y, radius));
    if (hit.length === 0) {
      return;
    }
    const hitIds = new Set(hit.map((shape) => shape.id));
    this.shapeItems.update((items) => items.filter((shape) => !hitIds.has(shape.id)));
    for (const shape of hit) {
      this.recordUndoAction({
        type: 'DELETE_OBJECT',
        objectId: shape.id,
        objectType: 'SHAPE',
        before: this.cloneShapeItem(shape),
        after: null,
        gestureId: this.currentEraserGestureId ?? undefined,
      });
      this.broadcastShapeDelete(shape.id);
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
    if (this.shapeStart !== null) {
      const preview = this.shapePreview();
      this.cancelShapePreview();
      (event.target as HTMLCanvasElement).releasePointerCapture?.(event.pointerId);
      if (preview !== null && !isShapeTooSmall(preview) && this.canDraw()) {
        this.shapeItems.update((items) => [...items, preview]);
        this.recordUndoAction({
          type: 'CREATE_OBJECT',
          objectId: preview.id,
          objectType: 'SHAPE',
          before: null,
          after: this.cloneShapeItem(preview),
        });
        this.broadcastShapeUpsert(preview);
      }
      return;
    }
    if (this.currentStroke.length === 0) {
      return;
    }
    const points = this.currentStroke;
    this.currentStroke = [];
    this.publishStroke(points);
    this.currentEraserGestureId = null;
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
    const scaledW = WORKSPACE_WIDTH * this.zoomLevel();
    const scaledH = WORKSPACE_HEIGHT * this.zoomLevel();
    const centeredX = (viewW - scaledW) / 2;
    const centeredY = (viewH - scaledH) / 2;
    const minX = scaledW <= viewW ? centeredX : viewW - scaledW;
    const maxX = scaledW <= viewW ? centeredX : 0;
    const minY = scaledH <= viewH ? centeredY : viewH - scaledH;
    const maxY = scaledH <= viewH ? centeredY : 0;
    this.panX.set(Math.max(minX, Math.min(maxX, x)));
    this.panY.set(Math.max(minY, Math.min(maxY, y)));
  }

  private centerPan(): void {
    const wrap = this.wrapRef()?.nativeElement;
    const viewW = wrap?.clientWidth ?? WORKSPACE_WIDTH;
    const viewH = wrap?.clientHeight ?? WORKSPACE_HEIGHT;
    this.setPan(
      (viewW - WORKSPACE_WIDTH * this.zoomLevel()) / 2,
      (viewH - WORKSPACE_HEIGHT * this.zoomLevel()) / 2
    );
  }

  toScreenX(wx: number): number {
    return this.panX() + wx * this.zoomLevel();
  }

  toScreenY(wy: number): number {
    return this.panY() + wy * this.zoomLevel();
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
    if (!this.boardStateReady()) {
      this.queuedRemoteDrawEvents.push(event);
      return;
    }
    this.applyRemoteDraw(event);
  }

  private applyRemoteDraw(event: WhiteboardDrawEventResponse): void {
    if (event.clientEventId !== null && this.ownEventIds.has(event.clientEventId)) {
      // Eco de un evento propio que ya se pintó localmente.
      this.ownEventIds.delete(event.clientEventId);
      return;
    }
    if (event.eventType === 'CLEAR') {
      const isRecompose = event.clientEventId?.startsWith('recompose-') === true;
      if (!isRecompose) {
        this.cancelText();
        this.cancelShapePreview();
      }
      this.clearCanvas();
      this.boardStrokes = [];
      if (!isRecompose) {
        this.textItems.set([]);
        this.shapeItems.set([]);
        this.clearUndoHistory();
      }
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
        if (this.editingTextId() === id) {
          this.cancelText();
        }
        if (this.selectedTextId() === id) {
          this.clearSelection();
        }
        this.textItems.update((items) => items.filter((i) => i.id !== id));
      }
      return;
    }
    if (event.eventType === 'SHAPE') {
      this.upsertShape(event);
      return;
    }
    if (event.eventType === 'SHAPE_DELETE') {
      if (event.shapeId !== null) {
        const id = event.shapeId;
        if (this.selectedShapeId() === id) {
          this.clearSelection();
        }
        this.shapeItems.update((items) => items.filter((shape) => shape.id !== id));
      }
      return;
    }
    this.applyRemoteStrokeEvent(event);
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

  private upsertShape(event: WhiteboardDrawEventResponse): void {
    const points = event.points ?? [];
    const start = points[0];
    const end = points[1];
    if (event.shapeId === null || !start || !end || !this.isShapeTool(event.tool)) {
      return;
    }
    const shape: DisplayShapeItem = {
      id: event.shapeId,
      type: event.tool,
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      color: event.color ?? '#1d9e75',
      strokeWidth: event.strokeWidth ?? 4,
    };
    this.shapeItems.update((items) => {
      const index = items.findIndex((item) => item.id === shape.id);
      if (index === -1) {
        return [...items, shape];
      }
      const next = [...items];
      next[index] = shape;
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
        this.canInteractBeforePause = current.canInteract;
        this.session.set({ ...current, status: 'PAUSED', canInteract: false });
        this.clearSelection();
        if (this.tool() !== 'MOVE') {
          this.cancelText();
          this.cancelShapePreview();
          this.tool.set('MOVE');
        }
        this.showBanner('La sesión está pausada por el docente.', 'warning');
        break;
      case 'SESSION_RESUMED':
        this.session.set({
          ...current,
          status: 'ACTIVE',
          canInteract: this.canInteractBeforePause ?? current.canInteract,
        });
        this.showBanner('La sesión fue reanudada.', 'success');
        this.refreshDetail('ACTIVE');
        break;
      case 'SESSION_CLOSED':
        this.cancelText();
        this.cancelShapePreview();
        this.clearSelection();
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
    this.clearSelection();
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

  private redrawCanvasFromStrokes(): void {
    const ctx = this.ensureCanvas();
    if (ctx === null) {
      return;
    }
    ctx.fillStyle = BOARD_BACKGROUND;
    ctx.fillRect(0, 0, WORKSPACE_WIDTH, WORKSPACE_HEIGHT);
    for (const stroke of this.boardStrokes) {
      const isErase = stroke.eventType === 'ERASE';
      const color = isErase ? BOARD_BACKGROUND : stroke.color ?? '#000000';
      const width = isErase ? stroke.eraserSize ?? 24 : stroke.strokeWidth ?? 4;
      this.renderStroke(stroke.points, color, width);
    }
  }

  private applyRemoteStrokeEvent(event: WhiteboardDrawEventResponse): void {
    const stroke = this.strokeRecordFromEvent(event);
    this.boardStrokes = this.upsertStrokeRecord(this.boardStrokes, stroke);
    this.redrawCanvasFromStrokes();
  }

  private strokeRecordFromEvent(event: WhiteboardDrawEventResponse): WhiteboardStrokeRecord {
    const isErase = event.eventType === 'ERASE';
    return {
      id: event.clientEventId ?? undefined,
      eventType: isErase ? 'ERASE' : 'DRAW',
      color: isErase ? null : event.color ?? '#000000',
      strokeWidth: isErase ? null : event.strokeWidth ?? 4,
      eraserSize: isErase ? event.eraserSize ?? 24 : null,
      points: ((event.points ?? []) as WhiteboardPoint[]).map((point) => ({ ...point })),
    };
  }

  private upsertStrokeRecord(
    strokes: WhiteboardStrokeRecord[],
    stroke: WhiteboardStrokeRecord
  ): WhiteboardStrokeRecord[] {
    if (stroke.id === undefined) {
      return [...strokes, this.cloneStrokeRecord(stroke)];
    }
    const index = strokes.findIndex((current) => current.id === stroke.id);
    if (index === -1) {
      return [...strokes, this.cloneStrokeRecord(stroke)];
    }
    const next = [...strokes];
    next[index] = this.cloneStrokeRecord(stroke);
    return next;
  }

  private broadcastBoardRecompose(): void {
    this.realtime.sendDraw({ eventType: 'CLEAR', tool: 'CLEAR', clientEventId: this.newEventId('recompose') });
    for (const stroke of this.boardStrokes) {
      this.broadcastStrokeRecord(stroke);
    }
  }

  private broadcastStrokeRecord(stroke: WhiteboardStrokeRecord): void {
    const clientEventId = this.newEventId('recompose');
    if (stroke.eventType === 'ERASE') {
      this.realtime.sendDraw({
        eventType: 'ERASE',
        tool: 'ERASER',
        eraserSize: stroke.eraserSize ?? 24,
        points: stroke.points,
        clientEventId,
      });
      return;
    }
    this.realtime.sendDraw({
      eventType: 'DRAW',
      tool: 'PEN',
      color: stroke.color ?? '#000000',
      strokeWidth: stroke.strokeWidth ?? 4,
      points: stroke.points,
      clientEventId,
    });
  }

  private eraserTouchesDrawStroke(points: readonly WhiteboardPoint[], eraserSize: number): boolean {
    const radius = Math.max(eraserSize / 2 + 3, 8);
    return this.boardStrokes.some(
      (stroke) =>
        stroke.eventType === 'DRAW' &&
        points.some((point) => this.strokeRecordContainsPoint(stroke, point, radius))
    );
  }

  private strokeRecordContainsPoint(
    stroke: WhiteboardStrokeRecord,
    point: WhiteboardPoint,
    radius: number
  ): boolean {
    const strokePoints = stroke.points;
    if (strokePoints.length === 0) {
      return false;
    }
    const tolerance = radius + (stroke.strokeWidth ?? 4) / 2;
    if (strokePoints.length === 1) {
      return Math.hypot(point.x - strokePoints[0].x, point.y - strokePoints[0].y) <= tolerance;
    }
    for (let i = 1; i < strokePoints.length; i++) {
      if (this.distanceToSegment(point, strokePoints[i - 1], strokePoints[i]) <= tolerance) {
        return true;
      }
    }
    return false;
  }

  private distanceToSegment(point: WhiteboardPoint, from: WhiteboardPoint, to: WhiteboardPoint): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (dx === 0 && dy === 0) {
      return Math.hypot(point.x - from.x, point.y - from.y);
    }
    const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
  }

  private publishStroke(points: WhiteboardPoint[]): void {
    const clientEventId = this.newEventId();
    const isErase = this.tool() === 'ERASER';
    const shouldKeepStroke = !isErase || this.eraserTouchesDrawStroke(points, this.eraserSize());
    if (isErase && !shouldKeepStroke) {
      this.currentEraserGestureId = null;
      return;
    }
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
    const strokeRecord: WhiteboardStrokeRecord = {
      id: this.localStrokeId(),
      eventType: isErase ? 'ERASE' : 'DRAW',
      color: isErase ? null : this.color(),
      strokeWidth: isErase ? null : this.strokeWidth(),
      eraserSize: isErase ? this.eraserSize() : null,
      points,
    };
    this.boardStrokes.push(strokeRecord);
    this.recordUndoAction({
      type: isErase ? 'ERASE_STROKE' : 'CREATE_STROKE',
      objectId: strokeRecord.id ?? clientEventId,
      objectType: 'STROKE',
      before: null,
      after: this.cloneStrokeRecord(strokeRecord),
      strokeIndex: this.boardStrokes.length - 1,
      gestureId: this.currentEraserGestureId ?? undefined,
    });
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

  isShapeTool(tool: string): tool is ShapeTool {
    return tool === 'RECTANGLE' || tool === 'CIRCLE' || tool === 'LINE' || tool === 'ARROW';
  }

  shapeBox(shape: DisplayShapeItem): { x: number; y: number; width: number; height: number } {
    return normalizedShapeBox(shape);
  }

  shapeArrowPoints(shape: DisplayShapeItem): string {
    return arrowHeadPoints(shape);
  }

  shapeHitWidth(shape: DisplayShapeItem): number {
    return Math.max(12, shape.strokeWidth + 8);
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
  }

  private newEventId(prefix = 'evt'): string {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `${prefix}-${crypto.randomUUID()}`
        : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
