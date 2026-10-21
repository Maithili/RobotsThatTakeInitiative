// The generated database, plus lookup maps the UI uses everywhere.
import raw from './generated/db.json';
import { inEvaluations, inMethodsGraph, inMethodsTopBand, inSubproblems } from './lib/scope.ts';
import type { Db, DbDataset, DbPaper, LevelId, SubproblemId } from './schema.ts';
import { SUBPROBLEM_IDS } from './schema.ts';

export const db = raw as unknown as Db;

// Plain-text fields write the human policy as "π^h"; show it as πʰ. TeX fields stay as they are.
const TEX_KEYS = new Set(['input', 'output', 'tex', 'headline']);
function prettify<T>(v: T, key = ''): T {
  if (typeof v === 'string') return (TEX_KEYS.has(key) ? v : v.replace(/π\^h/g, 'πʰ')) as T;
  if (Array.isArray(v)) return v.map((x) => prettify(x)) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, prettify(x, k)])) as T;
  return v;
}
export const tx = prettify(db.taxonomy);
export const papers: DbPaper[] = db.papers;
export const paperById = new Map(papers.map((p) => [p.id, p]));
export const datasetById = new Map<string, DbDataset>(db.datasets.map((d) => [d.id, d]));

export const LEVELS_TOP_DOWN: LevelId[] = ['L2', 'L1', 'L0'];
export const SUBS: readonly SubproblemId[] = SUBPROBLEM_IDS;

export const REPO = 'https://github.com/Maithili/RobotsThatTakeInitiative';
export const RTI_URL = 'https://arxiv.org/abs/2609.28910';

/** The paper the site is built on (SPEC §8.3, §8.4). Defined with the level scope so the build can use it too. */
export { FRAMEWORK_PAPER } from './lib/scope.ts';

export interface EvalRow {
  paper: DbPaper;
  evaluation: NonNullable<DbPaper['evaluations']>[number];
}
export const evalRows: EvalRow[] = papers.flatMap((p) => (p.evaluations ?? []).map((evaluation) => ({ paper: p, evaluation })));
export const evalById = new Map(evalRows.map((r) => [r.evaluation.id, r]));

export function paperLabel(id: string) {
  return paperById.get(id)?.short_name ?? id;
}

/** The Subproblems page lists only works that address a subproblem (SPEC §9). */
export function addressesAny(p: DbPaper) {
  return Object.values(p.subproblems ?? {}).some((t) => t?.status === 'addresses');
}

/** Pages that show a paper (SPEC §6.4 item 8), following the level scope (§6.2). */
export function pagesFor(p: DbPaper): ('methods' | 'evaluations' | 'subproblems')[] {
  const out: ('methods' | 'evaluations' | 'subproblems')[] = [];
  if (inMethodsTopBand(p) || inMethodsGraph(p)) out.push('methods');
  if (p.evaluations?.length && inEvaluations(p)) out.push('evaluations');
  if (addressesAny(p) && inSubproblems(p)) out.push('subproblems');
  return out;
}

export function issueUrl(template: 'add-paper.yml' | 'fix-paper.yml', fields: Record<string, string> = {}) {
  const q = new URLSearchParams({ template, ...fields });
  return `${REPO}/issues/new?${q.toString()}`;
}

export function fixUrl(p: { id: string; title: string }, field?: string) {
  return issueUrl('fix-paper.yml', {
    title: `[fix] ${p.id}${field ? `: ${field}` : ''}`,
    paper_id: p.id,
    ...(field ? { field } : {}),
  });
}
