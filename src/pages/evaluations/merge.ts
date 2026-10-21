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
  baselines: string[];
  otherBaselines: string[];
  drift: Cap | null;
  adapt: Cap | null;
  /** Closest level per realism axis across the entries, by taxonomy order. */
  realism: { robot: string | null; human: string | null; environment: string | null };
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

export function mergePaper(
  paper: DbPaper,
  loopOrder: string[],
  realismOrder: { robot: string[]; human: string[]; environment: string[] },
): PaperEvalRow {
  const es = paper.evaluations ?? [];
  return {
    paper,
    entries: es,
    environments: uniq(es.map((e) => e.environment).filter((x): x is string => !!x)),
    datasets: uniq(es.flatMap((e) => e.datasets ?? [])),
    loops: loopOrder.filter((l) => es.some((e) => e.loop === l)),
    humans: uniq(es.map((e) => e.human_model).filter((x): x is string => !!x)),
    metrics: uniq(es.flatMap((e) => e.metrics ?? [])),
    baselines: uniq(es.flatMap((e) => e.baselines ?? [])),
    otherBaselines: uniq(es.flatMap((e) => e.other_baselines ?? [])),
    drift: strongest(es.map((e) => e.captures?.state_drift)),
    adapt: strongest(es.map((e) => e.captures?.goal_adaptation)),
    realism: {
      robot: closest(es.map((e) => e.realism?.robot), realismOrder.robot),
      human: closest(es.map((e) => e.realism?.human), realismOrder.human),
      environment: closest(es.map((e) => e.realism?.environment), realismOrder.environment),
    },
  };
}

/** Furthest loop type on the scale, for sorting. -1 if the paper has none. */
export function furthestLoop(r: PaperEvalRow, loopOrder: string[]) {
  return Math.max(-1, ...r.loops.map((l) => loopOrder.indexOf(l)));
}

export interface RowFilters {
  loop: string | null;
  term: string | null;
  metric: string | null;
  dataset: string | null;
  metricTerms: (m: string) => string[];
}

/** A paper matches when any of its entries does. */
export function rowMatches(r: PaperEvalRow, f: RowFilters): boolean {
  return r.entries.some(
    (e) =>
      (!f.loop || e.loop === f.loop) &&
      (!f.term || (e.metrics ?? []).some((m) => f.metricTerms(m).includes(f.term!))) &&
      (!f.metric || (e.metrics ?? []).includes(f.metric)) &&
      (!f.dataset || e.environment === f.dataset || (e.datasets ?? []).includes(f.dataset)),
  );
}

/** Datasets table groups (SPEC §8.5): tangential datasets form their own group at the bottom. Order is kept. */
export function datasetGroups<T extends { tangent?: boolean }>(rows: readonly T[]): { core: T[]; tangent: T[] } {
  return { core: rows.filter((d) => !d.tangent), tangent: rows.filter((d) => !!d.tangent) };
}
