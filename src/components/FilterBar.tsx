import { useState, type ReactNode } from 'react';
import { tx } from '../data.ts';
import { GLOBAL_LIST_KEYS, hasActiveFilters, type GlobalListKey } from '../lib/filters.ts';
import { toggleInList, useUrl } from '../state/url.ts';
import { Chip } from './Chip.tsx';

const LABELS: Record<GlobalListKey, string> = { family: 'Family', action: 'Action', input: 'Input', theme: 'Theme' };

function optionsFor(k: GlobalListKey): [string, string][] {
  switch (k) {
    case 'family':
      return Object.entries(tx.families).map(([id, f]) => [id, f.name]);
    case 'action':
      return Object.entries(tx.action_types).map(([id, a]) => [id, a.label]);
    case 'input':
      return Object.entries(tx.observation_modalities).map(([id, a]) => [id, a.label]);
    case 'theme':
      return Object.entries(tx.themes).map(([id, a]) => [id, a.label]);
  }
}

function labelOf(k: GlobalListKey, v: string) {
  return optionsFor(k).find(([id]) => id === v)?.[1] ?? v;
}

/** Active global filters as removable chips, plus controls for the dimensions a page offers. */
export function FilterBar({ controls = [], years, extra }: { controls?: GlobalListKey[]; years?: [number, number]; extra?: ReactNode }) {
  const url = useUrl();
  const f = url.filters;
  const [open, setOpen] = useState(false);
  const active = hasActiveFilters(f);
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
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => url.set({ family: null, action: null, input: null, theme: null, years: null, q: null })}>
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
