import { describe, expect, it } from 'vitest';
import { matchesGlobal, matchesQuery, parseYears, readGlobalFilters } from '../src/lib/filters.ts';
import { ancestry, subproblemFlow } from '../src/lib/graph.ts';
import { scorePaper, search } from '../src/lib/search.ts';
import { categoryItems, itemServes, itemSummary, metricKeyMembers, termTags, unitText } from '../src/lib/metrics.ts';
import { categoriesOf, closest, furthestLoop, mergePaper, mostComplex, rowMatches, strongest } from '../src/pages/evaluations/merge.ts';
import { complexityFill } from '../src/pages/evaluations/RealismPlot.tsx';
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
    // `level` selects a Methods level card; it is not a global filter (SPEC §6.2).
    expect(f).toEqual({
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
    expect(matchesGlobal(s, f('family=temporal_imitation'))).toBe(false);
    expect(matchesGlobal(s, f('action=act'))).toBe(false);
    expect(matchesGlobal(m, f('action=ask'))).toBe(false);
    expect(matchesGlobal(m, f('family=temporal_imitation&input=scene_graph'))).toBe(true);
  });
  it('ignores level=, which only highlights a Methods timeline row', () => {
    expect(matchesGlobal(m, f('level=L1'))).toBe(true);
    expect(matchesGlobal(s, f('level=L2'))).toBe(true);
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
  const TC = ['low', 'medium', 'high'];
  it('takes the most complex task level across entries, and null when no entry has one', () => {
    expect(mostComplex(['medium', null, 'high', 'low'], TC)).toBe('high');
    expect(mostComplex(['low', undefined], TC)).toBe('low');
    expect(mostComplex([null, undefined], TC)).toBeNull();
    expect(mostComplex([], TC)).toBeNull();
    const withLevels = P('p', 'P', {
      evaluations: [
        { id: 'a', loop: 'offline_replay', task_complexity: 'medium' },
        { id: 'b', loop: 'closed_scripted', task_complexity: null },
        { id: 'c', loop: 'closed_adaptive', task_complexity: 'low' },
      ],
    });
    expect(mergePaper(withLevels, LOOPS, R, undefined, TC).complexity).toBe('medium');
    // An entry with no level never lowers the merged one, and a paper with none stays null.
    expect(row.complexity).toBeNull();
    expect(mergePaper(paper, LOOPS, R, undefined, TC).complexity).toBeNull();
  });
  it('colors a complexity level by its ramp step, and gray when not assessed', () => {
    expect(complexityFill('low', TC)).toBe('var(--complexity-1)');
    expect(complexityFill('high', TC)).toBe('var(--complexity-3)');
    expect(complexityFill(null, TC)).toBe('var(--complexity-none)');
    expect(complexityFill('unknown', TC)).toBe('var(--complexity-none)');
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

  const CATS = ['user_actions', 'object_movement', 'task'];
  const CAT_OF: Record<string, string> = { f1: 'object_movement', nas: 'user_actions' };
  const catOf = (m: string): string | undefined => CAT_OF[m];
  it('lists the distinct categories of its metrics in category order, never uncategorized metrics', () => {
    expect(mergePaper(paper, LOOPS, R, { order: CATS, of: catOf }).categories).toEqual(['user_actions', 'object_movement']);
    expect(categoriesOf(['f1', 'relation_accuracy'], CATS, catOf)).toEqual(['object_movement']);
    expect(categoriesOf(['relation_accuracy'], CATS, catOf)).toEqual([]);
    expect(row.categories).toEqual([]);
  });
  it('matches a category when any entry has a metric in it', () => {
    const f = { loop: null, term: null, metric: null, dataset: null, metricTerms: () => [], metricCategory: catOf };
    expect(rowMatches(row, { ...f, category: 'user_actions' })).toBe(true);
    expect(rowMatches(row, { ...f, category: 'task' })).toBe(false);
    expect(rowMatches(row, { ...f, category: 'user_actions', loop: 'offline_replay' })).toBe(false);
  });
  it('matches a metric group when any entry uses any of its members', () => {
    const f = { loop: null, term: null, metric: null, dataset: null, metricTerms: () => [] };
    const members = (m: string) => (m === 'grp' ? ['nas', 'other'] : [m]);
    expect(rowMatches(row, { ...f, metric: 'grp', metricMembers: members })).toBe(true);
    expect(rowMatches(row, { ...f, metric: 'grp', metricMembers: members, loop: 'offline_replay' })).toBe(false);
    expect(rowMatches(row, { ...f, metric: 'grp' })).toBe(false);
  });
});

describe('metric category boxes', () => {
  const M = (category: string | undefined, group: string | undefined, terms: string[], direction: 'higher' | 'lower' = 'higher', unit = '%') => ({
    category,
    group,
    terms,
    direction,
    unit,
  });
  const metrics = {
    f1: M('obj', undefined, ['dC_saved', 'dC_added'], 'higher', 'fraction'),
    used_correct: M('obj', 'used', ['dC_saved']),
    other: M('task', undefined, []),
    object_f1: M('obj', undefined, ['dC_added'], 'higher', 'fraction'),
    used_wrong: M('obj', 'used', ['dC_added'], 'lower'),
    relation_accuracy: M(undefined, undefined, []),
  };
  it('lists a category in taxonomy order, with a group as one item at its first member', () => {
    expect(categoryItems('obj', metrics)).toEqual([
      { id: 'f1', group: null, members: ['f1'] },
      { id: 'used', group: 'used', members: ['used_correct', 'used_wrong'] },
      { id: 'object_f1', group: null, members: ['object_f1'] },
    ]);
    expect(categoryItems('task', metrics).map((i) => i.id)).toEqual(['other']);
    expect(categoryItems('none', metrics)).toEqual([]);
  });
  it('drops metrics that fail `keep`, and a group with no member left', () => {
    // The group moves to its first kept member.
    expect(categoryItems('obj', metrics, (m) => m !== 'used_correct').map((i) => i.members)).toEqual([['f1'], ['object_f1'], ['used_wrong']]);
    expect(categoryItems('obj', metrics, (m) => !m.startsWith('used')).map((i) => i.id)).toEqual(['f1', 'object_f1']);
  });
  it("summarizes an item's terms, direction, and units", () => {
    const TERMS = ['dV', 'dC_saved', 'dC_added', 'Cr'];
    const [f1, used] = categoryItems('obj', metrics);
    expect(itemSummary(f1, metrics, TERMS)).toEqual({ terms: ['dC_saved', 'dC_added'], direction: 'higher', units: ['fraction'] });
    expect(itemSummary(used, metrics, TERMS)).toEqual({ terms: ['dC_saved', 'dC_added'], direction: null, units: ['%'] });
  });
  it("tags a row with ΔV and ΔC only, as the union of its members' terms", () => {
    expect(termTags(['dV'])).toEqual(['ΔV']);
    for (const t of ['dC_saved', 'dC_added', 'Cr']) expect(termTags([t])).toEqual(['ΔC']);
    expect(termTags(['dC_added', 'Cr', 'dV', 'dC_saved'])).toEqual(['ΔV', 'ΔC']);
    expect(termTags([])).toEqual([]);
    const all: Record<string, { terms: string[] }> = metrics;
    const tagsOf = (category: string) => categoryItems(category, metrics).map((it) => termTags(it.members.flatMap((m) => all[m].terms)));
    // f1, the used group (ΔC↓ and ΔC↑ members), object F1; a row whose metrics serve no term gets no tag.
    expect(tagsOf('obj')).toEqual([['ΔC'], ['ΔC'], ['ΔC']]);
    expect(tagsOf('task')).toEqual([[]]);
  });
  it('shows a unit as stored, except "not stated"', () => {
    expect(unitText('%')).toBe('%');
    expect(unitText('1–7 rating')).toBe('1–7 rating');
    expect(unitText('not stated')).toBe('unit not stated');
  });
  it('dims a row only when no member serves the term', () => {
    const [f1, used, objectF1] = categoryItems('obj', metrics);
    expect(itemServes(used, metrics, 'dC_saved')).toBe(true);
    expect(itemServes(objectF1, metrics, 'dC_saved')).toBe(false);
    expect(itemServes(f1, metrics, 'Cr')).toBe(false);
    expect(itemServes(f1, metrics, null)).toBe(true);
  });
  it('reads metric= as a metric id or a group id', () => {
    expect(metricKeyMembers('f1', metrics)).toEqual(['f1']);
    expect(metricKeyMembers('used', metrics)).toEqual(['used_correct', 'used_wrong']);
    expect(metricKeyMembers('ghost', metrics)).toEqual(['ghost']);
  });
});
