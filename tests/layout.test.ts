import { describe, expect, it } from 'vitest';
import { countOverlaps, insideForeignHull, layoutLiterature, type LayoutNodeInput } from '../src/lib/literatureLayout.ts';

function fixture(n: number, k: number, loose: number) {
  const nodes: LayoutNodeInput[] = [];
  for (let i = 0; i < n; i++) nodes.push({ id: `p${i}`, cluster: i < n - loose ? `c${i % k}` : null, label: `Method ${i}`, year: 2015 + (i % 12), icons: 1 });
  const links = nodes.slice(1).map((p, i) => ({ source: nodes[(i * 7) % (i + 1)].id, target: p.id }));
  return { nodes, clusters: Array.from({ length: k }, (_, i) => `c${i}`), links };
}

describe('literature graph layout', () => {
  it('is identical on every run', () => {
    const f = fixture(20, 2, 2);
    const a = layoutLiterature(f.nodes, f.clusters, f.links);
    const b = layoutLiterature([...f.nodes].reverse(), f.clusters, [...f.links].reverse());
    expect([...a.nodes.values()].map((n) => [n.id, n.x, n.y])).toEqual([...a.nodes.keys()].map((id) => [id, b.nodes.get(id)!.x, b.nodes.get(id)!.y]));
  });

  it('puts two clusters left and right, with unclustered papers between them', () => {
    const f = fixture(9, 2, 1);
    const r = layoutLiterature(f.nodes, f.clusters, []);
    const [left, right] = r.clusters;
    expect(left.centroid[0]).toBeLessThan(right.centroid[0]);
    const loose = r.nodes.get('p8')!;
    expect(loose.x).toBeGreaterThan(left.centroid[0]);
    expect(loose.x).toBeLessThan(right.centroid[0]);
  });

  it('keeps 60 papers in 4 clusters readable: no overlaps, nothing inside a foreign hull', () => {
    const f = fixture(60, 4, 4);
    const r = layoutLiterature(f.nodes, f.clusters, f.links);
    expect(r.clusters).toHaveLength(4);
    const placed = [...r.nodes.values()];
    expect(countOverlaps(placed)).toBe(0);
    expect(placed.filter((n) => insideForeignHull(n, r.clusters)).map((n) => n.id)).toEqual([]);
  });

  it('gives a new cluster its own hull without code changes', () => {
    const f = fixture(15, 3, 0);
    expect(layoutLiterature(f.nodes, [...f.clusters, 'unused'], f.links).clusters.map((c) => c.id)).toEqual(['c0', 'c1', 'c2']);
  });
});
