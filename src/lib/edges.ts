// Graph edges between papers (SPEC §5.5). Pure, shared by the build and the UI.

/** In precedence order: builds on outranks benchmarks against, which outranks cites. */
export const EDGE_TYPES = ['builds', 'benchmarks', 'cites'] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export const EDGE_LABEL: Record<EdgeType, { forward: string; name: string }> = {
  builds: { name: 'Builds on', forward: 'builds on' },
  benchmarks: { name: 'Benchmarks against', forward: 'benchmarks against' },
  cites: { name: 'Cites', forward: 'cites' },
};

/** One relation. `from` is the earlier work (built on, benchmarked, or cited); `to` is the paper that does so. */
export interface Relation {
  type: EdgeType;
  from: string;
  to: string;
}

/** One line per pair of papers, with every relation between them. */
export interface PairEdge {
  key: string;
  relations: Relation[];
}

const rank = (t: EdgeType) => EDGE_TYPES.indexOf(t);

/** Groups relations by unordered pair, drops self-loops and duplicates, and sorts each pair's relations by precedence. */
export function mergeEdges(rels: Relation[]): PairEdge[] {
  const byPair = new Map<string, Relation[]>();
  const seen = new Set<string>();
  for (const r of rels) {
    if (r.from === r.to) continue;
    const id = `${r.type}:${r.from}>${r.to}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const key = [r.from, r.to].sort().join('|');
    byPair.set(key, [...(byPair.get(key) ?? []), r]);
  }
  return [...byPair.entries()]
    .map(([key, relations]) => ({ key, relations: relations.sort((a, b) => rank(a.type) - rank(b.type)) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** The relation a pair draws as, given the edge types shown: the highest-precedence one, or null if none is shown. */
export function drawnRelation(e: PairEdge, shown: ReadonlySet<EdgeType>): Relation | null {
  return e.relations.find((r) => shown.has(r.type)) ?? null;
}

/** Parses `edges=`. Absent means all three; unknown values are ignored. */
export function parseEdgeTypes(v: string | null | undefined): Set<EdgeType> {
  if (v === null || v === undefined) return new Set(EDGE_TYPES);
  return new Set(v.split(',').filter((x): x is EdgeType => (EDGE_TYPES as readonly string[]).includes(x)));
}

/** Serializes the shown types for `edges=`: null (absent) when all three are on. */
export function edgeParam(shown: ReadonlySet<EdgeType>): string | null {
  if (EDGE_TYPES.every((t) => shown.has(t))) return null;
  const list = EDGE_TYPES.filter((t) => shown.has(t));
  return list.length ? list.join(',') : 'none';
}

/** For ancestry: maps each paper to the earlier works it is linked to by any shown relation. */
export function earlierWorks(edges: PairEdge[], shown: ReadonlySet<EdgeType>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const e of edges) {
    for (const r of e.relations) {
      if (!shown.has(r.type)) continue;
      (out[r.to] ??= []).push(r.from);
      out[r.from] ??= [];
    }
  }
  return out;
}
