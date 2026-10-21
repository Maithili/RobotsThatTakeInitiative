// Edge geometry and routing for the literature graph (SPEC §7.2 Edge routing). Pure and deterministic, shared by
// the build (which lays out the graph and routes its edges) and the graph (which draws the routes).
//
// Every edge is a quadratic curve that bends slightly to the left of its direction. No edge may pass within
// clearance of a node that is not one of its ends: the node's drawn radius plus EDGE_CLEARANCE_PX screen pixels.
// Positions and radii are in graph units (screen pixels at zoom 1). Dots scale with zoom but the 6 px gap does not,
// so at zoom k the gap is 6 / k graph units. The build routes every edge once per zoom step (ROUTE_STEPS) and
// stores only the routes that differ from the default curve; the graph draws the route for its zoom step.

export const EDGE_CLEARANCE_PX = 6;
/** Extra radius of the framework paper's ring around its dot, at zoom 1. */
export const FRAMEWORK_RING = 3.5;

/** Zoom steps the build routes edges for, from 1 down. A route made for a step clears at every zoom at or above
 *  it, so the graph uses the largest step at or below its zoom. Below the last step, routes do their best. */
export const ROUTE_STEPS: readonly number[] = [1, 0.8, 0.64, 0.512, 0.41, 0.328];

/** Index into ROUTE_STEPS for zoom k: the largest step at or below k, or the last step. */
export function stepIndex(k: number): number {
  const i = ROUTE_STEPS.findIndex((s) => k >= s - 1e-9);
  return i < 0 ? ROUTE_STEPS.length - 1 : i;
}

/** Radius edges stop at and keep clear of: the dot, or the ring around the framework paper's dot. */
export function edgeRadius(r: number, framework = false): number {
  return framework ? r + FRAMEWORK_RING + 1 : r;
}

export type Pt = [number, number];

export interface RouteNode {
  id: string;
  x: number;
  y: number;
  /** Drawn radius: the dot, or its ring (edgeRadius). */
  rr: number;
}

export interface EdgeGeometry {
  /** SVG path data. */
  d: string;
  /** Point halfway along the path, for the edge's hover card. */
  mid: Pt;
  /** The drawn path, sampled, for clearance and crossing checks. */
  pts: Pt[];
  /** default: the plain curve. bend: its control point moved sideways. waypoints: a smooth path around obstacles. */
  kind: 'default' | 'bend' | 'waypoints';
}

/** A stored route: the control point's offset to the left of the edge, or waypoints (x, y, x, y, …) with a
 *  tension. Null or absent means the default curve. */
export type RouteSpec = { bend: number } | { way: number[]; tension: number };

/** Routes by edge key ("from>to"), one entry per ROUTE_STEPS step; only edges with some non-default route. */
export type Routes = Record<string, (RouteSpec | null)[]>;

export const edgeKey = (from: string, to: string) => `${from}>${to}`;

/** Gap between a node's drawn edge and the start or end of its edges. */
const END_GAP = 1.5;
/** Default bend: the control point sits this share of the edge's length to the left, up to DEFAULT_BEND_MAX. */
const DEFAULT_BEND = 0.12;
const DEFAULT_BEND_MAX = 36;

const r1 = (v: number) => Math.round(v * 10) / 10;

/** The 6 px gap in graph units at zoom k. Above zoom 1 the zoom-1 gap is kept, which is then more than 6 px. */
const gapAt = (k: number) => EDGE_CLEARANCE_PX / Math.min(1, Math.max(k, 1e-3));

/** Clearance in graph units around a node at zoom k, from its center: drawn radius plus 6 screen pixels. */
export function routeClearance(rr: number, k = 1): number {
  return rr + gapAt(k);
}

// ---------- sampling and distances ----------

/** Samples for a path of the given length: about one per 8 units, from 10 to 48. */
const samples = (len: number) => Math.max(10, Math.min(48, Math.ceil(len / 8)));

function quadPts(p0: Pt, c: Pt, p1: Pt, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return out;
}

function cubicPts(p0: Pt, c1: Pt, c2: Pt, p1: Pt, n: number, out: Pt[]) {
  for (let i = out.length ? 1 : 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
      u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
    ]);
  }
}

/** Squared distance from a point to a segment. */
function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = px - ax - t * dx;
  const ey = py - ay - t * dy;
  return ex * ex + ey * ey;
}

