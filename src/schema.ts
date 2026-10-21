// Zod schemas for the data files, shared by scripts/build-data.ts and the app.
// Ids that point into the taxonomy or at other files are checked in src/validate.ts,
// since they depend on the loaded taxonomy.
import { z } from 'zod';

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

export const TaxonomySchema = z.object({
  levels: z.record(
    z.enum(LEVEL_IDS),
    z.object({
      name: z.string(),
      knowns: z.object({ goal: known, human_policy: known }),
      definition: z.string(),
      note: z.string().optional(),
    }),
  ),
  families: z.record(
    z.object({
      name: z.string(),
      definition: z.string(),
      scope_line: z.string().optional(),
      strength: z.string().optional(),
      limitations: z.array(z.string()).optional(),
      note: z.string().optional(),
    }),
  ),
  action_types: z.record(defn),
  observation_modalities: z.record(defn),
  stages: z.record(z.object({ name: z.string(), definition: z.string() })),
  subproblems: z.record(
    z.enum(SUBPROBLEM_IDS),
    z.object({
      name: z.string(),
      stage: z.string(),
      input: z.string(),
      output: z.string(),
      challenge: z.string(),
      depends_on: z.array(z.enum(SUBPROBLEM_IDS)),
      approaches: z.record(z.string()),
    }),
  ),
  themes: z.record(defn),
  statuses: z.record(z.object({ glyph: z.string(), label: z.string() })),
  relations: z.record(defn),
  net_value: z.object({
    headline: z.string(),
    counterfactual: z.string(),
    terms: z.record(z.object({ label: z.string(), tex: z.string(), definition: z.string() })),
  }),
  metric_kinds: z.record(z.string()),
  metrics: z.record(
    z.object({
      label: z.string(),
      definition: z.string(),
      terms: z.array(z.string()),
      kind: z.string(),
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
    loop: z.string(),
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
    results: z.array(ResultSchema).optional(),
  })
  .strict();
export type Evaluation = z.infer<typeof EvaluationSchema>;

export const MethodSchema = z
  .object({
    knowns: z.object({ goal: known, human_policy: known }).strict().nullable().optional(),
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
    links: z
      .object({
        paper: url.nullable(),
        code: url.nullable().optional(),
        project: url.nullable().optional(),
      })
      .strict(),
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
    kind: z.enum(['dataset', 'simulator', 'benchmark']),
    introduced_in: z.string().nullable().optional(),
    links: z.object({ home: url.nullable() }).strict(),
    sim_or_real: z.enum(['sim', 'real', 'both']),
    span: capped('span').nullable().optional(),
    households_or_users: z.union([z.number().int(), z.string()]).nullable().optional(),
    observations: z.array(z.string()).optional(),
    goal_annotations: ynp.nullable().optional(),
    executable: yn.nullable().optional(),
    environment: z.string().nullable().optional(),
    notes: capped('notes').nullable().optional(),
    provenance: capped('provenance'),
  })
  .strict();
export type Dataset = z.infer<typeof DatasetSchema>;

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
  compared_in: string[];
  search: string;
}

export interface DbDataset extends Dataset {
  used_by: EvalRef[];
}

export interface Db {
  taxonomy: Taxonomy;
  papers: DbPaper[];
  datasets: DbDataset[];
  metric_used_by: Record<string, EvalRef[]>;
  subproblem_counts: Record<SubproblemId, Record<'addresses' | 'assumes' | 'skips', number>>;
}
