import { polygonContains } from 'd3-polygon';
import { describe, expect, it } from 'vitest';
import type { Pt } from '../src/lib/edgeRouting.ts';
import {
  countOverlaps,
  dotRadius,
  DOT_R_MAX,
  DOT_R_MIN,
  hullOf,
  inLiteratureGraph,
  LABEL_GAP,
  LABEL_H,
  labelWidth,
  labelYear,
  layoutLiterature,
  layoutPapers,
  linkedPapers,
  placeGroupLabels,
  placeLabels,
  shapeInside,
  TANGENT_R,
  type LayoutNodeInput,
  type Point,
  type ScreenBox,
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

  it('keeps 300 papers in 4 clusters plus 30 tangential works readable', { timeout: 60_000 }, () => {
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
    // Each category forms its own loose group: every work sits nearer its own category's center than any other's,
    // and the groups sit apart, outside every hull.
    const byId = new Map(papers.map((p) => [p.id, p]));
    const cats = [...new Set(papers.filter((p) => p.tangent).map((p) => p.tangent!))];
    expect(cats.length).toBeGreaterThanOrEqual(4);
    const center = new Map(
      cats.map((c) => {
        const ms = placed.filter((n) => byId.get(n.id)!.tangent === c);
        return [c, [ms.reduce((s, n) => s + n.x, 0) / ms.length, ms.reduce((s, n) => s + n.y, 0) / ms.length] as [number, number]];
      }),
    );
    const stray = placed
      .filter((n) => n.tangent)
      .filter((n) => {
        const own = byId.get(n.id)!.tangent!;
        const d = (c: string) => Math.hypot(n.x - center.get(c)![0], n.y - center.get(c)![1]);
        return cats.some((c) => c !== own && d(c) < d(own));
      })
      .map((n) => n.id);
    expect(stray).toEqual([]);
    for (const a of cats) for (const b of cats) if (a < b) expect(Math.hypot(center.get(a)![0] - center.get(b)![0], center.get(a)![1] - center.get(b)![1])).toBeGreaterThan(300);
    for (const [c, [x, y]] of center) expect(hulls.some((h) => polygonContains(h, [x, y])), `${c} center inside a hull`).toBe(false);
  });

  it('pulls each tangential category toward its own anchor next to the clusters', () => {
    const f = fixture(24, 2, 0);
    const tangents: LayoutNodeInput[] = ['x', 'y'].flatMap((g) => [0, 1, 2, 3].map((i) => ({ id: `${g}${i}`, cluster: null, tangent: true, group: g, r: 6, labelW: 50 })));
    // Category x cites cluster c0 (left), category y cites cluster c1 (right).
    const links = [...f.links, ...[0, 1, 2, 3].flatMap((i) => [{ source: 'p0', target: `x${i}` }, { source: 'p1', target: `y${i}` }])];
    const pos = layoutLiterature([...f.nodes, ...tangents], f.clusters, links);
    const mean = (pred: (id: string) => boolean) => {
      const ps = [...pos].filter(([id]) => pred(id)).map(([, p]) => p);
      return { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length };
    };
    const x = mean((id) => id.startsWith('x'));
    const y = mean((id) => id.startsWith('y'));
    const c0 = mean((id) => f.nodes.some((n) => n.id === id && n.cluster === 'c0'));
    const c1 = mean((id) => f.nodes.some((n) => n.id === id && n.cluster === 'c1'));
    // Each category sits apart from the other, beside the cluster it links to.
    expect(Math.hypot(x.x - y.x, x.y - y.y)).toBeGreaterThan(100);
    const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    expect(d(x, c0)).toBeLessThan(d(x, c1));
    expect(d(y, c1)).toBeLessThan(d(y, c0));
    const placed = shapes([...f.nodes, ...tangents], pos);
    expect(countOverlaps(placed)).toBe(0);
    expect(inForeignHull(placed, f.clusters)).toEqual([]);
  });
});

describe('tangential category labels', () => {
  const group = { id: 'g', w: 120, h: 17, members: [0, 1, 2].map((i) => ({ x: i * 30, y: 0, r: 6, labelW: 40 })) };
  const hit = (a: ScreenBox, b: ScreenBox) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const dotBox = (d: { x: number; y: number; r: number }, k = 1): ScreenBox => ({ x0: (d.x - d.r) * k, x1: (d.x + d.r) * k, y0: (d.y - d.r) * k, y1: (d.y + d.r) * k });

  it('sits near its papers and covers no dot, label, or other category label', () => {
    // Other papers crowd the spot above the group; the label goes elsewhere, still next to the group.
    const others = [-10, 30, 60, 90].map((x, i) => ({ x, y: -26, r: 8, id: `o${i}` }));
    const dots = [...group.members, ...others];
    const boxes = placeGroupLabels([group, { ...group, id: 'h', members: [{ x: 300, y: 0, r: 6, labelW: 40 }] }], 1, {
      dots,
      labels: dots.map((d) => ({ ...d, w: 40 })),
    });
    const b = boxes.get('g')!;
    for (const d of dots) expect(hit(b, dotBox(d))).toBe(false);
    for (const d of dots) expect(hit(b, { x0: d.x + d.r + LABEL_GAP, x1: d.x + d.r + LABEL_GAP + 40, y0: d.y - LABEL_H / 2, y1: d.y + LABEL_H / 2 })).toBe(false);
    expect(hit(b, boxes.get('h')!)).toBe(false);
    const nearest = Math.min(...group.members.map((m) => Math.hypot(Math.max(0, b.x0 - m.x, m.x - b.x1), Math.max(0, b.y0 - m.y, m.y - b.y1))));
    expect(nearest).toBeLessThan(40);
  });

  it('keeps off edges where it can, and stays in the content bounds', () => {
    // An edge runs just above the group; the label goes below it.
    const edge: Pt[] = [
      [-200, -16],
      [300, -16],
    ];
    const b = placeGroupLabels([group], 1, { dots: group.members, edges: [edge] }).get('g')!;
    expect(b.y0).toBeGreaterThan(-16);
    // Content bounds that end just right of the group: the label does not run past them, at any zoom, though the
    // label keeps its size on screen.
    for (const [k, bounds] of [
      [1, { x0: -40, y0: -200, x1: 100, y1: 200 }],
      [0.5, { x0: -300, y0: -400, x1: 100, y1: 400 }],
    ] as const) {
      const c = placeGroupLabels([group], k, { dots: group.members, bounds }).get('g')!;
      expect(c.x0).toBeGreaterThanOrEqual(bounds.x0 * k - 0.5);
      expect(c.x1).toBeLessThanOrEqual(bounds.x1 * k + 0.5);
      for (const d of group.members) expect(hit(c, dotBox(d, k))).toBe(false);
    }
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
