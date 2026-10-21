// Citation lookup logic for scripts/fetch-citations.ts (SPEC §5.5). Pure: the network sits behind `S2Api`,
// so tests can mock it.

export interface PaperRef {
  id: string;
  title: string;
  year: number;
  ids?: { doi?: string; arxiv?: string };
}

export interface S2Paper {
  paperId: string;
  title: string;
  year: number | null;
}

export interface S2Api {
  /** Looks up one paper by external id ("DOI:10.…" or "ARXIV:2401.01234"). Null if not found. */
  byExternalId(ext: string): Promise<S2Paper | null>;
  /** Semantic Scholar's best title match. The caller still checks it for an exact match. */
  matchTitle(title: string): Promise<S2Paper | null>;
  /** Source ids of the papers this paper cites. */
  references(paperId: string): Promise<string[]>;
  /** Optional: other source ids for the same paper (a preprint and its published version), found by exact title. */
  aliases?(p: PaperRef): Promise<S2Paper[]>;
}

export type MatchedBy = 'doi' | 'arxiv' | 'title';

/** Lowercase, strip accents, punctuation, and extra spaces. */
export function normalizeTitle(t: string): string {
  return t
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Exact normalized title and a year within one. Never a fuzzy match. */
export function isExactMatch(p: PaperRef, s: S2Paper | null): s is S2Paper {
  if (!s) return false;
  if (normalizeTitle(p.title) !== normalizeTitle(s.title)) return false;
  return s.year === null || Math.abs(s.year - p.year) <= 1;
}

/** DOI first, then arXiv id, then an exact title match. */
export async function resolvePaper(p: PaperRef, api: S2Api): Promise<{ s2: S2Paper; by: MatchedBy } | null> {
  if (p.ids?.doi) {
    const s = await api.byExternalId(`DOI:${p.ids.doi}`);
    if (s) return { s2: s, by: 'doi' };
  }
  if (p.ids?.arxiv) {
    const s = await api.byExternalId(`ARXIV:${p.ids.arxiv}`);
    if (s) return { s2: s, by: 'arxiv' };
  }
  const m = await api.matchTitle(p.title);
  if (isExactMatch(p, m)) return { s2: m, by: 'title' };
  return null;
}

export interface CitationsFile {
  generated_at: string | null;
  source: string;
  papers: Record<string, { s2_id: string | null; cites: string[] }>;
  unresolved: string[];
  note?: string;
}

/** Resolves every paper, fetches reference lists, and keeps references that are papers in the database. */
export async function buildCitations(
  papers: PaperRef[],
  api: S2Api,
  log: (msg: string) => void = () => {},
  now = () => new Date().toISOString(),
  source = 'Semantic Scholar Graph API',
): Promise<CitationsFile> {
  const s2ToId = new Map<string, string>();
  const resolved = new Map<string, string>();
  const unresolved: string[] = [];
  for (const p of papers) {
    const r = await resolvePaper(p, api);
    if (!r) {
      unresolved.push(p.id);
      log(`✗ not found: ${p.id} (${p.title})`);
      continue;
    }
    resolved.set(p.id, r.s2.paperId);
    s2ToId.set(r.s2.paperId, p.id);
    for (const a of (await api.aliases?.(p)) ?? []) if (isExactMatch(p, a) && !s2ToId.has(a.paperId)) s2ToId.set(a.paperId, p.id);
    log(`✓ ${p.id} by ${r.by}`);
  }
  const out: CitationsFile['papers'] = {};
  for (const p of papers) {
    const s2 = resolved.get(p.id);
    if (!s2) continue;
    const refs = await api.references(s2);
    const cites = [...new Set(refs.map((r) => s2ToId.get(r)).filter((x): x is string => !!x && x !== p.id))].sort();
    out[p.id] = { s2_id: s2, cites };
  }
  return { generated_at: now(), source, papers: out, unresolved: unresolved.sort() };
}