/** Distance from a point to a segment. */
export function segDist(px: number, py: number, a: Pt, b: Pt): number {
  return Math.sqrt(segDist2(px, py, a[0], a[1], b[0], b[1]));
}

/** Distance from a point to a polyline. */
export function polyDist(px: number, py: number, pts: Pt[]): number {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist2(px, py, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  return Math.sqrt(d);
}

function bbox(pts: Pt[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

function pathLength(pts: Pt[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
}

function midpoint(pts: Pt[]): Pt {
  const half = pathLength(pts) / 2;
  let l = 0;
  for (let i = 1; i < pts.length; i++) {
    const s = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (l + s >= half && s > 0) {
      const t = (half - l) / s;
      return [pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1])];
    }
    l += s;
  }
  return pts[Math.floor(pts.length / 2)];
}

// ---------- a spatial index of nodes ----------

/** Uniform grid of nodes, for finding the nodes near a path. */
export class NodeIndex<N extends RouteNode = RouteNode> {
  private cells = new Map<number, N[]>();
  readonly maxR: number;
  constructor(
    readonly nodes: readonly N[],
    private cell = 48,
  ) {
    this.maxR = Math.max(0, ...nodes.map((n) => n.rr));
    for (const n of nodes) {
      const k = this.key(Math.floor(n.x / cell), Math.floor(n.y / cell));
      const list = this.cells.get(k);
      if (list) list.push(n);
      else this.cells.set(k, [n]);
    }
  }
  private key(i: number, j: number) {
    return (i + 32768) * 65536 + (j + 32768);
  }
  /** Nodes whose centers lie in the box, into `out` (cleared first; pass a reused array to save allocations). */
  within(x0: number, y0: number, x1: number, y1: number, out: N[] = []): N[] {
    out.length = 0;
    const c = this.cell;
    const i1 = Math.floor(x1 / c);
    const j1 = Math.floor(y1 / c);
    for (let i = Math.floor(x0 / c); i <= i1; i++) {
      for (let j = Math.floor(y0 / c); j <= j1; j++) {
        const list = this.cells.get(this.key(i, j));
        if (!list) continue;
        for (const n of list) if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1) out.push(n);
      }
    }
    return out;
  }
}

export interface Blocker<N extends RouteNode = RouteNode> {
  node: N;
  /** Clearance the path needs from the node's center. */
  need: number;
}

/** Nodes, other than the edge's two ends, that the path passes within clearance of at zoom k. With `firstOnly`,
 *  stops at the first. */
export function blockers<N extends RouteNode>(pts: Pt[], ends: readonly string[], index: NodeIndex<N>, k = 1, firstOnly = false): Blocker<N>[] {
  const gap = gapAt(k);
  const reach = index.maxR + gap;
  const b = bbox(pts);
  const out: Blocker<N>[] = [];
  for (const n of index.within(b.x0 - reach, b.y0 - reach, b.x1 + reach, b.y1 + reach)) {
    if (n.id === ends[0] || n.id === ends[1]) continue;
    const need = n.rr + gap;
    const x = n.x;
    const y = n.y;
    if (x < b.x0 - need || x > b.x1 + need || y < b.y0 - need || y > b.y1 + need) continue;
    const need2 = need * need;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1];
      const q = pts[i];
      if ((x < p[0] - need && x < q[0] - need) || (x > p[0] + need && x > q[0] + need) || (y < p[1] - need && y < q[1] - need) || (y > p[1] + need && y > q[1] + need)) continue;
      if (segDist2(x, y, p[0], p[1], q[0], q[1]) < need2) {
        out.push({ node: n, need });
        break;
      }
    }
    if (firstOnly && out.length) break;
  }
  return out;
}

const isClear = <N extends RouteNode>(pts: Pt[], ends: readonly string[], index: NodeIndex<N>, k: number) => !blockers(pts, ends, index, k, true).length;

// ---------- curves ----------

/** The edge's end on node n: on the circle of radius rr + END_GAP, toward `toward`. */
function trim(n: RouteNode, toward: Pt): Pt {
  const ux = toward[0] - n.x;
  const uy = toward[1] - n.y;
  const l = Math.hypot(ux, uy) || 1;
  return [n.x + (ux / l) * (n.rr + END_GAP), n.y + (uy / l) * (n.rr + END_GAP)];
}

/** Unit vector along a→b, its left normal, the length, and the midpoint. */
function frame(a: RouteNode, b: RouteNode) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { ux: dx / len, uy: dy / len, nx: -dy / len, ny: dx / len, len, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
}

