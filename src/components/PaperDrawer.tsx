import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { datasetById, fixUrl, pagesFor, paperById, paperLabel, SUBS, tx } from '../data.ts';
import { citationSourceText } from '../lib/citations.ts';
import { inMethodsGraph } from '../lib/scope.ts';
import type { DbPaper } from '../schema.ts';
import { applyParams, useUrl } from '../state/url.ts';
import { ActionChip, InputChip, KnownsChips, LevelChip, LoopPill, MetricChip, TangentTag } from './Chip.tsx';
import { Missing } from './EmptyState.tsx';
import { CaptureGlyph, StatusGlyph } from './StatusGlyph.tsx';

export const MAX_COMPARE = 3;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="drawer__section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/** `sourceOf` gives each link's hover text, such as where a citation comes from (SPEC §5.5). */
function PaperLinks({ ids, empty, sourceOf }: { ids: string[]; empty?: ReactNode; sourceOf?: (id: string) => string | undefined }) {
  const url = useUrl();
  if (!ids.length) return <>{empty ?? <span className="muted">—</span>}</>;
  return (
    <span className="link-list">
      {ids.map((id) => (
        <button key={id} type="button" className="linkish" title={sourceOf?.(id)} onClick={() => url.openPaper(id)}>
          {paperLabel(id)}
        </button>
      ))}
    </span>
  );
}

function Authors({ authors }: { authors: string[] }) {
  if (authors.length <= 6) return <>{authors.join(', ')}</>;
  return (
    <>
      {authors.slice(0, 6).join(', ')} <span className="muted" title={authors.slice(6).join(', ')}>+{authors.length - 6}</span>
    </>
  );
}

export function PinButton({ id, compact }: { id: string; compact?: boolean }) {
  const url = useUrl();
  const compare = url.list('compare');
  const pinned = compare.includes(id);
  const full = !pinned && compare.length >= MAX_COMPARE;
  return (
    <span className="pin">
      <button
        type="button"
        className={pinned ? 'btn btn--sm is-on' : 'btn btn--sm'}
        aria-pressed={pinned}
        disabled={full}
        onClick={() => url.set({ compare: pinned ? compare.filter((x) => x !== id) : [...compare, id] })}
      >
        {pinned ? 'Unpin' : compact ? 'Pin' : 'Pin to compare'}
      </button>
      {full && <span className="pin__msg">Compare holds {MAX_COMPARE}. Unpin one first.</span>}
    </span>
  );
}

function CopyBibtex({ bibtex }: { bibtex: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(bibtex);
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {done ? 'Copied' : 'Copy BibTeX'}
    </button>
  );
}

const PAGE_LABEL = { methods: 'Methods', evaluations: 'Evaluations', subproblems: 'Subproblems' } as const;

