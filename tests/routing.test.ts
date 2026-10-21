// Edge routing (SPEC §7.2 Edge routing, §13 test 11): no drawn edge passes within clearance (drawn radius + 6 px)
// of a node that is not one of its ends, in the seed data or the synthetic fixture.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  blockers,
  defaultCurve,
  edgeKey,
  geometryOf,
  NodeIndex,
  routeAll,
  routeClearance,
  routeEdge,
  ROUTE_STEPS,
  stepIndex,
  type RouteNode,
  type Routes,
} from '../src/lib/edgeRouting.ts';
import { graphLinks, inLiteratureGraph, layoutPapers, routeNodes, routePapers, type GraphPaper } from '../src/lib/literatureLayout.ts';
import { FOCUS_LEVELS } from '../src/lib/scope.ts';
import { TANGENTS_IN_GRAPH } from '../src/pages/methods/constants.ts';
import { SYNTHETIC_FAMILIES, syntheticPapers } from '../src/pages/methods/synthetic.ts';
import { buildDb } from '../src/validate.ts';

const node = (id: string, x: number, y: number, rr = 8): RouteNode => ({ id, x, y, rr });

describe('edge routing', () => {
  it('maps zoom to routing steps, and clearance to 6 screen pixels at that zoom', () => {
    expect(stepIndex(2)).toBe(0);
    expect(stepIndex(1)).toBe(0);
    expect(stepIndex(0.9)).toBe(1);
    expect(stepIndex(0.64)).toBe(2);
    expect(stepIndex(0.05)).toBe(ROUTE_STEPS.length - 1);
    expect(routeClearance(8, 1)).toBe(14);
    expect(routeClearance(8, 0.5)).toBe(20);
    expect(routeClearance(8, 3)).toBe(14);
  });

  it('keeps the default curve when nothing is in the way', () => {
    const nodes = [node('a', 0, 0), node('b', 200, 0), node('far', 100, 120)];
    const r = routeEdge(nodes[0], nodes[1], new NodeIndex(nodes));
    expect(r.spec).toBeNull();
    expect(r.geo.kind).toBe('default');
  });

  it('bends around a node in the way, to the side that needs the smaller move', () => {
    // Watch-And-Help, ProAct, and NOPA stacked in a column, as on the live graph before the fix.
    const wah = node('watch-and-help', -160, 44, 9.2);
    const proact = node('proact', -161, 3, 7);
    const nopa = node('nopa', -160, -38, 10.8);
    const index = new NodeIndex([wah, proact, nopa]);
    expect(blockers(defaultCurve(wah, nopa).pts, [wah.id, nopa.id], index).map((b) => b.node.id)).toEqual(['proact']);
    const r = routeEdge(wah, nopa, index);
    expect(r.geo.kind).toBe('bend');
    expect(blockers(r.geo.pts, [wah.id, nopa.id], index)).toEqual([]);
    // ProAct sits a little left of the column, so the curve passes on the right (+x), its default side.
    expect(r.spec && 'bend' in r.spec && r.spec.bend > 0).toBe(true);
    // The stored route redraws the same path.
    expect(geometryOf(wah, nopa, r.spec).d).toBe(r.geo.d);
  });

  it('threads a smooth path through waypoints when one bend is not enough', () => {
    // Two staggered walls: the edge has to weave between them.
    const a = node('a', 0, 0);
    const b = node('b', 240, 0);
    const wall = [
      ...[-150, -120, -90, -60, -30, 0, 30].map((y, i) => node(`w${i}`, 80, y)),
      ...[-30, 0, 30, 60, 90, 120, 150].map((y, i) => node(`v${i}`, 160, y)),
    ];
    const index = new NodeIndex([a, b, ...wall]);
    const r = routeEdge(a, b, index);
    expect(r.geo.kind).toBe('waypoints');
    expect(blockers(r.geo.pts, ['a', 'b'], index)).toEqual([]);
  });

  it('is deterministic', () => {
    const papers = syntheticPapers().slice(0, 60);
    const pos = layoutPapers(papers, Object.keys(SYNTHETIC_FAMILIES));
    const nodes = routeNodes(papers, pos);
    const edges = graphLinks(papers).map((l) => ({ from: l.source, to: l.target }));
    expect(routeAll(nodes, edges)).toEqual(routeAll([...nodes].reverse(), [...edges].reverse()));
  });
});

