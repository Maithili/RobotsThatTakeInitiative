import { describe, expect, it } from 'vitest';
import {
  countOverlaps,
  dotRadius,
  DOT_R_MAX,
  DOT_R_MIN,
  hullOf,
  inLiteratureGraph,
  labelWidth,
  labelYear,
  layoutLiterature,
  layoutPapers,
  linkedPapers,
  placeLabels,
  shapeInside,
  TANGENT_R,
  type LayoutNodeInput,
  type Point,
  type Shape,
} from '../src/lib/literatureLayout.ts';
import { SYNTHETIC_COUNT, SYNTHETIC_FAMILIES, SYNTHETIC_TANGENTS, syntheticPapers } from '../src/pages/methods/synthetic.ts';

function fixture(n: number, k: number, loose: number) {
  const nodes: LayoutNodeInput[] = [];
  for (let i = 0; i < n; i++) nodes.push({ id: `p${i}`, cluster: i < n - loose ? `c${i % k}` : null, r: 7 + (i % 4) * 2, labelW: 50 + (i % 5) * 9 });
  const links = nodes.slice(1).map((p, i) => ({ source: nodes[(i * 7) % (i + 1)].id, target: p.id }));
  return { nodes, clusters: Array.from({ length: k }, (_, i) => `c${i}`), links };
}

const shapes = (nodes: LayoutNodeInput[], pos: Map<string, Point>): (Shape & { id: string; cluster: string | null })[] =>
  nodes.map((n) => ({ id: n.id, cluster: n.tangent ? null : n.cluster, r: n.r, labelW: n.labelW, ...pos.get(n.id)! }));

/** Ids of nodes that sit inside the hull of a cluster they do not belong to. */
function inForeignHull(placed: ReturnType<typeof shapes>, clusters: string[]) {
  const hulls = clusters.map((c) => ({ c, hull: hullOf(placed.filter((n) => n.cluster === c)) }));
  return placed.filter((n) => hulls.some((h) => h.c !== n.cluster && shapeInside(n, h.hull))).map((n) => n.id);
}

describe('literature graph layout (build time)', () => {
  it('is identical on every run, whatever the input order', () => {
    const f = fixture(24, 2, 2);
    const a = layoutLiterature(f.nodes, f.clusters, f.links);
    const b = layoutLiterature([...f.nodes].reverse(), f.clusters, [...f.links].reverse());
    expect([...a.keys()].sort().map((id) => [id, a.get(id)])).toEqual([...b.keys()].sort().map((id) => [id, b.get(id)]));
  });

  it('puts two clusters left and right, with unclustered papers between them', () => {
    const f = fixture(13, 2, 1);
    const pos = layoutLiterature(f.nodes, f.clusters, []);
    const mean = (c: string) => {
      const ms = f.nodes.filter((n) => n.cluster === c).map((n) => pos.get(n.id)!.x);
      return ms.reduce((s, x) => s + x, 0) / ms.length;
    };
    const loose = pos.get('p12')!;
    expect(mean('c0')).toBeLessThan(loose.x);
    expect(loose.x).toBeLessThan(mean('c1'));
  });

  it('gives a new cluster its own area without code changes', () => {
    const f = fixture(30, 3, 0);
    const pos = layoutLiterature(f.nodes, [...f.clusters, 'unused'], f.links);
    const placed = shapes(f.nodes, pos);
    expect(countOverlaps(placed)).toBe(0);
    expect(inForeignHull(placed, f.clusters)).toEqual([]);
  });

  it('keeps 300 papers in 4 clusters plus 30 tangential works readable', () => {
    const papers = syntheticPapers();
    expect(papers.filter((p) => !p.tangent)).toHaveLength(SYNTHETIC_COUNT);
    expect(papers.filter((p) => p.tangent)).toHaveLength(SYNTHETIC_TANGENTS);
    const families = Object.keys(SYNTHETIC_FAMILIES);
    const pos = layoutPapers(papers, families);
    expect(pos.size).toBe(330);
    const placed = papers.map((p) => ({
      id: p.id,
      cluster: p.tangent ? null : p.method?.family ?? null,
      tangent: !!p.tangent,
      r: dotRadius(linkedPapers(p).size, !!p.tangent),
      labelW: labelWidth(p.short_name, p.year),
      ...pos.get(p.id)!,
    }));
    // Dots and labels never overlap at zoom 1, and nothing sits inside a hull not its own.
    expect(countOverlaps(placed)).toBe(0);
    expect(inForeignHull(placed, families)).toEqual([]);
    // Tangential works sit in a band just outside the clusters: near some hull, never far off (the layout spans
    // about 2000 px at zoom 1).
    const hulls = families.map((c) => hullOf(placed.filter((n) => n.cluster === c)));
    const toSegment = (px: number, py: number, [ax, ay]: [number, number], [bx, by]: [number, number]) => {
      const l2 = (bx - ax) ** 2 + (by - ay) ** 2;
      const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2)) : 0;
      return Math.hypot(px - ax - t * (bx - ax), py - ay - t * (by - ay));
    };
    const gap = (n: (typeof placed)[number]) => Math.min(...hulls.flatMap((h) => h.map((p, i) => toSegment(n.x, n.y, p, h[(i + 1) % h.length]))));
    const far = placed.filter((n) => n.tangent && gap(n) > 220).map((n) => n.id);
    expect(far).toEqual([]);
  });
});