/** The default bend: the control point's offset to the left of a→b. */
export function defaultBend(a: Pick<RouteNode, 'x' | 'y'>, b: Pick<RouteNode, 'x' | 'y'>): number {
  return Math.min(DEFAULT_BEND_MAX, Math.hypot(b.x - a.x, b.y - a.y) * DEFAULT_BEND);
}

/** A quadratic curve from a to b whose control point sits `bend` to the left of the midpoint (negative: right). */
export function bentCurve(a: RouteNode, b: RouteNode, bend: number, kind: EdgeGeometry['kind'] = 'bend'): EdgeGeometry {
  const f = frame(a, b);
  const c: Pt = [f.mx + f.nx * bend, f.my + f.ny * bend];
  const p0 = trim(a, c);
  const p1 = trim(b, c);
  const pts = quadPts(p0, c, p1, samples(f.len + Math.abs(bend)));
  return {
    d: `M${r1(p0[0])},${r1(p0[1])}Q${r1(c[0])},${r1(c[1])} ${r1(p1[0])},${r1(p1[1])}`,
    mid: [(p0[0] + 2 * c[0] + p1[0]) / 4, (p0[1] + 2 * c[1] + p1[1]) / 4],
    pts,
    kind,
  };
}

/** The plain curve from a (the earlier work) to b, as drawn when nothing is in the way. */
export function defaultCurve(a: RouteNode, b: RouteNode): EdgeGeometry {
  return bentCurve(a, b, defaultBend(a, b), 'default');
}

/** A smooth path (Catmull-Rom as cubic Béziers) from a to b through the waypoints. Lower `tension` keeps the
 *  path closer to the straight lines between waypoints; 0 draws those lines. */
export function waypointPath(a: RouteNode, b: RouteNode, way: Pt[], tension = 1): EdgeGeometry {
  const p0 = trim(a, way[0] ?? [b.x, b.y]);
  const p1 = trim(b, way[way.length - 1] ?? [a.x, a.y]);
  const P = [p0, ...way, p1];
  let d = `M${r1(p0[0])},${r1(p0[1])}`;
  const pts: Pt[] = [];
  const s = tension / 6;
  for (let i = 0; i < P.length - 1; i++) {
    const q0 = P[Math.max(0, i - 1)];
    const q1 = P[i];
    const q2 = P[i + 1];
    const q3 = P[Math.min(P.length - 1, i + 2)];
    const c1: Pt = [q1[0] + (q2[0] - q0[0]) * s, q1[1] + (q2[1] - q0[1]) * s];
    const c2: Pt = [q2[0] - (q3[0] - q1[0]) * s, q2[1] - (q3[1] - q1[1]) * s];
    d += `C${r1(c1[0])},${r1(c1[1])} ${r1(c2[0])},${r1(c2[1])} ${r1(q2[0])},${r1(q2[1])}`;
    cubicPts(q1, c1, c2, q2, samples(Math.hypot(q2[0] - q1[0], q2[1] - q1[1])), pts);
  }
  return { d, mid: midpoint(pts), pts, kind: 'waypoints' };
}

/** The drawn geometry of an edge from a to b for a stored route (none: the default curve). */
export function geometryOf(a: RouteNode, b: RouteNode, spec?: RouteSpec | null): EdgeGeometry {
  if (!spec) return defaultCurve(a, b);
  if ('bend' in spec) return bentCurve(a, b, spec.bend);
  const way: Pt[] = [];
  for (let i = 0; i + 1 < spec.way.length; i += 2) way.push([spec.way[i], spec.way[i + 1]]);
  return waypointPath(a, b, way, spec.tension);
}

// ---------- routing ----------

/**
 * Routes the edge from a to b around every node it would pass within clearance of at zoom k (SPEC §7.2).
 * 1. The default curve, if it clears every node.
 * 2. Otherwise the control point moves sideways, to whichever side clears every node with the smaller move.
 * 3. If no move up to a limit clears, a smooth path through a waypoint beside each obstacle.
 * 4. If nodes crowd the way, waypoints at the corners of a corridor found on a grid.
 * If nothing clears (possible only at low zoom in a crowded graph), returns the candidate with the fewest blockers.
 */