/** Edges (by ROUTE_STEPS step) whose drawn path passes within clearance of a node other than its ends. */
function blocked(papers: GraphPaper[], pos: Map<string, { x: number; y: number }>, routes: Routes, step: number): string[] {
  const nodes = routeNodes(papers, pos);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const index = new NodeIndex(nodes);
  const k = ROUTE_STEPS[step];
  return graphLinks(papers)
    .filter((l) => {
      const g = geometryOf(byId.get(l.source)!, byId.get(l.target)!, routes[edgeKey(l.source, l.target)]?.[step]);
      return blockers(g.pts, [l.source, l.target], index, k).length > 0;
    })
    .map((l) => edgeKey(l.source, l.target));
}

function seedGraph(): GraphPaper[] {
  const dir = join(__dirname, '../data');
  const load = (sub: string) =>
    readdirSync(join(dir, sub))
      .filter((n) => n.endsWith('.yaml'))
      .sort()
      .map((n) => ({ name: n.replace(/\.yaml$/, ''), data: yaml.load(readFileSync(join(dir, sub, n), 'utf8')) }));
  const r = buildDb({
    taxonomy: yaml.load(readFileSync(join(dir, 'taxonomy.yaml'), 'utf8')),
    papers: load('papers'),
    datasets: load('datasets'),
    citations: JSON.parse(readFileSync(join(dir, 'citations.json'), 'utf8')),
    manualCitations: yaml.load(readFileSync(join(dir, 'citations-manual.yaml'), 'utf8')),
  });
  expect(r.errors).toEqual([]);
  return r.db!.papers.filter((p) => inLiteratureGraph(p, FOCUS_LEVELS, TANGENTS_IN_GRAPH));
}

describe('no drawn edge passes within clearance of another node', () => {
  it('in the seed data, at every zoom step', () => {
    const papers = seedGraph();
    const families = [...new Set(papers.map((p) => p.method?.family).filter((f): f is string => !!f))].sort();
    const pos = layoutPapers(papers, families);
    const routes = routePapers(papers, pos);
    for (let s = 0; s < ROUTE_STEPS.length; s++) expect(blocked(papers, pos, routes, s), `zoom step ${ROUTE_STEPS[s]}`).toEqual([]);
    // The case that prompted routing: Watch-And-Help to NOPA kept clear of ProAct.
    if (pos.has('watch-and-help') && pos.has('nopa') && pos.has('proact')) {
      const nodes = routeNodes(papers, pos);
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const g = geometryOf(byId.get('watch-and-help')!, byId.get('nopa')!, routes[edgeKey('watch-and-help', 'nopa')]?.[0]);
      expect(blockers(g.pts, ['watch-and-help', 'nopa'], new NodeIndex(nodes)).map((b) => b.node.id)).not.toContain('proact');
    }
  });

  it('in the synthetic fixture of 330 papers, at zoom 0.5 and up', { timeout: 120_000 }, () => {
    const papers = syntheticPapers();
    const pos = layoutPapers(papers, Object.keys(SYNTHETIC_FAMILIES));
    const routes = routePapers(papers, pos);
    for (let s = 0; s < ROUTE_STEPS.length; s++) {
      if (ROUTE_STEPS[s] < 0.5) continue;
      expect(blocked(papers, pos, routes, s), `zoom step ${ROUTE_STEPS[s]}`).toEqual([]);
    }
  });
});
