// Synthetic papers for checking that the literature graph stays readable and responsive as it grows (SPEC §7.2, M4):
// 300 L2 papers, 292 of them in 4 families and 8 with no family, plus 30 tangential works, linked by builds on,
// benchmarks against, and cites. Reached only through ?synthetic=1; never mixed with real data.
// scripts/build-data.ts lays these papers out and writes src/generated/synthetic-layout.json.
import type { DbPaper } from '../../schema.ts';

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** Family D is semi-tangential, so the fixture exercises that treatment too (SPEC §7.2). */
export const SYNTHETIC_FAMILIES: Record<string, { name: string; definition: string; scope_line?: string; semi_tangential?: boolean }> = {
  synthetic_a: { name: 'Synthetic family A', definition: 'Layout test fixture.' },
  synthetic_b: { name: 'Synthetic family B', definition: 'Layout test fixture.' },
  synthetic_c: { name: 'Synthetic family C', definition: 'Layout test fixture.' },
  synthetic_d: { name: 'Synthetic family D', definition: 'Layout test fixture.', semi_tangential: true },
};

const FAMILIES = [...Object.keys(SYNTHETIC_FAMILIES)];
const ACTIONS = ['act', 'timing', 'initiate', 'inform', 'ask'];
const INPUTS = ['object_relocations', 'scene_graph', 'video', 'language'];
export const SYNTHETIC_COUNT = 300;
export const SYNTHETIC_UNCLUSTERED = 8;
export const SYNTHETIC_TANGENTS = 30;
const TANGENT_TYPES = ['hri', 'conversational', 'search'];
const NAMES = ['Atlas', 'Beacon', 'Cairn', 'Delta', 'Ember', 'Fable', 'Garnet', 'Harbor', 'Iris', 'Juniper', 'Kestrel', 'Lumen', 'Meridian', 'Nimbus', 'Orbit', 'Pilot', 'Quill', 'Rover', 'Sable', 'Tandem', 'Umber', 'Vesper', 'Willow', 'Yarrow', 'Zephyr'];

/** Picks up to n distinct items, favoring the first list. */
function pick<T>(r: () => number, n: number, near: T[], far: T[], pNear = 0.85): T[] {
  const out = new Set<T>();
  for (let i = 0; i < n * 3 && out.size < n; i++) {
    const from = near.length && (r() < pNear || !far.length) ? near : far;
    if (from.length) out.add(from[Math.floor(r() * from.length)]);
  }
  return [...out];
}

export function syntheticPapers(): DbPaper[] {
  const r = rng(42);
  const out: DbPaper[] = [];
  // Years rise with the index so links point from older to newer papers.
  for (let i = 0; i < SYNTHETIC_COUNT; i++) {
    const year = Math.min(2026, 2012 + Math.floor((i / SYNTHETIC_COUNT) * 14 + r() * 1.5));
    const family = i < SYNTHETIC_COUNT - SYNTHETIC_UNCLUSTERED ? FAMILIES[i % FAMILIES.length] : null;
    const older = out.filter((p) => p.year < year);
    const same = older.filter((p) => p.method?.family === family);
    const other = older.filter((p) => p.method?.family !== family);
    const builds_on = r() < 0.3 ? pick(r, 1, same, other, 0.95) : [];
    const baselines = r() < 0.45 ? pick(r, 1 + Math.floor(r() * 2), same, other) : [];
    const cites = pick(r, Math.floor(r() * 4), same, other, 0.7);
    const id = `synthetic-${i}`;
    const short_name = `${NAMES[i % NAMES.length]}${i >= NAMES.length ? `-${Math.floor(i / NAMES.length)}` : ''}`;
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
        builds_on: builds_on.map((p) => p.id),
      },
      evaluations: baselines.length ? [{ id: `${id}-eval`, loop: 'offline_replay', baselines: baselines.map((p) => p.id) }] : undefined,
      level: 'L2',
      built_upon_by: [],
      benchmarks_against: baselines.map((p) => p.id),
      benchmarked_in: [],
      cites: cites.map((p) => p.id),
      cited_by: [],
      search: `${short_name} synthetic paper ${i} ${year}`.toLowerCase(),
    });
    for (const b of builds_on) b.built_upon_by.push(id);
    for (const b of baselines) b.benchmarked_in.push(id);
    for (const c of cites) c.cited_by.push(id);
  }
  const core = [...out];
  for (let i = 0; i < SYNTHETIC_TANGENTS; i++) {
    const id = `synthetic-t${i}`;
    const short_name = `Study ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? 2 : ''}`;
    const year = 2015 + Math.floor(r() * 12);
    const cites = pick(r, 1 + Math.floor(r() * 2), core.filter((p) => p.year <= year), core);
    out.push({
      id,
      short_name,
      title: `Synthetic tangential work ${i}`,
      authors: ['Synthetic Author'],
      year,
      tangent: TANGENT_TYPES[i % TANGENT_TYPES.length],
      links: { paper: null },
      provenance: 'Synthetic fixture',
      level: null,
      built_upon_by: [],
      benchmarks_against: [],
      benchmarked_in: [],
      cites: cites.map((p) => p.id),
      cited_by: [],
      search: `${short_name} synthetic tangential ${i}`.toLowerCase(),
    });
    for (const c of cites) c.cited_by.push(id);
  }
  return out;
}
