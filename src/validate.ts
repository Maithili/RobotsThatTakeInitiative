// Validation and derivation for the data files (SPEC §5.4).
// Pure: takes parsed YAML, returns errors, warnings and the db. scripts/build-data.ts does the I/O.
import { mergeEdges, type Relation } from './lib/edges.ts';
import {
  CitationsSchema,
  DatasetSchema,
  ManualCitationsSchema,
  PaperSchema,
  SUBPROBLEM_IDS,
  TaxonomySchema,
  deriveLevel,
  type Db,
  type DbDataset,
  type DbPaper,
  type Dataset,
  type EvalRef,
  type Paper,
  type SubproblemId,
  type Taxonomy,
  type Citations,
  type CitationSource,
  type ManualCitation,
} from './schema.ts';

export interface SourceFile {
  /** File name without extension, e.g. "slate-pro". */
  name: string;
  data: unknown;
}

export interface BuildInput {
  taxonomy: unknown;
  papers: SourceFile[];
  datasets: SourceFile[];
  /** Parsed data/citations.json, or undefined if the file does not exist yet. */
  citations?: unknown;
  /** Parsed data/citations-manual.yaml: a list of {from, to, source, where?}. Undefined or null counts as empty. */
  manualCitations?: unknown;
  /** Repo-relative paths of every file in the repo, to reject PDFs. */
  repoFiles?: string[];
}

export interface BuildResult {
  errors: string[];
  warnings: string[];
  db: Db | null;
}

