import {
  WhiteboardBoardStateSnapshot, WhiteboardDrawEventRequest, WhiteboardDrawEventResponse,
  WhiteboardShapeType,
} from '../models';

type Operation = WhiteboardDrawEventRequest | WhiteboardDrawEventResponse;
const empty = (): WhiteboardBoardStateSnapshot => ({ v: 1, strokes: [], texts: [], shapes: [] });
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Confirmed state and local intentions are separate. Acknowledging never means skipping a mutation. */
export class WhiteboardReconciliation {
  private confirmed = empty();
  private readonly pending = new Map<string, WhiteboardDrawEventRequest>();

  get pendingCount(): number { return this.pending.size; }

  track(operation: WhiteboardDrawEventRequest): void {
    if (operation.clientEventId) this.pending.set(operation.clientEventId, copy(operation));
  }

  acknowledge(id: string | null): boolean { return id != null && this.pending.delete(id); }
  discardPending(): void { this.pending.clear(); }
  reset(snapshot: WhiteboardBoardStateSnapshot): void { this.confirmed = copy(snapshot); }

  confirm(event: WhiteboardDrawEventResponse): boolean {
    const own = this.acknowledge(event.clientEventId);
    this.confirmed = reduce(this.confirmed, event);
    return own;
  }

  visible(): WhiteboardBoardStateSnapshot {
    let state = this.confirmed;
    for (const operation of this.pending.values()) state = reduce(state, operation);
    // UI gestures may mutate their copies; neither the confirmed base nor pending payloads may change.
    return copy(state);
  }
}

/** Same identity/upsert/order rules as the server projection; this grants no permissions or authorship. */
function reduce(state: WhiteboardBoardStateSnapshot, event: Operation): WhiteboardBoardStateSnapshot {
  if (event.eventType === 'CLEAR') return empty();
  const texts = state.texts ?? [], shapes = state.shapes ?? [], strokes = state.strokes ?? [];
  if (event.eventType === 'TEXT_DELETE') return { ...state, texts: texts.filter(item => item.id !== event.textId) };
  if (event.eventType === 'SHAPE_DELETE') return { ...state, shapes: shapes.filter(item => item.id !== event.shapeId) };
  if (event.eventType === 'STROKE_DELETE') return { ...state, strokes: strokes.filter(item => item.id !== event.strokeId) };
  const point = event.points?.[0];
  if (!point) return state;
  const owner = (existing?: { ownerUserId?: number | null }): number | null =>
    'ownerUserId' in event ? event.ownerUserId ?? null : existing?.ownerUserId ?? null;
  if (event.eventType === 'TEXT' && event.textId && event.runs) {
    return { ...state, texts: upsert(texts, {
      id: event.textId, ownerUserId: owner(texts.find(item => item.id === event.textId)),
      wx: point.x, wy: point.y, color: event.color ?? '#1a1a16', size: event.fontSize ?? 32, runs: event.runs,
    }) };
  }
  if (event.eventType === 'SHAPE' && event.shapeId && event.points?.[1]) {
    return { ...state, shapes: upsert(shapes, {
      id: event.shapeId, ownerUserId: owner(shapes.find(item => item.id === event.shapeId)),
      type: event.tool as WhiteboardShapeType, x1: point.x, y1: point.y,
      x2: event.points[1].x, y2: event.points[1].y,
      color: event.color ?? '#000000', strokeWidth: event.strokeWidth ?? 4,
    }) };
  }
  if (event.eventType === 'DRAW' || event.eventType === 'ERASE') {
    const id = event.strokeId ?? event.clientEventId ?? undefined;
    return { ...state, strokes: upsert(strokes, {
      id, ownerUserId: owner(strokes.find(item => item.id === id)), eventType: event.eventType,
      color: event.color ?? null, strokeWidth: event.strokeWidth ?? null,
      eraserSize: event.eraserSize ?? null, points: event.points ?? [],
    }, event.strokeIndex) };
  }
  return state;
}

function upsert<T extends { readonly id?: string }>(items: readonly T[], item: T, insertAt?: number | null): T[] {
  const index = item.id == null ? -1 : items.findIndex(current => current.id === item.id);
  const next = [...items];
  if (index >= 0) next[index] = item;
  else next.splice(insertAt == null ? next.length : Math.max(0, Math.min(insertAt, next.length)), 0, item);
  return next;
}
