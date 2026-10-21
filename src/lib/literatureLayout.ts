// Literature graph geometry (SPEC §7.2): dot sizes, label text, the build-time force layout, cluster hulls,
// and collision-aware label placement. Pure: the same data always gives the same result. Filters never reach it.
import { forceLink, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import { polygonCentroid, polygonContains, polygonHull } from 'd3-polygon';
import type { DbPaper } from '../schema.ts';

/** Dot radius at zoom 1 for a paper with no links; grows with links up to DOT_R_MAX. */
export const DOT_R_MIN = 7;
export const DOT_R_MAX = 16;
/** Tangential works are smaller dots. */
export const TANGENT_R = 5;
/** Label font size in screen pixels at every zoom. */
export const LABEL_PX = 12;
/** Gap between a dot and its label, in screen pixels. */
export const LABEL_GAP = 4;
/** Height of a label box, in screen pixels. */
export const LABEL_H = 14;
/** Hull margin around its dots and labels. */
export const HULL_PAD = 16;

const PAD = 3; // half the gap kept between two nodes' boxes
const BAND_GAP = 16; // gap between the clusters and the band of tangential works
const TICKS = 300;

export type GraphPaper = Pick<
  DbPaper,
  'id' | 'short_name' | 'year' | 'tangent' | 'method' | 'built_upon_by' | 'benchmarks_against' | 'benchmarked_in' | 'cites' | 'cited_by'
>;

/** Database papers this paper is linked to by any edge type (SPEC §5.5). */
export function linkedPapers(p: GraphPaper): Set<string> {
  const s = new Set([...(p.method?.builds_on ?? []), ...p.built_upon_by, ...p.benchmarks_against, ...p.benchmarked_in, ...p.cites, ...p.cited_by]);
  s.delete(p.id);
  return s;
}

/** Radius from the number of linked papers: 7 px with no links, growing with the square root, capped. */
export function dotRadius(links: number, tangent = false): number {
  if (tangent) return TANGENT_R;
  return Math.round(Math.min(DOT_R_MAX, DOT_R_MIN + 2.2 * Math.sqrt(Math.max(0, links))) * 10) / 10;
}

/** The muted two-digit year after a label (" '23"), or null when the short name already holds the year. */
export function labelYear(shortName: string, year: number): string | null {
  return shortName.includes(String(year)) ? null : `'${String(year).slice(-2)}`;
}

/** Text width estimate for the system UI font, slightly generous so estimated boxes never undercut real ones. */
export function textWidth(s: string, px = LABEL_PX): number {
  let em = 0;
  for (const ch of s) {
    if ("ijlI.,:;'|!`".includes(ch)) em += 0.28;
    else if ('ftr()[]'.includes(ch)) em += 0.38;
    else if (ch === ' ') em += 0.28;
    else if (ch === '-') em += 0.38;
    else if ('mw'.includes(ch)) em += 0.86;
    else if ('MW'.includes(ch)) em += 0.94;
    else if (/[A-Z]/.test(ch)) em += 0.68;
    else if (/[a-z]/.test(ch)) em += 0.55;
    else if (/[0-9]/.test(ch)) em += 0.6;
    else em += 0.66;
  }
  return Math.ceil(em * px);
}

/** Label width in screen pixels: short name at 12 px, then the year at 11 px. */
export function labelWidth(shortName: string, year: number): number {
  const y = labelYear(shortName, year);
  return textWidth(shortName) + (y ? 4 + textWidth(y, 11) : 0);
}

/** A placed node: dot center, dot radius, and label width, all at zoom 1. */
export interface Shape {
  x: number;
  y: number;
  r: number;
  labelW: number;
}

export interface LayoutNodeInput {
  id: string;
  /** Cluster id, or null for papers outside every cluster. */
  cluster: string | null;
  /** Tangential works take no cluster pull and sit in a band just outside the clusters. */
  tangent?: boolean;
  r: number;
  labelW: number;
}

export interface Point {
  x: number;
  y: number;
}

/** 32-bit string hash (FNV-1a). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SimNode extends SimulationNodeDatum, Shape {
  id: string;
  cluster: string | null;
  tangent: boolean;
  tx: number;
  ty: number;
  x: number;
  y: number;
}

// A node's box covers its dot and its label (SPEC §7.2: collision keeps dots and their labels apart).
const halfW = (n: Shape) => n.r + (LABEL_GAP + n.labelW) / 2 + PAD;
const boxCx = (n: Shape) => n.x + (LABEL_GAP + n.labelW) / 2;
const halfH = (n: Shape) => Math.max(n.r, LABEL_H / 2) + PAD;

/** Area a node's box takes, with some slack for packing. */
const footprint = (n: Shape) => 4 * halfW(n) * halfH(n) * 1.9;

/** Cluster centers evenly spaced on a circle, the first on the left, so two clusters sit left and right. */
export function clusterCenters(clusters: string[], radii: Record<string, number>, middle = 0): Map<string, [number, number]> {
  const k = clusters.length;
  const rmax = Math.max(0, ...clusters.map((c) => radii[c] ?? 0));
  const R = k <= 1 ? 0 : k === 2 ? rmax + 40 + middle / 2 : (rmax + 50 + middle / 2) / Math.sin(Math.PI / k);
  return new Map(clusters.map((c, i) => [c, [R * Math.cos(Math.PI + (2 * Math.PI * i) / k), R * Math.sin(Math.PI + (2 * Math.PI * i) / k)]]));
}

/** Pushes overlapping boxes apart along the axis of least overlap. */
function separate(nodes: SimNode[], strength: number) {
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    const ax = boxCx(a);
    const aw = halfW(a);
    const ah = halfH(a);
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      const bx = boxCx(b);
      const ox = aw + halfW(b) - Math.abs(ax - bx);
      if (ox <= 0) continue;
      const oy = ah + halfH(b) - Math.abs(a.y - b.y);
      if (oy <= 0) continue;
      // Push apart along the line between box centers, by the distance that clears the overlap on either axis.
      // Pushing along that line, rather than along one axis, keeps clusters of wide boxes round.
      let dx = ax - bx;
      let dy = a.y - b.y;
      let len = Math.hypot(dx, dy);
      if (len < 1e-6) {
        dx = a.id < b.id ? -1 : 1;
        dy = 0;
        len = 1;
      }
      const ux = dx / len;
      const uy = dy / len;
      const t = Math.min(Math.abs(ux) > 1e-6 ? ox / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? oy / Math.abs(uy) : Infinity);
      const s = (t / 2) * strength;
      a.x += ux * s;
      a.y += uy * s;
      b.x -= ux * s;
      b.y -= uy * s;
    }
  }
}