function DrawerBody({ p }: { p: DbPaper }) {
  const url = useUrl();
  const m = p.method;
  const subs = SUBS.filter((s) => p.subproblems?.[s]);
  const pages = pagesFor(p);

  return (
    <>
      <header className="drawer__head">
        <div className="drawer__meta">
          <strong className="drawer__short">{p.short_name}</strong>
          <span>{p.year}</span>
          {p.venue && <span className="muted">{p.venue}</span>}
          {p.type === 'survey' && <span className="tag">Survey</span>}
          {p.tangent && <TangentTag type={p.tangent} />}
        </div>
        <h2 id="drawer-title" className="drawer__title">
          {p.title}
        </h2>
        <p className="drawer__authors">
          <Authors authors={p.authors} />
        </p>
        <div className="drawer__links">
          {p.links.paper ? (
            <a className="btn btn--sm" href={p.links.paper} target="_blank" rel="noreferrer">
              Paper ↗
            </a>
          ) : (
            <span className="muted small">
              Paper link <Missing href={fixUrl(p, 'links.paper')} />
            </span>
          )}
          {p.links.code && (
            <a className="btn btn--sm" href={p.links.code} target="_blank" rel="noreferrer">
              Code ↗
            </a>
          )}
          {p.links.project && (
            <a className="btn btn--sm" href={p.links.project} target="_blank" rel="noreferrer">
              Project ↗
            </a>
          )}
          {p.bibtex && <CopyBibtex bibtex={p.bibtex} />}
        </div>
      </header>

      <Section title="Level">
        {m ? (
          <div className="drawer__level">
            <KnownsChips knowns={m.knowns} />
            {m.knowns && (
              <>
                <span aria-hidden="true">→</span>
                {p.level ? <LevelChip level={p.level} /> : <span className="muted">not a level</span>}
              </>
            )}
            {p.level && <span className="muted small">{tx.levels[p.level].name}</span>}
          </div>
        ) : (
          <span className="muted">No method block. This work appears for its subproblems or evaluations.</span>
        )}
        {m?.family && (
          <p className="drawer__family">
            Family: <strong>{tx.families[m.family]?.name}</strong>
          </p>
        )}
        {p.tangent && (
          <p className="drawer__family" data-testid="drawer-tangent">
            Tangential category: <strong>{tx.tangent_types[p.tangent]?.label ?? p.tangent}</strong>
            {tx.tangent_types[p.tangent] && <span className="muted"> · {tx.tangent_types[p.tangent].definition}</span>}
          </p>
        )}
      </Section>

      {m && (
        <Section title="Core strength and modalities">
          <p className="one-line">{m.core_strength ?? <Missing href={fixUrl(p, 'method.core_strength')} />}</p>
          <div className="io">
            <span className="io__side">
              {(m.inputs ?? []).length ? m.inputs!.map((i) => <InputChip key={i} id={i} />) : <Missing href={fixUrl(p, 'method.inputs')} />}
            </span>
            <span className="io__arrow" aria-label="to">
              →
            </span>
            <span className="io__side">
              {(m.action_types ?? []).length ? m.action_types!.map((a) => <ActionChip key={a} type={a} />) : <Missing href={fixUrl(p, 'method.action_types')} />}
            </span>
          </div>
        </Section>
      )}

      {subs.length > 0 && (
        <Section title="Subproblems">
          <div className="sub-strip" role="list">
            {SUBS.map((s) => (
              <span key={s} className="sub-strip__cell" role="listitem" title={tx.subproblems[s].name}>
                <span className="sub-strip__id">{tx.subproblems[s].short}</span>
                <StatusGlyph status={p.subproblems?.[s]?.status} />
              </span>
            ))}
          </div>
          <ul className="sub-rows">
            {subs.map((s) => {
              const t = p.subproblems![s]!;
              return (
                <li key={s}>
                  <StatusGlyph status={t.status} />
                  <Link to={{ pathname: '/subproblems', search: applyParams(url.search, { sub: s }) }} className="sub-rows__id" title={tx.subproblems[s].name}>
                    {tx.subproblems[s].short}
                  </Link>
                  <span className="sub-rows__note">{t.note}</span>
                  <span className={`rel rel--${t.relation}`}>{tx.relations[t.relation].label}</span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {(p.evaluations ?? []).length > 0 && (
        <Section title="Evaluations">
          <ul className="eval-list">
            {p.evaluations!.map((e) => (
              <li key={e.id}>
                <div className="eval-list__top">
                  <LoopPill loop={e.loop} />
                  {[e.environment, ...(e.datasets ?? [])].filter(Boolean).map((d) => (
                    <span key={d!} className="chip chip--dataset">
                      {datasetById.get(d!)?.name ?? d}
                    </span>
                  ))}
                </div>
                <div className="eval-list__metrics">
                  {(e.metrics ?? []).length ? e.metrics!.map((mt) => <MetricChip key={mt} id={mt} />) : <span className="muted small">Metrics not recorded</span>}
                </div>
                {e.captures && (
                  <div className="eval-list__caps small">
                    <span>
                      {tx.captures.state_drift.label} <CaptureGlyph value={e.captures.state_drift} label={tx.captures.state_drift.label} />
                    </span>
                    <span>
                      {tx.captures.goal_adaptation.label} <CaptureGlyph value={e.captures.goal_adaptation} label={tx.captures.goal_adaptation.label} />
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Lineage">
        <p className="small muted">Only papers in this database.</p>
        <dl className="lineage">
          <dt>Builds on</dt>
          <dd>
            <PaperLinks ids={m?.builds_on ?? []} empty={m ? <Missing href={fixUrl(p, 'method.builds_on')} /> : undefined} />
          </dd>
          <dt>Built upon by</dt>
          <dd>
            <PaperLinks ids={p.built_upon_by} />
          </dd>
          <dt>Benchmarks against</dt>
          <dd>
            <PaperLinks ids={p.benchmarks_against} />
          </dd>
          <dt>Benchmarked in</dt>
          <dd>
            <PaperLinks ids={p.benchmarked_in} />
          </dd>
          <dt>Cites</dt>
          <dd data-testid="drawer-cites">
            <PaperLinks ids={p.cites} sourceOf={(id) => citationSourceText(p.cite_sources?.[id])} />
          </dd>
          <dt>Cited by</dt>
          <dd data-testid="drawer-cited-by">
            <PaperLinks ids={p.cited_by} sourceOf={(id) => citationSourceText(paperById.get(id)?.cite_sources?.[p.id])} />
          </dd>
        </dl>
      </Section>

      {pages.length > 0 && (
        <Section title="Appears on">
          <span className="link-list">
            {pages.map((pg) => (
              <Link
                key={pg}
                to={{
                  pathname: `/${pg}`,
                  search: applyParams(url.search, pg === 'methods' && inMethodsGraph(p) ? { focus: p.id } : {}),
                }}
              >
                {PAGE_LABEL[pg]}
              </Link>
            ))}
          </span>
        </Section>
      )}

      <footer className="drawer__foot">
        <p className="small muted">Source: {p.provenance}</p>
        <div className="drawer__foot-actions">
          <a className="btn btn--sm" href={fixUrl(p)} target="_blank" rel="noreferrer">
            Suggest a correction ↗
          </a>
          <PinButton id={p.id} />
        </div>
      </footer>
    </>
  );
}

export function PaperDrawer() {
  const url = useUrl();
  const id = url.get('paper');
  const p = id ? paperById.get(id) : undefined;
  const panel = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!p) return;
    if (!returnFocus.current) returnFocus.current = document.activeElement as HTMLElement;
    panel.current?.focus({ preventScroll: true });
    panel.current?.scrollTo({ top: 0 });
  }, [p]);

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        url.set({ paper: null });
        const el = returnFocus.current;
        returnFocus.current = null;
        if (el && document.contains(el)) el.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, url]);

  if (!id) return null;
  return (
    <aside ref={panel} className="drawer" role="dialog" aria-modal="false" aria-labelledby="drawer-title" tabIndex={-1} data-testid="drawer">
      <button type="button" className="drawer__close icon-btn" aria-label="Close" onClick={() => url.set({ paper: null })}>
        ×
      </button>
      {p ? (
        <DrawerBody p={p} />
      ) : (
        <div className="drawer__head">
          <h2 id="drawer-title" className="drawer__title">
            No paper “{id}”
          </h2>
          <p className="muted">It may have been renamed or removed.</p>
        </div>
      )}
    </aside>
  );
}
