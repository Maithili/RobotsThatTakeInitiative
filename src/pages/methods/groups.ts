// Grouping of method papers by level and family, used by the Methods list and the Subproblems matrix.
import { tx } from '../../data.ts';
import type { DbPaper, LevelId } from '../../schema.ts';

export interface Lane {
  id: string;
  level: LevelId;
  family: string | null;
  title: string;
  papers: DbPaper[];
}

/** Groups top to bottom: one L2 group per family, "Family not set", then L1, then L0. */
export function buildLanes(papers: DbPaper[]): Lane[] {
  const l2 = papers.filter((p) => p.level === 'L2');
  const lanes: Lane[] = Object.entries(tx.families).map(([fid, f]) => ({
    id: `L2:${fid}`,
    level: 'L2',
    family: fid,
    title: f.name,
    papers: l2.filter((p) => p.method?.family === fid),
  }));
  const unset = l2.filter((p) => !p.method?.family || !tx.families[p.method.family]);
  if (unset.length) lanes.push({ id: 'L2:none', level: 'L2', family: null, title: 'Family not set', papers: unset });
  lanes.push({ id: 'L1', level: 'L1', family: null, title: tx.levels.L1.name, papers: papers.filter((p) => p.level === 'L1') });
  lanes.push({ id: 'L0', level: 'L0', family: null, title: tx.levels.L0.name, papers: papers.filter((p) => p.level === 'L0') });
  return lanes;
}
