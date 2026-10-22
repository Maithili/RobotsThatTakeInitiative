// Literature graph geometry (SPEC §7.2): dot sizes, label text, the build-time spring layout, cluster hulls,
// and collision-aware label placement. Pure: the same data always gives the same result. Filters never reach it.
import { forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import { polygonCentroid, polygonContains, polygonHull } from 'd3-polygon';
import type { DbPaper } from '../schema.ts';
import { defaultBend, EDGE_CLEARANCE_PX, edgeRadius, routeAll, segmentsCross, type Pt, type RouteNode, type Routes } from './edgeRouting.ts';
import { FRAMEWORK_PAPER } from './scope.ts';

/** Dot radius at zoom 1 for a paper with no links; grows with links up to DOT_R_MAX. */
export const DOT_R_MIN = 7;
export const DOT_R_MAX = 16;
/** Tangential works are slightly smaller dots. */
export const TANGENT_R = 6;
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
/** Gap kept between two tangential groups, with room for their category labels. */
const GROUP_GAP = 44;
/** Pull of a tangential work toward its category's anchor, and the strength of its springs out of its category. */
const ANCHOR_PULL = 0.2;
const TANGENT_SPRING = 0.02;
/** Ticks during which a tangential group moves along with its anchor. */
const ANCHOR_CARRY_TICKS = 160;
const TICKS = 300;
/** Springs: every edge type pulls its two papers toward this distance, with this strength over the lower degree
 *  (d3's default). Springs across clusters are this much weaker, so the cluster pull still decides the cluster. */
const SPRING_LENGTH = 80;
const SPRING_STRENGTH = 1;
const SPRING_ACROSS = 0.05;
/** Repulsion between all nodes (d3 many-body strength). */
const CHARGE = -30;
/** Strength of the force that pushes nodes off edges they are not part of, and the simulation heat (alpha) below
 *  which it starts, once the layout has its rough shape. */
const EDGE_PUSH = 4;
const EDGE_PUSH_FROM = 0.3;
/** In the clean-up pass, one edge–node overlap costs as much as this many crossings. */
const OVERLAP_WEIGHT = 4;
/** The layout keeps nodes this much further from edges than the routing clearance, so few edges need routing. */
const LAYOUT_MARGIN = 3;
/** Rounds of the clean-up pass. */
const CLEANUP_ROUNDS = 2;

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

/** Text width estimate for the system UI font. The build-time layout spaces dots apart with it. Which labels show,
 *  and where, uses the widths the browser measures instead, since real widths vary with the visitor's fonts. */
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
  /** A tangential work's category (its tangent type). Each category pulls toward its own anchor in the band. */
  group?: string | null;
  r: number;
  /** Radius edges stop at and keep clear of (the dot, or the framework paper's ring). Defaults to r. */
  rr?: number;
  labelW: number;
}

/** An edge for the layout: `source` is the earlier work, where the drawn edge starts (SPEC §5.5). */
export interface LayoutLink {
  source: string;
  target: string;
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
  mark?: number;
  cluster: string | null;
  tangent: boolean;
  /** Tangential category, '' for none; null for core papers. */
  group: string | null;
  rr: number;
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

// ---------- edges in the layout ----------

interface SimEdge {
  a: SimNode;
  b: SimNode;
  mark?: number;
  /** The drawn default curve, center to center, as a polyline of five points, and its bounding box. */
  pts: Pt[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Recomputes an edge's polyline (edgeRouting.defaultCurve) and bounding box from its ends' positions. */
function refreshEdge(e: SimEdge) {
  const { a, b } = e;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = defaultBend(a, b);
  const cx = (a.x + b.x) / 2 - (dy / len) * bend;
  const cy = (a.y + b.y) / 2 + (dx / len) * bend;
  e.x0 = Infinity;
  e.y0 = Infinity;
  e.x1 = -Infinity;
  e.y1 = -Infinity;
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const u = 1 - t;
    const x = u * u * a.x + 2 * u * t * cx + t * t * b.x;
    const y = u * u * a.y + 2 * u * t * cy + t * t * b.y;
    e.pts[i] = [x, y];
    if (x < e.x0) e.x0 = x;
    if (x > e.x1) e.x1 = x;
    if (y < e.y0) e.y0 = y;
    if (y > e.y1) e.y1 = y;
  }
}

/** Distance a node keeps from edges it is not part of, center to edge: its radius, the routing clearance, a margin. */
const edgeNeed = (n: SimNode) => n.rr + EDGE_CLEARANCE_PX + LAYOUT_MARGIN;

/** Nearest point of a polyline to (px, py): distance, the point, and where along the edge it falls (0 at a, 1 at b). */
function nearest(px: number, py: number, pts: Pt[]): { d: number; qx: number; qy: number; t: number } {
  let bd = Infinity;
  let bqx = 0;
  let bqy = 0;
  let bt = 0;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0];
    const ay = pts[i - 1][1];
    const dx = pts[i][0] - ax;
    const dy = pts[i][1] - ay;
    const l2 = dx * dx + dy * dy;
    let s = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    s = s < 0 ? 0 : s > 1 ? 1 : s;
    const qx = ax + s * dx;
    const qy = ay + s * dy;
    const d = (px - qx) * (px - qx) + (py - qy) * (py - qy);
    if (d < bd) {
      bd = d;
      bqx = qx;
      bqy = qy;
      bt = (i - 1 + s) / (pts.length - 1);
    }
  }
  return { d: Math.sqrt(bd), qx: bqx, qy: bqy, t: bt };
}

