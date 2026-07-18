import { UserRole } from './auth.models';

/**
 * Modelos de la pizarra interactiva en vivo. Reflejan los DTOs reales del backend
 * (paquete com.morales.chemicallab.dto y entity). Los nombres de campo coinciden
 * exactamente con los devueltos por /api/whiteboards/teacher y por los eventos
 * WebSocket/STOMP del canal /topic/whiteboards/{sessionId}.
 */

/** Estado de una sesión de pizarra (enum WhiteboardSessionStatus). */
export type WhiteboardSessionStatus = 'ACTIVE' | 'PAUSED' | 'CLOSED';

/**
 * Permiso individual de interacción de un participante (enum WhiteboardInteractionOverride).
 * Se combina con el permiso global de la sesión para obtener el permiso efectivo.
 */
export type WhiteboardInteractionOverride = 'FOLLOW_GLOBAL' | 'ALLOWED' | 'BLOCKED';

/**
 * Tipo de evento de dibujo transportado por WebSocket (enum WhiteboardDrawEventType).
 * TEXT/TEXT_DELETE transportan objetos de texto en vivo del docente o de estudiantes con permiso.
 */
export type WhiteboardDrawEventType =
  | 'DRAW'
  | 'ERASE'
  | 'CLEAR'
  | 'TEXT'
  | 'TEXT_DELETE'
  | 'SHAPE'
  | 'SHAPE_DELETE'
  | 'STROKE_DELETE';

/** Herramienta usada en un evento de dibujo (enum WhiteboardDrawTool). */
export type WhiteboardDrawTool =
  | 'PEN'
  | 'ERASER'
  | 'CLEAR'
  | 'TEXT'
  | 'RECTANGLE'
  | 'CIRCLE'
  | 'LINE'
  | 'ARROW';

/** Tipo de forma estructurada transportada y guardada en la pizarra. */
export type WhiteboardShapeType = 'RECTANGLE' | 'CIRCLE' | 'LINE' | 'ARROW';

/** Evento de control difundido al canal de la sesión (enum WhiteboardControlEventType). */
export type WhiteboardControlEventType =
  | 'SESSION_PAUSED'
  | 'SESSION_RESUMED'
  | 'SESSION_CLOSED'
  | 'INTERACTION_UPDATED'
  | 'PARTICIPANT_PERMISSION_UPDATED'
  | 'PARTICIPANT_JOINED';

/**
 * Fragmento de texto con un estilo uniforme (DTO WhiteboardTextRun). El formato
 * (negrita/cursiva/subrayado) es por fragmento; el color y el tamaño son del bloque de texto.
 */
export interface WhiteboardTextRun {
  readonly text: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
}

/**
 * Vista de una sesión para el docente propietario (listado y resultado de acciones).
 * No incluye los bytes de la captura final; solo si está disponible (snapshotAvailable).
 */
export interface WhiteboardSessionResponse {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  readonly teacherId: number;
  readonly teacherName: string;
  readonly grade: string;
  readonly section: string;
  readonly status: WhiteboardSessionStatus;
  readonly interactionEnabled: boolean;
  readonly participantCount: number;
  readonly snapshotAvailable: boolean;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly pausedAt: string | null;
  readonly resumedAt: string | null;
  readonly closedAt: string | null;
  readonly closedBy: string | null;
}

/** Vista segura de un participante (alumno) para el docente. */
export interface WhiteboardParticipantResponse {
  readonly id: number;
  readonly studentId: number;
  readonly studentName: string;
  readonly studentCode: string;
  readonly grade: string;
  readonly section: string;
  readonly interactionOverride: WhiteboardInteractionOverride;
  readonly effectiveInteraction: boolean;
  readonly joinedAt: string;
  readonly lastSeenAt: string | null;
}

/** Detalle de una sesión: metadata más la lista de participantes. */
export interface WhiteboardSessionDetailResponse {
  readonly session: WhiteboardSessionResponse;
  readonly participants: readonly WhiteboardParticipantResponse[];
}

