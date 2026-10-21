// Synthetic papers for checking that the literature graph stays readable as it grows (SPEC §7.2, M4):
// 60 L2 papers, 56 of them in 4 families and 4 with no family, plus links between them.
// Reached only through ?synthetic=1; never mixed with real data.
import type { DbPaper } from '../../schema.ts';

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export const SYNTHETIC_FAMILIES: Record<string, { name: string; definition: string; scope_line?: string }> = {
  synthetic_a: { name: 'Synthetic family A', definition: 'Layout test fixture.' },
  synthetic_b: { name: 'Synthetic family B', definition: 'Layout test fixture.' },
  synthetic_c: { name: 'Synthetic family C', definition: 'Layout test fixture.' },
  synthetic_d: { name: 'Synthetic family D', definition: 'Layout test fixture.' },
};

const FAMILIES = [...Object.keys(SYNTHETIC_FAMILIES)];
const ACTIONS = ['act', 'timing', 'initiate', 'inform', 'ask'];
const INPUTS = ['object_relocations', 'scene_graph', 'video', 'language'];
export const SYNTHETIC_COUNT = 60;

export function syntheticPapers(): DbPaper[] {
  const r = rng(42);
  const out: DbPaper[] = [];
  for (let i = 0; i < SYNTHETIC_COUNT; i++) {
    const year = 2014 + Math.floor(r() * 13);
    const family = i < 56 ? FAMILIES[i % 4] : null;
    const older = out.filter((p) => p.year < year);
    const builds_on = older.length && r() < 0.35 ? [older[Math.floor(r() * older.length)].id] : [];
    const baselines = older.length && r() < 0.4 ? [older[Math.floor(r() * older.length)].id] : [];
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
        knowns: { goal: 'unknown', human_policy: 'unknown' },
        family,
        action_types: [ACTIONS[Math.floor(r() * ACTIONS.length)]],
        inputs: [INPUTS[Math.floor(r() * INPUTS.length)]],
        core_strength: null,
        builds_on,
      },
      evaluations: baselines.length ? [{ id: `${id}-eval`, loop: 'offline_replay', baselines }] : undefined,
      level: 'L2',
      built_upon_by: [],
      benchmarks_against: baselines,
      benchmarked_in: [],
      cites: [],
      cited_by: [],
      search: `${short_name} synthetic paper ${i} ${year}`.toLowerCase(),
    });
  }
  return out;
}
