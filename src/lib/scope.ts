// Level scope (SPEC §6.2): which papers each part of the site shows. Pure, so tests can use it without the db.
import type { DbPaper, LevelId } from '../schema.ts';

/** The paper the site is built on. Its protocol row is pinned and shaded (SPEC §8.4); its realism dot (§8.3) and
 *  graph dot have a ring. */
export const FRAMEWORK_PAPER = 'gap';

/** Levels shown outside the Methods top band: the graph, the list, Evaluations, and Subproblems. */
export const FOCUS_LEVELS: readonly LevelId[] = ['L2'];

/** Levels with a card, a paper count, and a timeline row in the Methods top band (SPEC §7.1). L0 has a card only. */
export const BAND_LEVELS: readonly LevelId[] = ['L2', 'L1'];

type Scoped = Pick<DbPaper, 'level' | 'method' | 'tangent'>;

export function atFocusLevel(p: Scoped): boolean {
  return !!p.level && FOCUS_LEVELS.includes(p.level);
}

/** Methods top band: methods at a band level, without tangential works. */
export function inMethodsTopBand(p: Scoped): boolean {
  return !!p.method && !!p.level && BAND_LEVELS.includes(p.level) && !p.tangent;
}

/** Methods graph and list: methods at a focus level, plus tangential works at any level or none. */
export function inMethodsGraph(p: Scoped): boolean {
  return !!p.tangent || (!!p.method && atFocusLevel(p));
}

/** Evaluations page (protocols table, realism plot, used-by counts): papers at a focus level only. */
export function inEvaluations(p: Scoped): boolean {
  return atFocusLevel(p);
}

/** The Evaluations page scope with the taxonomy's `evaluations_exclude` applied (SPEC §8.4): focus-level papers that
 *  are not excluded. Excluded papers stay on the graph and the Subproblems page. */
export function evaluationsScope(exclude: Iterable<string>): (p: Scoped & Pick<DbPaper, 'id'>) => boolean {
  const ex = new Set(exclude);
  return (p) => inEvaluations(p) && !ex.has(p.id);
}

/** Subproblems page (lists, counts, matrix): papers at a focus level plus papers with no level. */
export function inSubproblems(p: Scoped): boolean {
  return !p.level || atFocusLevel(p);
}
