// Writes data/citations.json (SPEC §5.5). Run after adding papers:
//   npm run fetch-citations                      Semantic Scholar (S2_API_KEY in the environment is optional)
//   npm run fetch-citations -- --source openalex  OpenAlex, the fallback when Semantic Scholar's shared rate limit blocks a run
// Papers are matched by DOI, then arXiv id, then an exact normalized title with the year within one. Never a fuzzy match.
// The build reads the committed file and never calls the network.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { buildCitations, normalizeTitle, type PaperRef, type S2Api, type S2Paper } from '../src/lib/citations.ts';

const root = join(import.meta.dirname, '..');
const dir = join(root, 'data/papers');
const SOURCE = process.argv.includes('--source') ? process.argv[process.argv.indexOf('--source') + 1] : 'semanticscholar';
const KEY = process.env.S2_API_KEY;
// Semantic Scholar's shared public pool allows about one request per second; a key allows more.
const SPACING_MS = SOURCE === 'openalex' ? 120 : KEY ? 150 : 1100;
const MAX_TRIES = 20;
// Responses are cached so a run cut short by a rate limit resumes where it stopped.
const CACHE_DIR = join(root, 'node_modules/.cache');
const CACHE = join(CACHE_DIR, `fetch-citations-${SOURCE}.json`);
const cache: Record<string, unknown> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const saveCache = () => {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE, JSON.stringify(cache));
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;

async function get(url: string, headers: Record<string, string> = {}, tries = MAX_TRIES): Promise<unknown | null> {
  if (url in cache) return cache[url];
  const body = await fetchWithRetry(url, headers, tries);
  cache[url] = body;
  saveCache();
  return body;
}

async function fetchWithRetry(url: string, headers: Record<string, string>, tries: number): Promise<unknown | null> {
  for (let attempt = 1; attempt <= tries; attempt++) {
    const wait = last + SPACING_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetch(url, { headers });
    if (res.status === 404) return null;
    if (res.status === 429 || res.status >= 500) {
      const backoff = Math.min(90_000, 2_000 * 2 ** (attempt - 1));
      console.warn(`  ${res.status} on ${url.split('?')[0]}; retrying in ${backoff / 1000}s (${attempt}/${tries})`);
      await sleep(backoff);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${url}`);
    return res.json();
  }
  throw new Error(`${SOURCE} kept refusing requests (rate limit). Try later${SOURCE === 'semanticscholar' ? ', set S2_API_KEY, or use --source openalex' : ''}.`);
}

// ---- Semantic Scholar ----
const S2 = 'https://api.semanticscholar.org/graph/v1';
const s2Headers: Record<string, string> = KEY ? { 'x-api-key': KEY } : {};
const semanticScholar: S2Api = {
  async byExternalId(ext) {
    return (await get(`${S2}/paper/${encodeURIComponent(ext)}?fields=paperId,title,year`, s2Headers)) as S2Paper | null;
  },
  async matchTitle(title) {
    const r = (await get(`${S2}/paper/search/match?query=${encodeURIComponent(title)}&fields=paperId,title,year`, s2Headers)) as { data?: S2Paper[] } | null;
    return r?.data?.[0] ?? null;
  },
  async references(paperId) {
    const ids: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const r = (await get(`${S2}/paper/${paperId}/references?fields=paperId&limit=1000&offset=${offset}`, s2Headers)) as {
        data?: { citedPaper: { paperId: string | null } | null }[];
        next?: number;
      } | null;
      for (const d of r?.data ?? []) if (d.citedPaper?.paperId) ids.push(d.citedPaper.paperId);
      if (!r?.next) break;
    }
    return ids;
  },
};

// ---- OpenAlex ----
const OA = 'https://api.openalex.org';
interface OAWork {
  id: string;
  display_name: string | null;
  publication_year: number | null;
  referenced_works?: string[];
}
const oaPaper = (w: OAWork | null): S2Paper | null => (w ? { paperId: w.id, title: w.display_name ?? '', year: w.publication_year } : null);
const oaSearch = async (title: string, tries = MAX_TRIES) => {
  // OpenAlex filter values cannot hold punctuation such as , : | ? so search on words only.
  const q = encodeURIComponent(title.replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim());
  const r = (await get(`${OA}/works?filter=title.search:${q}&per_page=10&select=id,display_name,publication_year`, {}, tries)) as {
    results?: OAWork[];
  } | null;
  return (r?.results ?? []).map((w) => oaPaper(w)!);
};
const openAlex: S2Api = {
  async byExternalId(ext) {
    const [kind, id] = [ext.slice(0, ext.indexOf(':')), ext.slice(ext.indexOf(':') + 1)];
    const doi = kind === 'ARXIV' ? `10.48550/arXiv.${id}` : id;
    return oaPaper((await get(`${OA}/works/doi:${doi}?select=id,display_name,publication_year`)) as OAWork | null);
  },
  async matchTitle(title) {
    // The caller checks for an exact match; return the first exact one if any. A search that stays
    // rate-limited leaves the paper unresolved for this run instead of aborting it.
    let hits: S2Paper[];
    try {
      hits = await oaSearch(title, 6);
    } catch {
      rateLimited.push(title);
      return null;
    }
    return hits.find((h) => normalizeTitle(h.title) === normalizeTitle(title)) ?? hits[0] ?? null;
  },
  async references(paperId) {
    const w = (await get(`${OA}/works/${paperId.replace('https://openalex.org/', '')}?select=id,referenced_works`)) as OAWork | null;
    return w?.referenced_works ?? [];
  },
  // Aliases only add recall, so a search that stays rate-limited is skipped rather than blocking the run.
  async aliases(p) {
    try {
      return await oaSearch(p.title, 4);
    } catch {
      console.warn(`  skipped alias search for ${p.id} (rate limit)`);
      return [];
    }
  },
};

const rateLimited: string[] = [];
const api = SOURCE === 'openalex' ? openAlex : semanticScholar;
const label = SOURCE === 'openalex' ? 'OpenAlex' : 'Semantic Scholar Graph API';

const papers: PaperRef[] = readdirSync(dir)
  .filter((n) => n.endsWith('.yaml'))
  .sort()
  .map((n) => {
    const p = yaml.load(readFileSync(join(dir, n), 'utf8')) as PaperRef;
    return { id: p.id, title: p.title, year: p.year, ids: p.ids };
  });

console.log(`Looking up ${papers.length} papers on ${label}${KEY && SOURCE !== 'openalex' ? ' (with API key)' : ''}…`);
const out = await buildCitations(papers, api, (m) => console.log(m), undefined, label);
if (rateLimited.length) {
  const ids = papers.filter((p) => rateLimited.includes(p.title)).map((p) => p.id);
  out.note = `Title search was rate-limited for ${ids.join(', ')}. Rerun to fill them in.`;
}
writeFileSync(join(root, 'data/citations.json'), JSON.stringify(out, null, 2) + '\n');
const edges = Object.values(out.papers).reduce((n, e) => n + e.cites.length, 0);
console.log(`\nWrote data/citations.json: ${Object.keys(out.papers).length} found, ${out.unresolved.length} not found, ${edges} citation edges.`);
if (out.unresolved.length) console.log(`Not found: ${out.unresolved.join(', ')}`);
