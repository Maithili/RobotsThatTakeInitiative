// Synthetic papers for checking that the lineage graph stays readable at scale (SPEC §7.2, M4).
// Reached only through ?synthetic=<n>; never mixed with real data.
import type { DbPaper } from '../../schema.ts';

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const FAMILIES = ['goal_inference', 'temporal_prediction', 'full_pipeline', null];
const ACTIONS = ['act', 'timing', 'initiate', 'inform', 'ask'];
const INPUTS = ['object_relocations', 'scene_graph', 'video', 'language'];

export function syntheticPapers(n: number): DbPaper[] {
  const r = rng(42);
  const out: DbPaper[] = [];
  for (let i = 0; i < Math.min(n, 400); i++) {
    const year = 2008 + Math.floor(r() * 19);
    const lv = r();
    const level = lv < 0.55 ? 'L2' : lv < 0.9 ? 'L1' : 'L0';
    const family = level === 'L2' ? FAMILIES[Math.floor(r() * FAMILIES.length)] : null;
    const older = out.filter((p) => p.year < year);
    const builds_on = older.length && r() < 0.6 ? [older[Math.floor(r() * older.length)].id] : [];
    const id = `synthetic-${i}`;
    const short_name = `Method ${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26) || ''}`;
    out.push({
      id,
      short_name,
      title: `Synthetic paper ${i}`,
      authors: ['Synthetic Author'],
      year,
      links: { paper: null },
      provenance: 'Synthetic fixture',
      method: {
        knowns: level === 'L0' ? { goal: 'known', human_policy: 'known' } : level === 'L1' ? { goal: 'known', human_policy: 'unknown' } : { goal: 'unknown', human_policy: 'unknown' },
        family,
        action_types: [ACTIONS[Math.floor(r() * ACTIONS.length)]],
        inputs: [INPUTS[Math.floor(r() * INPUTS.length)]],
        core_strength: null,
        builds_on,
      },
      level,
      built_upon_by: [],
      compared_in: [],
      search: `${short_name} synthetic paper ${i} ${year}`.toLowerCase(),
    });
  }
  return out;
}