/** Overlapping node boxes (dot plus label), for tests. */
export function countOverlaps(nodes: Shape[]): number {
  let n = 0;
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const ox = halfW(a) - PAD + halfW(b) - PAD - Math.abs(boxCx(a) - boxCx(b));
      const oy = halfH(a) - PAD + halfH(b) - PAD - Math.abs(a.y - b.y);
      if (ox > 0.5 && oy > 0.5) n++;
    }
  return n;
}

/** Points on a circle. */
function ring(cx: number, cy: number, r: number, n: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)] as [number, number]);
}

/** Outline points of a node's dot and label box, grown by `pad` with rounded corners. */
function outline(n: Shape, pad: number, steps = 16): [number, number][] {
  const pts = ring(n.x, n.y, n.r + pad, steps);
  const x0 = n.x + n.r + LABEL_GAP;
  const x1 = x0 + n.labelW;
  const y0 = n.y - LABEL_H / 2;
  const y1 = n.y + LABEL_H / 2;
  if (n.labelW > 0) {
    for (const [cx, cy, a0] of [
      [x1, y0, -Math.PI / 2],
      [x1, y1, 0],
      [x0, y1, Math.PI / 2],
      [x0, y0, Math.PI],
    ] as const) {
      for (let i = 0; i <= 3; i++) {
        const a = a0 + (i / 3) * (Math.PI / 2);
        pts.push([cx + pad * Math.cos(a), cy + pad * Math.sin(a)]);
      }
    }
  }
  return pts;
}

