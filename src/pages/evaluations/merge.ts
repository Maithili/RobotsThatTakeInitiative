// One protocols-table row per paper (SPEC §8.4): a paper's evaluation entries merged. Pure, for tests.
import type { DbPaper, Evaluation } from '../../schema.ts';

export type Cap = 'yes' | 'partial' | 'no';
const CAP_RANK: Record<Cap, number> = { no: 0, partial: 1, yes: 2 };

export interface PaperEvalRow {
  paper: DbPaper;
  entries: Evaluation[];
  environments: string[];
  datasets: string[];
  /** Distinct loop types, in scale order. */
  loops: string[];
  humans: string[];
  metrics: string[];
  /** Distinct categories among the paper's metrics, in category order (SPEC §8.4). */
  categories: string[];
  baselines: string[];
  otherBaselines: string[];
  drift: Cap | null;
  adapt: Cap | null;
  /** Closest level per realism axis across the paper's main (non-secondary) entries, by taxonomy order (SPEC §8.3).
   *  `interaction` comes from each entry's loop type. */
  realism: { robot: string | null; human: string | null; environment: string | null; interaction: string | null };
  /** Most complex `action_space_complexity` level across the main entries, by taxonomy order (SPEC §8.3). Null when
   *  no main entry has one. */
  actionSpaceComplexity: string | null;
}

/** Orders for the realism axes, plus the loop-type → interaction mapping from the taxonomy (`loop_types.*.interaction`). */
export interface RealismOrder {
  robot: string[];
  human: string[];
  environment: string[];
  interaction?: string[];
  interactionOf?: (loop: string) => string | null | undefined;
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

export function strongest(values: (Cap | null | undefined)[]): Cap | null {
  let best: Cap | null = null;
  for (const v of values) if (v && (best === null || CAP_RANK[v] > CAP_RANK[best])) best = v;
  return best;
}

/** The level furthest along `order` among the values, or null. */
export function closest(values: (string | null | undefined)[], order: string[]): string | null {
  let best = -1;
  for (const v of values) if (v) best = Math.max(best, order.indexOf(v));
  return best >= 0 ? order[best] : null;
}

/** The most complex level among the values, by `order` from low to high, or null. */
export function mostComplex(values: (string | null | undefined)[], order: string[]): string | null {
  return closest(values, order);
}

/** A paper's main evaluations: every entry not marked `secondary`. Only these place its realism dot (SPEC §8.3). */
export function mainEntries(es: readonly Evaluation[]): Evaluation[] {
  return es.filter((e) => !e.secondary);
}

/** An evaluation's interaction level, from its loop type. Null when it has no loop type or the type has no mapping. */
export function interactionOf(e: Pick<Evaluation, 'loop'>, loopTypes: Record<string, { interaction?: string }>): string | null {
  return (e.loop && loopTypes[e.loop]?.interaction) || null;
}

/** Distinct categories of `metrics`, in `order`. Metrics with no category add none. */
export function categoriesOf(metrics: string[], order: string[], categoryOf: (m: string) => string | null | undefined): string[] {
  const used = new Set(metrics.map(categoryOf));
  return order.filter((c) => used.has(c));
}

export function mergePaper(
  paper: DbPaper,
  loopOrder: string[],
  realismOrder: RealismOrder,
  categories: { order: string[]; of: (m: string) => string | null | undefined } = { order: [], of: () => null },
  /** `action_space_complexity` level ids, from low to high. */
  actionSpaceOrder: string[] = [],
): PaperEvalRow {
  const es = paper.evaluations ?? [];
  const main = mainEntries(es);
  const metrics = uniq(es.flatMap((e) => e.metrics ?? []));
  return {
    paper,
    entries: es,
    environments: uniq(es.map((e) => e.environment).filter((x): x is string => !!x)),
    datasets: uniq(es.flatMap((e) => e.datasets ?? [])),
    loops: loopOrder.filter((l) => es.some((e) => e.loop === l)),
    humans: uniq(es.map((e) => e.human_model).filter((x): x is string => !!x)),
    metrics,
    categories: categoriesOf(metrics, categories.order, categories.of),
    baselines: uniq(es.flatMap((e) => e.baselines ?? [])),
    otherBaselines: uniq(es.flatMap((e) => e.other_baselines ?? [])),
    drift: strongest(es.map((e) => e.captures?.state_drift)),
    adapt: strongest(es.map((e) => e.captures?.goal_adaptation)),
    realism: {
      robot: closest(main.map((e) => e.realism?.robot), realismOrder.robot),
      human: closest(main.map((e) => e.realism?.human), realismOrder.human),
      environment: closest(main.map((e) => e.realism?.environment), realismOrder.environment),
      interaction: closest(
        main.map((e) => (e.loop ? realismOrder.interactionOf?.(e.loop) : null)),
        realismOrder.interaction ?? [],
      ),
    },
    actionSpaceComplexity: mostComplex(main.map((e) => e.action_space_complexity), actionSpaceOrder),
  };
}

/** Furthest loop type on the scale, for sorting. -1 if the paper has none. */
export function furthestLoop(r: PaperEvalRow, loopOrder: string[]) {
  return Math.max(-1, ...r.loops.map((l) => loopOrder.indexOf(l)));
}

/** Datasets table groups (SPEC §8.5): the main group, then activity datasets, then tangential ones. Order is kept. */
export function datasetGroups<T extends { activity?: boolean; tangent?: boolean }>(rows: readonly T[]): { core: T[]; activity: T[]; tangent: T[] } {
  return {
    core: rows.filter((d) => !d.activity && !d.tangent),
    activity: rows.filter((d) => !!d.activity && !d.tangent),
    tangent: rows.filter((d) => !!d.tangent),
  };
}
