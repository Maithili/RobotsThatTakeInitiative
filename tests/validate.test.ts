import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { deriveLevel } from '../src/schema.ts';
import { buildDb, findCycle, isPdfUrl, type SourceFile } from '../src/validate.ts';

const realTaxonomy = yaml.load(readFileSync(join(__dirname, '../data/taxonomy.yaml'), 'utf8')) as Record<string, any>;

/** Taxonomy without cross-references to papers, so an empty papers/ folder is valid. */
function bareTaxonomy() {
  const t = structuredClone(realTaxonomy);
  delete t.loop_types.closed_adaptive.refs;
  delete t.realism.human.levels.adaptive_sim.refs;
  t.featured_comparison.methods = [];
  t.featured_comparison.columns = [];
  return t;
}

const base = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  short_name: id.toUpperCase().slice(0, 20),
  title: `Title of ${id}`,
  authors: ['A. Author'],
  year: 2020,
  links: { paper: 'https://arxiv.org/abs/2001.00001' },
  provenance: 'test',
  ...extra,
});

const L2K = { knowns: { goal: 'unknown', human_policy: 'unknown' } } as const;
const sim = { id: 'sim', name: 'Sim', kind: 'simulator', links: { home: null }, sim_or_real: 'sim', provenance: 'test' };
const ds = { id: 'ds', name: 'DS', kind: 'dataset', links: { home: null }, sim_or_real: 'sim', provenance: 'test' };

function run(papers: Record<string, unknown>[], opts: { datasets?: Record<string, unknown>[]; taxonomy?: unknown; repoFiles?: string[]; names?: string[] } = {}) {
  const pf: SourceFile[] = papers.map((p, i) => ({ name: opts.names?.[i] ?? (p.id as string), data: p }));
  const df: SourceFile[] = (opts.datasets ?? [sim, ds]).map((d) => ({ name: d.id as string, data: d }));
  return buildDb({ taxonomy: opts.taxonomy ?? bareTaxonomy(), papers: pf, datasets: df, repoFiles: opts.repoFiles });
}

const expectError = (r: ReturnType<typeof run>, re: RegExp) => {
  expect(r.db).toBeNull();
  expect(r.errors.some((e) => re.test(e)), `expected an error matching ${re}, got:\n${r.errors.join('\n')}`).toBe(true);
};

describe('level derivation', () => {
  it('maps knowns to levels', () => {
    expect(deriveLevel({ goal: 'known', human_policy: 'known' })).toBe('L0');
    expect(deriveLevel({ goal: 'known', human_policy: 'unknown' })).toBe('L1');
    expect(deriveLevel({ goal: 'unknown', human_policy: 'unknown' })).toBe('L2');
    expect(deriveLevel({ goal: 'unknown', human_policy: 'known' })).toBeNull();
    expect(deriveLevel(null)).toBeNull();
    expect(deriveLevel(undefined)).toBeNull();
  });
});