describe('graph nodes and labels', () => {
  it('sizes dots by linked papers, from 7 px to a cap; tangential works are smaller', () => {
    expect(dotRadius(0)).toBe(DOT_R_MIN);
    expect(dotRadius(1)).toBeGreaterThan(DOT_R_MIN);
    expect(dotRadius(4)).toBeGreaterThan(dotRadius(1));
    expect(dotRadius(400)).toBe(DOT_R_MAX);
    expect(dotRadius(4, true)).toBe(TANGENT_R);
    expect(TANGENT_R).toBeLessThan(DOT_R_MIN);
  });

  it('counts each linked database paper once, by any edge type', () => {
    const p = { id: 'a', short_name: 'A', year: 2020, method: { knowns: null, builds_on: ['b'] }, built_upon_by: ['c'], benchmarks_against: ['b'], benchmarked_in: [], cites: ['b', 'd'], cited_by: ['a'] };
    expect([...linkedPapers(p as never)].sort()).toEqual(['b', 'c', 'd']);
  });

  it("adds a two-digit year unless the short name already has the year", () => {
    expect(labelYear('SLaTe-PRO', 2023)).toBe("'23");
    expect(labelYear('Koch van den Broek 2024', 2024)).toBeNull();
    expect(labelWidth('Koch van den Broek 2024', 2024)).toBeLessThan(labelWidth('Koch van den Broek 2024', 2023));
  });

  it('chooses graph members: focus levels with a method block, plus tangential works when on', () => {
    expect(inLiteratureGraph({ level: 'L2', method: { knowns: null } as never }, ['L2'], true)).toBe(true);
    expect(inLiteratureGraph({ level: 'L1', method: { knowns: null } as never }, ['L2'], true)).toBe(false);
    expect(inLiteratureGraph({ level: null, tangent: 'hri' }, ['L2'], true)).toBe(true);
    expect(inLiteratureGraph({ level: null, tangent: 'hri' }, ['L2'], false)).toBe(false);
  });

  it('places labels without overlaps; below zoom 1 only larger dots; hover, focus and search always', () => {
    const dots = [
      { id: 'big', x: 0, y: 0, r: 14 },
      { id: 'mid', x: 0, y: 60, r: 9 },
      { id: 'small', x: 0, y: 200, r: 7 },
    ];
    const cands = dots.map((d) => ({ ...d, w: 60, tier: 2 as const }));
    expect([...placeLabels(cands, dots, 1)].sort()).toEqual(['big', 'mid', 'small']);
    expect([...placeLabels(cands, dots, 0.5)]).toEqual(['big']);
    const hovered = cands.map((c) => (c.id === 'small' ? { ...c, tier: 0 as const } : c));
    expect([...placeLabels(hovered, dots, 0.5)].sort()).toEqual(['big', 'small']);
    // A label never covers another dot or a label already shown, unless something asks for it.
    const pair = [
      { id: 'a', x: 0, y: 0, r: 8 },
      { id: 'b', x: 40, y: 0, r: 8 },
    ];
    expect([...placeLabels(pair.map((d) => ({ ...d, w: 80, tier: 2 as const })), pair, 1)]).toEqual(['b']);
    expect([...placeLabels(pair.map((d) => ({ ...d, w: 80, tier: d.id === 'a' ? (0 as const) : (2 as const) })), pair, 1)]).toEqual(['a']);
  });
});