/**
 * Vista segura de una sesión para el estudiante (DTO WhiteboardStudentSessionResponse del
 * backend). Expone solo lo necesario: no incluye datos internos del docente ni de otros alumnos.
 * {@link joined} indica si el estudiante ya se unió y {@link canInteract} su permiso efectivo de
 * dibujo (joined && status === 'ACTIVE' && permiso efectivo combinando global e individual).
 */
export interface WhiteboardStudentSessionResponse {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  readonly teacherName: string;
  readonly grade: string;
  readonly section: string;
  readonly status: WhiteboardSessionStatus;
  readonly interactionEnabled: boolean;
  readonly joined: boolean;
  readonly canInteract: boolean;
  readonly snapshotAvailable: boolean;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly closedAt: string | null;
}

/**
 * Entrada del historial de sesiones cerradas visible para el estudiante (DTO
 * WhiteboardHistoryItemResponse): metadata segura y disponibilidad de la captura final.
 */
export interface WhiteboardHistoryItemResponse {
  readonly id: number;
  readonly name: string;
  readonly teacherName: string;
  readonly grade: string;
  readonly section: string;
  readonly status: WhiteboardSessionStatus;
  readonly snapshotAvailable: boolean;
  readonly closedAt: string | null;
}

/** Cuerpo de creación de una sesión de pizarra. El docente se resuelve del token. */
export interface WhiteboardSessionCreateRequest {
  readonly name: string;
  readonly description?: string;
  readonly grade: string;
  readonly section: string;
}

/** Activación/desactivación del permiso global de interacción de una sesión. */
export interface WhiteboardGlobalInteractionRequest {
  readonly interactionEnabled: boolean;
}

/** Actualización del permiso individual de interacción de un alumno. */
export interface WhiteboardParticipantInteractionRequest {
  readonly interactionOverride: WhiteboardInteractionOverride;
}

/** Coordenada de un trazo en el lienzo (relativa al canvas del cliente). */
export interface WhiteboardPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Evento de dibujo enviado por WebSocket a /app/whiteboards/{sessionId}/draw.
 * El actor lo resuelve el backend del principal autenticado, no se envía aquí.
 */
export interface WhiteboardDrawEventRequest {
  readonly eventType: WhiteboardDrawEventType;
  readonly tool: WhiteboardDrawTool;
  readonly color?: string | null;
  readonly strokeWidth?: number | null;
  readonly eraserSize?: number | null;
  readonly points?: readonly WhiteboardPoint[];
  /** Identificador del evento generado por el cliente, para deduplicar el eco propio. */
  readonly clientEventId?: string;
  /** Solo en eventos de texto (TEXT/TEXT_DELETE): identificador estable del bloque de texto. */
  readonly textId?: string;
  /** Solo en TEXT: tamaño de fuente del bloque. */
  readonly fontSize?: number | null;
  /** Solo en TEXT: fragmentos con formato del bloque. La posición viaja como único punto en points. */
  readonly runs?: readonly WhiteboardTextRun[];
  /** Solo en eventos de forma (SHAPE/SHAPE_DELETE): identificador estable del objeto. */
  readonly shapeId?: string;
  /**
   * Identificador estable del trazo (DRAW/ERASE/STROKE_DELETE). Todos los clientes comparten
   * este id, lo que permite que deshacer/rehacer se difunda como eventos concretos por identidad.
   */
  readonly strokeId?: string;
  /** Posición del trazo dentro del lienzo al restaurarlo (rehacer). Si falta, se añade al final. */
  readonly strokeIndex?: number | null;
}

/** Evento de dibujo difundido a los suscriptores de /topic/whiteboards/{sessionId}. */
export interface WhiteboardDrawEventResponse {
  readonly sessionId: number;
  readonly eventType: WhiteboardDrawEventType;
  readonly tool: WhiteboardDrawTool;
  readonly color: string | null;
  readonly strokeWidth: number | null;
  readonly eraserSize: number | null;
  readonly points: readonly WhiteboardPoint[] | null;
  readonly actorRole: UserRole;
  readonly actorDisplayName: string;
  readonly clientEventId: string | null;
  readonly occurredAt: string;
  /** Solo en eventos de texto: identificador del bloque. */
  readonly textId: string | null;
  /** Solo en TEXT: tamaño de fuente del bloque. */
  readonly fontSize: number | null;
  /** Solo en TEXT: fragmentos con formato del bloque. */
  readonly runs: readonly WhiteboardTextRun[] | null;
  /** Solo en eventos de forma: identificador estable del objeto. */
  readonly shapeId: string | null;
  /** Identificador estable del trazo (DRAW/ERASE/STROKE_DELETE), si el emisor lo envió. */
  readonly strokeId: string | null;
  /** Posición del trazo al restaurarlo (rehacer), si el emisor la envió. */
  readonly strokeIndex: number | null;
}