/** True if (px, py) is within `need` of the polyline. */
function near(px: number, py: number, pts: Pt[], need: number): boolean {
  const n2 = need * need;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0];
    const ay = pts[i - 1][1];
    const dx = pts[i][0] - ax;
    const dy = pts[i][1] - ay;
    const l2 = dx * dx + dy * dy;
    let s = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    s = s < 0 ? 0 : s > 1 ? 1 : s;
    const ex = px - ax - s * dx;
    const ey = py - ay - s * dy;
    if (ex * ex + ey * ey < n2) return true;
  }
  return false;
}

/** Uniform grid of items by box, for finding nodes near an edge or edges near a node. Items carry a `mark`
 *  so a query returns each once. */
class Grid<T extends { mark?: number }> {
  private cells = new Map<number, T[]>();
  private where = new Map<T, number[]>();
  private stamp = 0;
  constructor(private cell: number) {}
  private key(i: number, j: number) {
    return (i + 32768) * 65536 + (j + 32768);
  }
  add(item: T, x0: number, y0: number, x1: number, y1: number) {
    const keys: number[] = [];
    const c = this.cell;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++)
      for (let j = Math.floor(y0 / c); j <= Math.floor(y1 / c); j++) {
        const k = this.key(i, j);
        keys.push(k);
        const list = this.cells.get(k);
        if (list) list.push(item);
        else this.cells.set(k, [item]);
      }
    this.where.set(item, keys);
  }
  remove(item: T) {
    for (const k of this.where.get(item) ?? []) {
      const list = this.cells.get(k)!;
      list.splice(list.indexOf(item), 1);
    }
    this.where.delete(item);
  }
  private collect(x0: number, y0: number, x1: number, y1: number, out: T[]) {
    const c = this.cell;
    const i1 = Math.floor(x1 / c);
    const j1 = Math.floor(y1 / c);
    for (let i = Math.floor(x0 / c); i <= i1; i++)
      for (let j = Math.floor(y0 / c); j <= j1; j++) {
        const list = this.cells.get(this.key(i, j));
        if (!list) continue;
        for (const it of list) {
          if (it.mark === this.stamp) continue;
          it.mark = this.stamp;
          out.push(it);
        }
      }
  }
  /** Items in cells that meet the box, each once, into `out` (cleared first). */
  query(x0: number, y0: number, x1: number, y1: number, out: T[]): T[] {
    out.length = 0;
    this.stamp++;
    this.collect(x0, y0, x1, y1, out);
    return out;
  }
  /** Items in cells that meet any segment of the path, grown by `pad`, each once, into `out` (cleared first). */
  queryPath(pts: Pt[], pad: number, out: T[]): T[] {
    out.length = 0;
    this.stamp++;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1];
      const q = pts[i];
      this.collect(Math.min(p[0], q[0]) - pad, Math.min(p[1], q[1]) - pad, Math.max(p[0], q[0]) + pad, Math.max(p[1], q[1]) + pad, out);
    }
    return out;
  }
}

function nodeGrid(nodes: SimNode[]): Grid<SimNode> {
  const g = new Grid<SimNode>(48);
  for (const n of nodes) g.add(n, n.x, n.y, n.x, n.y);
  return g;
}

/** Force: pushes each node away from edges it is not part of, and the edge's two ends the other way (SPEC §7.2). */
function pushFromEdges(nodes: SimNode[], edges: SimEdge[], alpha: number) {
  const grid = nodeGrid(nodes);
  let maxNeed = 0;
  for (const n of nodes) maxNeed = Math.max(maxNeed, edgeNeed(n));
  const found: SimNode[] = [];
  for (const e of edges) {
    refreshEdge(e);
    for (const o of grid.queryPath(e.pts, maxNeed, found)) {
      if (o === e.a || o === e.b) continue;
      const need = edgeNeed(o);
      if (o.x < e.x0 - need || o.x > e.x1 + need || o.y < e.y0 - need || o.y > e.y1 + need) continue;
      const q = nearest(o.x, o.y, e.pts);
      if (q.d >= need) continue;
      let ux = o.x - q.qx;
      let uy = o.y - q.qy;
      let l = Math.hypot(ux, uy);
      if (l < 1e-6) {
        // On the edge: push to one side, chosen per node.
        ux = e.b.y - e.a.y;
        uy = e.a.x - e.b.x;
        l = Math.hypot(ux, uy) || 1;
        if (hash(o.id) & 1) {
          ux = -ux;
          uy = -uy;
        }
      }
      ux /= l;
      uy /= l;
      const f = (need - q.d) * alpha * EDGE_PUSH;
      o.vx = (o.vx ?? 0) + ux * f * 0.7;
      o.vy = (o.vy ?? 0) + uy * f * 0.7;
      e.a.vx = (e.a.vx ?? 0) - ux * f * 0.3 * (1 - q.t);
      e.a.vy = (e.a.vy ?? 0) - uy * f * 0.3 * (1 - q.t);
      e.b.vx = (e.b.vx ?? 0) - ux * f * 0.3 * q.t;
      e.b.vy = (e.b.vy ?? 0) - uy * f * 0.3 * q.t;
    }
  }
}

/**
 * Clean-up after the simulation (SPEC §7.2): deterministic moves of one node at a time, each kept only if it lowers
 * the node's edge–node overlaps (weighted) plus edge crossings. A node never leaves its cluster's hull (so hulls
 * never grow), never enters a hull not its own, and never overlaps another node's dot or label.
 */