describe('validator', () => {
  it('passes on an empty papers folder', () => {
    const r = run([], { datasets: [] });
    expect(r.errors).toEqual([]);
    expect(r.db?.papers).toEqual([]);
  });

  it('rejects a file that does not match its schema', () => {
    expectError(run([{ ...base('a'), year: 'twenty' }]), /year/);
    expectError(run([{ ...base('a'), surprise: 1 }]), /Unrecognized key/);
  });

  it('rejects ids that are not in the taxonomy', () => {
    expectError(run([base('a', { themes: ['vibes'] })]), /unknown theme/);
    expectError(run([base('a', { tangent: 'gossip' })]), /unknown tangent type "gossip"/);
    expectError(run([base('a', { method: { ...L2K, action_types: ['dance'] } })]), /unknown action type/);
    expectError(run([base('a', { method: { ...L2K, inputs: ['smell'] } })]), /unknown input modality/);
    expectError(run([base('a', { evaluations: [{ id: 'e', loop: 'vibes' }] })]), /unknown loop type/);
    expectError(run([base('a', { evaluations: [{ id: 'e', loop: 'offline_replay', metrics: ['bleu'] }] })]), /unknown metric/);
    expectError(
      run([base('a', { subproblems: { A2: { status: 'addresses', relation: 'direct', approach: 'hierarchical', note: 'x' } } })]),
      /not an approach of A2/,
    );
  });

  it('rejects ablations listed as baselines', () => {
    expectError(run([base('a', { evaluations: [{ id: 'e', loop: 'offline_replay', other_baselines: ['No-memory variant (ablation)'] }] })]), /lists an ablation/);
  });

  it('rejects references to missing ids', () => {
    expectError(run([base('a', { method: { ...L2K, builds_on: ['ghost'] } })]), /builds_on "ghost" does not exist/);
    expectError(run([base('a', { evaluations: [{ id: 'e', loop: 'offline_replay', baselines: ['ghost'] }] })]), /baseline "ghost"/);
    expectError(run([base('a', { evaluations: [{ id: 'e', loop: 'offline_replay', datasets: ['ghost'] }] })]), /dataset "ghost"/);
    expectError(run([base('a', { evaluations: [{ id: 'e', loop: 'offline_replay', environment: 'ghost' }] })]), /environment "ghost"/);
    expectError(run([base('a', { evaluations: [{ id: 'e', loop: 'offline_replay', environment: 'ds' }] })]), /not a simulator/);
    expectError(
      run([base('a', { evaluations: [{ id: 'e', loop: 'offline_replay', metrics: ['f1'], results: [{ method: 'ghost', metric: 'f1', value: 1 }] }] })]),
      /result method "ghost"/,
    );
    expectError(run([], { datasets: [{ ...ds, introduced_in: 'ghost' }] }), /introduced_in "ghost"/);
    expectError(run([], { taxonomy: realTaxonomy, datasets: [] }), /refs "zhang-2023-llm-human-models" does not exist/);
  });

  it('rejects an id that differs from its file name', () => {
    expectError(run([base('a')], { names: ['b'] }), /differs from file name/);
  });

  it('rejects duplicate evaluation ids', () => {
    expectError(
      run([base('a', { evaluations: [{ id: 'e', loop: 'offline_replay' }] }), base('b', { evaluations: [{ id: 'e', loop: 'offline_replay' }] })]),
      /also used in/,
    );
  });

  it('rejects text over its cap', () => {
    expectError(run([base('a', { short_name: 'x'.repeat(25) })]), /short_name exceeds 24/);
    expectError(run([base('a', { provenance: 'x'.repeat(141) })]), /provenance exceeds 140/);
    expectError(run([base('a', { method: { ...L2K, core_strength: 'x'.repeat(121) } })]), /core_strength exceeds 120/);
    expectError(run([base('a', { subproblems: { G1: { status: 'addresses', relation: 'direct', note: 'x'.repeat(141) } } })]), /note exceeds 140/);
    expectError(run([base('a', { evaluations: [{ id: 'e', loop: 'offline_replay', human_model: 'x'.repeat(61) }] })]), /human_model exceeds 60/);
    expectError(run([], { datasets: [{ ...ds, span: 'x'.repeat(41) }] }), /span exceeds 40/);
  });

  it('rejects PDF links and PDF files', () => {
    expectError(run([base('a', { links: { paper: 'https://x.org/paper.PDF?dl=1' } })]), /points to a PDF/);
    expectError(run([base('a', { links: { paper: null, code: 'https://x.org/a.pdf' } })]), /links.code points to a PDF/);
    expectError(run([], { datasets: [{ ...ds, links: { home: 'https://x.org/d.pdf' } }] }), /links.home points to a PDF/);
    expectError(run([], { repoFiles: ['data/papers/a.yaml', 'docs/paper.pdf'] }), /PDF files are not allowed/);
    expect(isPdfUrl('https://arxiv.org/abs/2001.00001')).toBe(false);
    expect(isPdfUrl('https://arxiv.org/pdf/2001.00001.pdf#page=2')).toBe(true);
  });

  it('rejects goal unknown with policy known', () => {
    expectError(run([base('a', { method: { knowns: { goal: 'unknown', human_policy: 'known' } } })]), /not a level/);
  });

  it('rejects a family on a non-L2 paper', () => {
    expectError(run([base('a', { method: { knowns: { goal: 'known', human_policy: 'unknown' }, family: 'goal_inference' } })]), /not L2/);
  });

  it('rejects a method block without knowns', () => {
    expectError(run([base('a', { method: { family: 'goal_inference' } })]), /knowns/);
    expectError(run([base('a', { method: { knowns: null } })]), /knowns/);
  });

  it('rejects a builds_on cycle', () => {
    expectError(
      run([base('a', { method: { ...L2K, builds_on: ['b'] } }), base('b', { method: { ...L2K, builds_on: ['c'] } }), base('c', { method: { ...L2K, builds_on: ['a'] } })]),
      /cycle/,
    );
    expect(findCycle(new Map([['a', ['b']], ['b', []]]))).toBeNull();
  });

  it('warns without failing', () => {
    const r = run([
      base('old', { links: { paper: null }, method: { ...L2K, builds_on: ['new'] } }),
      base('new', { year: 2024, evaluations: [{ id: 'e', loop: 'offline_replay', metrics: [], results: [{ method: 'old', metric: 'f1', value: 1 }] }] }),
      base('lonely'),
    ]);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join('\n')).toMatch(/links.paper is null/);
    expect(r.warnings.join('\n')).toMatch(/newer than this paper/);
    expect(r.warnings.join('\n')).toMatch(/not in the evaluation's metrics/);
    expect(r.warnings.join('\n')).toMatch(/lonely.yaml: no method/);
  });

  it('derives levels, reverse edges, used_by, counts, and search', () => {
    const r = run([
      base('a', { method: { knowns: { goal: 'unknown', human_policy: 'unknown' }, family: 'temporal_imitation' }, subproblems: { A3: { status: 'addresses', relation: 'direct', note: 'x' } } }),
      base('b', {
        year: 2022,
        authors: ['Jane Doe'],
        method: { knowns: { goal: 'known', human_policy: 'unknown' }, builds_on: ['a'] },
        evaluations: [{ id: 'e', loop: 'offline_replay', environment: 'sim', datasets: ['ds'], metrics: ['f1'], baselines: ['a'] }],
      }),
    ]);
    expect(r.errors).toEqual([]);
    const db = r.db!;
    const a = db.papers.find((p) => p.id === 'a')!;
    const b = db.papers.find((p) => p.id === 'b')!;
    expect(a.level).toBe('L2');
    expect(b.level).toBe('L1');
    expect(a.built_upon_by).toEqual(['b']);
    expect(a.benchmarked_in).toEqual(['b']);
    expect(b.benchmarks_against).toEqual(['a']);
    expect(db.metric_used_by.f1).toEqual([{ paper: 'b', evaluation: 'e' }]);
    expect(db.datasets.find((d) => d.id === 'ds')!.used_by).toEqual([{ paper: 'b', evaluation: 'e' }]);
    expect(db.datasets.find((d) => d.id === 'sim')!.used_by).toEqual([{ paper: 'b', evaluation: 'e' }]);
    expect(db.subproblem_counts.A3.addresses).toBe(1);
    expect(b.search).toContain('jane doe');
    expect(b.search).toContain('2022');
  });
});