export function isPdfUrl(u: string): boolean {
  try {
    return new URL(u).pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return u.split(/[?#]/)[0].toLowerCase().endsWith('.pdf');
  }
}

function zodMessages(prefix: string, err: { issues: { path: (string | number)[]; message: string }[] }) {
  return err.issues.map((i) => `${prefix}: ${i.path.join('.') || '(root)'}: ${i.message}`);
}

export function searchString(p: Pick<Paper, 'short_name' | 'title' | 'authors' | 'venue' | 'year'>) {
  return [p.short_name, p.title, p.authors.join(' '), p.venue ?? '', String(p.year)].join(' ').toLowerCase();
}

/** Ids that appear more than once in a list, each named once. */
function repeated(xs: readonly string[] | null | undefined): string[] {
  return [...new Set((xs ?? []).filter((x, i, all) => all.indexOf(x) !== i))];
}

/** Returns one cycle (as a list of ids) if the graph has any, else null. */
export function findCycle(edges: Map<string, string[]>): string[] | null {
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (n: string): string[] | null => {
    state.set(n, 1);
    stack.push(n);
    for (const m of edges.get(n) ?? []) {
      if (state.get(m) === 1) return [...stack.slice(stack.indexOf(m)), m];
      if (!state.has(m)) {
        const c = visit(m);
        if (c) return c;
      }
    }
    stack.pop();
    state.set(n, 2);
    return null;
  };
  for (const n of edges.keys()) {
    if (!state.has(n)) {
      const c = visit(n);
      if (c) return c;
    }
  }
  return null;
}

export function buildDb(input: BuildInput): BuildResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const tx = TaxonomySchema.safeParse(input.taxonomy);
  if (!tx.success) return { errors: zodMessages('taxonomy.yaml', tx.error), warnings, db: null };
  const t: Taxonomy = tx.data;

  for (const f of input.repoFiles ?? []) {
    if (f.toLowerCase().endsWith('.pdf')) errors.push(`${f}: PDF files are not allowed in the repo`);
  }

  // ---- parse files ----
  const papers: Paper[] = [];
  for (const f of input.papers) {
    const r = PaperSchema.safeParse(f.data);
    if (!r.success) {
      errors.push(...zodMessages(`papers/${f.name}.yaml`, r.error));
      continue;
    }
    if (r.data.id !== f.name) errors.push(`papers/${f.name}.yaml: id "${r.data.id}" differs from file name`);
    papers.push(r.data);
  }
  const datasets: Dataset[] = [];
  for (const f of input.datasets) {
    const r = DatasetSchema.safeParse(f.data);
    if (!r.success) {
      errors.push(...zodMessages(`datasets/${f.name}.yaml`, r.error));
      continue;
    }
    if (r.data.id !== f.name) errors.push(`datasets/${f.name}.yaml: id "${r.data.id}" differs from file name`);
    datasets.push(r.data);
  }

  const paperById = new Map<string, Paper>();
  for (const p of papers) {
    if (paperById.has(p.id)) errors.push(`papers: duplicate id "${p.id}"`);
    paperById.set(p.id, p);
  }
  const datasetById = new Map<string, Dataset>();
  for (const d of datasets) {
    if (datasetById.has(d.id)) errors.push(`datasets: duplicate id "${d.id}"`);
    datasetById.set(d.id, d);
  }

  const inSet = (set: Record<string, unknown>, id: string) => Object.prototype.hasOwnProperty.call(set, id);
  const referenced = new Set<string>();
  const evalIds = new Map<string, string>();
  const evalById = new Map<string, { paper: Paper; metrics: string[] }>();

  // ---- papers ----
  for (const p of papers) {
    const at = `papers/${p.id}.yaml`;
    const checkLink = (field: string, u: string | null | undefined) => {
      if (u && isPdfUrl(u)) errors.push(`${at}: ${field} points to a PDF (${u}); use a landing page`);
    };
    checkLink('links.paper', p.links.paper);
    checkLink('links.code', p.links.code);
    checkLink('links.project', p.links.project);
    if (p.links.paper === null) warnings.push(`${at}: links.paper is null`);

    for (const th of p.themes ?? []) if (!inSet(t.themes, th)) errors.push(`${at}: unknown theme "${th}"`);
    if (p.tangent !== undefined && !inSet(t.tangent_types, p.tangent)) errors.push(`${at}: unknown tangent type "${p.tangent}"`);

    const m = p.method;
    if (m) {
      const level = deriveLevel(m.knowns);
      if (m.knowns && m.knowns.goal === 'unknown' && m.knowns.human_policy === 'known') {
        errors.push(`${at}: knowns {goal: unknown, human_policy: known} is not a level in the formalism`);
      }
      if (m.family != null) {
        if (!inSet(t.families, m.family)) errors.push(`${at}: unknown family "${m.family}"`);
        if (level !== 'L2') errors.push(`${at}: family is set but the level is ${level ?? 'not set'}, not L2`);
      }
      for (const a of m.action_types ?? []) if (!inSet(t.action_types, a)) errors.push(`${at}: unknown action type "${a}"`);
      for (const i of m.inputs ?? []) if (!inSet(t.observation_modalities, i)) errors.push(`${at}: unknown input modality "${i}"`);
      for (const i of repeated(m.inputs)) errors.push(`${at}: input modality "${i}" is listed twice`);
      for (const b of m.builds_on ?? []) {
        referenced.add(b);
        const target = paperById.get(b);
        if (!target) errors.push(`${at}: builds_on "${b}" does not exist`);
        else if (target.year > p.year) warnings.push(`${at}: builds_on "${b}" (${target.year}) is newer than this paper (${p.year})`);
      }
    }

    for (const [sid, tag] of Object.entries(p.subproblems ?? {})) {
      const sp = t.subproblems[sid as SubproblemId];
      if (sp && tag.approach && !inSet(sp.approaches, tag.approach)) {
        errors.push(`${at}: approach "${tag.approach}" is not an approach of ${sid}`);
      }
    }

    for (const e of p.evaluations ?? []) {
      const eat = `${at}: evaluation ${e.id}`;
      if (evalIds.has(e.id)) errors.push(`${eat}: id also used in papers/${evalIds.get(e.id)}.yaml`);
      evalIds.set(e.id, p.id);
      evalById.set(e.id, { paper: p, metrics: e.metrics ?? [] });
      if (e.loop !== null && !inSet(t.loop_types, e.loop)) errors.push(`${eat}: unknown loop type "${e.loop}"`);
      if (e.environment != null) {
        const env = datasetById.get(e.environment);
        if (!env) errors.push(`${eat}: environment "${e.environment}" does not exist`);
        else if (env.kind !== 'simulator') errors.push(`${eat}: environment "${e.environment}" is not a simulator`);
      }
      for (const d of e.datasets ?? []) if (!datasetById.has(d)) errors.push(`${eat}: dataset "${d}" does not exist`);
      for (const ob of e.other_baselines ?? []) {
        if (/\bablations?\b/i.test(ob)) errors.push(`${eat}: other_baselines lists an ablation ("${ob}"); leave ablations of the paper's own method out`);
      }
      for (const axis of ['robot', 'human', 'environment'] as const) {
        const lv = e.realism?.[axis];
        if (lv != null && !inSet(t.realism[axis].levels, lv)) errors.push(`${eat}: unknown realism.${axis} level "${lv}"`);
      }
      if (e.action_space_complexity != null && !inSet(t.action_space_complexity.levels, e.action_space_complexity)) {
        errors.push(`${eat}: unknown action_space_complexity level "${e.action_space_complexity}"`);
      }
      for (const mt of e.metrics ?? []) if (!inSet(t.metrics, mt)) errors.push(`${eat}: unknown metric "${mt}"`);
      for (const b of e.baselines ?? []) {
        referenced.add(b);
        if (!paperById.has(b)) errors.push(`${eat}: baseline "${b}" does not exist`);
      }
      for (const r of e.results ?? []) {
        if (r.method) {
          referenced.add(r.method);
          if (!paperById.has(r.method)) errors.push(`${eat}: result method "${r.method}" does not exist`);
        }
        if (!inSet(t.metrics, r.metric)) errors.push(`${eat}: unknown result metric "${r.metric}"`);
        else if (!(e.metrics ?? []).includes(r.metric)) {
          warnings.push(`${eat}: result metric "${r.metric}" is not in the evaluation's metrics`);
        }
      }
    }
  }

  // ---- citations ----
  let citations: Citations | null = null;
  if (input.citations === undefined) {
    warnings.push('data/citations.json is missing. Run `npm run fetch-citations`.');
  } else {
    const c = CitationsSchema.safeParse(input.citations);
    if (!c.success) errors.push(...zodMessages('citations.json', c.error));
    else {
      citations = c.data;
      const listed = new Set([...Object.keys(citations.papers), ...citations.unresolved]);
      const stale = [...listed].filter((id) => !paperById.has(id));
      const staleCites = Object.values(citations.papers).flatMap((e) => e.cites).filter((id) => !paperById.has(id));
      const missing = papers.map((p) => p.id).filter((id) => !listed.has(id));
      if (stale.length || staleCites.length) {
        warnings.push(`data/citations.json lists paper ids that no longer exist (${[...new Set([...stale, ...staleCites])].join(', ')}). Rerun \`fetch-citations\`.`);
      }
      if (missing.length) warnings.push(`data/citations.json is missing ${missing.join(', ')}. Rerun \`fetch-citations\`.`);
    }
  }

  // ---- hand-curated citations (SPEC §5.5) ----
  let manual: ManualCitation[] = [];
  if (input.manualCitations != null) {
    const mc = ManualCitationsSchema.safeParse(input.manualCitations);
    if (!mc.success) errors.push(...zodMessages('citations-manual.yaml', mc.error));
    else {
      manual = mc.data;
      const seen = new Map<string, number>();
      manual.forEach((c, i) => {
        const at = `citations-manual.yaml: entry ${i + 1} (${c.from} cites ${c.to})`;
        if (!paperById.has(c.from)) errors.push(`${at}: from "${c.from}" does not exist`);
        if (!paperById.has(c.to)) errors.push(`${at}: to "${c.to}" does not exist`);
        if (c.from === c.to) errors.push(`${at}: a paper cannot cite itself`);
        const key = `${c.from}>${c.to}`;
        if (seen.has(key)) errors.push(`${at}: duplicates entry ${seen.get(key)}`);
        else seen.set(key, i + 1);
      });
    }
  }

  const cycle = findCycle(new Map(papers.map((p) => [p.id, p.method?.builds_on ?? []])));
  if (cycle) errors.push(`builds_on contains a cycle: ${cycle.join(' → ')}`);

  // ---- datasets ----
  for (const d of datasets) {
    const at = `datasets/${d.id}.yaml`;
    if (d.links.home && isPdfUrl(d.links.home)) errors.push(`${at}: links.home points to a PDF`);
    if (d.introduced_in != null) {
      referenced.add(d.introduced_in);
      if (!paperById.has(d.introduced_in)) errors.push(`${at}: introduced_in "${d.introduced_in}" does not exist`);
    }
    if (d.environment != null) {
      const env = datasetById.get(d.environment);
      if (!env) errors.push(`${at}: environment "${d.environment}" does not exist`);
      else if (env.kind !== 'simulator') errors.push(`${at}: environment "${d.environment}" is not a simulator`);
    }
    for (const b of d.based_on ?? []) {
      if (!datasetById.has(b.id)) errors.push(`${at}: based_on "${b.id}" does not exist`);
      else if (b.id === d.id) errors.push(`${at}: based_on names itself`);
    }
    if (d.kind !== 'evaluation_setup' && (d.human_models?.length || d.loops?.length)) {
      errors.push(`${at}: human_models and loops are for evaluation setups only`);
    }
    for (const l of d.loops ?? []) if (!inSet(t.loop_types, l)) errors.push(`${at}: unknown loop type "${l}"`);
    for (const o of d.observations ?? []) {
      if (!inSet(t.observation_modalities, o)) errors.push(`${at}: unknown observation modality "${o}"`);
    }
    for (const o of repeated(d.observations)) errors.push(`${at}: observation modality "${o}" is listed twice`);
  }

  // ---- taxonomy cross-references ----
  const hueOwner = new Map<string, string>();
  for (const [tid, tt] of Object.entries(t.tangent_types)) {
    const other = hueOwner.get(tt.color);
    if (other) errors.push(`taxonomy.yaml: tangent_types.${tid}.color "${tt.color}" is already the color of ${other}; each category needs its own`);
    else hueOwner.set(tt.color, tid);
  }
  for (const [lid, lt] of Object.entries(t.loop_types)) {
    if (!inSet(t.realism.interaction.levels, lt.interaction)) {
      errors.push(`taxonomy.yaml: loop_types.${lid}.interaction "${lt.interaction}" is not a realism.interaction level`);
    }
    for (const r of lt.refs ?? []) {
      referenced.add(r);
      if (!paperById.has(r)) errors.push(`taxonomy.yaml: loop_types.${lid}.refs "${r}" does not exist`);
    }
  }
  for (const axis of ['robot', 'human', 'environment', 'interaction'] as const) {
    for (const [lid, lv] of Object.entries(t.realism[axis].levels)) {
      for (const r of lv.refs ?? []) {
        referenced.add(r);
        if (!paperById.has(r)) errors.push(`taxonomy.yaml: realism.${axis}.levels.${lid}.refs "${r}" does not exist`);
      }
    }
  }
  const groupCategories = new Map<string, Map<string, string[]>>(); // group -> category ("none" if unset) -> member ids
  for (const [mid, mt] of Object.entries(t.metrics)) {
    for (const term of mt.terms) if (!inSet(t.net_value.terms, term)) errors.push(`taxonomy.yaml: metrics.${mid} has unknown term "${term}"`);
    if (!inSet(t.metric_kinds, mt.kind)) errors.push(`taxonomy.yaml: metrics.${mid} has unknown kind "${mt.kind}"`);
    if (mt.category !== undefined && !inSet(t.metric_categories, mt.category)) {
      errors.push(`taxonomy.yaml: metrics.${mid} has unknown category "${mt.category}"`);
    }
    if (mt.group !== undefined) {
      if (!inSet(t.metric_groups, mt.group)) errors.push(`taxonomy.yaml: metrics.${mid} has unknown group "${mt.group}"`);
      else {
        const byCat = groupCategories.get(mt.group) ?? new Map<string, string[]>();
        const c = mt.category ?? 'none';
        byCat.set(c, [...(byCat.get(c) ?? []), mid]);
        groupCategories.set(mt.group, byCat);
      }
    }
  }
  for (const [gid, byCat] of groupCategories) {
    if (byCat.size > 1) {
      const parts = [...byCat].map(([c, ms]) => `${ms.join(', ')} in ${c === 'none' ? 'no category' : `"${c}"`}`);
      errors.push(`taxonomy.yaml: metric group "${gid}" spans categories (${parts.join('; ')})`);
    }
  }
  for (const pid of t.evaluations_exclude) {
    referenced.add(pid);
    if (!paperById.has(pid)) errors.push(`taxonomy.yaml: evaluations_exclude "${pid}" does not exist`);
  }
  const fc = t.featured_comparison;
  if (!inSet(t.metrics, fc.metric)) errors.push(`taxonomy.yaml: featured_comparison.metric "${fc.metric}" does not exist`);
  for (const m of fc.methods) if (!paperById.has(m)) errors.push(`taxonomy.yaml: featured_comparison method "${m}" does not exist`);
  for (const c of fc.columns) if (!evalById.has(c.evaluation)) errors.push(`taxonomy.yaml: featured_comparison evaluation "${c.evaluation}" does not exist`);

  for (const p of papers) {
    if (!p.method && !p.subproblems && !p.evaluations && !p.tangent && !referenced.has(p.id)) {
      warnings.push(`papers/${p.id}.yaml: no method, subproblem, or evaluation block and nothing references it`);
    }
  }

  if (errors.length) return { errors, warnings, db: null };

  // ---- derive ----
  const relations: Relation[] = [];
  const builtUponBy = new Map<string, string[]>();
  const benchmarkedIn = new Map<string, Set<string>>();
  const citedBy = new Map<string, Set<string>>();
  // Citations from data/citations.json and data/citations-manual.yaml, one entry per pair with every source.
  const citeSources = new Map<string, Map<string, CitationSource[]>>(); // citing id -> cited id -> sources
  const addCite = (citing: string, cited: string, src: CitationSource) => {
    if (!paperById.has(citing) || !paperById.has(cited) || citing === cited) return;
    if (!citeSources.has(citing)) citeSources.set(citing, new Map());
    const byCited = citeSources.get(citing)!;
    const list = byCited.get(cited) ?? [];
    if (!list.some((s) => s.kind === src.kind && s.source === src.source && s.where === src.where)) list.push(src);
    byCited.set(cited, list);
  };
  for (const [id, entry] of Object.entries(citations?.papers ?? {})) {
    for (const c of entry.cites) addCite(id, c, { kind: 'fetched', source: citations!.source });
  }
  for (const c of manual) addCite(c.from, c.to, { kind: 'manual', source: c.source, ...(c.where ? { where: c.where } : {}) });
  const citesOf = new Map<string, string[]>();
  for (const [id, byCited] of citeSources) {
    const cs = [...byCited.keys()].sort();
    citesOf.set(id, cs);
    for (const c of cs) {
      if (!citedBy.has(c)) citedBy.set(c, new Set());
      citedBy.get(c)!.add(id);
      relations.push({ type: 'cites', from: c, to: id });
    }
  }
  const metricUsedBy: Record<string, EvalRef[]> = Object.fromEntries(Object.keys(t.metrics).map((k) => [k, []]));
  const datasetUsedBy = new Map<string, EvalRef[]>(datasets.map((d) => [d.id, []]));
  for (const p of papers) {
    for (const b of p.method?.builds_on ?? []) {
      builtUponBy.set(b, [...(builtUponBy.get(b) ?? []), p.id]);
      relations.push({ type: 'builds', from: b, to: p.id });
    }
    for (const e of p.evaluations ?? []) {
      const ref = { paper: p.id, evaluation: e.id };
      for (const b of e.baselines ?? []) {
        if (b === p.id) continue;
        if (!benchmarkedIn.has(b)) benchmarkedIn.set(b, new Set());
        benchmarkedIn.get(b)!.add(p.id);
        relations.push({ type: 'benchmarks', from: b, to: p.id });
      }
      for (const m of e.metrics ?? []) metricUsedBy[m].push(ref);
      const ds = new Set([...(e.datasets ?? []), ...(e.environment ? [e.environment] : [])]);
      for (const d of ds) datasetUsedBy.get(d)!.push(ref);
    }
  }

  const counts = Object.fromEntries(
    SUBPROBLEM_IDS.map((s) => [s, { addresses: 0, assumes: 0, skips: 0 }]),
  ) as Db['subproblem_counts'];
  for (const p of papers) for (const [s, tag] of Object.entries(p.subproblems ?? {})) counts[s as SubproblemId][tag.status]++;

  const dbPapers: DbPaper[] = papers
    .map((p) => ({
      ...p,
      level: deriveLevel(p.method?.knowns),
      built_upon_by: builtUponBy.get(p.id) ?? [],
      benchmarks_against: [...new Set((p.evaluations ?? []).flatMap((e) => e.baselines ?? []))].filter((b) => b !== p.id),
      benchmarked_in: [...(benchmarkedIn.get(p.id) ?? [])],
      cites: citesOf.get(p.id) ?? [],
      cited_by: [...(citedBy.get(p.id) ?? [])].sort(),
      cite_sources: Object.fromEntries(citeSources.get(p.id) ?? []),
      search: searchString(p),
    }))
    .sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
  const dbDatasets: DbDataset[] = datasets
    .map((d) => ({
      ...d,
      used_by: datasetUsedBy.get(d.id) ?? [],
      basis_of: datasets.flatMap((o) => (o.based_on ?? []).filter((b) => b.id === d.id).map((b) => ({ id: o.id, relation: b.relation }))),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    errors,
    warnings,
    db: {
      taxonomy: t,
      papers: dbPapers,
      datasets: dbDatasets,
      metric_used_by: metricUsedBy,
      subproblem_counts: counts,
      edges: mergeEdges(relations),
      citations: {
        generated_at: citations?.generated_at ?? null,
        source: citations?.source ?? 'none',
        unresolved: citations?.unresolved ?? [],
        resolved: Object.values(citations?.papers ?? {}).filter((e) => e.s2_id).length,
        manual: manual.length,
      },
    },
  };
}
