// Zod schemas for the data files, shared by scripts/build-data.ts and the app.
// Ids that point into the taxonomy or at other files are checked in src/validate.ts,
// since they depend on the loaded taxonomy.
import { z } from 'zod';
import type { Routes } from './lib/edgeRouting.ts';
import type { PairEdge } from './lib/edges.ts';

export const SUBPROBLEM_IDS = ['G1', 'G2', 'A1', 'A2', 'A3', 'P1', 'P2'] as const;
export type SubproblemId = (typeof SUBPROBLEM_IDS)[number];

export const LEVEL_IDS = ['L0', 'L1', 'L2'] as const;
export type LevelId = (typeof LEVEL_IDS)[number];

export const CAPS = {
  short_name: 24,
  provenance: 140,
  core_strength: 120,
  note: 140,
  human_model: 60,
  span: 40,
  notes: 140,
  mapping_note: 160,
  group_definition: 140,
} as const;

const capped = (field: keyof typeof CAPS) =>
  z.string().max(CAPS[field], { message: `${field} exceeds ${CAPS[field]} characters` });

const kebab = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be kebab-case');
const url = z.string().url();
const ynp = z.enum(['yes', 'partial', 'no']);
const yn = z.enum(['yes', 'no']);
const known = z.enum(['known', 'unknown']);

// ---------- taxonomy ----------

const defn = z.object({ label: z.string(), definition: z.string() });
const levelDef = z.object({
  name: z.string(),
  knowns: z.object({ goal: known, human_policy: known }),
  definition: z.string(),
  note: z.string().optional(),
});
const subproblemDef = z.object({
  name: z.string(),
  short: z.string(),
  stage: z.string(),
  input: z.string(),
  output: z.string(),
  challenge: z.string(),
  depends_on: z.array(z.enum(SUBPROBLEM_IDS)),
  approaches: z.record(z.string()),
});

const realismAxis = z.object({
  label: z.string(),
  levels: z.record(
    z.object({ label: z.string(), definition: z.string().optional(), opacity: z.number().min(0).max(1).optional(), refs: z.array(z.string()).optional() }).strict(),
  ),
});

export const TaxonomySchema = z.object({
  levels: z.object({ L0: levelDef, L1: levelDef, L2: levelDef }),
  families: z.record(
    z.object({
      name: z.string(),
      definition: z.string(),
      scope_line: z.string().optional(),
      strength: z.string().optional(),
      limitations: z.array(z.string()).optional(),
      note: z.string().optional(),
      /** Drawn part-way transparent in the literature graph (SPEC §7.2). Its papers count as L2 everywhere else. */
      semi_tangential: z.boolean().optional(),
    }),
  ),
  action_types: z.record(defn),
  observation_modalities: z.record(defn),
  stages: z.record(z.object({ name: z.string(), definition: z.string() })),
  subproblems: z.object(Object.fromEntries(SUBPROBLEM_IDS.map((s) => [s, subproblemDef])) as Record<SubproblemId, typeof subproblemDef>),
  themes: z.record(defn),
  tangent_types: z.record(defn),
  statuses: z.record(z.object({ glyph: z.string(), label: z.string() })),
  relations: z.record(defn),
  net_value: z.object({
    headline: z.string(),
    counterfactual: z.string(),
    terms: z.record(z.object({ label: z.string(), tex: z.string(), definition: z.string() })),
  }),
  /** Ordered. The Evaluations page shows one tab per category and hides metrics with none (SPEC §8.6). */
  metric_categories: z
    .record(z.object({ label: z.string() }).strict())
    .nullish()
    .transform((v) => v ?? {}),
  /** Metrics listed as one item in the metrics section. Members share a category. */
  metric_groups: z
    .record(z.object({ label: z.string(), definition: capped('group_definition') }).strict())
    .nullish()
    .transform((v) => v ?? {}),
  /** Paper ids kept off the Evaluations page, such as object search papers (SPEC §8.4). */
  evaluations_exclude: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  metric_kinds: z.record(z.string()),
  metrics: z.record(
    z.object({
      label: z.string(),
      /** A `metric_categories` id. Metrics with none never show on the Evaluations page. */
      category: z.string().optional(),
      /** A `metric_groups` id. */
      group: z.string().optional(),
      definition: z.string(),
      terms: z.array(z.string()),
      kind: z.string(),
      /** Whether a higher or a lower value is better. */
      direction: z.enum(['higher', 'lower']),
      unit: z.string().min(1),
      /** One line on why the metric serves its terms. */
      mapping_note: capped('mapping_note').optional(),
    }),
  ),
  loop_types: z.record(
    z.object({ label: z.string(), definition: z.string(), refs: z.array(z.string()).optional() }),
  ),
  captures: z.object({
    state_drift: defn,
    goal_adaptation: defn,
    values: z.array(z.string()),
  }),
  realism: z.object({
    robot: realismAxis,
    human: realismAxis,
    environment: realismAxis,
    source_url: url.nullable(),
  }),
  featured_comparison: z.object({
    title: z.string(),
    metric: z.string(),
    methods: z.array(z.string()),
    columns: z.array(z.object({ evaluation: z.string(), label: z.string() })),
    source: z.string(),
  }),
});
export type Taxonomy = z.infer<typeof TaxonomySchema>;