describe('citations', () => {
  const cit = (papers: Record<string, { s2_id: string | null; cites: string[] }>, unresolved: string[] = []) => ({
    generated_at: 'T',
    source: 'test',
    papers,
    unresolved,
  });
  const runC = (ps: Record<string, unknown>[], citations: unknown) =>
    buildDb({ taxonomy: bareTaxonomy(), papers: ps.map((p) => ({ name: p.id as string, data: p })), datasets: [], citations });

  it('warns when citations.json is missing, stale, or incomplete', () => {
    expect(runC([base('a')], undefined).warnings.join('\n')).toMatch(/citations.json is missing/);
    const stale = runC([base('a')], cit({ a: { s2_id: 'x', cites: ['ghost'] }, gone: { s2_id: 'y', cites: [] } }));
    expect(stale.errors).toEqual([]);
    expect(stale.warnings.join('\n')).toMatch(/no longer exist \(gone, ghost\)/);
    expect(runC([base('a'), base('b')], cit({ a: { s2_id: 'x', cites: [] } })).warnings.join('\n')).toMatch(/missing b/);
  });

  it('rejects a malformed citations.json', () => {
    expectError(runC([base('a')], { papers: {} }) as ReturnType<typeof run>, /citations.json/);
  });

  it('derives cites, cited_by, and one merged edge per pair', () => {
    const r = runC(
      [
        base('a', { method: { ...L2K } }),
        base('b', { year: 2022, method: { ...L2K, builds_on: ['a'] }, evaluations: [{ id: 'e', loop: 'offline_replay', baselines: ['a'] }] }),
      ],
      cit({ a: { s2_id: 'x', cites: [] }, b: { s2_id: 'y', cites: ['a', 'outside'] } }),
    );
    expect(r.errors).toEqual([]);
    const a = r.db!.papers.find((p) => p.id === 'a')!;
    const b = r.db!.papers.find((p) => p.id === 'b')!;
    expect(b.cites).toEqual(['a']);
    expect(a.cited_by).toEqual(['b']);
    expect(r.db!.edges).toHaveLength(1);
    expect(r.db!.edges[0].relations.map((x) => x.type)).toEqual(['builds', 'benchmarks', 'cites']);
    expect(r.db!.edges[0].relations[0]).toEqual({ type: 'builds', from: 'a', to: 'b' });
    expect(r.db!.citations.resolved).toBe(2);
  });
});