/** Evento de control difundido al canal cuando el docente actúa por REST. */
export interface WhiteboardControlEventResponse {
  readonly sessionId: number;
  readonly eventType: WhiteboardControlEventType;
  readonly status: WhiteboardSessionStatus | null;
  readonly interactionEnabled: boolean | null;
  readonly targetStudentId: number | null;
  readonly occurredAt: string;
}

/**
 * Mensaje recibido por el canal /topic/whiteboards/{sessionId}: el backend difunde tanto
 * eventos de dibujo como de control en el mismo canal. Se distinguen por su eventType.
 */
export type WhiteboardTopicMessage =
  | WhiteboardDrawEventResponse
  | WhiteboardControlEventResponse;

/**
 * Estado actual del lienzo de una sesión en vivo (DTO WhiteboardBoardStateResponse). Permite
 * reconstruir lo ya dibujado al unirse tarde o recargar. {@link stateJson} es null si todavía no
 * se guardó ningún estado. El frontend interpreta el contenido del JSON (trazos + textos).
 */
export interface WhiteboardBoardStateResponse {
  readonly sessionId: number;
  readonly status: WhiteboardSessionStatus;
  readonly stateJson: string | null;
  readonly updatedAt: string | null;
}

/**
 * Trazo serializado dentro del estado del lienzo (DRAW o ERASE).
 * Pendiente: para seleccionar/mover trazos se requiere convertirlos a objetos agrupados con id estable.
 */
export interface WhiteboardStrokeRecord {
  /** Identificador estable local del trazo cuando el frontend puede conservarlo. */
  readonly id?: string;
  readonly eventType: 'DRAW' | 'ERASE';
  readonly color: string | null;
  readonly strokeWidth: number | null;
  readonly eraserSize: number | null;
  readonly points: readonly WhiteboardPoint[];
}

/** Objeto de texto serializado dentro del estado del lienzo (coordenadas de workspace). */
export interface WhiteboardTextRecord {
  readonly id: string;
  readonly wx: number;
  readonly wy: number;
  readonly color: string;
  readonly size: number;
  readonly runs: readonly WhiteboardTextRun[];
}

/** Forma estructurada serializada dentro del estado del lienzo. */
export interface WhiteboardShapeRecord {
  readonly id: string;
  readonly type: WhiteboardShapeType;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly color: string;
  readonly strokeWidth: number;
}

/**
 * Instantánea serializada del lienzo en vivo (lo que viaja en {@link WhiteboardBoardStateResponse#stateJson}).
 * La interpreta el frontend; el backend la trata como texto opaco. Incluye trazos y textos para que
 * un alumno que recarga o entra tarde reconstruya el estado actual antes de seguir en vivo.
 */
export interface WhiteboardBoardStateSnapshot {
  readonly v: 1;
  readonly strokes: readonly WhiteboardStrokeRecord[];
  readonly texts: readonly WhiteboardTextRecord[];
  readonly shapes?: readonly WhiteboardShapeRecord[];
}

const CONTROL_EVENT_TYPES: ReadonlySet<string> = new Set<WhiteboardControlEventType>([
  'SESSION_PAUSED',
  'SESSION_RESUMED',
  'SESSION_CLOSED',
  'INTERACTION_UPDATED',
  'PARTICIPANT_PERMISSION_UPDATED',
  'PARTICIPANT_JOINED',
]);

/** Discrimina un mensaje del canal como evento de control (vs. evento de dibujo). */
export function isWhiteboardControlEvent(
  message: WhiteboardTopicMessage
): message is WhiteboardControlEventResponse {
  return CONTROL_EVENT_TYPES.has(message.eventType);
}