/** A cluster's hull: a rounded convex outline around its dots and labels (at zoom 1). */
export function hullOf(members: Shape[], pad = HULL_PAD): [number, number][] {
  if (!members.length) return [];
  return polygonHull(members.flatMap((n) => outline(n, pad))) ?? [];
}

/** True if any part of a node's dot or label lies inside the polygon. */
export function shapeInside(n: Shape, poly: [number, number][], margin = 3): boolean {
  if (poly.length < 3) return false;
  const pts: [number, number][] = [[n.x, n.y], ...ring(n.x, n.y, n.r + margin, 8)];
  if (n.labelW > 0) {
    const x0 = n.x + n.r + LABEL_GAP - margin;
    const x1 = n.x + n.r + LABEL_GAP + n.labelW + margin;
    const y0 = n.y - LABEL_H / 2 - margin;
    const y1 = n.y + LABEL_H / 2 + margin;
    pts.push([x0, y0], [x1, y0], [x1, y1], [x0, y1], [(x0 + x1) / 2, y0], [(x0 + x1) / 2, y1]);
  }
  return pts.some((p) => polygonContains(poly, p));
}

/**
 * Force layout, run once at build time (SPEC §7.2). Cluster centers sit on a circle; each node pulls toward its
 * cluster center, and nodes with no cluster toward the middle. Tangential works sit in a band just outside the
 * clusters. Links pull weakly. Boxes for dots and labels never overlap, and no node sits in a hull not its own.
 */
