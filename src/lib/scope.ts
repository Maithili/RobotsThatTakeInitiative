// Level scope (SPEC §6.2): which papers each part of the site shows. Pure, so tests can use it without the db.
import type { DbPaper, LevelId } from '../schema.ts';

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

/** Subproblems page (lists, counts, matrix): papers at a focus level plus papers with no level. */
export function inSubproblems(p: Scoped): boolean {
  return !p.level || atFocusLevel(p);
}