function untangle(nodes: SimNode[], edges: SimEdge[], clusters: string[], members: (c: string) => SimNode[]) {
  if (!edges.length) return;
  const nodesAt = nodeGrid(nodes);
  const edgesAt = new Grid<SimEdge>(96);
  for (const e of edges) {
    refreshEdge(e);
    edgesAt.add(e, e.x0, e.y0, e.x1, e.y1);
  }
  const incident = new Map<SimNode, SimEdge[]>(nodes.map((n) => [n, []]));
  for (const e of edges) {
    incident.get(e.a)!.push(e);
    incident.get(e.b)!.push(e);
  }
  let maxNeed = 0;
  let maxHalfW = 0;
  let maxHalfH = 0;
  for (const n of nodes) {
    maxNeed = Math.max(maxNeed, edgeNeed(n));
    maxHalfW = Math.max(maxHalfW, halfW(n));
    maxHalfH = Math.max(maxHalfH, halfH(n));
  }
  const start = new Map(nodes.map((n) => [n, [n.x, n.y] as const]));
  const nodeBuf: SimNode[] = [];
  const edgeBuf: SimEdge[] = [];

  const place = (v: SimNode, x: number, y: number) => {
    nodesAt.remove(v);
    v.x = x;
    v.y = y;
    nodesAt.add(v, x, y, x, y);
    for (const e of incident.get(v)!) {
      edgesAt.remove(e);
      refreshEdge(e);
      edgesAt.add(e, e.x0, e.y0, e.x1, e.y1);
    }
  };
  /** Overlaps involving v: v in the way of an edge, or an edge of v in the way of another node. */
  const overlapsOf = (v: SimNode) => {
    let n = 0;
    const need = edgeNeed(v);
    for (const e of edgesAt.query(v.x - need, v.y - need, v.x + need, v.y + need, edgeBuf)) {
      if (e.a === v || e.b === v) continue;
      if (v.x < e.x0 - need || v.x > e.x1 + need || v.y < e.y0 - need || v.y > e.y1 + need) continue;
      if (near(v.x, v.y, e.pts, need)) n++;
    }
    for (const e of incident.get(v)!) {
      for (const o of nodesAt.queryPath(e.pts, maxNeed, nodeBuf)) {
        if (o === e.a || o === e.b) continue;
        const no = edgeNeed(o);
        if (o.x < e.x0 - no || o.x > e.x1 + no || o.y < e.y0 - no || o.y > e.y1 + no) continue;
        if (near(o.x, o.y, e.pts, no)) n++;
      }
    }
    return n;
  };
  /** Crossings between v's edges and all others, as straight chords. Edges that share a node never count. */
  const crossingsOf = (v: SimNode) => {
    let n = 0;
    for (const e of incident.get(v)!) {
      const a: Pt = [e.a.x, e.a.y];
      const b: Pt = [e.b.x, e.b.y];
      for (const g of edgesAt.queryPath([a, b], 0, edgeBuf)) {
        if (g.a === e.a || g.a === e.b || g.b === e.a || g.b === e.b) continue;
        if (segmentsCross(a, b, [g.a.x, g.a.y], [g.b.x, g.b.y])) n++;
      }
    }
    return n;
  };
  const score = (v: SimNode) => OVERLAP_WEIGHT * overlapsOf(v) + crossingsOf(v);
  const boxClear = (v: SimNode) => {
    const cx = boxCx(v);
    const hw = halfW(v);
    const hh = halfH(v);
    for (const o of nodesAt.query(cx - hw - 2 * maxHalfW, v.y - hh - maxHalfH, cx + hw + 2 * maxHalfW, v.y + hh + maxHalfH, nodeBuf)) {
      if (o === v) continue;
      if (hw + halfW(o) - Math.abs(cx - boxCx(o)) > 0 && hh + halfH(o) - Math.abs(v.y - o.y) > 0) return false;
    }
    return true;
  };

  const DIRS: [number, number][] = [];
  for (let i = 0; i < 8; i++) DIRS.push([Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)]);
  const order = [...nodes].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (let round = 0; round < CLEANUP_ROUNDS; round++) {
    const hulls = new Map(clusters.map((c) => [c, hullOf(members(c))]));
    const allowed = (v: SimNode) => {
      if (!boxClear(v)) return false;
      if (v.cluster) {
        // Inside the cluster's hull, or the hull grows only where no other node sits.
        for (const [c, other] of hulls) if (c !== v.cluster && shapeInside(v, other)) return false;
        const h = hulls.get(v.cluster)!;
        if (h.length < 3) return true;
        const ol = outline(v, HULL_PAD);
        if (ol.every((p) => polygonContains(h, p))) return true;
        const grown = polygonHull([...h, ...ol]);
        if (!grown) return true;
        let gx0 = Infinity;
        let gy0 = Infinity;
        let gx1 = -Infinity;
        let gy1 = -Infinity;
        for (const [x, y] of grown) {
          gx0 = Math.min(gx0, x);
          gy0 = Math.min(gy0, y);
          gx1 = Math.max(gx1, x);
          gy1 = Math.max(gy1, y);
        }
        const pad = maxHalfW * 2 + HULL_PAD;
        for (const o of nodesAt.query(gx0 - pad, gy0 - pad, gx1 + pad, gy1 + pad, nodeBuf)) {
          if (o.cluster !== v.cluster && shapeInside(o, grown)) return false;
        }
        return true;
      }
      for (const h of hulls.values()) if (shapeInside(v, h)) return false;
      if (v.tangent) {
        // Tangential works stay in their band.
        const [sx, sy] = start.get(v)!;
        if (Math.hypot(v.x - sx, v.y - sy) > 30) return false;
      }
      return true;
    };
    let improved = 0;
    for (const v of order) {
      const base = score(v);
      if (base === 0) continue;
      const x0 = v.x;
      const y0 = v.y;
      const cands: [number, number][] = [];
      // Straight out of the way of each edge v blocks, then small steps in eight directions.
      const need = edgeNeed(v);
      for (const e of edgesAt.query(x0 - need, y0 - need, x0 + need, y0 + need, edgeBuf)) {
        if (e.a === v || e.b === v) continue;
        const q = nearest(x0, y0, e.pts);
        if (q.d >= need || q.d < 1e-6) continue;
        const k = (need - q.d + 1) / q.d;
        cands.push([x0 + (x0 - q.qx) * k, y0 + (y0 - q.qy) * k]);
      }
      for (const step of [6, 14]) for (const [dx, dy] of DIRS) cands.push([x0 + dx * step, y0 + dy * step]);
      let best = { s: base, x: x0, y: y0 };
      for (const [x, y] of cands) {
        place(v, x, y);
        if (allowed(v)) {
          const s = score(v);
          if (s < best.s) best = { s, x, y };
        }
      }
      place(v, best.x, best.y);
      if (best.x !== x0 || best.y !== y0) {
        improved++;
        if (v.cluster) hulls.set(v.cluster, hullOf(members(v.cluster)));
      }
    }
    if (!improved) break;
  }
}

