import { describe, expect, it } from 'vitest';
import { buildCitations, isExactMatch, normalizeTitle, resolvePaper, type S2Api, type S2Paper } from '../src/lib/citations.ts';
import { drawnRelation, earlierWorks, edgeParam, mergeEdges, parseEdgeTypes, type EdgeType } from '../src/lib/edges.ts';
import { ancestry } from '../src/lib/graph.ts';

describe('edge precedence and merging', () => {
  const rels = [
    { type: 'cites' as const, from: 'stot', to: 'slate-pro' },
    { type: 'builds' as const, from: 'stot', to: 'slate-pro' },
    { type: 'benchmarks' as const, from: 'stot', to: 'slate-pro' },
    { type: 'benchmarks' as const, from: 'slate-pro', to: 'gap' },
    { type: 'cites' as const, from: 'slate-pro', to: 'gap' },
    { type: 'cites' as const, from: 'slate-pro', to: 'gap' }, // duplicate
    { type: 'cites' as const, from: 'gap', to: 'gap' }, // self-loop
  ];
  const edges = mergeEdges(rels);
  const all = new Set<EdgeType>(['builds', 'benchmarks', 'cites']);

  it('keeps one line per pair with every relation, in precedence order', () => {
    expect(edges).toHaveLength(2);
    const pair = edges.find((e) => e.key === 'slate-pro|stot')!;
    expect(pair.relations.map((r) => r.type)).toEqual(['builds', 'benchmarks', 'cites']);
    expect(edges.find((e) => e.key === 'gap|slate-pro')!.relations).toHaveLength(2);
  });

  it('draws the highest-precedence shown relation, or nothing', () => {
    const pair = edges.find((e) => e.key === 'slate-pro|stot')!;
    expect(drawnRelation(pair, all)?.type).toBe('builds');
    expect(drawnRelation(pair, new Set<EdgeType>(['benchmarks', 'cites']))?.type).toBe('benchmarks');
    expect(drawnRelation(pair, new Set<EdgeType>(['cites']))?.type).toBe('cites');
    expect(drawnRelation(pair, new Set<EdgeType>())).toBeNull();
  });

  it('reads and writes edges=', () => {
    expect([...parseEdgeTypes(null)]).toEqual(['builds', 'benchmarks', 'cites']);
    expect([...parseEdgeTypes('builds,benchmarks,bogus')]).toEqual(['builds', 'benchmarks']);
    expect([...parseEdgeTypes('none')]).toEqual([]);
    expect(edgeParam(all)).toBeNull();
    expect(edgeParam(new Set<EdgeType>(['cites', 'builds']))).toBe('builds,cites');
    expect(edgeParam(new Set<EdgeType>())).toBe('none');
  });

  it('follows only the shown edge types for ancestry', () => {
    const onlyBuilds = earlierWorks(edges, new Set<EdgeType>(['builds']));
    expect([...ancestry('gap', onlyBuilds).ancestors]).toEqual([]);
    const withBench = earlierWorks(edges, new Set<EdgeType>(['builds', 'benchmarks']));
    expect([...ancestry('gap', withBench).ancestors].sort()).toEqual(['slate-pro', 'stot']);
    expect([...ancestry('stot', withBench).descendants].sort()).toEqual(['gap', 'slate-pro']);
  });
});

describe('fetch-citations resolution', () => {
  const s2 = (paperId: string, title: string, year: number | null): S2Paper => ({ paperId, title, year });
  const DB: Record<string, S2Paper> = {
    'DOI:10.1/a': s2('S-A', 'Paper A', 2020),
    'ARXIV:2401.00001': s2('S-B', 'Paper B', 2024),
  };
  const titles: Record<string, S2Paper> = {
    'Paper C: Exact': s2('S-C', 'Paper C — exact', 2022),
    'Paper D': s2('S-D', 'Paper D, revisited', 2022),
    'Paper E': s2('S-E', 'Paper E', 2015),
  };
  const refs: Record<string, string[]> = { 'S-A': [], 'S-B': ['S-A', 'S-X'], 'S-C': ['S-A', 'S-B', 'S-C'] };
  const calls: string[] = [];
  const api: S2Api = {
    byExternalId: async (ext) => (calls.push(ext), DB[ext] ?? null),
    matchTitle: async (t) => (calls.push(`title:${t}`), titles[t] ?? null),
    references: async (id) => refs[id] ?? [],
  };

  it('matches by DOI, then arXiv id, then exact title', async () => {
    expect((await resolvePaper({ id: 'a', title: 'x', year: 2020, ids: { doi: '10.1/a', arxiv: '2401.00001' } }, api))?.by).toBe('doi');
    expect((await resolvePaper({ id: 'b', title: 'x', year: 2024, ids: { doi: '10.9/missing', arxiv: '2401.00001' } }, api))?.by).toBe('arxiv');
    expect((await resolvePaper({ id: 'c', title: 'Paper C: Exact', year: 2023 }, api))?.by).toBe('title');
  });

  it('rejects a near-miss title and a year more than one off', async () => {
    expect(await resolvePaper({ id: 'd', title: 'Paper D', year: 2022 }, api)).toBeNull();
    expect(await resolvePaper({ id: 'e', title: 'Paper E', year: 2020 }, api)).toBeNull();
    expect(normalizeTitle('Café: “Exact”—Title!')).toBe('cafe exact title');
    expect(isExactMatch({ id: 'x', title: 'A b', year: 2020 }, s2('1', 'a  B', null))).toBe(true);
  });

  it('keeps only references to papers in the database', async () => {
    const out = await buildCitations(
      [
        { id: 'a', title: 'Paper A', year: 2020, ids: { doi: '10.1/a' } },
        { id: 'b', title: 'Paper B', year: 2024, ids: { arxiv: '2401.00001' } },
        { id: 'c', title: 'Paper C: Exact', year: 2022 },
        { id: 'd', title: 'Paper D', year: 2022 },
      ],
      api,
      undefined,
      () => 'T',
    );
    expect(out.generated_at).toBe('T');
    expect(out.unresolved).toEqual(['d']);
    expect(out.papers.b).toEqual({ s2_id: 'S-B', cites: ['a'] });
    expect(out.papers.c.cites).toEqual(['a', 'b']);
    expect(out.papers.a.cites).toEqual([]);
  });
});

describe('fetch-citations aliases', () => {
  it('maps exact-title aliases (preprint and published versions) to the same paper', async () => {
    const api: S2Api = {
      byExternalId: async (ext) => (ext === 'DOI:10.1/pub' ? { paperId: 'PUB', title: 'Paper P', year: 2023 } : null),
      matchTitle: async (t) => (t === 'Paper Q' ? { paperId: 'Q', title: 'Paper Q', year: 2024 } : null),
      references: async (id) => (id === 'Q' ? ['PRE', 'OTHER'] : []),
      aliases: async (p) =>
        p.id === 'p'
          ? [
              { paperId: 'PRE', title: 'Paper P', year: 2022 },
              { paperId: 'NEAR', title: 'Paper P revisited', year: 2023 },
            ]
          : [],
    };
    const out = await buildCitations(
      [
        { id: 'p', title: 'Paper P', year: 2023, ids: { doi: '10.1/pub' } },
        { id: 'q', title: 'Paper Q', year: 2024 },
      ],
      api,
    );
    expect(out.papers.q.cites).toEqual(['p']);
  });
});