export function routeEdge<N extends RouteNode>(a: N, b: N, index: NodeIndex<N>, k = 1): { geo: EdgeGeometry; spec: RouteSpec | null } {
  const ends = [a.id, b.id];
  const def = defaultCurve(a, b);
  if (isClear(def.pts, ends, index, k)) return { geo: def, spec: null };

  const f = frame(a, b);
  const bend0 = defaultBend(a, b);
  let best: { geo: EdgeGeometry; spec: RouteSpec | null; n: number; cost: number } | null = null;
  const consider = (geo: EdgeGeometry, spec: RouteSpec | null, cost: number) => {
    const n = blockers(geo.pts, ends, index, k).length;
    if (!best || n < best.n || (n === best.n && cost < best.cost)) best = { geo, spec, n, cost };
  };
  consider(def, null, 0);

  // 2. Move the control point sideways from its default, coarse steps then fine, each way; the smaller move wins,
  // to the left on a tie.
  const coarse = Math.max(4, f.len * 0.06);
  const fine = coarse / 4;
  const limit = f.len * 1.2 + 40;
  let pick: { move: number; s: number } | null = null;
  for (const dir of [1, -1]) {
    for (let move = coarse; move <= limit && (!pick || move < pick.move); move += coarse) {
      const s = r1(bend0 + dir * move);
      if (!isClear(bentCurve(a, b, s).pts, ends, index, k)) continue;
      let found = { move, s };
      for (let m = move - coarse + fine; m < move - 1e-9; m += fine) {
        const sm = r1(bend0 + dir * m);
        if (isClear(bentCurve(a, b, sm).pts, ends, index, k)) {
          found = { move: m, s: sm };
          break;
        }
      }
      if (!pick || found.move < pick.move) pick = found;
      break;
    }
  }
  if (pick) return { geo: bentCurve(a, b, pick.s), spec: { bend: pick.s } };
  consider(bentCurve(a, b, r1(bend0 + limit)), { bend: r1(bend0 + limit) }, limit);
  consider(bentCurve(a, b, r1(bend0 - limit)), { bend: r1(bend0 - limit) }, limit);

  // 3. A waypoint beside each obstacle, ordered along the edge. Obstacles found on a candidate join the set.
  const toSpec = (way: Pt[], tension: number): { way: number[]; tension: number } => ({ way: way.flatMap(([x, y]) => [r1(x), r1(y)]), tension });
  const obstacles = new Map<string, N>();
  for (const x of blockers(def.pts, ends, index, k)) obstacles.set(x.node.id, x.node);
  for (const x of blockers(bentCurve(a, b, 0).pts, ends, index, k)) obstacles.set(x.node.id, x.node);
  for (let pass = 0; pass < 3; pass++) {
    const obs = [...obstacles.values()]
      .map((o) => ({ o, t: (o.x - a.x) * f.ux + (o.y - a.y) * f.uy, s: (o.x - f.mx) * f.nx + (o.y - f.my) * f.ny }))
      .sort((p, q) => p.t - q.t || (p.o.id < q.o.id ? -1 : 1));
    // All obstacles on the left, all on the right, or each passed on the side away from its center.
    const strategies: number[][] = [obs.map(() => 1), obs.map(() => -1), obs.map((x) => (x.s >= 0 ? -1 : 1))];
    let found: { geo: EdgeGeometry; spec: RouteSpec; len: number } | null = null;
    let added = false;
    for (const sides of strategies) {
      for (const extra of [3, 10]) {
        const spec = toSpec(
          obs.map(({ o }, i) => {
            const off = sides[i] * (routeClearance(o.rr, k) + extra);
            return [o.x + f.nx * off, o.y + f.ny * off];
          }),
          1,
        );
        const geo = geometryOf(a, b, spec);
        const bl = blockers(geo.pts, ends, index, k);
        const len = pathLength(geo.pts);
        if (!bl.length) {
          if (!found || len < found.len) found = { geo, spec, len };
          break;
        }
        for (const x of bl) {
          if (!obstacles.has(x.node.id)) added = true;
          obstacles.set(x.node.id, x.node);
        }
      }
    }
    if (found) return { geo: found.geo, spec: found.spec };
    if (!added) break;
  }

  // 4. Nodes crowd the way: find a corridor on a grid, keep its corners as waypoints, and draw the smoothest path
  // through them that still clears every node.
  const way = corridorWaypoints(a, b, index, k);
  if (way) {
    for (const tension of [1, 0.6, 0.3, 0]) {
      const spec = toSpec(way, tension);
      const geo = geometryOf(a, b, spec);
      if (isClear(geo.pts, ends, index, k)) return { geo, spec };
      consider(geo, spec, 2 * limit + pathLength(geo.pts));
    }
  }
  const { geo, spec } = best!;
  return { geo, spec };
}

