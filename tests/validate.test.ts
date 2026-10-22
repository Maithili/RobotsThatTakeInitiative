import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { citationSourceText } from '../src/lib/citations.ts';
import { metricTooltip } from '../src/lib/metrics.ts';
import { datasetGroups } from '../src/pages/evaluations/merge.ts';
import { deriveLevel } from '../src/schema.ts';
import { buildDb, findCycle, isPdfUrl, type SourceFile } from '../src/validate.ts';

const realTaxonomy = yaml.load(readFileSync(join(__dirname, '../data/taxonomy.yaml'), 'utf8')) as Record<string, any>;

/** Taxonomy without cross-references to papers, so an empty papers/ folder is valid. */
function bareTaxonomy() {
  const t = structuredClone(realTaxonomy);
  delete t.loop_types.closed_adaptive.refs;
  delete t.realism.interaction.levels.adaptive_humans.refs;
  t.featured_comparison.methods = [];
  t.featured_comparison.columns = [];
  t.evaluations_exclude = [];
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
  it('rejects a taxonomy definition cut short by an unquoted comma in a flow mapping', () => {
    const t = bareTaxonomy() as Record<string, Record<string, unknown>>;
    t.stages = { ...t.stages, anticipation: yaml.load('{name: Anticipation, definition: Reasons over need, goal, or action.}') };
    expectError(run([], { taxonomy: t }), /stages\.anticipation: "or action\." looks like text cut off by an unquoted comma/);
  });
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
    // Retired ids (Oct 22 2026): object relocations and scene graphs became object movements, and language left.
    for (const old of ['object_relocations', 'scene_graph', 'language']) {
      expectError(run([base('a', { method: { ...L2K, inputs: [old] } })]), new RegExp(`unknown input modality "${old}"`));
      expectError(run([], { datasets: [sim, { ...ds, observations: [old] }] }), new RegExp(`unknown observation modality "${old}"`));
    }
    expectError(run([base('a', { evaluations: [{ id: 'e', loop: 'vibes' }] })]), /unknown loop type/);
    expectError(run([base('a', { evaluations: [{ id: 'e', loop: 'offline_replay', metrics: ['bleu'] }] })]), /unknown metric/);
    expectError(
      run([base('a', { subproblems: { A2: { status: 'addresses', relation: 'direct', approach: 'hierarchical', note: 'x' } } })]),
      /not an approach of A2/,
    );
  });

  it('rejects an input or observation modality listed twice', () => {
    expectError(run([base('a', { method: { ...L2K, inputs: ['object_movements', 'video', 'object_movements'] } })]), /input modality "object_movements" is listed twice/);
    expectError(run([], { datasets: [sim, { ...ds, observations: ['activity_labels', 'activity_labels'] }] }), /observation modality "activity_labels" is listed twice/);
    expect(run([base('a', { method: { ...L2K, inputs: ['object_movements', 'activity_labels', 'video'] } })]).errors).toEqual([]);
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

  it('gives each tangential category its own tangential hue slot', () => {
    const withTangents = (types: Record<string, Record<string, unknown>>) => {
      const t = bareTaxonomy();
      t.tangent_types = types;
      return run([], { datasets: [], taxonomy: t });
    };
    const cat = (color?: unknown) => ({ label: 'L', definition: 'D', ...(color === undefined ? {} : { color }) });
    // The real taxonomy gives every category a hue slot, each a different one: all five slots are taken.
    expect(Object.values(realTaxonomy.tangent_types).map((x: any) => x.color).sort()).toEqual(['amber', 'brown', 'fern', 'magenta', 'sky']);
    expect(withTangents({ a: cat('amber'), b: cat('magenta'), c: cat('sky'), d: cat('brown'), e: cat('fern') }).errors).toEqual([]);
    // Missing, unknown, or a family's hue (or the gray for uncategorized papers) is rejected, naming the slots.
    expectError(withTangents({ a: cat() }), /tangent_types\.a\.color: needs a color, one of amber, magenta, sky, brown, fern/);
    expectError(withTangents({ a: cat('green') }), /tangent_types\.a\.color: "green" is reserved for families/);
    expectError(withTangents({ a: cat('chartreuse') }), /tangent_types\.a\.color: unknown hue "chartreuse"/);
    expectError(withTangents({ a: cat('teal') }), /tangent_types\.a\.color: "teal" is reserved for families/);
    expectError(withTangents({ a: cat('gray') }), /"gray" is reserved/);
    expectError(withTangents({ a: cat(2) }), /tangent_types\.a\.color: needs a color/);
    // Two categories never share a color.
    expectError(withTangents({ a: cat('amber'), b: cat('amber') }), /tangent_types\.b\.color "amber" is already the color of a/);
    // An unquoted comma in a flow-style definition becomes a stray key, which fails instead of cutting the definition.
    const cut = yaml.load('{label: L, color: fern, definition: Reacts to cues, without a goal.}') as Record<string, unknown>;
    expectError(withTangents({ a: cut }), /tangent_types\.a: "without a goal\." looks like text cut off by an unquoted comma/);
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

describe('hand-curated citations (data/citations-manual.yaml)', () => {
  const cit = (papers: Record<string, { s2_id: string | null; cites: string[] }>) => ({ generated_at: 'T', source: 'OpenAlex', papers, unresolved: [] });
  const runM = (ps: Record<string, unknown>[], manualCitations: unknown, citations: unknown = cit({})) =>
    buildDb({ taxonomy: bareTaxonomy(), papers: ps.map((p) => ({ name: p.id as string, data: p })), datasets: [], citations, manualCitations });
  const two = [base('a', { method: { ...L2K } }), base('b', { year: 2022, method: { ...L2K } })];
  const LIB = 'Librarian, Oct 21 2026';

  it('accepts an empty list, a missing file, and an empty file', () => {
    for (const m of [[], undefined, null]) {
      const r = runM(two, m);
      expect(r.errors).toEqual([]);
      expect(r.db!.citations.manual).toBe(0);
    }
  });

  it('rejects entries that do not match the schema', () => {
    expectError(runM(two, { from: 'b', to: 'a', source: LIB }) as ReturnType<typeof run>, /citations-manual.yaml/);
    expectError(runM(two, [{ from: 'b', to: 'a' }]) as ReturnType<typeof run>, /citations-manual.yaml: 0.source/);
    expectError(runM(two, [{ from: 'b', to: 'a', source: '' }]) as ReturnType<typeof run>, /citations-manual.yaml: 0.source/);
    expectError(runM(two, [{ from: 'b', to: 'a', source: LIB, page: 3 }]) as ReturnType<typeof run>, /Unrecognized key/);
  });

  it('rejects unknown ids', () => {
    expectError(runM(two, [{ from: 'ghost', to: 'a', source: LIB }]) as ReturnType<typeof run>, /entry 1 \(ghost cites a\): from "ghost" does not exist/);
    expectError(runM(two, [{ from: 'b', to: 'ghost', source: LIB }]) as ReturnType<typeof run>, /entry 1 \(b cites ghost\): to "ghost" does not exist/);
  });

  it('rejects a self-citation', () => {
    expectError(runM(two, [{ from: 'a', to: 'a', source: LIB }]) as ReturnType<typeof run>, /a paper cannot cite itself/);
  });

  it('rejects duplicates within the file', () => {
    expectError(
      runM(two, [
        { from: 'b', to: 'a', source: LIB },
        { from: 'b', to: 'a', source: 'Someone else', where: '§2' },
      ]) as ReturnType<typeof run>,
      /entry 2 \(b cites a\): duplicates entry 1/,
    );
    // The reverse pair is a different citation.
    expect(runM(two, [{ from: 'b', to: 'a', source: LIB }, { from: 'a', to: 'b', source: LIB }]).errors).toEqual([]);
  });

  it('merges with citations.json into cites, cited_by, and edges, keeping every source for each pair', () => {
    const three = [...two, base('c', { year: 2024, method: { ...L2K } })];
    const r = runM(
      three,
      [
        { from: 'b', to: 'a', source: LIB, where: '§2, ref. [14]' },
        { from: 'c', to: 'a', source: LIB },
      ],
      cit({ a: { s2_id: null, cites: [] }, b: { s2_id: 'x', cites: ['a'] }, c: { s2_id: 'y', cites: ['b'] } }),
    );
    expect(r.errors).toEqual([]);
    const get = (id: string) => r.db!.papers.find((p) => p.id === id)!;
    expect(get('b').cites).toEqual(['a']);
    expect(get('c').cites).toEqual(['a', 'b']);
    expect(get('a').cited_by).toEqual(['b', 'c']);
    expect(get('b').cited_by).toEqual(['c']);
    // b cites a in both files: one pair, both sources.
    expect(get('b').cite_sources).toEqual({
      a: [
        { kind: 'fetched', source: 'OpenAlex' },
        { kind: 'manual', source: LIB, where: '§2, ref. [14]' },
      ],
    });
    expect(get('c').cite_sources).toEqual({ a: [{ kind: 'manual', source: LIB }], b: [{ kind: 'fetched', source: 'OpenAlex' }] });
    expect(get('a').cite_sources).toEqual({});
    // One cites relation per pair, pointing from the cited (earlier) paper to the citing one.
    const cites = r.db!.edges.flatMap((e) => e.relations).filter((x) => x.type === 'cites');
    expect(cites).toEqual(
      expect.arrayContaining([
        { type: 'cites', from: 'a', to: 'b' },
        { type: 'cites', from: 'a', to: 'c' },
        { type: 'cites', from: 'b', to: 'c' },
      ]),
    );
    expect(cites).toHaveLength(3);
    expect(r.db!.citations.manual).toBe(2);
  });

  it('works without citations.json', () => {
    const r = runM(two, [{ from: 'b', to: 'a', source: LIB }], undefined);
    expect(r.errors).toEqual([]);
    expect(r.db!.papers.find((p) => p.id === 'b')!.cites).toEqual(['a']);
  });

  it('describes the sources on hover', () => {
    expect(citationSourceText(undefined)).toBeUndefined();
    expect(citationSourceText([])).toBeUndefined();
    expect(citationSourceText([{ source: 'OpenAlex' }])).toBe('Source: OpenAlex');
    expect(citationSourceText([{ source: 'OpenAlex' }, { source: LIB, where: '§2' }])).toBe(`Sources: OpenAlex; ${LIB} (§2)`);
  });
});

describe('taxonomy additions: tangent types, semi-tangential families, metric direction and unit', () => {
  it('ships two families and no semi-tangential one, the five tangent types, and direction and unit on every metric', () => {
    const r = run([], { datasets: [] });
    expect(r.errors).toEqual([]);
    const t = r.db!.taxonomy;
    // Per Maithili, Oct 22 2026: the core is Goal Inference, Temporal Imitation, and GAP. Implicit Cues became a tangent type.
    expect(Object.keys(t.families)).toEqual(['goal_inference', 'temporal_imitation']);
    expect(Object.values(t.families).filter((f) => f.semi_tangential)).toEqual([]);
    expect(Object.keys(t.tangent_types)).toEqual(['hri', 'conversational', 'search', 'planning', 'implicit_cues']);
    expect(t.tangent_types.search).toMatchObject({ label: 'Dynamic mapping and object search', color: 'amber' });
    expect(t.tangent_types.hri).toMatchObject({ label: 'User perceptions of proactivity', color: 'magenta' });
    expect(t.tangent_types.conversational).toMatchObject({ label: 'Conversational proactivity', color: 'sky' });
    expect(t.tangent_types.planning).toEqual({
      label: 'Anticipatory task planning',
      color: 'brown',
      definition: "Plans the robot's current task while preparing for likely future tasks.",
    });
    expect(t.tangent_types.implicit_cues).toEqual({
      label: 'Implicit cues',
      color: 'fern',
      definition: 'Reacts to implicit cues in the scene or from people, without a stated goal.',
    });
    expect(t.metrics.net_actions_saved).toMatchObject({ direction: 'higher', unit: '%' });
    expect(t.metrics.perturbed_actions).toMatchObject({ direction: 'lower', unit: '%' });
    expect(t.metrics.f1).toMatchObject({ direction: 'higher', unit: 'fraction' });
  });

  it('rejects the retired implicit_cues family, and accepts the implicit_cues and planning tangents', () => {
    expectError(run([base('a', { method: { ...L2K, family: 'implicit_cues' } })]), /unknown family "implicit_cues"/);
    const r = run([base('a', { method: L2K, tangent: 'implicit_cues' }), base('b', { method: L2K, tangent: 'planning' }), base('c', { tangent: 'search' })]);
    expect(r.errors).toEqual([]);
    // A tangential work keeps the level its knowns give.
    expect(r.db!.papers.find((p) => p.id === 'b')!.level).toBe('L2');
  });

  // No real family is semi-tangential any more; the schema keeps the flag for the synthetic fixture's family D.
  const withSemi = (semi: unknown) => {
    const t = bareTaxonomy();
    t.families.semi = { name: 'Semi', definition: 'A semi-tangential test family.', semi_tangential: semi };
    return t;
  };

  it('accepts papers in a semi-tangential family', () => {
    const r = run([base('a', { method: { ...L2K, family: 'semi' } })], { taxonomy: withSemi(true) });
    expect(r.errors).toEqual([]);
    expect(r.db!.taxonomy.families.semi.semi_tangential).toBe(true);
  });

  it('rejects a non-boolean semi_tangential', () => {
    expectError(run([], { taxonomy: withSemi('yes'), datasets: [] }), /taxonomy.yaml: families.semi.semi_tangential/);
  });

  it('rejects a metric without direction or unit, with a bad direction, or with a long mapping_note', () => {
    const variant = (edit: (m: Record<string, unknown>) => void) => {
      const t = bareTaxonomy();
      edit(t.metrics.f1);
      return run([], { taxonomy: t, datasets: [] });
    };
    expectError(variant((m) => delete m.direction), /metrics.f1.direction/);
    expectError(variant((m) => (m.direction = 'up')), /metrics.f1.direction/);
    expectError(variant((m) => delete m.unit), /metrics.f1.unit/);
    expectError(variant((m) => (m.unit = '')), /metrics.f1.unit/);
    expectError(variant((m) => (m.mapping_note = 'x'.repeat(161))), /mapping_note exceeds 160/);
    expect(variant((m) => (m.mapping_note = 'x'.repeat(160))).errors).toEqual([]);
  });

  it('shows direction and unit in metric chip tooltips', () => {
    expect(metricTooltip({ definition: 'D.', kind: 'direct', direction: 'lower', unit: '%' })).toBe('D. (direct) · ↓ lower is better · unit: %');
    expect(metricTooltip({ definition: 'D.', kind: 'proxy', direction: 'higher', unit: 'fraction' })).toContain('↑ higher is better');
  });
});

describe('metric categories, metric groups, and evaluations_exclude', () => {
  const taxonomyWith = (edit: (t: Record<string, any>) => void) => {
    const t = bareTaxonomy();
    edit(t);
    return t;
  };

  it('ships the categories in order, the groups, and no computational or saved-steps metrics', () => {
    const r = run([], { datasets: [] });
    expect(r.errors).toEqual([]);
    const t = r.db!.taxonomy;
    expect(Object.keys(t.metric_categories)).toEqual([
      'change_in_user_actions',
      'object_movement_prediction',
      'activity_label_prediction',
      'task_performance',
      'end_user_perceptions',
      'implicit_need_detection',
      'coordination_fluency',
    ]);
    expect(t.metric_groups.goal_prf.label).toBe('Goal precision, recall, and F1');
    expect(Object.keys(t.metrics).filter((m) => t.metrics[m].group === 'goal_prf')).toEqual(['goal_predicate_precision', 'goal_predicate_recall', 'goal_predicate_f1']);
    expect(t.metrics.goal_predicate_f1.category).toBe('task_performance');
    // Groups added for the metric boxes (Oct 22 2026). F1 and object F1 stay apart: their definitions differ.
    expect(Object.keys(t.metrics).filter((m) => t.metrics[m].group === 'task_cost')).toEqual(['avg_task_cost', 'cost_reduction']);
    expect(Object.keys(t.metrics).filter((m) => t.metrics[m].group === 'user_ratings')).toEqual(['rated_goal_knowledge', 'rated_helpfulness', 'rated_trust']);
    expect(t.metrics.f1.group).toBeUndefined();
    expect(t.metrics.object_f1.group).toBeUndefined();
    expect(t.metrics.relation_accuracy.category).toBeUndefined();
    expect(t.metrics.search_success_rate.category).toBeUndefined();
    for (const m of ['training_time', 'training_samples', 'inference_time', 'planning_time', 'saved_steps_rate', 'saved_steps']) expect(t.metrics[m]).toBeUndefined();
    expect(realTaxonomy.evaluations_exclude).toEqual(['saavedra-2026-scene-graphs', 'din-2025-proactivity']);
  });

  it('rejects a metric with an unknown category or group', () => {
    expectError(run([], { taxonomy: taxonomyWith((t) => (t.metrics.f1.category = 'vibes')), datasets: [] }), /metrics.f1 has unknown category "vibes"/);
    expectError(run([], { taxonomy: taxonomyWith((t) => (t.metrics.f1.group = 'vibes')), datasets: [] }), /metrics.f1 has unknown group "vibes"/);
  });

  it('rejects a group whose members span categories, including a member with no category', () => {
    expectError(
      run([], { taxonomy: taxonomyWith((t) => (t.metrics.goal_predicate_f1.category = 'end_user_perceptions')), datasets: [] }),
      /metric group "goal_prf" spans categories \(goal_predicate_precision, goal_predicate_recall in "task_performance"; goal_predicate_f1 in "end_user_perceptions"\)/,
    );
    expectError(run([], { taxonomy: taxonomyWith((t) => delete t.metrics.goal_predicate_f1.category), datasets: [] }), /metric group "goal_prf" spans categories .*in no category/);
  });

  it('rejects an evaluations_exclude id that is not a paper, and accepts one that is', () => {
    expectError(run([], { taxonomy: taxonomyWith((t) => (t.evaluations_exclude = ['ghost'])), datasets: [] }), /evaluations_exclude "ghost" does not exist/);
    const ok = run([base('a')], { taxonomy: taxonomyWith((t) => (t.evaluations_exclude = ['a'])) });
    expect(ok.errors).toEqual([]);
    // Excluding a paper references it, so it is not reported as lonely.
    expect(ok.warnings.join('\n')).not.toMatch(/a.yaml: no method/);
  });

  it('rejects a group definition over 140 characters and unknown keys', () => {
    expectError(run([], { taxonomy: taxonomyWith((t) => (t.metric_groups.goal_prf.definition = 'x'.repeat(141))), datasets: [] }), /group_definition exceeds 140/);
    expectError(run([], { taxonomy: taxonomyWith((t) => (t.metric_categories.task_performance.color = 'red')), datasets: [] }), /metric_categories.task_performance: Unrecognized key/);
  });

  it('treats empty categories, groups, and exclusions as none', () => {
    const t = taxonomyWith((t) => {
      t.metric_categories = null;
      t.metric_groups = null;
      t.evaluations_exclude = null;
      for (const m of Object.values<Record<string, unknown>>(t.metrics)) {
        delete m.category;
        delete m.group;
      }
    });
    const r = run([], { taxonomy: t, datasets: [] });
    expect(r.errors).toEqual([]);
    expect(r.db!.taxonomy.metric_categories).toEqual({});
    expect(r.db!.taxonomy.metric_groups).toEqual({});
    expect(r.db!.taxonomy.evaluations_exclude).toEqual([]);
  });
});

describe('tangential datasets', () => {
  it('accepts tangent: true and keeps it in the database', () => {
    const r = run([], { datasets: [sim, { ...ds, tangent: true }] });
    expect(r.errors).toEqual([]);
    expect(r.db!.datasets.find((d) => d.id === 'ds')!.tangent).toBe(true);
  });

  it('rejects a non-boolean tangent', () => {
    expectError(run([], { datasets: [sim, { ...ds, tangent: 'yes' }] }), /datasets\/ds.yaml: tangent/);
    expectError(run([], { datasets: [sim, { ...ds, tangent: 'search' }] }), /datasets\/ds.yaml: tangent/);
  });

  it('groups activity datasets, then tangential datasets, after the others, keeping order', () => {
    const rows = [{ id: 'x', tangent: true }, { id: 'a1', activity: true }, { id: 'y' }, { id: 'z', tangent: false, activity: false }, { id: 'w', tangent: true }, { id: 'a2', activity: true }];
    const g = datasetGroups(rows);
    expect(g.core.map((d) => d.id)).toEqual(['y', 'z']);
    expect(g.activity.map((d) => d.id)).toEqual(['a1', 'a2']);
    expect(g.tangent.map((d) => d.id)).toEqual(['x', 'w']);
  });

  it('rejects a dataset in two groups or a non-boolean activity flag', () => {
    expectError(run([], { datasets: [sim, { ...ds, activity: true, tangent: true }] }), /activity and tangent are both set/);
    expectError(run([], { datasets: [sim, { ...ds, activity: 'yes' }] }), /datasets\/ds.yaml: activity/);
    expect(run([], { datasets: [sim, { ...ds, activity: true }] }).errors).toEqual([]);
  });

  it('takes a reference for an introducing paper outside the database, with a landing-page link, only when introduced_in is null', () => {
    const reference = { title: 'A Dataset Paper', authors: 'A. Author, B. Author', venue: 'CVPR', year: 2020, url: 'https://example.org/paper.html' };
    const r = run([], { datasets: [sim, { ...ds, introduced_in: null, reference }] });
    expect(r.errors).toEqual([]);
    expect(r.db!.datasets.find((d) => d.id === 'ds')!.reference).toEqual(reference);
    expectError(run([], { datasets: [sim, { ...ds, reference: { ...reference, url: 'https://example.org/paper.pdf' } }] }), /reference.url points to a PDF/);
    expectError(run([], { datasets: [sim, { ...ds, reference: { ...reference, year: 'old' } }] }), /reference/);
    expectError(run([], { datasets: [sim, { ...ds, reference: { title: 'T' } }] }), /reference/);
    expectError(run([base('p')], { datasets: [sim, { ...ds, introduced_in: 'p', reference }] }), /drop it when introduced_in is set/);
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
  it('rejects unknown realism levels, including the old human levels', () => {
    expectError(run([base('a', { evaluations: [{ id: 'e', loop: 'offline_replay', realism: { robot: 'telepathy' } }] })]), /realism.robot level "telepathy"/);
    for (const old of ['recorded', 'adaptive_sim', 'non_target', 'target_users']) {
      expectError(run([base('a', { evaluations: [{ id: 'e', loop: 'offline_replay', realism: { human: old } }] })]), new RegExp(`realism.human level "${old}"`));
    }
    expect(Object.keys(bareTaxonomy().realism.human.levels)).toEqual(['scripted', 'crowdsourced', 'real_humans']);
    expect(Object.keys(bareTaxonomy().realism.interaction.levels)).toEqual(['open_loop', 'closed_loop', 'adaptive_humans']);
  });
  it('maps every loop type to an interaction level; user studies count as adaptive humans', () => {
    const t = bareTaxonomy();
    const map = Object.fromEntries(Object.entries(t.loop_types).map(([id, lt]) => [id, (lt as { interaction: string }).interaction]));
    expect(map).toEqual({
      offline_replay: 'open_loop',
      closed_scripted: 'closed_loop',
      closed_adaptive: 'adaptive_humans',
      user_study_short: 'adaptive_humans',
      user_study_longitudinal: 'adaptive_humans',
    });
    expect(run([], { taxonomy: t }).errors).toEqual([]);
  });
  it('rejects a loop type with no interaction level or an unknown one', () => {
    const missing = bareTaxonomy();
    delete missing.loop_types.closed_scripted.interaction;
    expectError(run([], { taxonomy: missing }), /loop_types\.closed_scripted\.interaction: needs an interaction level/);
    const unknown = bareTaxonomy();
    unknown.loop_types.closed_scripted.interaction = 'telepathy';
    expectError(run([], { taxonomy: unknown }), /loop_types\.closed_scripted\.interaction "telepathy" is not a realism\.interaction level/);
  });
  it('never takes interaction from an evaluation, only from its loop type', () => {
    expectError(run([base('a', { evaluations: [{ id: 'e', loop: 'offline_replay', realism: { interaction: 'open_loop' } }] })]), /Unrecognized key.*interaction/);
  });
  it('accepts a boolean secondary flag and rejects anything else', () => {
    expect(run([base('a', { evaluations: [{ id: 'e', loop: 'user_study_short', secondary: true }] })]).errors).toEqual([]);
    expectError(run([base('a', { evaluations: [{ id: 'e', loop: 'user_study_short', secondary: 'yes' }] })]), /secondary/);
  });
  it('rejects an opacity on a realism level; environment no longer drives opacity', () => {
    const t = bareTaxonomy();
    t.realism.environment.levels.simulator.opacity = 0.25;
    expectError(run([], { taxonomy: t }), /realism\.environment\.levels\.simulator: Unrecognized key.*opacity/);
  });
  it('accepts each of the four action space levels and null, and rejects unknown ones', () => {
    expect(Object.keys(bareTaxonomy().action_space_complexity.levels)).toEqual(['low', 'medium', 'high', 'very_high']);
    const ok = run([
      base('a', {
        evaluations: [
          { id: 'e1', loop: 'offline_replay', action_space_complexity: 'low' },
          { id: 'e2', loop: 'offline_replay', action_space_complexity: 'medium' },
          { id: 'e3', loop: 'offline_replay', action_space_complexity: 'high' },
          { id: 'e4', loop: 'offline_replay', action_space_complexity: 'very_high' },
          { id: 'e5', loop: 'offline_replay', action_space_complexity: null },
          { id: 'e6', loop: 'offline_replay' },
        ],
      }),
    ]);
    expect(ok.errors).toEqual([]);
    expectError(
      run([base('a', { evaluations: [{ id: 'e', loop: 'offline_replay', action_space_complexity: 'galactic' }] })]),
      /evaluation e: unknown action_space_complexity level "galactic"/,
    );
    // The old key is gone.
    expectError(run([base('a', { evaluations: [{ id: 'e', loop: 'offline_replay', task_complexity: 'high' }] })]), /Unrecognized key.*task_complexity/);
  });
  it('allows 1 to 4 action space levels, one per step of the color ramp', () => {
    const five = bareTaxonomy();
    five.action_space_complexity.levels.extreme = { label: 'Extreme', definition: 'More than the ramp can show.' };
    expectError(run([], { taxonomy: five }), /action_space_complexity\.levels: needs 1 to 4 levels/);
    const none = bareTaxonomy();
    none.action_space_complexity.levels = {};
    expectError(run([], { taxonomy: none }), /action_space_complexity\.levels: needs 1 to 4 levels/);
    const one = bareTaxonomy();
    one.action_space_complexity.levels = { low: { label: 'Low', definition: 'Few.' } };
    expect(run([], { taxonomy: one }).errors).toEqual([]);
  });
  it('derives basis_of', () => {
    const r = run([], { datasets: [sim, ds, { ...setup, environment: 'sim', based_on: [{ id: 'ds', relation: 'uses' }], human_models: ['Scripted'], loops: ['closed_scripted'] }] });
    expect(r.errors).toEqual([]);
    expect(r.db!.datasets.find((d) => d.id === 'ds')!.basis_of).toEqual([{ id: 'setup', relation: 'uses' }]);
  });
});
