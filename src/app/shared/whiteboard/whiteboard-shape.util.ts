import { WhiteboardShapeRecord } from '../models';

export type WhiteboardShapeObject = WhiteboardShapeRecord;

export function localShapeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `shape-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function isShapeTooSmall(shape: WhiteboardShapeObject): boolean {
  const dx = Math.abs(shape.x2 - shape.x1);
  const dy = Math.abs(shape.y2 - shape.y1);
  if (shape.type === 'LINE' || shape.type === 'ARROW') {
    return Math.hypot(dx, dy) < 8;
  }
  return dx < 8 || dy < 8;
}

export function normalizedShapeBox(shape: WhiteboardShapeObject): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const x = Math.min(shape.x1, shape.x2);
  const y = Math.min(shape.y1, shape.y2);
  return {
    x,
    y,
    width: Math.abs(shape.x2 - shape.x1),
    height: Math.abs(shape.y2 - shape.y1),
  };
}

export function shapeBounds(shape: WhiteboardShapeObject): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  const pad = Math.max(8, shape.strokeWidth / 2 + 6);
  return {
    left: Math.min(shape.x1, shape.x2) - pad,
    top: Math.min(shape.y1, shape.y2) - pad,
    right: Math.max(shape.x1, shape.x2) + pad,
    bottom: Math.max(shape.y1, shape.y2) + pad,
  };
}

export function moveShape(
  shape: WhiteboardShapeObject,
  dx: number,
  dy: number,
  maxWidth: number,
  maxHeight: number
): WhiteboardShapeObject {
  const bounds = shapeBounds(shape);
  let clampedDx = dx;
  let clampedDy = dy;
  if (bounds.left + clampedDx < 0) {
    clampedDx = -bounds.left;
  }
  if (bounds.right + clampedDx > maxWidth) {
    clampedDx = maxWidth - bounds.right;
  }
  if (bounds.top + clampedDy < 0) {
    clampedDy = -bounds.top;
  }
  if (bounds.bottom + clampedDy > maxHeight) {
    clampedDy = maxHeight - bounds.bottom;
  }
  return {
    ...shape,
    x1: round2(shape.x1 + clampedDx),
    y1: round2(shape.y1 + clampedDy),
    x2: round2(shape.x2 + clampedDx),
    y2: round2(shape.y2 + clampedDy),
  };
}

export function drawShapeItem(ctx: CanvasRenderingContext2D, shape: WhiteboardShapeObject): void {
  ctx.save();
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineWidth = shape.strokeWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (shape.type === 'RECTANGLE') {
    const box = normalizedShapeBox(shape);
    ctx.strokeRect(box.x, box.y, box.width, box.height);
  } else if (shape.type === 'CIRCLE') {
    const box = normalizedShapeBox(shape);
    ctx.beginPath();
    ctx.ellipse(
      box.x + box.width / 2,
      box.y + box.height / 2,
      box.width / 2,
      box.height / 2,
      0,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(shape.x1, shape.y1);
    ctx.lineTo(shape.x2, shape.y2);
    ctx.stroke();
    if (shape.type === 'ARROW') {
      drawArrowHead(ctx, shape);
    }
  }
  ctx.restore();
}

export function eraserHitsShape(
  shape: WhiteboardShapeObject,
  wx: number,
  wy: number,
  radius: number
): boolean {
  const tolerance = radius + shape.strokeWidth / 2 + 3;
  if (shape.type === 'LINE' || shape.type === 'ARROW') {
    return distanceToSegment(wx, wy, shape.x1, shape.y1, shape.x2, shape.y2) <= tolerance;
  }
  const box = normalizedShapeBox(shape);
  if (shape.type === 'RECTANGLE') {
    const inside =
      wx >= box.x - tolerance &&
      wx <= box.x + box.width + tolerance &&
      wy >= box.y - tolerance &&
      wy <= box.y + box.height + tolerance;
    if (!inside) {
      return false;
    }
    const nearVertical = Math.min(Math.abs(wx - box.x), Math.abs(wx - (box.x + box.width))) <= tolerance;
    const nearHorizontal = Math.min(Math.abs(wy - box.y), Math.abs(wy - (box.y + box.height))) <= tolerance;
    return nearVertical || nearHorizontal;
  }
  const rx = Math.max(1, box.width / 2);
  const ry = Math.max(1, box.height / 2);
  const cx = box.x + rx;
  const cy = box.y + ry;
  const normalized = Math.hypot((wx - cx) / rx, (wy - cy) / ry);
  const scaledTolerance = tolerance / Math.max(rx, ry);
  return Math.abs(normalized - 1) <= scaledTolerance;
}

export function arrowHeadPoints(shape: WhiteboardShapeObject): string {
  const points = arrowHead(shape);
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

function drawArrowHead(ctx: CanvasRenderingContext2D, shape: WhiteboardShapeObject): void {
  const points = arrowHead(shape);
  if (points.length === 0) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.fill();
}

function arrowHead(shape: WhiteboardShapeObject): { x: number; y: number }[] {
  const angle = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1);
  if (!Number.isFinite(angle)) {
    return [];
  }
  const length = Math.max(12, shape.strokeWidth * 4);
  const spread = Math.PI / 7;
  return [
    { x: shape.x2, y: shape.y2 },
    {
      x: shape.x2 - Math.cos(angle - spread) * length,
      y: shape.y2 - Math.sin(angle - spread) * length,
    },
    {
      x: shape.x2 - Math.cos(angle + spread) * length,
      y: shape.y2 - Math.sin(angle + spread) * length,
    },
  ];
}

function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
