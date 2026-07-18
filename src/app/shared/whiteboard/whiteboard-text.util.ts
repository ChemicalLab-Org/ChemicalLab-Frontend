import { WhiteboardTextRun } from '../models';

/**
 * Lógica de texto compartida entre el editor docente y el visor estudiante de la pizarra, para
 * que ambos tengan exactamente el mismo comportamiento (formato parcial por fragmentos, render en
 * la captura, detección por el borrador) sin duplicar código.
 *
 * <p>Un objeto de texto se compone de fragmentos ({@link WhiteboardTextRun}) con su propio
 * negrita/cursiva/subrayado (formato parcial); el color y el tamaño son del bloque. Las
 * coordenadas {@code wx}/{@code wy} son del workspace lógico de la pizarra.</p>
 */
export interface WhiteboardTextObject {
  readonly id: string;
  readonly wx: number;
  readonly wy: number;
  readonly color: string;
  readonly size: number;
  readonly runs: readonly WhiteboardTextRun[];
}

/** Identificador local para un objeto de texto. */
export function localTextId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `txt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Fuente CSS/canvas de un fragmento según el tamaño del bloque y su formato. */
export function runFont(size: number, run: WhiteboardTextRun): string {
  const style = run.italic ? 'italic ' : '';
  const weight = run.bold ? '700' : '400';
  return `${style}${weight} ${size}px "Plus Jakarta Sans", system-ui, sans-serif`;
}

/** Escapa texto para insertarlo como HTML del editor. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Une fragmentos adyacentes con el mismo formato (evita fragmentación innecesaria). */
export function mergeRuns(runs: WhiteboardTextRun[]): WhiteboardTextRun[] {
  const merged: WhiteboardTextRun[] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && last.bold === run.bold && last.italic === run.italic && last.underline === run.underline) {
      merged[merged.length - 1] = { ...last, text: last.text + run.text };
    } else {
      merged.push(run);
    }
  }
  return merged;
}

/**
 * Convierte el DOM de un editor contenteditable en fragmentos con estilo uniforme. Reconoce el
 * formato aplicado por {@code document.execCommand('bold'|'italic'|'underline')} sobre una
 * selección parcial (etiquetas B/STRONG, I/EM, U y estilos en línea).
 */
export function parseRuns(root: HTMLElement): WhiteboardTextRun[] {
  const runs: WhiteboardTextRun[] = [];
  const walk = (node: Node, bold: boolean, italic: boolean, underline: boolean): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (text.length > 0) {
        runs.push({ text, bold, italic, underline });
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const el = node as HTMLElement;
    if (el.tagName === 'BR') {
      return; // editor de una sola línea: ignoramos saltos
    }
    const style = el.style;
    const fontWeight = style.fontWeight;
    const nextBold =
      bold ||
      el.tagName === 'B' ||
      el.tagName === 'STRONG' ||
      fontWeight === 'bold' ||
      (fontWeight !== '' && Number(fontWeight) >= 600);
    const nextItalic = italic || el.tagName === 'I' || el.tagName === 'EM' || style.fontStyle === 'italic';
    const decoration = `${style.textDecoration} ${style.textDecorationLine}`;
    const nextUnderline = underline || el.tagName === 'U' || decoration.includes('underline');
    el.childNodes.forEach((child) => walk(child, nextBold, nextItalic, nextUnderline));
  };
  root.childNodes.forEach((n) => walk(n, false, false, false));
  return mergeRuns(runs);
}

/** Serializa fragmentos a HTML para repoblar el editor al reeditar. */
export function runsToHtml(runs: readonly WhiteboardTextRun[]): string {
  return runs
    .map((run) => {
      let html = escapeHtml(run.text);
      if (run.bold) {
        html = `<b>${html}</b>`;
      }
      if (run.italic) {
        html = `<i>${html}</i>`;
      }
      if (run.underline) {
        html = `<u>${html}</u>`;
      }
      return html;
    })
    .join('');
}

/** Coloca el cursor al final del contenido del editor contenteditable. */
export function caretToEnd(editor: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/**
 * Dibuja un objeto de texto (con formato por fragmentos) en un contexto de canvas. Se usa al
 * componer la captura final de la pizarra. Avanza la x fragmento a fragmento conservando el
 * formato parcial y el subrayado.
 */
export function drawTextItem(ctx: CanvasRenderingContext2D, item: WhiteboardTextObject): void {
  ctx.save();
  ctx.fillStyle = item.color;
  ctx.strokeStyle = item.color;
  ctx.textBaseline = 'top';
  let x = item.wx;
  for (const run of item.runs) {
    ctx.font = runFont(item.size, run);
    const width = ctx.measureText(run.text).width;
    ctx.fillText(run.text, x, item.wy);
    if (run.underline) {
      const underlineY = item.wy + item.size * 1.08;
      ctx.lineWidth = Math.max(1, item.size / 14);
      ctx.beginPath();
      ctx.moveTo(x, underlineY);
      ctx.lineTo(x + width, underlineY);
      ctx.stroke();
    }
    x += width;
  }
  ctx.restore();
}

/** Ancho total (px de workspace) de un objeto de texto, medido fragmento a fragmento. */
export function measureTextWidth(ctx: CanvasRenderingContext2D, item: WhiteboardTextObject): number {
  let width = 0;
  for (const run of item.runs) {
    ctx.font = runFont(item.size, run);
    width += ctx.measureText(run.text).width;
  }
  return width;
}

/**
 * Indica si el círculo del borrador (centro {@code wx}/{@code wy}, radio {@code radius} en
 * coordenadas del workspace) toca el rectángulo del objeto de texto. El rectángulo se infla por el
 * radio para que «tocar o intersectar» elimine el texto, igual que con los trazos.
 */
export function eraserHitsText(
  ctx: CanvasRenderingContext2D,
  item: WhiteboardTextObject,
  wx: number,
  wy: number,
  radius: number
): boolean {
  const width = measureTextWidth(ctx, item);
  const left = item.wx - radius;
  const right = item.wx + width + radius;
  const top = item.wy - radius;
  const bottom = item.wy + item.size + radius;
  return wx >= left && wx <= right && wy >= top && wy <= bottom;
}