export function layoutLiterature(input: LayoutNodeInput[], clusterOrder: string[], links: { source: string; target: string }[]): Map<string, Point> {
  const sorted = [...input].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const clusters = clusterOrder.filter((c) => sorted.some((n) => n.cluster === c && !n.tangent));
  const area = (pred: (n: LayoutNodeInput) => boolean) => sorted.filter(pred).reduce((s, n) => s + footprint({ x: 0, y: 0, r: n.r, labelW: n.labelW }), 0);
  const radii = Object.fromEntries(clusters.map((c) => [c, Math.sqrt(area((n) => !n.tangent && n.cluster === c) / Math.PI)]));
  const middle = Math.sqrt(area((n) => !n.tangent && !(n.cluster && clusters.includes(n.cluster))) / Math.PI) * 2;
  const centers = clusterCenters(clusters, radii, middle);

  const nodes: SimNode[] = sorted.map((n) => {
    const tangent = !!n.tangent;
    const cluster = !tangent && n.cluster && centers.has(n.cluster) ? n.cluster : null;
    const [tx, ty] = (cluster && centers.get(cluster)) || [0, 0];
    const r = mulberry32(hash(n.id));
    const a = r() * 2 * Math.PI;
    const spread = cluster ? (radii[cluster] ?? 60) * 0.8 : tangent ? 0 : 40;
    const d = tangent ? 0 : spread * Math.sqrt(r());
    const base = { id: n.id, cluster, tangent, r: n.r, labelW: n.labelW, tx, ty };
    if (tangent) {
      // Start tangential works on a ring around everything; the band force pulls them in.
      const R = Math.max(200, ...[...centers.values()].map(([x, y]) => Math.hypot(x, y))) + Math.max(100, ...Object.values(radii)) + 80;
      return { ...base, x: R * Math.cos(a), y: R * Math.sin(a) };
    }
    return { ...base, x: tx + d * Math.cos(a), y: ty + d * Math.sin(a) };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const simLinks: SimulationLinkDatum<SimNode>[] = [...links]
    .filter((l) => byId.has(l.source) && byId.has(l.target) && l.source !== l.target)
    .map((l) => (l.source < l.target ? l : { source: l.target, target: l.source }))
    .sort((a, b) => (a.source + '|' + a.target < b.source + '|' + b.target ? -1 : 1))
    .filter((l, i, arr) => i === 0 || l.source !== arr[i - 1].source || l.target !== arr[i - 1].target)
    .map((l) => ({ source: l.source, target: l.target }));

  const members = (c: string) => nodes.filter((n) => n.cluster === c);
  // Each cluster's current extent, as an ellipse around its boxes.
  const extents = () =>
    clusters.map((c) => {
      const ms = members(c);
      const cx = ms.reduce((s, n) => s + boxCx(n), 0) / ms.length;
      const cy = ms.reduce((s, n) => s + n.y, 0) / ms.length;
      const rx = Math.max(...ms.map((n) => Math.abs(boxCx(n) - cx) + halfW(n)));
      const ry = Math.max(...ms.map((n) => Math.abs(n.y - cy) + halfH(n)));
      return { c, cx, cy, rx, ry };
    });

  // Keeps every node out of the area of clusters it does not belong to.
  const exclude = (alpha: number) => {
    for (const e of extents()) {
      for (const n of nodes) {
        if (n.cluster === e.c) continue;
        const dx = boxCx(n) - e.cx;
        const dy = n.y - e.cy;
        const ax = e.rx + HULL_PAD + halfW(n);
        const ay = e.ry + HULL_PAD + halfH(n);
        const dn = Math.hypot(dx / ax, dy / ay);
        if (dn >= 1) continue;
        const k = dn > 1e-6 ? 1 / dn - 1 : 1;
        n.vx = (n.vx ?? 0) + (dn > 1e-6 ? dx : ax) * k * alpha * 0.5;
        n.vy = (n.vy ?? 0) + (dn > 1e-6 ? dy : 0) * k * alpha * 0.5;
      }
    }
  };

  // Pulls each tangential work toward a band just outside the clusters: a ring around its nearest cluster (an
  // ellipse around the cluster's boxes, grown by a margin, with extra room above for the family name), on the
  // cluster's outer side, so the space between clusters stays for papers with no family. With no clusters, the
  // ring goes around all other nodes.
  const band = (alpha: number) => {
    let rings = extents().map((e) => ({ cx: e.cx, cy: e.cy, rx: e.rx + HULL_PAD, ry: e.ry + HULL_PAD, ox: 0, oy: 0 }));
    if (rings.length > 1) {
      const mx = rings.reduce((s, g) => s + g.cx, 0) / rings.length;
      const my = rings.reduce((s, g) => s + g.cy, 0) / rings.length;
      for (const g of rings) {
        const l = Math.hypot(g.cx - mx, g.cy - my) || 1;
        g.ox = (g.cx - mx) / l;
        g.oy = (g.cy - my) / l;
      }
    }
    if (!rings.length) {
      const core = nodes.filter((n) => !n.tangent);
      if (!core.length) return;
      const cx = core.reduce((s, n) => s + boxCx(n), 0) / core.length;
      const cy = core.reduce((s, n) => s + n.y, 0) / core.length;
      rings = [
        {
          cx,
          cy,
          rx: Math.max(...core.map((n) => Math.abs(boxCx(n) - cx) + halfW(n))),
          ry: Math.max(...core.map((n) => Math.abs(n.y - cy) + halfH(n))),
          ox: 0,
          oy: 0,
        },
      ];
    }
    for (const n of nodes) {
      if (!n.tangent) continue;
      const q: [number, number] = [boxCx(n), n.y];
      let best: { tx: number; ty: number; d: number } | null = null;
      for (const g of rings) {
        let dx = q[0] - g.cx;
        let dy = q[1] - g.cy;
        let d = Math.hypot(dx, dy);
        if (d < 1e-6) {
          const a = mulberry32(hash(n.id))() * 2 * Math.PI;
          dx = Math.cos(a);
          dy = Math.sin(a);
          d = 1;
        }
        let ux = dx / d;
        let uy = dy / d;
        // Facing the middle: turn to the cluster's flank instead.
        const inward = ux * g.ox + uy * g.oy;
        if (inward < 0) {
          ux -= inward * g.ox;
          uy -= inward * g.oy;
          const l = Math.hypot(ux, uy);
          if (l < 1e-6) {
            ux = -g.oy;
            uy = g.ox;
          } else {
            ux /= l;
            uy /= l;
          }
        }
        const edge = 1 / Math.hypot(ux / g.rx, uy / g.ry);
        const reach = edge + BAND_GAP + Math.abs(ux) * halfW(n) + Math.abs(uy) * halfH(n) + (uy < 0 ? -uy * 20 : 0);
        const tx = g.cx + ux * reach;
        const ty = g.cy + uy * reach;
        const dist = Math.hypot(tx - q[0], ty - q[1]);
        if (!best || dist < best.d) best = { tx, ty, d: dist };
      }
      n.vx = (n.vx ?? 0) + (best!.tx - q[0]) * 0.15 * alpha;
      n.vy = (n.vy ?? 0) + (best!.ty - q[1]) * 0.15 * alpha;
    }
  };

  // Clusters of wide label boxes pack in more columns than rows, so the vertical pull is weaker in proportion
  // to the boxes' shape; clusters then come out round rather than flat.
  const core = nodes.filter((n) => !n.tangent);
  const aspect = core.length ? core.reduce((s, n) => s + halfH(n), 0) / core.reduce((s, n) => s + halfW(n), 0) : 1;
  const pullY = Math.max(0.15, Math.min(1, aspect * 0.8));
  const pull = (d: SimNode) => (d.tangent ? 0 : d.cluster ? 0.1 : 0.16);

  const sim = forceSimulation<SimNode>(nodes)
    .randomSource(mulberry32(42))
    .force('x', forceX<SimNode>((d) => d.tx).strength(pull))
    .force('y', forceY<SimNode>((d) => d.ty).strength((d) => pull(d) * pullY))
    .force('band', band)
    .force(
      'link',
      forceLink<SimNode, SimulationLinkDatum<SimNode>>(simLinks)
        .id((d) => d.id)
        .distance(90)
        .strength((l) => ((l.source as SimNode).tangent || (l.target as SimNode).tangent ? 0.05 : 0.02)),
    )
    .force('exclude', exclude)
    .force('collide', (alpha: number) => separate(nodes, Math.min(1, 0.5 + alpha)))
    .stop();
  for (let i = 0; i < TICKS; i++) sim.tick();

  // Final passes: no overlapping boxes, and no node inside a hull it does not belong to.
  for (let pass = 0; pass < 400; pass++) {
    separate(nodes, 1);
    let moved = countOverlaps(nodes) > 0;
    for (const c of clusters) {
      const hull = hullOf(members(c));
      if (hull.length < 3) continue;
      const [cx, cy] = polygonCentroid(hull);
      for (const n of nodes) {
        if (n.cluster === c || !shapeInside(n, hull)) continue;
        const dx = n.x - cx;
        const dy = n.y - cy;
        const d = Math.hypot(dx, dy) || 1;
        n.x += (dx / d) * 6;
        n.y += (dy / d) * 6;
        moved = true;
      }
    }
    if (!moved) break;
  }

  return new Map(nodes.map((n) => [n.id, { x: Math.round(n.x * 10) / 10, y: Math.round(n.y * 10) / 10 }]));
}

/** Which papers are in the literature graph (SPEC §7.2): the core levels with a method block, plus tangential works. */
export function inLiteratureGraph(p: Pick<DbPaper, 'tangent' | 'method' | 'level'>, levels: readonly string[], tangents: boolean): boolean {
  if (p.tangent) return tangents;
  return !!p.method && !!p.level && levels.includes(p.level);
}

/** Lays out graph papers from their data: radius from links, label width from short name and year, cluster from family. */
export function layoutPapers(papers: GraphPaper[], familyOrder: string[]): Map<string, Point> {
  const ids = new Set(papers.map((p) => p.id));
  const input: LayoutNodeInput[] = papers.map((p) => ({
    id: p.id,
    cluster: !p.tangent && p.method?.family && familyOrder.includes(p.method.family) ? p.method.family : null,
    tangent: !!p.tangent,
    r: dotRadius(linkedPapers(p).size, !!p.tangent),
    labelW: labelWidth(p.short_name, p.year),
  }));
  const links = papers.flatMap((p) => [...linkedPapers(p)].filter((o) => ids.has(o)).map((o) => ({ source: o, target: p.id })));
  return layoutLiterature(input, familyOrder, links);
}

export interface LabelCandidate {
  id: string;
  x: number;
  y: number;
  r: number;
  /** Label width in screen pixels. */
  w: number;
  /** 0: always shown (hover, focus, selection, search). 1: preferred (neighbors of those). 2: the rest. */
  tier: 0 | 1 | 2;
}

/** Below zoom 1, only the larger dots get a label unless something asks for it: the top share of dot sizes,
 *  a share that grows as the reader zooms in, until every dot qualifies at zoom 1. */
export function labelMinRadius(radii: number[], k: number): number {
  if (k >= 1 || !radii.length) return 0;
  const sorted = [...radii].sort((a, b) => a - b);
  const q = Math.min(0.9, 1.4 * (1 - k));
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/**
 * Chooses which labels to show at zoom k, in screen space. Tier 0 always shows. Others show in tier order, then
 * by dot size, when they overlap no shown label, no other dot, and no block (such as a family name, given in
 * screen pixels at zoom k). Soft dots (faded while hovering) block only tier 2. Below zoom 1, tier 2 needs a
 * larger dot.
 */
export function placeLabels(
  cands: LabelCandidate[],
  dots: { id: string; x: number; y: number; r: number; soft?: boolean }[],
  k: number,
  opts: { minR?: number; blocks?: { x0: number; y0: number; x1: number; y1: number }[] } = {},
): Set<string> {
  const minR = opts.minR ?? labelMinRadius(dots.map((d) => d.r), k);
  const CELL = 48;
  type Box = { id: string; x0: number; x1: number; y0: number; y1: number; label: boolean; soft?: boolean };
  const grid = new Map<string, Box[]>();
  const cellsOf = (x0: number, y0: number, x1: number, y1: number) => {
    const out: string[] = [];
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j++) out.push(`${i},${j}`);
    return out;
  };
  const insert = (b: Box) => {
    for (const c of cellsOf(b.x0, b.y0, b.x1, b.y1)) {
      const list = grid.get(c);
      if (list) list.push(b);
      else grid.set(c, [b]);
    }
  };
  for (const d of dots) {
    const r = d.r * k - 0.5;
    if (r > 0) insert({ id: d.id, x0: d.x * k - r, x1: d.x * k + r, y0: d.y * k - r, y1: d.y * k + r, label: false, soft: d.soft });
  }
  for (const b of opts.blocks ?? []) insert({ id: '', ...b, label: true });
  const order = [...cands]
    .filter((c) => c.tier < 2 || k >= 1 || c.r >= minR)
    .sort((a, b) => a.tier - b.tier || b.r - a.r || (a.id < b.id ? -1 : 1));
  const shown = new Set<string>();
  for (const c of order) {
    const x0 = (c.x + c.r) * k + LABEL_GAP;
    const box = { id: c.id, x0, x1: x0 + c.w, y0: c.y * k - LABEL_H / 2, y1: c.y * k + LABEL_H / 2, label: true };
    if (c.tier > 0) {
      let hit = false;
      for (const cell of cellsOf(box.x0, box.y0, box.x1, box.y1)) {
        for (const o of grid.get(cell) ?? []) {
          if (!o.label && (o.id === c.id || (o.soft && c.tier < 2))) continue;
          if (o.x0 < box.x1 && box.x0 < o.x1 && o.y0 < box.y1 && box.y0 < o.y1) {
            hit = true;
            break;
          }
        }
        if (hit) break;
      }
      if (hit) continue;
    }
    shown.add(c.id);
    insert(box);
  }
  return shown;
}
