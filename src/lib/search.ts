// Token-prefix search scoring for the header box (SPEC §6.3). No library.
import { tokenize } from './filters.ts';

export interface Searchable {
  id: string;
  short_name: string;
  title: string;
  authors: string[];
  venue?: string | null;
  year: number;
}

const WEIGHTS = { short: 10, title: 4, author: 3, venue: 2, year: 2 };

function bestFor(token: string, fields: [string[], number][]): number {
  let best = 0;
  for (const [toks, w] of fields) {
    for (const t of toks) {
      if (t === token) best = Math.max(best, w * 1.5);
      else if (t.startsWith(token)) best = Math.max(best, w);
    }
  }
  return best;
}

export function scorePaper(p: Searchable, query: string): number {
  const qt = tokenize(query);
  if (!qt.length) return 0;
  const fields: [string[], number][] = [
    [tokenize(p.short_name), WEIGHTS.short],
    [tokenize(p.title), WEIGHTS.title],
    [tokenize(p.authors.join(' ')), WEIGHTS.author],
    [tokenize(p.venue ?? ''), WEIGHTS.venue],
    [[String(p.year)], WEIGHTS.year],
  ];
  let total = 0;
  for (const t of qt) {
    const s = bestFor(t, fields);
    if (s === 0) return 0; // every token must match something
    total += s;
  }
  // Whole short-name match wins outright.
  if (p.short_name.toLowerCase() === query.trim().toLowerCase()) total += 100;
  return total;
}

export function search<T extends Searchable>(items: T[], query: string, limit = 8): T[] {
  return items
    .map((p) => ({ p, s: scorePaper(p, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.p.year - a.p.year || a.p.short_name.localeCompare(b.p.short_name))
    .slice(0, limit)
    .map((x) => x.p);
}
