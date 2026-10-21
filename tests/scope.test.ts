import { describe, expect, it } from 'vitest';
import { atFocusLevel, BAND_LEVELS, FOCUS_LEVELS, inEvaluations, inMethodsGraph, inMethodsTopBand, inSubproblems } from '../src/lib/scope.ts';
import type { DbPaper } from '../src/schema.ts';

// Level scope (SPEC §6.2): which papers each part of the site shows.

const method = { knowns: { goal: 'unknown', human_policy: 'unknown' } } as DbPaper['method'];
const P = (id: string, extra: Partial<DbPaper> = {}) => ({ id, level: null, method: undefined, tangent: undefined, ...extra }) as DbPaper;

const l2 = P('l2', { level: 'L2', method });
const l1 = P('l1', { level: 'L1', method });
const l0 = P('l0', { level: 'L0', method });
const work = P('work'); // no level, such as a related work from another field
const tangent = P('tangent', { tangent: 'hri' });
const l1Tangent = P('l1-tangent', { level: 'L1', method, tangent: 'hri' });
const all = [l2, l1, l0, work, tangent, l1Tangent];
const ids = (keep: (p: DbPaper) => boolean) => all.filter(keep).map((p) => p.id);

describe('level scope', () => {
  it('focuses on L2, and the top band holds L2 and L1', () => {
    expect(FOCUS_LEVELS).toEqual(['L2']);
    expect(BAND_LEVELS).toEqual(['L2', 'L1']);
    expect(ids(atFocusLevel)).toEqual(['l2']);
  });

  it('puts L2 and L1 methods in the Methods top band, without tangential works or L0', () => {
    expect(ids(inMethodsTopBand)).toEqual(['l2', 'l1']);
  });

  it('puts focus-level methods and every tangential work in the Methods graph and list', () => {
    expect(ids(inMethodsGraph)).toEqual(['l2', 'tangent', 'l1-tangent']);
  });

  it('shows only focus-level papers on Evaluations, never papers with no level', () => {
    expect(ids(inEvaluations)).toEqual(['l2']);
  });

  it('shows focus-level papers and papers with no level on Subproblems, never L1', () => {
    expect(ids(inSubproblems)).toEqual(['l2', 'work', 'tangent']);
    expect(inSubproblems(l1)).toBe(false);
  });
});
