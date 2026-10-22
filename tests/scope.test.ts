import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { inLiteratureGraph } from '../src/lib/literatureLayout.ts';
import {
  atFocusLevel,
  BAND_LEVELS,
  evaluationsScope,
  FOCUS_LEVELS,
  FRAMEWORK_PAPER,
  inEvaluations,
  inMethodsGraph,
  inMethodsTopBand,
  inSubproblems,
  solvesSubproblem,
} from '../src/lib/scope.ts';
import { familyHue, FRAMEWORK_HUE, NO_CATEGORY_HUE, tangentHue, TANGENTS_IN_GRAPH } from '../src/pages/methods/constants.ts';
import type { DbPaper } from '../src/schema.ts';
import { buildDb } from '../src/validate.ts';

// Level scope (SPEC §6.2): which papers each part of the site shows.

const method = { knowns: { goal: 'unknown', human_policy: 'unknown' } } as DbPaper['method'];
const P = (id: string, extra: Partial<DbPaper> = {}) => ({ id, level: null, method: undefined, tangent: undefined, ...extra }) as DbPaper;

const l2 = P('l2', { level: 'L2', method });
const l1 = P('l1', { level: 'L1', method });
const l0 = P('l0', { level: 'L0', method });
const work = P('work'); // no level, such as a related work from another field
const tangent = P('tangent', { tangent: 'hri' });
const l1Tangent = P('l1-tangent', { level: 'L1', method, tangent: 'hri' });
const all = [l2, l1, l0, work, tangent, l1Tangent];
const ids = (keep: (p: DbPaper) => boolean) => all.filter(keep).map((p) => p.id);

describe('level scope', () => {
  it('focuses on L2, and the top band holds L2 and L1', () => {
    expect(FOCUS_LEVELS).toEqual(['L2']);
    expect(BAND_LEVELS).toEqual(['L2', 'L1']);
    expect(ids(atFocusLevel)).toEqual(['l2']);
  });

  it('puts L2 and L1 methods in the Methods top band, without tangential works or L0', () => {
    expect(ids(inMethodsTopBand)).toEqual(['l2', 'l1']);
  });

  it('puts focus-level methods and every tangential work in the Methods graph and list', () => {
    expect(ids(inMethodsGraph)).toEqual(['l2', 'tangent', 'l1-tangent']);
  });

  it('shows only focus-level papers on Evaluations, never papers with no level', () => {
    expect(ids(inEvaluations)).toEqual(['l2']);
  });

  it('keeps papers in evaluations_exclude off Evaluations, and only there', () => {
    const search = P('search', { level: 'L2', method });
    const keep = evaluationsScope(['search']);
    expect([...all, search].filter(keep).map((p) => p.id)).toEqual(['l2']);
    expect(evaluationsScope([])(search)).toBe(true);
    expect(inMethodsGraph(search)).toBe(true);
    expect(inSubproblems(search)).toBe(true);
  });

  it('shows focus-level papers and papers with no level on Subproblems, never L1', () => {
    expect(ids(inSubproblems)).toEqual(['l2', 'work', 'tangent']);
    expect(inSubproblems(l1)).toBe(false);
  });
});

