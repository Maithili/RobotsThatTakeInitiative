import { describe, expect, it } from 'vitest';
import { matchesGlobal, matchesQuery, parseYears, readGlobalFilters } from '../src/lib/filters.ts';
import { ancestry, subproblemFlow } from '../src/lib/graph.ts';
import { scorePaper, search } from '../src/lib/search.ts';
import { applyParams, toggleInList } from '../src/state/url.ts';
import type { DbPaper } from '../src/schema.ts';

describe('URL state', () => {
  it('round-trips global filters', () => {
    const qs = applyParams('', {
      level: ['L1', 'L2'],
      family: 'temporal_imitation',
      action: ['act', 'ask'],
      input: [],
      theme: 'continual_learning',
      years: '2015-2026',
      q: 'goal inference',
      paper: 'gap',
      compare: ['gap', 'slate-pro'],
    });
    expect(qs).toContain('level=L1,L2');
    const f = readGlobalFilters(new URLSearchParams(qs));
    expect(f).toEqual({
      level: ['L1', 'L2'],
      family: ['temporal_imitation'],
      action: ['act', 'ask'],
      input: [],
      theme: ['continual_learning'],
      years: [2015, 2026],
      q: 'goal inference',
    });
    const sp = new URLSearchParams(qs);
    expect(sp.get('paper')).toBe('gap');
    expect(sp.get('compare')).toBe('gap,slate-pro');
  });

  it('removes empty values and keeps others', () => {
    expect(applyParams('?level=L2&sub=A2', { level: null })).toBe('?sub=A2');
    expect(applyParams('?level=L2', { level: [] })).toBe('');
    expect(applyParams('?a=1', { gaps: false })).toBe('?a=1');
  });

  it('parses years and toggles lists', () => {
    expect(parseYears('2026-2015')).toEqual([2015, 2026]);
    expect(parseYears('nope')).toBeNull();
    expect(toggleInList(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleInList(['a', 'b'], 'a')).toEqual(['b']);
  });
});

const P = (id: string, short_name: string, extra: Partial<DbPaper> = {}): DbPaper =>
  ({
    id,
    short_name,
    title: '',
    authors: [],
    year: 2020,
    links: { paper: null },
    provenance: '',
    level: null,
    built_upon_by: [],
    benchmarks_against: [],
    benchmarked_in: [],
    cites: [],
    cited_by: [],
    search: '',
    ...extra,
  }) as DbPaper;

describe('search scoring', () => {
  const items = [
    P('nopa', 'NOPA', { title: 'Neurally-guided Online Probabilistic Assistance', authors: ['X. Puig'], year: 2023 }),
    P('gap', 'GAP', { title: 'Robots That Take Initiative', authors: ['Maithili Patel', 'Sonia Chernova'], year: 2026 }),
    P('slate-pro', 'SLaTe-PRO', { title: 'Predicting Routine Object Usage for Proactive Robot Assistance', authors: ['M. Patel'], year: 2023 }),
  ];
  it('ranks short-name matches above title matches', () => {
    expect(search(items, 'gap')[0].id).toBe('gap');
    expect(scorePaper(items[0], 'nopa')).toBeGreaterThan(scorePaper(items[0], 'online'));
  });
  it('matches token prefixes across fields and requires every token', () => {
    expect(search(items, 'patel').map((p) => p.id).sort()).toEqual(['gap', 'slate-pro']);
    expect(search(items, 'patel 2023').map((p) => p.id)).toEqual(['slate-pro']);
    expect(search(items, 'proact rob').map((p) => p.id)).toEqual(['slate-pro']);
    expect(search(items, 'zzz')).toEqual([]);
    expect(search(items, '')).toEqual([]);
  });
  it('caps results', () => {
    const many = Array.from({ length: 20 }, (_, i) => P(`p${i}`, `Robot ${i}`));
    expect(search(many, 'robot')).toHaveLength(8);
  });
});

describe('filters', () => {
  const m = P('m', 'M', { level: 'L2', method: { knowns: { goal: 'unknown', human_policy: 'unknown' }, family: 'temporal_imitation', action_types: ['act'], inputs: ['scene_graph'] }, search: 'm predicting routine 2023' });
  const s = P('s', 'S', { subproblems: { G1: { status: 'addresses', relation: 'direct', note: '' } } });
  const f = (q: string) => readGlobalFilters(new URLSearchParams(q));
  it('fails method filters for papers without a method block', () => {
    expect(matchesGlobal(m, f('level=L2'))).toBe(true);
    expect(matchesGlobal(s, f('level=L2'))).toBe(false);
    expect(matchesGlobal(s, f('action=act'))).toBe(false);
    expect(matchesGlobal(m, f('action=ask'))).toBe(false);
    expect(matchesGlobal(m, f('family=temporal_imitation&input=scene_graph'))).toBe(true);
  });
  it('applies years and text', () => {
    expect(matchesGlobal(m, f('years=2021-2026'))).toBe(false);
    expect(matchesQuery('predicting routine object', 'pred rout')).toBe(true);
    expect(matchesQuery('predicting routine object', 'goal')).toBe(false);
  });
});

describe('graph traversal', () => {
  it('finds ancestors and descendants through builds_on', () => {
    const buildsOn = { a: [], b: ['a'], c: ['b'], d: ['a'], e: [] };
    const r = ancestry('b', buildsOn);
    expect([...r.ancestors]).toEqual(['a']);
    expect([...r.descendants]).toEqual(['c']);
    expect([...ancestry('a', buildsOn).descendants].sort()).toEqual(['b', 'c', 'd']);
  });
  it('finds subproblem upstream and downstream sets', () => {
    const dependsOn = { G1: [], G2: ['G1'], A1: ['G1', 'G2'], A2: ['G1', 'A1'], A3: ['G1', 'G2'], P1: [], P2: ['P1', 'A1', 'A2', 'A3'] };
    const a2 = subproblemFlow('A2', dependsOn);
    expect([...a2.upstream].sort()).toEqual(['A1', 'G1', 'G2']);
    expect([...a2.downstream]).toEqual(['P2']);
    const g1 = subproblemFlow('G1', dependsOn);
    expect(g1.upstream.size).toBe(0);
    expect([...g1.downstream].sort()).toEqual(['A1', 'A2', 'A3', 'G2', 'P2']);
  });
});
