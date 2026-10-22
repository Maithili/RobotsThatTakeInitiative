// Graph text as the browser draws it (SPEC §7.2). Real text widths vary with the visitor's fonts, so which labels
// show and where category labels go use these measured boxes. The build-time layout keeps its own estimates
// (literatureLayout.textWidth) only to space dots apart.
import { LABEL_GAP } from '../../lib/literatureLayout.ts';

/** Text attributes shared by the drawn graph text and its measurement, so the two always match. */
export const LABEL_DX = '0.34em';
export const LABEL_DY = '0.35em';
export const YEAR_DX = '0.3em';
export const CAT_DY = '0.35em';
export const HULL_DY = '-0.5em';

/** A text's box relative to its anchor point (the text's x and y), in screen pixels. */
export interface TextBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LabelMetrics {
  /** Each paper label's width in screen pixels, from LABEL_GAP past its dot's edge to the end of its year. */
  labelW: Map<string, number>;
  /** Top and bottom of every paper label, from its dot's center, in screen pixels. */
  labelY: [number, number];
  /** Each tangential category label's box, from its anchor. */
  cats: Map<string, TextBox>;
  /** Each family name's box, from its anchor (centered above its hull). */
  hulls: Map<string, TextBox>;
}

export interface MeasureInput {
  labels: { id: string; name: string; year: string | null }[];
  cats: { id: string; text: string }[];
  hulls: { id: string; text: string }[];
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function textEl(cls: string, text: string, attrs: Record<string, string>): SVGTextElement {
  const t = document.createElementNS(SVG_NS, 'text');
  t.setAttribute('class', cls);
  for (const [k, v] of Object.entries(attrs)) t.setAttribute(k, v);
  t.textContent = text;
  return t;
}

/**
 * Measures the graph's text in `host`: a hidden group in the graph's SVG with the graph's text styles at the
 * screen font size. Each text is drawn there once, with the classes and offsets of the drawn text, its box read
 * back, and the element removed again, all in one layout. Returns null when nothing renders (the graph is hidden).
 */
export function measureLabels(host: SVGGElement, input: MeasureInput): LabelMetrics | null {
  const labels = input.labels.map((l) => {
    const t = textEl('litg__label', l.name, { dx: LABEL_DX, dy: LABEL_DY });
    if (l.year) {
      const y = document.createElementNS(SVG_NS, 'tspan');
      y.setAttribute('class', 'litg__label-year');
      y.setAttribute('dx', YEAR_DX);
      y.textContent = l.year;
      t.append(y);
    }
    return t;
  });
  const cats = input.cats.map((c) => textEl('litg__cat-label', c.text, { dy: CAT_DY }));
  const hulls = input.hulls.map((h) => textEl('litg__hull-label', h.text, { dy: HULL_DY, 'text-anchor': 'middle' }));
  const all = [...labels, ...cats, ...hulls];
  host.append(...all);
  try {
    const box = (t: SVGTextElement): TextBox => {
      const b = t.getBBox();
      return { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height };
    };
    const lb = labels.map(box);
    if (lb.some((b) => b.x1 - b.x0 <= 0)) return null;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const b of lb) {
      y0 = Math.min(y0, b.y0);
      y1 = Math.max(y1, b.y1);
    }
    return {
      // The label box starts LABEL_GAP past the dot's edge; the text starts at LABEL_DX, just past that.
      labelW: new Map(input.labels.map((l, i) => [l.id, lb[i].x1 - LABEL_GAP])),
      labelY: lb.length ? [y0, y1] : [0, 0],
      cats: new Map(input.cats.map((c, i) => [c.id, box(cats[i])])),
      hulls: new Map(input.hulls.map((h, i) => [h.id, box(hulls[i])])),
    };
  } catch {
    // getBBox throws in some browsers when the graph is not rendered.
    return null;
  } finally {
    for (const t of all) t.remove();
  }
}

const sameBox = (a: TextBox | undefined, b: TextBox | undefined) => !!a && !!b && a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;
const sameMap = <T>(a: Map<string, T>, b: Map<string, T>, eq: (x: T | undefined, y: T | undefined) => boolean) =>
  a.size === b.size && [...a].every(([k, v]) => eq(v, b.get(k)));

/** True if two measurements give the same boxes, so a re-measure that changes nothing re-renders nothing. */
export function sameMetrics(a: LabelMetrics, b: LabelMetrics): boolean {
  return (
    a.labelY[0] === b.labelY[0] &&
    a.labelY[1] === b.labelY[1] &&
    sameMap(a.labelW, b.labelW, (x, y) => x === y) &&
    sameMap(a.cats, b.cats, sameBox) &&
    sameMap(a.hulls, b.hulls, sameBox)
  );
}
