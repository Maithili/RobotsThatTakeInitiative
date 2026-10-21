import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { papers } from '../data.ts';
import { search } from '../lib/search.ts';
import { useUrl } from '../state/url.ts';
import { LevelChip } from './Chip.tsx';

/** Scrolls the element for a paper into view and pulses it once (Methods node, Subproblems row).
 *  The Methods graph handles `rti:locate` itself: it zooms to the node and pulses it. */
export function locatePaper(id: string) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (!window.dispatchEvent(new CustomEvent('rti:locate', { detail: { id }, cancelable: true }))) return;
      const el = document.querySelector<HTMLElement>(`[data-locate="${CSS.escape(id)}"]`);
      if (!el) return;
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      el.classList.remove('pulse');
      void el.getBoundingClientRect();
      el.classList.add('pulse');
      window.setTimeout(() => el.classList.remove('pulse'), 1200);
    }),
  );
}

export function Search() {
  const url = useUrl();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = useMemo(() => search(papers, q), [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
      if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const choose = (id: string) => {
    url.openPaper(id);
    setOpen(false);
    setQ('');
    input.current?.blur();
    locatePaper(id);
  };

  return (
    <div className="search" role="search">
      <input
        ref={input}
        type="search"
        className="search__input"
        placeholder="Search papers  /"
        aria-label="Search papers"
        role="combobox"
        aria-expanded={open && q !== ''}
        aria-controls={listId}
        aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && results[active]) {
            e.preventDefault();
            choose(results[active].id);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            setQ('');
            input.current?.blur();
          }
        }}
      />
      {open && q.trim() !== '' && (
        <ul className="search__results" id={listId} role="listbox" aria-label="Search results">
          {results.length === 0 && <li className="search__none">No papers match “{q}”.</li>}
          {results.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'search__item is-active' : 'search__item'}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(p.id);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="search__name">{p.short_name}</span>
              <span className="search__year">{p.year}</span>
              <LevelChip level={p.level} />
              <span className="search__title">{p.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
