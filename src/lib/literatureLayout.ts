// Deterministic force layout for the Methods literature graph (SPEC §7.2).
// Pure: the same data always gives the same positions. Filters never reach this function.
import { forceLink, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import { polygonCentroid, polygonContains, polygonHull } from 'd3-polygon';

export const NODE_H = 26;
const PAD = 14; // gap kept between pills
const HULL_PAD = 20; // hull margin around its pills
const TICKS = 320;

export interface LayoutNodeInput {
  id: string;
  /** Cluster id, or null for papers outside every cluster. */
  cluster: string | null;
  label: string;
  year: number;
  icons: number;
}

export interface PlacedNode {
  id: string;
  cluster: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedCluster {
  id: string;
  hull: [number, number][];
  centroid: [number, number];
  top: number;
}

export interface LayoutResult {
  nodes: Map<string, PlacedNode>;
  clusters: PlacedCluster[];
  bbox: { x: number; y: number; w: number; h: number };
}

/** Pill width from its text: short name, year, and action icons. An estimate, so the layout stays pure. */
export function pillWidth(label: string, icons: number): number {
  let w = 0;
  for (const ch of label) w += /[A-Z]/.test(ch) ? 8.7 : /[a-z0-9]/.test(ch) ? 7 : ch === ' ' ? 3.6 : 6;
  return Math.round(13 + w + 5 + 28 + 8 + icons * 12);
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

interface SimNode extends SimulationNodeDatum {
  id: string;
  cluster: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  tx: number;
  ty: number;
}

/** Cluster centers evenly spaced on a circle, the first on the left, so two clusters sit left and right. */
export function clusterCenters(clusters: string[], sizes: Record<string, number>): Map<string, [number, number]> {
  const k = clusters.length;
  const spread = Math.max(0, ...clusters.map((c) => 46 * Math.sqrt(sizes[c] ?? 1) + 70));
  const R = k <= 1 ? 0 : k === 2 ? spread + 120 : (spread + 90) / Math.sin(Math.PI / k);
  return new Map(clusters.map((c, i) => [c, [R * Math.cos(Math.PI + (2 * Math.PI * i) / k), R * Math.sin(Math.PI + (2 * Math.PI * i) / k)]]));
}

function overlapX(a: PlacedNode, b: PlacedNode) {
  return (a.w + b.w) / 2 + PAD - Math.abs(a.x - b.x);
}
function overlapY(a: PlacedNode, b: PlacedNode) {
  return (a.h + b.h) / 2 + PAD - Math.abs(a.y - b.y);
}

/** Pushes overlapping pills apart along the axis of least overlap. */
function separate(nodes: SimNode[], strength: number) {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const ox = overlapX(a, b);
      const oy = overlapY(a, b);
      if (ox <= 0 || oy <= 0) continue;
      if (ox / (a.w + b.w) < oy / (a.h + b.h)) {
        const s = (a.x < b.x || (a.x === b.x && a.id < b.id) ? -1 : 1) * (ox / 2) * strength;
        a.x += s;
        b.x -= s;
      } else {
        const s = (a.y < b.y || (a.y === b.y && a.id < b.id) ? -1 : 1) * (oy / 2) * strength;
        a.y += s;
        b.y -= s;
      }
    }
  }
}

function corners(n: PlacedNode, pad: number): [number, number][] {
  const x0 = n.x - n.w / 2 - pad;
  const x1 = n.x + n.w / 2 + pad;
  const y0 = n.y - n.h / 2 - pad;
  const y1 = n.y + n.h / 2 + pad;
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

function hullOf(members: PlacedNode[]): [number, number][] {
  return polygonHull(members.flatMap((n) => corners(n, HULL_PAD))) ?? [];
}

/** True if any part of the pill (corners, edge midpoints, center) lies inside the polygon. */
function pillInside(n: PlacedNode, poly: [number, number][]) {
  if (poly.length < 3) return false;
  const pts = [...corners(n, 4), [n.x, n.y] as [number, number], [n.x, n.y - n.h / 2 - 4] as [number, number], [n.x, n.y + n.h / 2 + 4] as [number, number]];
  return pts.some((p) => polygonContains(poly, p));
}

export function layoutLiterature(
  input: LayoutNodeInput[],
  clusterOrder: string[],
  links: { source: string; target: string }[],
): LayoutResult {
  const sorted = [...input].sort((a, b) => a.id.localeCompare(b.id));
  const clusters = clusterOrder.filter((c) => sorted.some((n) => n.cluster === c));
  const sizes = Object.fromEntries(clusters.map((c) => [c, sorted.filter((n) => n.cluster === c).length]));
  const centers = clusterCenters(clusters, sizes);

  const nodes: SimNode[] = sorted.map((n) => {
    const [tx, ty] = (n.cluster && centers.get(n.cluster)) || [0, 0];
    const r = mulberry32(hash(n.id));
    const a = r() * 2 * Math.PI;
    const d = 20 + r() * 60;
    return { id: n.id, cluster: n.cluster && centers.has(n.cluster) ? n.cluster : null, w: pillWidth(`${n.label}`, n.icons), h: NODE_H, tx, ty, x: tx + d * Math.cos(a), y: ty + d * Math.sin(a) };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const simLinks: SimulationLinkDatum<SimNode>[] = [...links]
    .sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target))
    .filter((l) => byId.has(l.source) && byId.has(l.target) && l.source !== l.target)
    .map((l) => ({ source: l.source, target: l.target }));

  const collide = (alpha: number) => separate(nodes, Math.min(1, 0.5 + alpha));
  // Keeps every pill out of the area of clusters it does not belong to.
  const exclude = (alpha: number) => {
    for (const c of clusters) {
      const members = nodes.filter((n) => n.cluster === c);
      if (!members.length) continue;
      const cx = members.reduce((s, n) => s + n.x, 0) / members.length;
      const cy = members.reduce((s, n) => s + n.y, 0) / members.length;
      const r = Math.max(...members.map((n) => Math.hypot(n.x - cx, n.y - cy) + n.w / 2)) + HULL_PAD + 20;
      for (const n of nodes) {
        if (n.cluster === c) continue;
        const dx = n.x - cx;
        const dy = n.y - cy;
        const d = Math.hypot(dx, dy) || 1;
        const need = r + n.w / 2 - d;
        if (need > 0) {
          n.vx = (n.vx ?? 0) + (dx / d) * need * alpha * 0.6;
          n.vy = (n.vy ?? 0) + (dy / d) * need * alpha * 0.6;
        }
      }
    }
  };

  const sim = forceSimulation<SimNode>(nodes)
    .randomSource(mulberry32(42))
    .force('x', forceX<SimNode>((d) => d.tx).strength((d) => (d.cluster ? 0.09 : 0.2)))
    .force('y', forceY<SimNode>((d) => d.ty).strength((d) => (d.cluster ? 0.09 : 0.2)))
    .force(
      'link',
      forceLink<SimNode, SimulationLinkDatum<SimNode>>(simLinks)
        .id((d) => d.id)
        .distance(130)
        .strength(0.03),
    )
    .force('exclude', exclude)
    .force('collide', collide)
    .stop();
  for (let i = 0; i < TICKS; i++) sim.tick();

  // Final passes: no overlapping pills, and no pill inside a hull it does not belong to.
  for (let pass = 0; pass < 400; pass++) {
    separate(nodes, 1);
    let moved = countOverlaps(nodes) > 0;
    for (const c of clusters) {
      const members = nodes.filter((n) => n.cluster === c);
      const hull = hullOf(members);
      if (hull.length < 3) continue;
      const [cx, cy] = polygonCentroid(hull);
      for (const n of nodes) {
        if (n.cluster === c || !pillInside(n, hull)) continue;
        const dx = n.x - cx;
        const dy = n.y - cy;
        const d = Math.hypot(dx, dy) || 1;
        n.x += (dx / d) * 8;
        n.y += (dy / d) * 8;
        moved = true;
      }
    }
    if (!moved) break;
  }

  const placed = new Map<string, PlacedNode>(nodes.map((n) => [n.id, { id: n.id, cluster: n.cluster, x: n.x, y: n.y, w: n.w, h: n.h }]));
  const placedClusters: PlacedCluster[] = clusters.map((c) => {
    const hull = hullOf([...placed.values()].filter((n) => n.cluster === c));
    return { id: c, hull, centroid: polygonCentroid(hull), top: Math.min(...hull.map((p) => p[1])) };
  });

  const xs = [...placed.values()].flatMap((n) => [n.x - n.w / 2, n.x + n.w / 2]).concat(placedClusters.flatMap((c) => c.hull.map((p) => p[0])));
  const ys = [...placed.values()].flatMap((n) => [n.y - n.h / 2, n.y + n.h / 2]).concat(placedClusters.flatMap((c) => c.hull.map((p) => p[1])));
  const margin = 18;
  const x0 = Math.min(...xs) - margin;
  const y0 = Math.min(...ys) - margin - 22; // room for hull labels
  const x1 = Math.max(...xs) + margin;
  const y1 = Math.max(...ys) + margin;
  return { nodes: placed, clusters: placedClusters, bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

/** Pills overlapping each other, for tests. */
export function countOverlaps(nodes: PlacedNode[]): number {
  let n = 0;
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) if (overlapX(nodes[i], nodes[j]) > PAD && overlapY(nodes[i], nodes[j]) > PAD) n++;
  return n;
}

/** Whether a pill sits inside a hull it does not belong to, for tests. */
export function insideForeignHull(n: PlacedNode, clusters: PlacedCluster[]): boolean {
  return clusters.some((c) => c.id !== n.cluster && pillInside(n, c.hull));
}
