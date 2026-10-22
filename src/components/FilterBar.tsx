import { useState, type ReactNode } from 'react';
import { tx } from '../data.ts';
import { GLOBAL_LIST_KEYS, hasActiveFilters, type GlobalListKey } from '../lib/filters.ts';
import { toggleInList, useUrl } from '../state/url.ts';
import { Chip } from './Chip.tsx';

const LABELS: Record<GlobalListKey, string> = { input: 'Input' };

function optionsFor(k: GlobalListKey): [string, string][] {
  switch (k) {
    case 'input':
      return Object.entries(tx.observation_modalities).map(([id, a]) => [id, a.label]);
  }
}

function labelOf(k: GlobalListKey, v: string) {
  return optionsFor(k).find(([id]) => id === v)?.[1] ?? v;
}

/** Active global filters as removable chips, plus controls for the dimensions a page offers. `pageFilters` names the
 *  page's own params that are set (shown by the page in `extra`): they count as active, and "Clear all" clears them. */
export function FilterBar({
  controls = [],
  years,
  extra,
  pageFilters = [],
}: {
  controls?: GlobalListKey[];
  years?: [number, number];
  extra?: ReactNode;
  pageFilters?: readonly string[];
}) {
  const url = useUrl();
  const f = url.filters;
  const [open, setOpen] = useState(false);
  const active = hasActiveFilters(f) || pageFilters.length > 0;
  const yr = f.years ?? years;

  return (
    <div className="filterbar" role="region" aria-label="Filters">
      <div className="filterbar__row">
        {(controls.length > 0 || years) && (
          <button type="button" className="btn btn--sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            Filters {open ? '▴' : '▾'}
          </button>
        )}
        <div className="chips" aria-live="polite">
          {GLOBAL_LIST_KEYS.flatMap((k) =>
            f[k].map((v) => (
              <Chip key={`${k}:${v}`} onRemove={() => url.set({ [k]: f[k].filter((x) => x !== v) })} removeLabel={`Remove filter ${LABELS[k]}: ${labelOf(k, v)}`}>
                <span className="muted">{LABELS[k]}:</span> {labelOf(k, v)}
              </Chip>
            )),
          )}
          {f.years && (
            <Chip onRemove={() => url.set({ years: null })} removeLabel="Remove year filter">
              <span className="muted">Years:</span> {f.years[0]}–{f.years[1]}
            </Chip>
          )}
          {f.q && (
            <Chip onRemove={() => url.set({ q: null })} removeLabel="Remove text filter">
              <span className="muted">Text:</span> “{f.q}”
            </Chip>
          )}
          {!active && <span className="muted small">No filters</span>}
        </div>
        {extra}
        <label className="filterbar__q">
          <span className="sr-only">Filter by text</span>
          <input type="search" placeholder="Filter text" value={f.q} onChange={(e) => url.set({ q: e.target.value || null })} />
        </label>
        {active && (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => url.set({ ...Object.fromEntries(GLOBAL_LIST_KEYS.map((k) => [k, null])), years: null, q: null, ...Object.fromEntries(pageFilters.map((k) => [k, null])) })}
          >
            Clear all
          </button>
        )}
      </div>
      {open && (
        <div className="filterbar__panel">
          {controls.map((k) => (
            <fieldset key={k} className="filterbar__group">
              <legend>{LABELS[k]}</legend>
              <div className="chips">
                {optionsFor(k).map(([id, label]) => (
                  <Chip key={id} pressed={f[k].includes(id)} onClick={() => url.set({ [k]: toggleInList(f[k], id) })}>
                    {label}
                  </Chip>
                ))}
              </div>
            </fieldset>
          ))}
          {years && yr && (
            <fieldset className="filterbar__group">
              <legend>Years</legend>
              <div className="years">
                <label>
                  From{' '}
                  <input type="number" min={years[0]} max={years[1]} value={yr[0]} onChange={(e) => url.set({ years: `${e.target.value}-${yr[1]}` })} />
                </label>
                <label>
                  to <input type="number" min={years[0]} max={years[1]} value={yr[1]} onChange={(e) => url.set({ years: `${yr[0]}-${e.target.value}` })} />
                </label>
              </div>
            </fieldset>
          )}
        </div>
      )}
    </div>
  );
}