// ---------- papers ----------

export const SubproblemTagSchema = z
  .object({
    status: z.enum(['addresses', 'assumes', 'skips']),
    relation: z.enum(['direct', 'adjacent']),
    approach: z.string().optional(),
    note: capped('note'),
  })
  .strict();
export type SubproblemTag = z.infer<typeof SubproblemTagSchema>;

export const ResultSchema = z
  .object({
    method: kebab.optional(),
    method_label: z.string().optional(),
    metric: z.string(),
    value: z.number(),
    sd: z.number().optional(),
  })
  .strict()
  .refine((r) => r.method || r.method_label, 'result needs method or method_label');

export const EvaluationSchema = z
  .object({
    id: kebab,
    environment: z.string().nullable().optional(),
    datasets: z.array(z.string()).optional(),
    /** Null until someone reads the paper's evaluation. */
    loop: z.string().nullable(),
    human_model: capped('human_model').nullable().optional(),
    metrics: z.array(z.string()).optional(),
    baselines: z.array(z.string()).optional(),
    other_baselines: z.array(z.string()).optional(),
    captures: z
      .object({ state_drift: ynp.nullable(), goal_adaptation: ynp.nullable() })
      .strict()
      .nullable()
      .optional(),
    provenance: capped('provenance').optional(),
    realism: z
      .object({ robot: z.string().nullable().optional(), human: z.string().nullable().optional(), environment: z.string().nullable().optional() })
      .strict()
      .optional(),
    results: z.array(ResultSchema).optional(),
  })
  .strict();
export type Evaluation = z.infer<typeof EvaluationSchema>;

export const MethodSchema = z
  .object({
    knowns: z.object({ goal: known, human_policy: known }).strict(),
    family: z.string().nullable().optional(),
    action_types: z.array(z.string()).optional(),
    inputs: z.array(z.string()).optional(),
    core_strength: capped('core_strength').nullable().optional(),
    builds_on: z.array(z.string()).optional(),
  })
  .strict();
export type Method = z.infer<typeof MethodSchema>;

export const PaperSchema = z
  .object({
    id: kebab,
    short_name: capped('short_name'),
    title: z.string().min(1),
    authors: z.array(z.string()).min(1),
    venue: z.string().nullable().optional(),
    year: z.number().int(),
    type: z.enum(['research', 'survey']).optional(),
    tangent: z.string().optional(),
    links: z
      .object({
        paper: url.nullable(),
        code: url.nullable().optional(),
        project: url.nullable().optional(),
      })
      .strict(),
    ids: z
      .object({
        doi: z.string().regex(/^10\.\S+$/, 'must be a bare DOI such as 10.1145/1234').optional(),
        arxiv: z.string().regex(/^\d{4}\.\d{4,5}$/, 'must be a bare arXiv id such as 2401.01234').optional(),
      })
      .strict()
      .optional(),
    bibtex: z.string().optional(),
    provenance: capped('provenance'),
    method: MethodSchema.optional(),
    themes: z.array(z.string()).optional(),
    subproblems: z.record(z.enum(SUBPROBLEM_IDS), SubproblemTagSchema).optional(),
    evaluations: z.array(EvaluationSchema).optional(),
  })
  .strict();
export type Paper = z.infer<typeof PaperSchema>;

// ---------- datasets ----------