describe('datasets, setups, and realism', () => {
  const setup = { id: 'setup', name: 'Setup', kind: 'evaluation_setup', links: { home: null }, sim_or_real: 'sim', provenance: 'test' };
  it('rejects bad based_on, setup-only fields on datasets, and non-simulator environments', () => {
    expectError(run([], { datasets: [sim, { ...ds, based_on: [{ id: 'ghost', relation: 'extends' }] }] }), /based_on "ghost" does not exist/);
    expectError(run([], { datasets: [sim, { ...ds, based_on: [{ id: 'sim', relation: 'copies' }] }] }), /relation/);
    expectError(run([], { datasets: [sim, { ...ds, loops: ['offline_replay'] }] }), /evaluation setups only/);
    expectError(run([], { datasets: [sim, ds, { ...setup, loops: ['vibes'] }] }), /unknown loop type "vibes"/);
    expectError(run([], { datasets: [sim, ds, { ...setup, environment: 'ds' }] }), /is not a simulator/);
  });
  it('rejects unknown realism levels', () => {
    expectError(run([base('a', { evaluations: [{ id: 'e', loop: 'offline_replay', realism: { robot: 'telepathy' } }] })]), /realism.robot level "telepathy"/);
  });
  it('derives basis_of', () => {
    const r = run([], { datasets: [sim, ds, { ...setup, environment: 'sim', based_on: [{ id: 'ds', relation: 'uses' }], human_models: ['Scripted'], loops: ['closed_scripted'] }] });
    expect(r.errors).toEqual([]);
    expect(r.db!.datasets.find((d) => d.id === 'ds')!.basis_of).toEqual([{ id: 'setup', relation: 'uses' }]);
  });
});