/**
 * Spring layout, run once at build time (SPEC §7.2). Cluster centers sit on a circle; each node pulls toward its
 * cluster center, and nodes with no cluster toward the middle. Tangential works pull toward an anchor for their
 * category in the band just outside the clusters, so each category forms a loose group. Every edge is a spring, all
 * nodes repel each other, and a force pushes each node away from edges it is not part of. Boxes for dots and labels
 * never overlap, and no node sits in a hull not its own. A clean-up pass then nudges nodes, within their cluster, to
 * clear the remaining edge–node overlaps and reduce crossings.
 */
export function layoutLiterature(input: LayoutNodeInput[], clusterOrder: string[], links: LayoutLink[]): Map<string, Point> {
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
    // Tangential works move to their category's anchor once the anchors are placed (below).
    const group = tangent ? n.group ?? '' : null;
    return { id: n.id, cluster, tangent, group, r: n.r, rr: n.rr ?? n.r, labelW: n.labelW, tx, ty, x: tx + d * Math.cos(a), y: ty + d * Math.sin(a) };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const valid = links.filter((l) => byId.has(l.source) && byId.has(l.target) && l.source !== l.target);
  // Drawn edges, by direction (an edge bends to the left of its direction), each once.
  const dlinks: SimEdge[] = [...new Map(valid.map((l) => [`${l.source}>${l.target}`, l])).values()]
    .sort((a, b) => (a.source + '|' + a.target < b.source + '|' + b.target ? -1 : 1))
    .map((l) => ({ a: byId.get(l.source)!, b: byId.get(l.target)!, pts: [], x0: 0, y0: 0, x1: 0, y1: 0 }));
  // Springs, one per pair.
  const simLinks: SimulationLinkDatum<SimNode>[] = [...valid]
    .map((l) => (l.source < l.target ? l : { source: l.target, target: l.source }))
    .sort((a, b) => (a.source + '|' + a.target < b.source + '|' + b.target ? -1 : 1))
    .filter((l, i, arr) => i === 0 || l.source !== arr[i - 1].source || l.target !== arr[i - 1].target)
    .map((l) => ({ source: l.source, target: l.target }));
  const degree = new Map<string, number>();
  for (const l of simLinks) for (const id of [l.source, l.target] as string[]) degree.set(id, (degree.get(id) ?? 0) + 1);

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

  // Clusters of wide label boxes pack in more columns than rows, so the vertical pull is weaker in proportion
  // to the boxes' shape; clusters then come out round rather than flat.
  const core = nodes.filter((n) => !n.tangent);
  const aspect = core.length ? core.reduce((s, n) => s + halfH(n), 0) / core.reduce((s, n) => s + halfW(n), 0) : 1;
  const pullY = Math.max(0.15, Math.min(1, aspect * 0.8));
  const pull = (d: SimNode) => (d.tangent ? 0 : d.cluster ? 0.1 : 0.16);

  // ---- tangential groups (SPEC §7.2) ----
  // Each category gets an anchor in the band just outside the clusters, in a direction of its own from the
  // middle: first the gaps between neighboring clusters, then the clusters' outer sides, then evenly around. A
  // category takes the free direction closest to the papers it links to. Along that direction, the anchor sits
  // at the least distance that keeps the group (a disk sized to its papers) clear of every cluster, of the papers
  // with no family, and of the groups placed before it. Its papers pull toward it and form a loose group.
  const tangents = nodes.filter((n) => n.tangent);
  const size = new Map<string, number>();
  for (const n of tangents) size.set(n.group!, (size.get(n.group!) ?? 0) + 1);
  const groupIds = [...size.keys()].sort((a, b) => size.get(b)! - size.get(a)! || (a < b ? -1 : a > b ? 1 : 0));
  const anchors = new Map<string, { ux: number; uy: number; rho: number; x: number; y: number }>();
  if (groupIds.length) {
    const k = clusters.length;
    const dirs: { a: number; gap: boolean }[] = [];
    if (k >= 2) {
      for (let i = 0; i < k; i++) dirs.push({ a: Math.PI + (2 * Math.PI * (i + 0.5)) / k, gap: true });
      for (let i = 0; i < k; i++) dirs.push({ a: Math.PI + (2 * Math.PI * i) / k, gap: false });
    }
    const more = Math.max(8, 2 * groupIds.length);
    for (let i = 0; i < more; i++) dirs.push({ a: -Math.PI / 2 + (2 * Math.PI * i) / more, gap: k < 2 });
    const angDist = (a: number, b: number) => Math.abs(((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    // Preferred direction: toward the core papers a category links to, at their starting targets.
    const prefer = new Map<string, number | null>();
    for (const g of groupIds) {
      let sx = 0;
      let sy = 0;
      let m = 0;
      for (const l of valid) {
        const a = byId.get(l.source)!;
        const b = byId.get(l.target)!;
        const other = a.group === g ? b : b.group === g ? a : null;
        if (!other || other.tangent) continue;
        sx += other.tx;
        sy += other.ty;
        m++;
      }
      prefer.set(g, m && Math.hypot(sx, sy) > 1e-6 ? Math.atan2(sy, sx) : null);
    }
    const used: number[] = [];
    for (const g of groupIds) {
      const p = prefer.get(g)!;
      let best = -1;
      let bestCost = Infinity;
      // Two groups keep at least 30 degrees apart when they can.
      for (const spaced of [true, false]) {
        dirs.forEach((d, i) => {
          if (used.includes(i) || (spaced && used.some((j) => angDist(dirs[j].a, d.a) < Math.PI / 6))) return;
          const cost = (p === null ? 0 : angDist(d.a, p)) + (d.gap ? 0 : 1.2);
          if (cost < bestCost - 1e-9) {
            bestCost = cost;
            best = i;
          }
        });
        if (best >= 0) break;
      }
      used.push(best);
      const rho = Math.sqrt(tangents.filter((n) => n.group === g).reduce((s, n) => s + footprint(n), 0) / Math.PI);
      anchors.set(g, { ux: Math.cos(dirs[best].a), uy: Math.sin(dirs[best].a), rho, x: 0, y: 0 });
    }
  }
  const placeAnchors = () => {
    const ext = extents();
    const loose = core.filter((n) => !n.cluster);
    const placed: { x: number; y: number; rho: number }[] = [];
    for (const g of groupIds) {
      const a = anchors.get(g)!;
      const need = a.rho + BAND_GAP;
      let R = 0;
      for (; R < 20000; R += 6) {
        const x = R * a.ux;
        const y = R * a.uy;
        // Clear of each cluster's ellipse (with room above it for the family name), ...
        if (ext.some((e) => ((x - e.cx) / (e.rx + HULL_PAD + need)) ** 2 + ((y - e.cy) / (e.ry + HULL_PAD + need + (y < e.cy ? 20 : 0))) ** 2 < 1)) continue;
        // ... of the papers with no family, ...
        if (loose.some((n) => Math.hypot(Math.max(0, Math.abs(x - boxCx(n)) - halfW(n)), Math.max(0, Math.abs(y - n.y) - halfH(n))) < need)) continue;
        // ... and of the groups placed before.
        if (placed.some((o) => Math.hypot(x - o.x, y - o.y) < o.rho + a.rho + GROUP_GAP)) continue;
        break;
      }
      a.x = R * a.ux;
      a.y = R * a.uy;
      placed.push(a);
    }
  };
  placeAnchors();
  // Tangential works start spread around their anchor.
  for (const n of tangents) {
    const a = anchors.get(n.group!)!;
    const r = mulberry32(hash(`${n.id}#group`));
    const t = r() * 2 * Math.PI;
    const d = a.rho * 0.8 * Math.sqrt(r());
    n.x = a.x + d * Math.cos(t);
    n.y = a.y + d * Math.sin(t);
  }
  let anchorTick = 0;
  const anchorPull = (alpha: number) => {
    if (anchorTick % 4 === 0) {
      const before = new Map([...anchors].map(([g, a]) => [g, [a.x, a.y]]));
      placeAnchors();
      // While the clusters grow into shape, each group moves with its anchor, so no work gets caught behind a
      // cluster on its way out.
      if (anchorTick < ANCHOR_CARRY_TICKS) {
        for (const n of tangents) {
          const a = anchors.get(n.group!)!;
          const [x0, y0] = before.get(n.group!)!;
          n.x += a.x - x0;
          n.y += a.y - y0;
        }
      }
    }
    anchorTick++;
    for (const n of tangents) {
      const a = anchors.get(n.group!)!;
      n.vx = (n.vx ?? 0) + (a.x - boxCx(n)) * ANCHOR_PULL * alpha;
      n.vy = (n.vy ?? 0) + (a.y - n.y) * ANCHOR_PULL * Math.sqrt(pullY) * alpha;
    }
  };

  const spring = (l: SimulationLinkDatum<SimNode>) => {
    const a = l.source as SimNode;
    const b = l.target as SimNode;
    const k = SPRING_STRENGTH / Math.min(degree.get(a.id) ?? 1, degree.get(b.id) ?? 1);
    // A tangential work's springs to other categories and to the core stay weak, so its category's anchor
    // decides where it sits.
    if (a.tangent || b.tangent) return a.group === b.group ? k * 0.5 : TANGENT_SPRING;
    return a.cluster === b.cluster ? k : k * SPRING_ACROSS;
  };

  let tick = 0;
  const sim = forceSimulation<SimNode>(nodes)
    .randomSource(mulberry32(42))
    .force('x', forceX<SimNode>((d) => d.tx).strength(pull))
    .force('y', forceY<SimNode>((d) => d.ty).strength((d) => pull(d) * pullY))
    .force('anchor', anchorPull)
    .force(
      'link',
      forceLink<SimNode, SimulationLinkDatum<SimNode>>(simLinks)
        .id((d) => d.id)
        .distance(SPRING_LENGTH)
        .strength(spring),
    )
    .force('charge', forceManyBody<SimNode>().strength(CHARGE).distanceMax(160))
    // The edge push starts once the layout has its rough shape, and runs every other tick at double strength.
    .force('edges', (alpha: number) => {
      if (alpha < EDGE_PUSH_FROM && (tick++ & 1)) pushFromEdges(nodes, dlinks, 2 * alpha);
    })
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

  untangle(nodes, dlinks, clusters, members);

  return new Map(nodes.map((n) => [n.id, { x: Math.round(n.x * 10) / 10, y: Math.round(n.y * 10) / 10 }]));
}

/** Which papers are in the literature graph (SPEC §7.2): the core levels with a method block, plus tangential works. */
export function inLiteratureGraph(p: Pick<DbPaper, 'tangent' | 'method' | 'level'>, levels: readonly string[], tangents: boolean): boolean {
  if (p.tangent) return tangents;
  return !!p.method && !!p.level && levels.includes(p.level);
}

/** Edges among the given papers, each from the earlier work to the paper that builds on, benchmarks, or cites it. */
export function graphLinks(papers: GraphPaper[]): LayoutLink[] {
  const ids = new Set(papers.map((p) => p.id));
  return papers.flatMap((p) =>
    [...new Set([...(p.method?.builds_on ?? []), ...p.benchmarks_against, ...p.cites])].filter((o) => o !== p.id && ids.has(o)).map((o) => ({ source: o, target: p.id })),
  );
}

/** Lays out graph papers from their data: radius from links, label width from short name and year, cluster from family. */
export function layoutPapers(papers: GraphPaper[], familyOrder: string[], framework: string = FRAMEWORK_PAPER): Map<string, Point> {
  const input: LayoutNodeInput[] = papers.map((p) => {
    const r = dotRadius(linkedPapers(p).size, !!p.tangent);
    return {
      id: p.id,
      cluster: !p.tangent && p.method?.family && familyOrder.includes(p.method.family) ? p.method.family : null,
      tangent: !!p.tangent,
      group: p.tangent ?? null,
      r,
      rr: edgeRadius(r, p.id === framework),
      labelW: labelWidth(p.short_name, p.year),
    };
  });
  return layoutLiterature(input, familyOrder, graphLinks(papers));
}

/** Graph papers as routing obstacles: position, and the radius edges keep clear of (dot, or the framework ring). */
export function routeNodes(papers: GraphPaper[], pos: Map<string, Point>, framework: string = FRAMEWORK_PAPER): RouteNode[] {
  return papers
    .filter((p) => pos.has(p.id))
    .map((p) => ({ id: p.id, ...pos.get(p.id)!, rr: edgeRadius(dotRadius(linkedPapers(p).size, !!p.tangent), p.id === framework) }));
}

/** Routes every graph edge around the nodes in its way, per zoom step (SPEC §7.2 Edge routing). Build time. */
export function routePapers(papers: GraphPaper[], pos: Map<string, Point>, framework: string = FRAMEWORK_PAPER): Routes {
  return routeAll(
    routeNodes(papers, pos, framework),
    graphLinks(papers).map((l) => ({ from: l.source, to: l.target })),
  );
}

/** Top and bottom of a paper label's box, from its dot's center, in screen pixels. The browser measures them; this
 *  default holds only where nothing has been measured. */
export const LABEL_Y: readonly [number, number] = [-LABEL_H / 2, LABEL_H / 2];

export interface LabelCandidate {
  id: string;
  x: number;
  y: number;
  r: number;
  /** Label width in screen pixels, from LABEL_GAP past the dot's edge to the end of the text. */
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
 * larger dot. A label's box runs from LABEL_GAP past its dot's edge for its width, and from `labelY` above and
 * below its dot's center.
 */
export function placeLabels(
  cands: LabelCandidate[],
  dots: { id: string; x: number; y: number; r: number; soft?: boolean }[],
  k: number,
  opts: { minR?: number; blocks?: { x0: number; y0: number; x1: number; y1: number }[]; labelY?: readonly [number, number] } = {},
): Set<string> {
  const minR = opts.minR ?? labelMinRadius(dots.map((d) => d.r), k);
  const [ly0, ly1] = opts.labelY ?? LABEL_Y;
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
    const box = { id: c.id, x0, x1: x0 + c.w, y0: c.y * k + ly0, y1: c.y * k + ly1, label: true };
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

// ---------- hover cards ----------

/** Space kept between a hover card and the edges of the graph's viewport. */
export const TIP_PAD = 6;
/** What covering a whole highlighted edge costs a hover card; covering part of one costs that share of it. */
const TIP_LINE_COST = 150;

/** A screen box with the cost of covering it with a hover card. */
export interface CoverBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cost: number;
  /** Costs only the share of it that is covered, as for a long name a card may clip at one end. */
  partial?: boolean;
}

/**
 * Picks where a hover card of size w × h goes in a viewport of size W × H, in screen pixels. Each candidate is a
 * left and top, with an optional cost of its own (a less natural side). A spot also costs what it covers: boxes by
 * their cost, and each edge (given as sample points) by the share of its points it covers, plus a large cost per
 * pixel it leaves the viewport. The cheapest wins, ties going to the earlier candidate, and the result is clamped
 * into the viewport.
 */
export function pickTipSpot(
  cands: [number, number, number?][],
  w: number,
  h: number,
  W: number,
  H: number,
  covers: CoverBox[],
  lines: [number, number][][] = [],
): [number, number] {
  let best: [number, number] = cands[0] ? [cands[0][0], cands[0][1]] : [TIP_PAD, TIP_PAD];
  let bestCost = Infinity;
  cands.forEach(([x, y, own = 0], i) => {
    const x1 = x + w;
    const y1 = y + h;
    let c = own + 1e4 * (Math.max(0, TIP_PAD - x) + Math.max(0, x1 - (W - TIP_PAD)) + Math.max(0, TIP_PAD - y) + Math.max(0, y1 - (H - TIP_PAD)));
    for (const b of covers) {
      if (!(b.x0 < x1 && x < b.x1 && b.y0 < y1 && y < b.y1)) continue;
      const share = b.partial ? ((Math.min(x1, b.x1) - Math.max(x, b.x0)) * (Math.min(y1, b.y1) - Math.max(y, b.y0))) / Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0)) : 1;
      c += b.cost * share;
    }
    for (const pts of lines) {
      if (!pts.length) continue;
      const inside = pts.filter(([px, py]) => px > x && px < x1 && py > y && py < y1).length;
      c += (TIP_LINE_COST * inside) / pts.length;
    }
    c += i * 0.01;
    if (c < bestCost) {
      bestCost = c;
      best = [x, y];
    }
  });
  const fit = (v: number, size: number, room: number) => Math.max(TIP_PAD, Math.min(v, room - size - TIP_PAD));
  return [fit(best[0], w, W), fit(best[1], h, H)];
}

// ---------- tangential category labels ----------

/** A box in screen pixels at the current zoom. */
export interface ScreenBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface GroupLabelInput {
  id: string;
  /** Label width and height in screen pixels. */
  w: number;
  h: number;
  /** The group's dots, at zoom 1, with their label widths in screen pixels. */
  members: { x: number; y: number; r: number; labelW: number }[];
}

/** True if the segment from a to b meets the box (Liang–Barsky clipping). */
function segmentMeetsBox(ax: number, ay: number, bx: number, by: number, b: ScreenBox): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  for (const [p, q] of [
    [-dx, ax - b.x0],
    [dx, b.x1 - ax],
    [-dy, ay - b.y0],
    [dy, b.y1 - ay],
  ]) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

const meets = (a: ScreenBox, b: ScreenBox) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
/** True if two screen boxes overlap. */
export const boxesMeet = meets;

/**
 * Places one text label per tangential category, near its papers (SPEC §7.2), at zoom k in screen space. Each
 * label tries spots around its group and around each of its papers, and takes the one that covers the fewest dots,
 * node labels, other category labels, blocks (such as family names), and edges, stays out of family hulls and
 * inside the content bounds (so fitting keeps it in view), and sits closest to its papers. Deterministic.
 */
export function placeGroupLabels(
  groups: GroupLabelInput[],
  k: number,
  ctx: {
    /** Every visible dot, at zoom 1. */
    dots: { x: number; y: number; r: number }[];
    /** Node labels that may show at this zoom, as dot and label width; the label sits right of the dot. */
    labels?: { x: number; y: number; r: number; w: number }[];
    /** Top and bottom of a node label, from its dot's center, in screen pixels. */
    labelY?: readonly [number, number];
    /** Drawn edges as polylines, at zoom 1. */
    edges?: Pt[][];
    /** Family hulls, at zoom 1. */
    hulls?: [number, number][][];
    /** Boxes to keep clear of, in screen pixels at zoom k. */
    blocks?: ScreenBox[];
    /** Content bounds, at zoom 1. */
    bounds?: { x0: number; y0: number; x1: number; y1: number };
  },
): Map<string, ScreenBox> {
  const CELL = 64;
  type Item = { kind: 'dot' | 'label' | 'block' | 'group'; box: ScreenBox; mark: number };
  const grid = new Map<number, Item[]>();
  const key = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);
  const add = (it: Item) => {
    for (let i = Math.floor(it.box.x0 / CELL); i <= Math.floor(it.box.x1 / CELL); i++)
      for (let j = Math.floor(it.box.y0 / CELL); j <= Math.floor(it.box.y1 / CELL); j++) {
        const list = grid.get(key(i, j));
        if (list) list.push(it);
        else grid.set(key(i, j), [it]);
      }
  };
  const [ly0, ly1] = ctx.labelY ?? LABEL_Y;
  for (const d of ctx.dots) add({ kind: 'dot', box: { x0: (d.x - d.r) * k, x1: (d.x + d.r) * k, y0: (d.y - d.r) * k, y1: (d.y + d.r) * k }, mark: 0 });
  for (const l of ctx.labels ?? []) {
    const x0 = (l.x + l.r) * k + LABEL_GAP;
    add({ kind: 'label', box: { x0, x1: x0 + l.w, y0: l.y * k + ly0, y1: l.y * k + ly1 }, mark: 0 });
  }
  for (const b of ctx.blocks ?? []) add({ kind: 'block', box: b, mark: 0 });
  const segs = (ctx.edges ?? []).map((pts) => {
    const sp = pts.map(([x, y]) => [x * k, y * k] as Pt);
    const xs = sp.map((p) => p[0]);
    const ys = sp.map((p) => p[1]);
    return { sp, box: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } };
  });
  const hulls = (ctx.hulls ?? []).filter((h) => h.length >= 3).map((h) => h.map(([x, y]) => [x * k, y * k] as [number, number]));
  const B = ctx.bounds ? { x0: ctx.bounds.x0 * k, x1: ctx.bounds.x1 * k, y0: ctx.bounds.y0 * k, y1: ctx.bounds.y1 * k } : null;
  let stamp = 0;

  const cost = (b: ScreenBox, cx: number, cy: number, spread: number, near: (b: ScreenBox) => number) => {
    let c = 0;
    stamp++;
    for (let i = Math.floor(b.x0 / CELL); i <= Math.floor(b.x1 / CELL); i++)
      for (let j = Math.floor(b.y0 / CELL); j <= Math.floor(b.y1 / CELL); j++)
        for (const it of grid.get(key(i, j)) ?? []) {
          if (it.mark === stamp || !meets(it.box, b)) continue;
          it.mark = stamp;
          c += it.kind === 'label' ? 80 : 1000;
        }
    for (const s of segs) {
      if (!meets(s.box, b)) continue;
      for (let i = 1; i < s.sp.length; i++) {
        if (segmentMeetsBox(s.sp[i - 1][0], s.sp[i - 1][1], s.sp[i][0], s.sp[i][1], b)) {
          c += 40;
          break;
        }
      }
    }
    const probes: [number, number][] = [
      [b.x0, b.y0],
      [b.x1, b.y0],
      [b.x0, b.y1],
      [b.x1, b.y1],
      [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2],
    ];
    if (hulls.some((h) => probes.some((p) => polygonContains(h, p)))) c += 300;
    // Outside the content bounds, a label may fall outside the fitted view: worse than covering a dot.
    if (B) c += 60 * (Math.max(0, B.x0 - b.x0) + Math.max(0, b.x1 - B.x1) + Math.max(0, B.y0 - b.y0) + Math.max(0, b.y1 - B.y1));
    const dc = Math.hypot((b.x0 + b.x1) / 2 - cx, (b.y0 + b.y1) / 2 - cy);
    return c + 0.5 * near(b) + 0.15 * Math.max(0, dc - spread);
  };

  const out = new Map<string, ScreenBox>();
  for (const g of groups) {
    if (!g.members.length) continue;
    const ms = g.members.map((m) => ({ x: m.x * k, y: m.y * k, r: m.r * k, lw: m.labelW }));
    const cx = ms.reduce((s, m) => s + m.x, 0) / ms.length;
    const cy = ms.reduce((s, m) => s + m.y, 0) / ms.length;
    const spread = Math.max(...ms.map((m) => Math.hypot(m.x - cx, m.y - cy) + m.r));
    const bx0 = Math.min(...ms.map((m) => m.x - m.r));
    const bx1 = Math.max(...ms.map((m) => m.x + m.r));
    const by0 = Math.min(...ms.map((m) => m.y - m.r));
    const by1 = Math.max(...ms.map((m) => m.y + m.r));
    const below = Math.max(by1, ...ms.map((m) => m.y + ly1));
    const lx1 = Math.max(...ms.map((m) => m.x + m.r + LABEL_GAP + m.lw));
    const { w, h } = g;
    const gap = 4;
    const tops: [number, number][] = [];
    // Around the group: above and below (left, centered, right), to the left, and to the right past the labels.
    for (const x of [bx0, (bx0 + bx1) / 2 - w / 2, bx1 - w]) tops.push([x, by0 - h - gap], [x, below + gap]);
    for (const y of [cy - h / 2, by0, by1 - h]) tops.push([bx0 - w - 2 * gap, y], [lx1 + 2 * gap, y]);
    // Around each paper.
    for (const m of ms) {
      tops.push([m.x - w / 2, m.y - m.r - h - gap], [m.x - w / 2, m.y + m.r + gap], [m.x - m.r, m.y - m.r - h - gap], [m.x - m.r, m.y + m.r + gap]);
      tops.push([m.x - m.r - gap - w, m.y - h / 2], [m.x + m.r + LABEL_GAP + m.lw + 2 * gap, m.y - h / 2]);
    }
    // A ring around the group, for crowded spots.
    for (let i = 0; i < 16; i++) {
      const a = (2 * Math.PI * i) / 16;
      tops.push([cx + Math.cos(a) * (spread + h) - w / 2, cy + Math.sin(a) * (spread + h) - h / 2]);
    }
    // Each spot also moved inside the content bounds, for small zooms, where a label is wide next to the graph.
    if (B) {
      for (const [x, y] of [...tops]) {
        const cx2 = Math.max(B.x0, Math.min(x, B.x1 - w));
        const cy2 = Math.max(B.y0, Math.min(y, B.y1 - h));
        if (cx2 !== x || cy2 !== y) tops.push([cx2, cy2]);
      }
    }
    const near = (b: ScreenBox) => Math.min(...ms.map((m) => Math.hypot(Math.max(0, b.x0 - m.x, m.x - b.x1), Math.max(0, b.y0 - m.y, m.y - b.y1))));
    let best: { box: ScreenBox; c: number } | null = null;
    for (const [x, y] of tops) {
      const box = { x0: x, y0: y, x1: x + w, y1: y + h };
      const c = cost(box, cx, cy, spread, near);
      if (!best || c < best.c - 1e-9) best = { box, c };
    }
    out.set(g.id, best!.box);
    add({ kind: 'group', box: best!.box, mark: 0 });
  }
  return out;
}