export const DatasetSchema = z
  .object({
    id: kebab,
    name: z.string(),
    kind: z.enum(['dataset', 'evaluation_setup', 'simulator']),
    introduced_in: z.string().nullable().optional(),
    links: z.object({ home: url.nullable() }).strict(),
    sim_or_real: z.enum(['sim', 'real', 'both']),
    span: capped('span').nullable().optional(),
    households_or_users: z.union([z.number().int(), z.string()]).nullable().optional(),
    observations: z.array(z.string()).optional(),
    goal_annotations: ynp.nullable().optional(),
    executable: yn.nullable().optional(),
    environment: z.string().nullable().optional(),
    based_on: z.array(z.object({ id: z.string(), relation: z.enum(['extends', 'uses', 'validates_against']) }).strict()).optional(),
    human_models: z.array(capped('human_model')).optional(),
    loops: z.array(z.string()).optional(),
    notes: capped('notes').nullable().optional(),
    /** Default false. Tangential datasets form their own group at the bottom of the datasets table (SPEC §8.5). */
    tangent: z.boolean().optional(),
    provenance: capped('provenance'),
  })
  .strict();
export type Dataset = z.infer<typeof DatasetSchema>;

// ---------- citations (generated by scripts/fetch-citations.ts) ----------

export const CitationsSchema = z
  .object({
    generated_at: z.string().nullable(),
    source: z.string(),
    papers: z.record(z.object({ s2_id: z.string().nullable(), cites: z.array(z.string()) }).strict()),
    unresolved: z.array(z.string()),
    note: z.string().optional(),
  })
  .strict();
export type Citations = z.infer<typeof CitationsSchema>;

// ---------- hand-curated citations (data/citations-manual.yaml) ----------

/** One hand-curated citation: `from` cites `to`, both paper ids (SPEC §5.5). */
export const ManualCitationSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    /** Who checked it, such as "Librarian, Oct 21 2026". */
    source: z.string().min(1),
    /** The location in `from`'s text. */
    where: z.string().min(1).nullable().optional(),
  })
  .strict();
export const ManualCitationsSchema = z.array(ManualCitationSchema);
export type ManualCitation = z.infer<typeof ManualCitationSchema>;

/** Where one citation pair comes from: data/citations.json (fetched) or data/citations-manual.yaml (manual). */
export interface CitationSource {
  kind: 'fetched' | 'manual';
  source: string;
  where?: string;
}

// ---------- derived database ----------

export type Knowns = NonNullable<Method['knowns']>;

export function deriveLevel(knowns: Knowns | null | undefined): LevelId | null {
  if (!knowns) return null;
  if (knowns.goal === 'known' && knowns.human_policy === 'known') return 'L0';
  if (knowns.goal === 'known' && knowns.human_policy === 'unknown') return 'L1';
  if (knowns.goal === 'unknown' && knowns.human_policy === 'unknown') return 'L2';
  return null; // goal unknown + policy known is not a level
}

export interface EvalRef {
  paper: string;
  evaluation: string;
}

export interface DbPaper extends Paper {
  level: LevelId | null;
  built_upon_by: string[];
  /** Papers in the database this paper compares against (from its evaluations' baselines). */
  benchmarks_against: string[];
  benchmarked_in: string[];
  /** Papers in the database this paper cites, from data/citations.json and data/citations-manual.yaml. */
  cites: string[];
  cited_by: string[];
  /** Sources of each pair in `cites`, keyed by the cited paper's id. The build always fills it. */
  cite_sources?: Record<string, CitationSource[]>;
  search: string;
  /** Literature graph position at zoom 1, from the build-time layout (SPEC §7.2). Only papers in the graph have one. */
  x?: number;
  y?: number;
}

export interface DbDataset extends Dataset {
  used_by: EvalRef[];
  /** Datasets and setups that name this one in their based_on. */
  basis_of: { id: string; relation: 'extends' | 'uses' | 'validates_against' }[];
}

export interface Db {
  taxonomy: Taxonomy;
  papers: DbPaper[];
  datasets: DbDataset[];
  metric_used_by: Record<string, EvalRef[]>;
  subproblem_counts: Record<SubproblemId, Record<'addresses' | 'assumes' | 'skips', number>>;
  /** One entry per pair of papers with every relation between them (SPEC §5.5). */
  edges: PairEdge[];
  /** Literature graph edge routes that differ from the default curve, per zoom step (SPEC §7.2 Edge routing). */
  routes?: Routes;
  citations: { generated_at: string | null; source: string; unresolved: string[]; resolved: number; manual: number };
}
