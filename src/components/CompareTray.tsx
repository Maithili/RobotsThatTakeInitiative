import { useEffect, useRef, useState, type ReactNode } from 'react';
import { paperById, SUBS, tx } from '../data.ts';
import type { DbPaper } from '../schema.ts';
import { useUrl } from '../state/url.ts';
import { ActionChip, InputChip, KnownsChips, LevelChip, LoopPill, MetricChip } from './Chip.tsx';
import { StatusGlyph, StatusLegend } from './StatusGlyph.tsx';

interface Row {
  label: string;
  key: (p: DbPaper) => string;
  render: (p: DbPaper) => ReactNode;
}

const dash = <span className="muted">—</span>;

const ROWS: Row[] = [
  {
    label: 'Level',
    key: (p) => `${p.level}|${JSON.stringify(p.method?.knowns ?? null)}`,
    render: (p) => (
      <span className="stack-xs">
        <LevelChip level={p.level} />
        <KnownsChips knowns={p.method?.knowns} />
      </span>
    ),
  },
  { label: 'Family', key: (p) => p.method?.family ?? '', render: (p) => (p.method?.family ? tx.families[p.method.family]?.name : dash) },
  {
    label: 'Action types',
    key: (p) => (p.method?.action_types ?? []).join(),
    render: (p) => ((p.method?.action_types ?? []).length ? <span className="chips">{p.method!.action_types!.map((a) => <ActionChip key={a} type={a} />)}</span> : dash),
  },
  {
    label: 'Inputs',
    key: (p) => (p.method?.inputs ?? []).join(),
    render: (p) => ((p.method?.inputs ?? []).length ? <span className="chips">{p.method!.inputs!.map((a) => <InputChip key={a} id={a} />)}</span> : dash),
  },
  { label: 'Core strength', key: (p) => p.method?.core_strength ?? '', render: (p) => p.method?.core_strength ?? dash },
  ...SUBS.map<Row>((s) => ({
    label: tx.subproblems[s].short,
    key: (p) => p.subproblems?.[s]?.status ?? '',
    render: (p) => <StatusGlyph status={p.subproblems?.[s]?.status} />,
  })),
  {
    label: 'Evaluations',
    key: (p) => (p.evaluations ?? []).map((e) => `${e.loop}:${(e.metrics ?? []).join()}`).join('|'),
    render: (p) =>
      (p.evaluations ?? []).length ? (
        <ul className="plain stack-xs">
          {p.evaluations!.map((e) => (
            <li key={e.id} className="chips">
              <LoopPill loop={e.loop} />
              {(e.metrics ?? []).map((m) => (
                <MetricChip key={m} id={m} />
              ))}
            </li>
          ))}
        </ul>
      ) : (
        dash
      ),
  },
  { label: 'Year', key: (p) => String(p.year), render: (p) => p.year },
  {
    label: 'Links',
    key: (p) => p.id,
    render: (p) => (
      <span className="chips">
        {p.links.paper ? <a href={p.links.paper} target="_blank" rel="noreferrer">Paper ↗</a> : dash}
        {p.links.code && <a href={p.links.code} target="_blank" rel="noreferrer">Code ↗</a>}
      </span>
    ),
  },
];

function CompareView({ ps, onClose }: { ps: DbPaper[]; onClose: () => void }) {
  const url = useUrl();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="compare-title" tabIndex={-1} ref={ref}>
        <header className="modal__head">
          <h2 id="compare-title">Compare papers</h2>
          <p className="small muted">Rows where all papers match are greyed.</p>
          <button type="button" className="icon-btn" aria-label="Close comparison" onClick={onClose}>
            ×
          </button>
        </header>
        <StatusLegend className="sub-legend compare__legend" />
        <div className="scroll-x">
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Field</span>
                </th>
                {ps.map((p) => (
                  <th key={p.id} scope="col">
                    <button type="button" className="linkish" onClick={() => {
                      onClose();
                      url.openPaper(p.id);
                    }}>
                      {p.short_name}
                    </button>
                    <div className="small muted one-line">{p.title}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => {
                const same = ps.length > 1 && new Set(ps.map(r.key)).size === 1;
                return (
                  <tr key={r.label} className={same ? 'is-same' : undefined}>
                    <th scope="row">{r.label}</th>
                    {ps.map((p) => (
                      <td key={p.id}>{r.render(p)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function CompareTray() {
  const url = useUrl();
  const ids = url.list('compare');
  const ps = ids.map((id) => paperById.get(id)).filter((p): p is DbPaper => !!p);
  const [open, setOpen] = useState(false);
  if (!ps.length) return null;
  return (
    <>
      <div className="tray" role="region" aria-label="Compare tray" data-testid="compare-tray">
        <span className="tray__label">Compare</span>
        <span className="chips">
          {ps.map((p) => (
            <span key={p.id} className="chip">
              <button type="button" className="linkish" onClick={() => url.openPaper(p.id)}>
                {p.short_name}
              </button>
              <button type="button" className="chip__x" aria-label={`Unpin ${p.short_name}`} onClick={() => url.set({ compare: ids.filter((x) => x !== p.id) })}>
                ×
              </button>
            </span>
          ))}
        </span>
        <span className="tray__actions">
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setOpen(true)}>
            Compare{ps.length > 1 ? ` ${ps.length}` : ''}
          </button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => url.set({ compare: null })}>
            Clear
          </button>
        </span>
      </div>
      {open && <CompareView ps={ps} onClose={() => setOpen(false)} />}
    </>
  );
}