/** Binary min-heap of grid cells by priority. */
class Heap {
  private ids: number[] = [];
  private pri: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, p: number) {
    const ids = this.ids;
    const pri = this.pri;
    let i = ids.length;
    ids.push(id);
    pri.push(p);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (pri[up] <= p) break;
      ids[i] = ids[up];
      pri[i] = pri[up];
      i = up;
    }
    ids[i] = id;
    pri[i] = p;
  }
  pop(): number {
    const ids = this.ids;
    const pri = this.pri;
    const top = ids[0];
    const lastId = ids.pop()!;
    const lastP = pri.pop()!;
    if (ids.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= ids.length) break;
        const r = l + 1;
        const c = r < ids.length && pri[r] < pri[l] ? r : l;
        if (pri[c] >= lastP) break;
        ids[i] = ids[c];
        pri[i] = pri[c];
        i = c;
      }
      ids[i] = lastId;
      pri[i] = lastP;
    }
    return top;
  }
}

/** Cells A* may expand before giving up on a corridor. */
const MAX_EXPAND = 60_000;
/** Weight on the A* distance-to-goal estimate: above 1 expands far fewer cells for a slightly longer corridor. */
const ASTAR_GREED = 1.5;

/**
 * A corridor from a to b that keeps clear of every other node, found by A* on a grid around the edge, then cut
 * down to the corners a straight line cannot skip. Returns those corners as waypoints, or null if none is found.
 */
function corridorWaypoints<N extends RouteNode>(a: N, b: N, index: NodeIndex<N>, k: number): Pt[] | null {
  const SLACK = 1.5; // extra room, so the smoothed path through the corners keeps clearance
  const gap = gapAt(k) + SLACK;
  const reach = index.maxR + gap;
  const buf: N[] = [];
  const segClear = (p: Pt, q: Pt) => {
    for (const o of index.within(Math.min(p[0], q[0]) - reach, Math.min(p[1], q[1]) - reach, Math.max(p[0], q[0]) + reach, Math.max(p[1], q[1]) + reach, buf)) {
      if (o.id === a.id || o.id === b.id) continue;
      const need = o.rr + gap;
      if (segDist2(o.x, o.y, p[0], p[1], q[0], q[1]) < need * need) return false;
    }
    return true;
  };
  const h = Math.max(3, Math.min(8, (index.maxR + gap) / 4));
  for (const margin of [60, 240]) {
    const x0 = Math.min(a.x, b.x) - margin;
    const y0 = Math.min(a.y, b.y) - margin;
    const W = Math.ceil((Math.max(a.x, b.x) + margin - x0) / h) + 1;
    const H = Math.ceil((Math.max(a.y, b.y) + margin - y0) / h) + 1;
    if (W * H > 400_000) continue;
    const cellOf = (x: number, y: number) => Math.round((y - y0) / h) * W + Math.round((x - x0) / h);
    const cx = (c: number) => x0 + (c % W) * h;
    const cy = (c: number) => y0 + Math.floor(c / W) * h;
    const start = cellOf(a.x, a.y);
    const goal = cellOf(b.x, b.y);
    // Blocked cells: within clearance of a node other than the ends. Inside an end's own dot the path is hidden,
    // so those cells stay free.
    const blocked = new Uint8Array(W * H);
    const paint = (o: RouteNode, r: number, value: number) => {
      const r2 = r * r;
      const i0 = Math.max(0, Math.ceil((o.x - r - x0) / h));
      const i1 = Math.min(W - 1, Math.floor((o.x + r - x0) / h));
      const j0 = Math.max(0, Math.ceil((o.y - r - y0) / h));
      const j1 = Math.min(H - 1, Math.floor((o.y + r - y0) / h));
      for (let j = j0; j <= j1; j++) {
        const dy = y0 + j * h - o.y;
        for (let i = i0; i <= i1; i++) {
          const dx = x0 + i * h - o.x;
          if (dx * dx + dy * dy < r2) blocked[j * W + i] = value;
        }
      }
    };
    for (const o of index.within(x0 - reach, y0 - reach, x0 + W * h + reach, y0 + H * h + reach, buf)) {
      if (o.id !== a.id && o.id !== b.id) paint(o, o.rr + gap, 1);
    }
    paint(a, a.rr + END_GAP, 0);
    paint(b, b.rr + END_GAP, 0);
    blocked[start] = 0;
    blocked[goal] = 0;
    const free = (c: number) => blocked[c] === 0;
    const g = new Float64Array(W * H).fill(Infinity);
    const from = new Int32Array(W * H).fill(-1);
    const heap = new Heap();
    const hx = cx(goal);
    const hy = cy(goal);
    g[start] = 0;
    heap.push(start, Math.hypot(cx(start) - hx, cy(start) - hy));
    let reached = false;
    let expanded = 0;
    while (heap.size && expanded++ < MAX_EXPAND) {
      const c = heap.pop();
      if (c === goal) {
        reached = true;
        break;
      }
      const i = c % W;
      const j = Math.floor(c / W);
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue;
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
          const n = nj * W + ni;
          if (!free(n)) continue;
          const ng = g[c] + (di && dj ? Math.SQRT2 : 1) * h;
          if (ng >= g[n]) continue;
          g[n] = ng;
          from[n] = c;
          heap.push(n, ng + ASTAR_GREED * Math.hypot(cx(n) - hx, cy(n) - hy));
        }
      }
    }
    if (!reached) continue;
    const raw: Pt[] = [];
    for (let c = goal; c !== -1; c = from[c]) raw.push([cx(c), cy(c)]);
    raw.reverse();
    raw[0] = [a.x, a.y];
    raw[raw.length - 1] = [b.x, b.y];
    // Keep only the corners: from each kept point, jump to the furthest point in plain view.
    const way: Pt[] = [];
    let i = 0;
    while (i < raw.length - 1) {
      let j = raw.length - 1;
      while (j > i + 1 && !segClear(raw[i], raw[j])) j--;
      if (j < raw.length - 1) way.push(raw[j]);
      i = j;
    }
    return way;
  }
  return null;
}

