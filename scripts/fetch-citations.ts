// Writes data/citations.json from Semantic Scholar (SPEC §5.5). Run after adding papers:
//   npm run fetch-citations            (S2_API_KEY in the environment is optional)
// The build reads the committed file and never calls the network.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { buildCitations, type PaperRef, type S2Api, type S2Paper } from '../src/lib/citations.ts';

const root = join(import.meta.dirname, '..');
const dir = join(root, 'data/papers');
const API = 'https://api.semanticscholar.org/graph/v1';
const KEY = process.env.S2_API_KEY;
// The shared public pool allows about one request per second; a key allows more.
const SPACING_MS = KEY ? 150 : 1100;
const MAX_TRIES = 8;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;

async function get(path: string): Promise<unknown | null> {
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const wait = last + SPACING_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetch(`${API}${path}`, { headers: KEY ? { 'x-api-key': KEY } : {} });
    if (res.status === 404) return null;
    if (res.status === 429 || res.status >= 500) {
      const backoff = Math.min(60_000, 2_000 * 2 ** (attempt - 1));
      console.warn(`  ${res.status} on ${path.split('?')[0]}; retrying in ${backoff / 1000}s (${attempt}/${MAX_TRIES})`);
      await sleep(backoff);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${path}`);
    return res.json();
  }
  throw new Error(`Semantic Scholar kept refusing requests (rate limit). Set S2_API_KEY or try later.`);
}

const FIELDS = 'paperId,title,year';
const api: S2Api = {
  async byExternalId(ext) {
    return (await get(`/paper/${encodeURIComponent(ext)}?fields=${FIELDS}`)) as S2Paper | null;
  },
  async matchTitle(title) {
    const r = (await get(`/paper/search/match?query=${encodeURIComponent(title)}&fields=${FIELDS}`)) as { data?: S2Paper[] } | null;
    return r?.data?.[0] ?? null;
  },
  async references(paperId) {
    const ids: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const r = (await get(`/paper/${paperId}/references?fields=paperId&limit=1000&offset=${offset}`)) as {
        data?: { citedPaper: { paperId: string | null } | null }[];
        next?: number;
      } | null;
      for (const d of r?.data ?? []) if (d.citedPaper?.paperId) ids.push(d.citedPaper.paperId);
      if (!r?.next) break;
    }
    return ids;
  },
};

const papers: PaperRef[] = readdirSync(dir)
  .filter((n) => n.endsWith('.yaml'))
  .sort()
  .map((n) => {
    const p = yaml.load(readFileSync(join(dir, n), 'utf8')) as PaperRef;
    return { id: p.id, title: p.title, year: p.year, ids: p.ids };
  });

console.log(`Looking up ${papers.length} papers on Semantic Scholar${KEY ? ' (with API key)' : ''}…`);
const out = await buildCitations(papers, api, (m) => console.log(m));
writeFileSync(join(root, 'data/citations.json'), JSON.stringify(out, null, 2) + '\n');
const edges = Object.values(out.papers).reduce((n, e) => n + e.cites.length, 0);
console.log(`\nWrote data/citations.json: ${Object.keys(out.papers).length} found, ${out.unresolved.length} not found, ${edges} citation edges.`);
if (out.unresolved.length) console.log(`Not found: ${out.unresolved.join(', ')}`);