describe('the seed data: core and tangential works (per Maithili, Oct 22 2026)', () => {
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
  const db = r.db!;
  const byId = new Map(db.papers.map((p) => [p.id, p]));
  const graph = db.papers.filter((p) => inLiteratureGraph(p, FOCUS_LEVELS, TANGENTS_IN_GRAPH));
  const families = db.taxonomy.families;
  /** The graph's hue for a paper, as LiteratureGraph picks it. */
  const hue = (p: DbPaper) => (p.tangent ? tangentHue(db.taxonomy.tangent_types, p.tangent) : p.id === FRAMEWORK_PAPER ? FRAMEWORK_HUE : familyHue(families, p.method?.family));
  const PLANNING = ['anticipatory-tamp', 'talukder-2025-anticipatory-planning', 'courteous-anticipation'];
  const DIN = 'din-2025-proactivity';

  it('builds without errors', () => {
    expect(r.errors).toEqual([]);
  });

  it('draws no gray paper: each graph paper is in a family, is GAP, or is a tangential work of a known type', () => {
    expect(graph.filter((p) => hue(p) === NO_CATEGORY_HUE).map((p) => p.id)).toEqual([]);
    const core = graph.filter((p) => !p.tangent);
    expect(core.filter((p) => p.id !== FRAMEWORK_PAPER && !(p.method?.family && families[p.method.family])).map((p) => p.id)).toEqual([]);
    expect(new Set(core.map((p) => p.method?.family ?? null))).toEqual(new Set(['goal_inference', 'temporal_imitation', null]));
    expect(core.filter((p) => !p.method?.family).map((p) => p.id)).toEqual([FRAMEWORK_PAPER]);
  });

  it('makes the three anticipatory planning papers brown planning tangents that keep their L2 level', () => {
    for (const id of PLANNING) {
      const p = byId.get(id)!;
      expect(p.tangent, id).toBe('planning');
      expect(p.method?.family, id).toBeUndefined();
      expect(p.method?.knowns, id).toEqual({ goal: 'unknown', human_policy: 'unknown' });
      expect(p.level, id).toBe('L2');
      expect(hue(p), id).toBe('brown');
      expect(graph.includes(p), id).toBe(true);
    }
  });

  it('makes Din 2025 a fern implicit-cues tangent with no family', () => {
    const p = byId.get(DIN)!;
    expect(p.tangent).toBe('implicit_cues');
    expect(p.method?.family).toBeUndefined();
    expect(p.level).toBe('L2');
    expect(hue(p)).toBe('fern');
    expect(graph.includes(p)).toBe(true);
  });

  it('keeps the planning papers on the Evaluations page, and Din off it through evaluations_exclude', () => {
    const onEvals = evaluationsScope(db.taxonomy.evaluations_exclude);
    for (const id of PLANNING) expect(onEvals(byId.get(id)!), id).toBe(true);
    expect(db.taxonomy.evaluations_exclude).toContain(DIN);
    expect(onEvals(byId.get(DIN)!)).toBe(false);
    expect(inEvaluations(byId.get(DIN)!)).toBe(true);
  });

  it('drops the four new tangents from the L2 timeline lane, which keeps the nine core L2 papers', () => {
    const lane = db.papers.filter((p) => inMethodsTopBand(p) && p.level === 'L2').map((p) => p.id);
    for (const id of [...PLANNING, DIN]) expect(lane, id).not.toContain(id);
    expect(lane.sort()).toEqual(['gap', 'globe', 'nopa', 'proact', 'saavedra-2026-scene-graphs', 'slate-pro', 'stot', 'streak', 'watch-and-help']);
  });
});

describe('subproblems display rule', () => {
  const approaches = { symbolic: 'Symbolic', learned: 'Learned' };
  const tagged = (tag: NonNullable<DbPaper['subproblems']>['A2']) => P('x', { subproblems: { A2: tag } });
  it('lists a work under a subproblem only when it addresses it with an approach from the taxonomy', () => {
    expect(solvesSubproblem(tagged({ status: 'addresses', relation: 'direct', approach: 'learned', note: '' }), 'A2', approaches)).toBe(true);
    expect(solvesSubproblem(tagged({ status: 'addresses', relation: 'adjacent', approach: 'symbolic', note: '' }), 'A2', approaches)).toBe(true);
    // No approach: the tags that once went under "Other".
    expect(solvesSubproblem(tagged({ status: 'addresses', relation: 'direct', note: '' }), 'A2', approaches)).toBe(false);
    expect(solvesSubproblem(tagged({ status: 'addresses', relation: 'direct', approach: 'toString', note: '' }), 'A2', approaches)).toBe(false);
    expect(solvesSubproblem(tagged({ status: 'assumes', relation: 'direct', approach: 'learned', note: '' }), 'A2', approaches)).toBe(false);
    expect(solvesSubproblem(tagged({ status: 'addresses', relation: 'direct', approach: 'learned', note: '' }), 'A1', approaches)).toBe(false);
    expect(solvesSubproblem(P('none'), 'A2', approaches)).toBe(false);
  });
});
