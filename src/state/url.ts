// URL state (SPEC §6.2). Filters use replaceState; opening a paper or switching pages uses pushState.
import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { parseList, readGlobalFilters, type GlobalFilters } from '../lib/filters.ts';

export type ParamValue = string | number | string[] | null | undefined | false;
export type ParamUpdates = Record<string, ParamValue>;

/** Applies updates to a query string. Empty values remove the key. Pure, for tests. */
export function applyParams(search: string, updates: ParamUpdates): string {
  const sp = new URLSearchParams(search);
  for (const [k, v] of Object.entries(updates)) {
    const s = Array.isArray(v) ? v.join(',') : v === null || v === undefined || v === false ? '' : String(v);
    if (s === '') sp.delete(k);
    else sp.set(k, s);
  }
  // Commas read better than %2C in shared links.
  const out = sp.toString().replace(/%2C/gi, ',');
  return out ? `?${out}` : '';
}

export function toggleInList(list: string[], v: string): string[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export interface UrlState {
  sp: URLSearchParams;
  search: string;
  pathname: string;
  filters: GlobalFilters;
  get(k: string): string | null;
  list(k: string): string[];
  /** replaceState by default; pass {push: true} for paper opens and page switches. */
  set(updates: ParamUpdates, opts?: { push?: boolean }): void;
  openPaper(id: string | null, extra?: ParamUpdates): void;
}

/** The live query string. Two updates in one tick (e.g. Esc closing the drawer and clearing focus)
 *  must compose, so read the address bar rather than the last rendered location. */
function liveLocation(fallback: { pathname: string; search: string }) {
  if (typeof window === 'undefined' || !window.location.hash.startsWith('#/')) return fallback;
  const h = window.location.hash.slice(1);
  const i = h.indexOf('?');
  return i >= 0 ? { pathname: h.slice(0, i), search: h.slice(i) } : { pathname: h, search: '' };
}

export function useUrl(): UrlState {
  const loc = useLocation();
  const navigate = useNavigate();
  const sp = useMemo(() => new URLSearchParams(loc.search), [loc.search]);
  const filters = useMemo(() => readGlobalFilters(sp), [sp]);
  const set = useCallback(
    (updates: ParamUpdates, opts?: { push?: boolean }) => {
      const live = liveLocation(loc);
      const search = applyParams(live.search, updates);
      if (search === live.search) return;
      navigate({ pathname: live.pathname, search }, { replace: !opts?.push });
    },
    [loc, navigate],
  );
  return {
    sp,
    search: loc.search,
    pathname: loc.pathname,
    filters,
    get: (k) => sp.get(k),
    list: (k) => parseList(sp.get(k)),
    set,
    openPaper: (id, extra = {}) => set({ paper: id, ...extra }, { push: id !== null }),
  };
}
