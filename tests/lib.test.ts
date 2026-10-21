import { describe, expect, it } from 'vitest';
import { matchesGlobal, matchesQuery, parseYears, readGlobalFilters } from '../src/lib/filters.ts';
import { ancestry, subproblemFlow } from '../src/lib/graph.ts';
import { scorePaper, search } from '../src/lib/search.ts';
import { closest, furthestLoop, mergePaper, rowMatches, strongest } from '../src/pages/evaluations/merge.ts';
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


describe('protocols table rows', () => {
  const LOOPS = ['offline_replay', 'closed_scripted', 'closed_adaptive', 'user_study_short'];
  const R = { robot: ['wizard', 'task_specific', 'generalist'], human: ['recorded', 'scripted', 'adaptive_sim'], environment: ['simulator', 'lab'] };
  const paper = P('gap', 'GAP', {
    evaluations: [
      { id: 'a', loop: 'offline_replay', datasets: ['d1'], metrics: ['f1'], baselines: ['x'], captures: { state_drift: 'no', goal_adaptation: 'no' }, realism: { robot: 'task_specific', human: 'recorded' } },
      { id: 'b', loop: 'closed_adaptive', environment: 'sim', datasets: ['d1', 'd2'], metrics: ['f1', 'nas'], baselines: ['x', 'y'], other_baselines: ['Oracle'], human_model: 'LLM', captures: { state_drift: 'yes', goal_adaptation: 'partial' }, realism: { robot: 'task_specific', human: 'adaptive_sim', environment: 'simulator' } },
      { id: 'c', loop: 'closed_scripted', human_model: 'Scripted', captures: { state_drift: 'yes', goal_adaptation: 'no' }, realism: { human: 'scripted' } },
    ],
  });
  const row = mergePaper(paper, LOOPS, R);
  it('merges entries into one row', () => {
    expect(row.loops).toEqual(['offline_replay', 'closed_scripted', 'closed_adaptive']);
    expect(row.datasets).toEqual(['d1', 'd2']);
    expect(row.environments).toEqual(['sim']);
    expect(row.humans).toEqual(['LLM', 'Scripted']);
    expect(row.metrics).toEqual(['f1', 'nas']);
    expect(row.baselines).toEqual(['x', 'y']);
    expect(row.otherBaselines).toEqual(['Oracle']);
    expect(row.drift).toBe('yes');
    expect(row.adapt).toBe('partial');
    expect(row.realism).toEqual({ robot: 'task_specific', human: 'adaptive_sim', environment: 'simulator' });
    expect(furthestLoop(row, LOOPS)).toBe(2);
  });
  it('takes the strongest capture and the closest realism level', () => {
    expect(strongest(['no', null, 'partial'])).toBe('partial');
    expect(strongest([null, undefined])).toBeNull();
    expect(closest(['recorded', 'adaptive_sim', 'scripted'], R.human)).toBe('adaptive_sim');
    expect(closest([null], R.human)).toBeNull();
  });
  it('matches filters when any entry matches', () => {
    const f = { loop: null, term: null, metric: null, dataset: null, metricTerms: (m: string) => (m === 'nas' ? ['dC_saved'] : ['dC_added']) };
    expect(rowMatches(row, { ...f, loop: 'closed_scripted' })).toBe(true);
    expect(rowMatches(row, { ...f, loop: 'user_study_short' })).toBe(false);
    expect(rowMatches(row, { ...f, term: 'dC_saved' })).toBe(true);
    expect(rowMatches(row, { ...f, dataset: 'sim' })).toBe(true);
    // Both conditions must hold in the same entry.
    expect(rowMatches(row, { ...f, loop: 'offline_replay', metric: 'nas' })).toBe(false);
  });
});