/**
 * Routes every edge for every zoom step (ROUTE_STEPS). A step reuses the previous step's route when it still
 * clears. Returns only edges with some route other than the default curve.
 */
export function routeAll<N extends RouteNode>(nodes: N[], edges: { from: string; to: string }[]): Routes {
  const index = new NodeIndex(nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: Routes = {};
  const keys = [...new Set(edges.filter((e) => e.from !== e.to && byId.has(e.from) && byId.has(e.to)).map((e) => edgeKey(e.from, e.to)))].sort();
  for (const key of keys) {
    const [from, to] = key.split('>');
    const a = byId.get(from)!;
    const b = byId.get(to)!;
    const specs: (RouteSpec | null)[] = [];
    let prev: RouteSpec | null = null;
    for (const k of ROUTE_STEPS) {
      if (specs.length && isClear(geometryOf(a, b, prev).pts, [from, to], index, k)) {
        specs.push(prev);
        continue;
      }
      prev = routeEdge(a, b, index, k).spec;
      specs.push(prev);
    }
    if (specs.some(Boolean)) out[key] = specs;
  }
  return out;
}

// ---------- checks ----------

/** Pairs of paths that cross, ignoring pairs that share an end node. */
export function countCrossings(edges: { a: string; b: string; pts: Pt[] }[]): number {
  const boxes = edges.map((e) => bbox(e.pts));
  let n = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const e = edges[i];
      const g = edges[j];
      if (e.a === g.a || e.a === g.b || e.b === g.a || e.b === g.b) continue;
      const p = boxes[i];
      const q = boxes[j];
      if (p.x1 < q.x0 || q.x1 < p.x0 || p.y1 < q.y0 || q.y1 < p.y0) continue;
      if (polylinesCross(e.pts, g.pts)) n++;
    }
  }
  return n;
}

/** True if two straight segments cross. */
export function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function polylinesCross(p: Pt[], q: Pt[]): boolean {
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1];
    const b = p[i];
    const x0 = Math.min(a[0], b[0]);
    const x1 = Math.max(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]);
    const y1 = Math.max(a[1], b[1]);
    for (let j = 1; j < q.length; j++) {
      const c = q[j - 1];
      const d = q[j];
      if (Math.max(c[0], d[0]) < x0 || Math.min(c[0], d[0]) > x1 || Math.max(c[1], d[1]) < y0 || Math.min(c[1], d[1]) > y1) continue;
      if (segmentsCross(a, b, c, d)) return true;
    }
  }
  return false;
}
