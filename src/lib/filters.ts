// Global filter state (SPEC §6.2) and matching. Pure, so tests can use it without the db.
// `level` is not a filter: it selects a Methods level card and highlights that card's timeline row only.
import type { DbPaper } from '../schema.ts';

export const GLOBAL_LIST_KEYS = ['family', 'action', 'input', 'theme'] as const;
export type GlobalListKey = (typeof GLOBAL_LIST_KEYS)[number];

export interface GlobalFilters {
  family: string[];
  action: string[];
  input: string[];
  theme: string[];
  years: [number, number] | null;
  q: string;
}

export function parseList(v: string | null | undefined): string[] {
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

export function parseYears(v: string | null | undefined): [number, number] | null {
  const m = v?.match(/^(\d{4})-(\d{4})$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a <= b ? [a, b] : [b, a];
}

export function readGlobalFilters(sp: URLSearchParams): GlobalFilters {
  return {
    family: parseList(sp.get('family')),
    action: parseList(sp.get('action')),
    input: parseList(sp.get('input')),
    theme: parseList(sp.get('theme')),
    years: parseYears(sp.get('years')),
    q: sp.get('q') ?? '',
  };
}

export function hasActiveFilters(f: GlobalFilters) {
  return GLOBAL_LIST_KEYS.some((k) => f[k].length > 0) || f.years !== null || f.q.trim() !== '';
}

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9π]+/)
    .filter(Boolean);
}

/** True if every query token is a prefix of some token in the paper's search string. */
export function matchesQuery(search: string, q: string): boolean {
  const qt = tokenize(q);
  if (!qt.length) return true;
  const st = tokenize(search);
  return qt.every((t) => st.some((s) => s.startsWith(t)));
}

export function matchesGlobal(p: DbPaper, f: GlobalFilters): boolean {
  const m = p.method;
  if (f.family.length && (!m || !m.family || !f.family.includes(m.family))) return false;
  if (f.action.length && (!m || !(m.action_types ?? []).some((a) => f.action.includes(a)))) return false;
  if (f.input.length && (!m || !(m.inputs ?? []).some((a) => f.input.includes(a)))) return false;
  if (f.theme.length && !(p.themes ?? []).some((t) => f.theme.includes(t))) return false;
  if (f.years && (p.year < f.years[0] || p.year > f.years[1])) return false;
  if (f.q.trim() && !matchesQuery(p.search, f.q)) return false;
  return true;
}
