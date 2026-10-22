import { Fragment, useMemo, useState } from 'react';
import { LoopPill, TermDot } from '../../components/Chip.tsx';
import { EmptyState } from '../../components/EmptyState.tsx';
import { FilterBar } from '../../components/FilterBar.tsx';
import { Math as TeX } from '../../components/Math.tsx';
import { datasetById, db, FRAMEWORK_PAPER, onEvaluations, paperById, paperLabel, papers, RTI_URL, tx } from '../../data.ts';
import { matchesGlobal } from '../../lib/filters.ts';
import { categoryItems, DIRECTION, itemServes, itemSummary, metricKeyMembers, type MetricItem } from '../../lib/metrics.ts';
import type { DbPaper } from '../../schema.ts';
import { useUrl } from '../../state/url.ts';
import { DatasetTable } from './DatasetTable.tsx';
import { FeaturedChart } from './FeaturedChart.tsx';
import { furthestLoop, mergePaper, rowMatches, type PaperEvalRow } from './merge.ts';
import { RealismPlot } from './RealismPlot.tsx';

const TERMS = Object.keys(tx.net_value.terms);
const LOOPS = Object.keys(tx.loop_types);
const METRICS = Object.keys(tx.metrics);
const CATEGORIES = Object.keys(tx.metric_categories);
const REALISM_ORDER = {
  robot: Object.keys(tx.realism.robot.levels),
  human: Object.keys(tx.realism.human.levels),
  environment: Object.keys(tx.realism.environment.levels),
};

const categoryOf = (m: string) => tx.metrics[m]?.category;
/** Uncategorized metrics never show on this page (SPEC §8.6), so they count toward no term. */
const shownTerms = (m: string) => (categoryOf(m) ? tx.metrics[m].terms : []);

/** Level scope (SPEC §6.2) and `evaluations_exclude` (§8.4): this page counts and shows only these papers. */
const inScope = (r: { paper: string }) => {
  const p = paperById.get(r.paper);
  return !!p && onEvaluations(p);
};
const paperRows: PaperEvalRow[] = papers
  .filter((p) => onEvaluations(p) && (p.evaluations ?? []).length)
  .map((p) => mergePaper(p, LOOPS, REALISM_ORDER, { order: CATEGORIES, of: categoryOf }));

/** Papers on this page that use each metric. */
const papersUsing = new Map(METRICS.map((m) => [m, new Set((db.metric_used_by[m] ?? []).filter(inScope).map((r) => r.paper))]));
/** Metrics the page lists: those with a category that a paper on the page uses (SPEC §8.6). */
const LISTED = new Set(METRICS.filter((m) => categoryOf(m) && papersUsing.get(m)!.size > 0));
/** One box per category that a paper on the page uses, in category order. */
const BOXES = CATEGORIES.filter((c) => METRICS.some((m) => LISTED.has(m) && categoryOf(m) === c));
const ITEMS = new Map(BOXES.map((c) => [c, categoryItems(c, tx.metrics, (m) => LISTED.has(m))]));
/** Papers on this page that use any metric in a row, by year and then short name. Keyed by metric or group id. */
const ROW_PAPERS = new Map<string, DbPaper[]>(
  [...ITEMS.values()].flat().map((it) => {
    const ids = new Set(it.members.flatMap((m) => [...papersUsing.get(m)!]));
    const ps = [...ids].map((id) => paperById.get(id)!).sort((a, b) => a.year - b.year || a.short_name.localeCompare(b.short_name));
    return [it.id, ps];
  }),
);

/** The metrics a `metric=` value stands for (a group id stands for its members), and their shared category. */
const keyMembers = (k: string) => metricKeyMembers(k, tx.metrics);
const keyCategory = (k: string) => categoryOf(keyMembers(k)[0]);
const keyLabel = (k: string) => tx.metrics[k]?.label ?? tx.metric_groups[k]?.label ?? k;

function metricsForTerm(term: string) {
  return METRICS.filter((m) => LISTED.has(m) && tx.metrics[m].terms.includes(term));
}

// ---------- 8.1 net value navigator ----------

function NetValueNavigator({ hoverTerms }: { hoverTerms: Set<string> }) {
  const url = useUrl();
  const term = url.get('term');
  return (
    <section className="card netvalue" aria-labelledby="nv-title">
      <h2 id="nv-title" className="sr-only">
        Net value
      </h2>
      <div className="netvalue__eq">
        <TeX tex={tx.net_value.headline} display />
      </div>
      <p className="netvalue__cf small">{tx.net_value.counterfactual}</p>
      <div className="terms" role="group" aria-label="Net value terms">
        {TERMS.map((t) => {
          const T = tx.net_value.terms[t];
          const n = metricsForTerm(t).length;
          const on = term === t;
          return (
            <button
              key={t}
              type="button"
              className={`term term--${t}${on ? ' is-on' : ''}${hoverTerms.has(t) ? ' is-hot' : ''}`}
              aria-pressed={on}
              aria-describedby={`term-def-${t}`}
              data-testid={`term-${t}`}
              onClick={() => url.set({ term: on ? null : t })}
            >
              <span className="term__top">
                <TermDot term={t} />
                <TeX tex={T.tex} />
                <span className="term__count">{n}</span>
              </span>
              <span className="term__label">{T.label.split('·')[1]?.trim() ?? T.label}</span>
              <span className="term__def" id={`term-def-${t}`} role="tooltip">
                {T.definition}
              </span>
              {n === 0 && <span className="term__none">No metric in the database measures this term yet.</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---------- 8.4 protocols table: one row per paper ----------

type PSort = 'paper' | 'year' | 'env' | 'loop' | 'human' | 'categories' | 'baselines';

function pval(r: PaperEvalRow, k: PSort): string | number {
  switch (k) {
    case 'paper':
      return r.paper.short_name.toLowerCase();
    case 'year':
      return r.paper.year;
    case 'env':
      return [...r.environments, ...r.datasets].join();
    case 'loop':
      return furthestLoop(r, LOOPS);
    case 'human':
      return r.humans.join();
    case 'categories':
      // By the first category in category order, then the next; papers with none sort last.
      return r.categories.map((c) => String(CATEGORIES.indexOf(c)).padStart(2, '0')).join(',') || '~';
    case 'baselines':
      return r.baselines.length + r.otherBaselines.length;
  }
}

function ProtocolTable({ rows }: { rows: PaperEvalRow[] }) {
  const url = useUrl();
  const category = url.get('category');
  const [sort, setSort] = useState<{ key: PSort; dir: 1 | -1 }>({ key: 'loop', dir: 1 });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const sorted = [...rows].sort((a, b) => {
    // The framework paper stays first under every sort (SPEC §8.4).
    const fa = a.paper.id === FRAMEWORK_PAPER ? 0 : 1;
    const fb = b.paper.id === FRAMEWORK_PAPER ? 0 : 1;
    if (fa !== fb) return fa - fb;
    const va = pval(a, sort.key);
    const vb = pval(b, sort.key);
    return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir || a.paper.year - b.paper.year || a.paper.short_name.localeCompare(b.paper.short_name);
  });
  const cols: [PSort, string][] = [
    ['paper', 'Paper'],
    ['year', 'Year'],
    ['categories', 'Metric categories'],
    ['env', 'Environment and datasets'],
    ['loop', 'Loop types'],
    ['human', 'Human models'],
    ['baselines', 'Baselines'],
  ];
  if (!rows.length) return <EmptyState>No evaluation matches these filters.</EmptyState>;
  return (
    <div className="scroll-x">
      <table className="table" data-testid="protocol-table">
        <thead>
          <tr>
            {cols.map(([k, label]) => (
              <th key={k} scope="col" aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                <button
                  type="button"
                  className="th-sort"
                  data-testid={`psort-${k}`}
                  onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : 1 }))}
                >
                  {label}
                  <span aria-hidden="true">{sort.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const nb = r.baselines.length + r.otherBaselines.length;
            const isOpen = open.has(r.paper.id);
            const framework = r.paper.id === FRAMEWORK_PAPER;
            return (
              <tr
                key={r.paper.id}
                className={`clickable${framework ? ' is-framework' : ''}`}
                onClick={() => url.openPaper(r.paper.id)}
                data-testid={`protocol-${r.paper.id}`}
              >
                <td>
                  <button
                    type="button"
                    className="linkish strong"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      url.openPaper(r.paper.id);
                    }}
                  >
                    {r.paper.short_name}
                  </button>
                  {framework && (
                    <a className="tag tag--framework" href={RTI_URL} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()}>
                      Framework paper ↗
                    </a>
                  )}
                </td>
                <td className="num">{r.paper.year}</td>
                <td>
                  <span className="chips">
                    {r.categories.length ? (
                      r.categories.map((c) => {
                        const on = category === c;
                        return (
                          <button
                            key={c}
                            type="button"
                            className={`chip chip--category${on ? ' chip--on' : ''}`}
                            aria-pressed={on}
                            data-category={c}
                            title={on ? 'Clear the category filter' : 'Filter protocols by this category and highlight its metrics'}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              selectCategory(url, on ? null : c);
                              if (!on) revealBox(c);
                            }}
                          >
                            {tx.metric_categories[c].label}
                          </button>
                        );
                      })
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </span>
                </td>
                <td>
                  {r.environments.map((d) => (
                    <span key={d} className="chip chip--dataset">
                      {datasetById.get(d)?.name ?? d}
                    </span>
                  ))}{' '}
                  {r.datasets.map((d) => (
                    <span key={d} className="chip">
                      {datasetById.get(d)?.name ?? d}
                    </span>
                  ))}
                  {!r.environments.length && !r.datasets.length && <span className="muted">—</span>}
                </td>
                <td>
                  <span className="chips">{r.loops.length ? r.loops.map((l) => <LoopPill key={l} loop={l} />) : <span className="muted">—</span>}</span>
                </td>
                <td>{r.humans.length ? r.humans.join('; ') : <span className="muted">—</span>}</td>
                <td>
                  {nb ? (
                    <>
                      <button
                        type="button"
                        className="linkish"
                        aria-expanded={isOpen}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setOpen((s) => {
                            const n = new Set(s);
                            if (n.has(r.paper.id)) n.delete(r.paper.id);
                            else n.add(r.paper.id);
                            return n;
                          });
                        }}
                      >
                        {nb} {isOpen ? '▴' : '▾'}
                      </button>
                      {isOpen && (
                        <ul className="plain small baselines">
                          {r.baselines.map((b) => (
                            <li key={b}>
                              <button
                                type="button"
                                className="linkish"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  url.openPaper(b);
                                }}
                              >
                                {paperLabel(b)}
                              </button>
                            </li>
                          ))}
                          {r.otherBaselines.map((b) => (
                            <li key={b} className="muted">
                              {b}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------- 8.6 metrics: one box per category, one row per metric or group ----------

/** Sets `category=`, and drops a `metric=` outside that category, so the two filters never contradict. */
function selectCategory(url: ReturnType<typeof useUrl>, c: string | null) {
  const metric = url.get('metric');
  url.set({ category: c, ...(c && metric && keyCategory(metric) !== c ? { metric: null } : {}) });
}

/** Scrolls a category's box into view and pulses it once (SPEC §8.6). */
function revealBox(c: string) {
  window.requestAnimationFrame(() => {
    const el = document.getElementById(`metric-box-${c}`);
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
    window.setTimeout(() => el.classList.remove('pulse'), 1200);
  });
}

function Direction({ direction, testId }: { direction: 'higher' | 'lower' | null; testId: string }) {
  const d = direction ? DIRECTION[direction] : { glyph: '↕', label: 'Direction differs by metric' };
  return (
    <span className="metric-row__arrow" role="img" aria-label={d.label} title={d.label} data-testid={testId}>
      {d.glyph}
    </span>
  );
}

/** Terms as dots with their symbols, or "No term". */
function TipTerms({ terms }: { terms: string[] }) {
  if (!terms.length) return <span className="muted">No term</span>;
  return (
    <span className="metric-tip__terms">
      {terms.map((t) => (
        <span key={t} className="metric-tip__term">
          <TermDot term={t} />
          <TeX tex={tx.net_value.terms[t].tex} />
        </span>
      ))}
    </span>
  );
}

/** The hover card of a row: term dots and units, per member for a group (SPEC §8.6). */
function MetricTip({ id, item }: { id: string; item: MetricItem }) {
  if (!item.group) {
    const M = tx.metrics[item.id];
    return (
      <span className="metric-tip" role="tooltip" id={id} data-testid={`metric-tip-${item.id}`}>
        <span className="metric-tip__row">
          <TipTerms terms={M.terms} />
          <span className="metric-tip__unit">{M.unit}</span>
        </span>
        {M.mapping_note && <span className="metric-tip__note">{M.mapping_note}</span>}
      </span>
    );
  }
  return (
    <span className="metric-tip" role="tooltip" id={id} data-testid={`metric-tip-${item.id}`}>
      {item.members.map((m) => {
        const M = tx.metrics[m];
        const d = DIRECTION[M.direction];
        return (
          <span key={m} className="metric-tip__row">
            <span className="metric-tip__name">
              {M.label}{' '}
              <span role="img" aria-label={d.label}>
                {d.glyph}
              </span>
            </span>
            <TipTerms terms={M.terms} />
            <span className="metric-tip__unit">{M.unit}</span>
          </span>
        );
      })}
    </span>
  );
}

function MetricRow({ item, onHoverTerms }: { item: MetricItem; onHoverTerms: (t: string[]) => void }) {
  const url = useUrl();
  const metric = url.get('metric');
  const category = url.get('category');
  const term = url.get('term');
  const key = item.id;
  const { label, definition } = item.group ? tx.metric_groups[key] : tx.metrics[key];
  const sum = itemSummary(item, tx.metrics, TERMS);
  const users = ROW_PAPERS.get(key) ?? [];
  const on = metric === key;
  // Under a term filter, rows that do not serve it dim rather than hide (SPEC §8.6).
  const dim = !itemServes(item, tx.metrics, term);
  const enter = () => onHoverTerms(sum.terms);
  const leave = () => onHoverTerms([]);
  const pick = () => {
    const c = keyCategory(key);
    url.set({ metric: on ? null : key, ...(!on && category && category !== c ? { category: null } : {}) });
  };
  return (
    <li
      className={`metric-row${on ? ' is-on' : ''}${dim ? ' is-dim' : ''}`}
      onClick={pick}
      onMouseEnter={enter}
      onMouseLeave={leave}
      data-testid={`metric-row-${key}`}
      data-dim={dim ? 'true' : 'false'}
    >
      <button type="button" className="metric-row__main" aria-pressed={on} aria-describedby={`metric-tip-${key}`} onFocus={enter} onBlur={leave}>
        <span className="metric-row__name">
          <strong>{label}</strong> <Direction direction={sum.direction} testId={`metric-dir-${key}`} />
        </span>
        <span className="metric-row__def">{definition}</span>
      </button>
      <span className="metric-row__papers" role="group" aria-label={`Papers that use ${label}`}>
        {users.map((p, i) => (
          <Fragment key={p.id}>
            {i > 0 && ', '}
            <button
              type="button"
              className="linkish metric-row__paper"
              onClick={(ev) => {
                ev.stopPropagation();
                url.openPaper(p.id);
              }}
            >
              {p.short_name}
            </button>
          </Fragment>
        ))}
      </span>
      <MetricTip id={`metric-tip-${key}`} item={item} />
    </li>
  );
}

function MetricsList({ onHoverTerms }: { onHoverTerms: (t: string[]) => void }) {
  const url = useUrl();
  const term = url.get('term');
  const category = url.get('category');
  return (
    <section aria-labelledby="metrics-title" className="stack-sm">
      <div className="section-title">
        <h2 id="metrics-title">Metrics</h2>
        <span className="small muted">Metrics by category, with the papers that use them. Hover a metric for its terms of ΔV − ΔC and its units. Click it to filter the protocols.</span>
      </div>
      {!BOXES.length ? (
        <EmptyState>No paper on this page uses a categorized metric.</EmptyState>
      ) : (
        <div className="metric-boxes" data-testid="metric-boxes">
          {BOXES.map((c) => {
            const items = ITEMS.get(c) ?? [];
            const on = category === c;
            const dim = !items.some((it) => itemServes(it, tx.metrics, term));
            return (
              <section
                key={c}
                id={`metric-box-${c}`}
                className={`metric-box${on ? ' is-on' : ''}${dim ? ' is-dim' : ''}`}
                aria-labelledby={`metric-box-title-${c}`}
                data-testid={`metric-box-${c}`}
              >
                <h3 id={`metric-box-title-${c}`} className="metric-box__title">
                  {tx.metric_categories[c].label}
                </h3>
                <ul className="metric-rows">
                  {items.map((it) => (
                    <MetricRow key={it.id} item={it} onHoverTerms={onHoverTerms} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------- page ----------

export function EvaluationsPage() {
  const url = useUrl();
  const [hover, setHover] = useState<string[]>([]);
  const hoverTerms = new Set(hover);
  const loop = url.get('loop');
  const term = url.get('term');
  const metric = url.get('metric');
  const category = url.get('category');
  const dataset = url.get('dataset');

  const rows = paperRows.filter(
    (r) =>
      matchesGlobal(r.paper, url.filters) &&
      rowMatches(r, { loop, term, metric, category, dataset, metricTerms: shownTerms, metricCategory: categoryOf, metricMembers: keyMembers }),
  );
  const matches = useMemo(() => new Set(rows.map((r) => r.paper.id)), [rows]);

  return (
    <div className="page">
      <div className="page__intro">
        <h1>Evaluations</h1>
        <p className="lede">How methods are scored: which terms of the net value each metric measures, and how close each evaluation comes to real use.</p>
      </div>
      <div className="eval-top">
        <NetValueNavigator hoverTerms={hoverTerms} />
        <FeaturedChart />
      </div>
      <RealismPlot rows={paperRows} matches={matches} />
      <FilterBar
        controls={['family', 'theme']}
        extra={
          <span className="filterbar__extra chips">
            <label className="colfilter">
              <span className="sr-only">Loop type</span>
              <select value={loop ?? ''} onChange={(e) => url.set({ loop: e.target.value || null })} data-testid="loop-filter" aria-label="Loop type">
                <option value="">All loop types</option>
                {LOOPS.map((l) => (
                  <option key={l} value={l}>
                    {tx.loop_types[l].label}
                  </option>
                ))}
              </select>
            </label>
            {term && (
              <span className="chip">
                <span className="muted">Term:</span> <TeX tex={tx.net_value.terms[term]?.tex ?? term} />
                <button type="button" className="chip__x" aria-label="Remove term filter" onClick={() => url.set({ term: null })}>
                  ×
                </button>
              </span>
            )}
            {category && (
              <span className="chip">
                <span className="muted">Category:</span> {tx.metric_categories[category]?.label ?? category}
                <button type="button" className="chip__x" aria-label="Remove category filter" onClick={() => url.set({ category: null })}>
                  ×
                </button>
              </span>
            )}
            {metric && (
              <span className="chip">
                <span className="muted">Metric:</span> {keyLabel(metric)}
                <button type="button" className="chip__x" aria-label="Remove metric filter" onClick={() => url.set({ metric: null })}>
                  ×
                </button>
              </span>
            )}
            {dataset && (
              <span className="chip">
                <span className="muted">Uses:</span> {datasetById.get(dataset)?.name}
                <button type="button" className="chip__x" aria-label="Remove dataset filter" onClick={() => url.set({ dataset: null })}>
                  ×
                </button>
              </span>
            )}
          </span>
        }
      />
      <section aria-labelledby="proto-title" className="stack-sm">
        <div className="section-title">
          <h2 id="proto-title">Evaluation protocols</h2>
          <span className="small muted">
            {rows.length} of {paperRows.length} papers
          </span>
        </div>
        <ProtocolTable rows={rows} />
      </section>
      <MetricsList onHoverTerms={setHover} />
      <DatasetTable />
    </div>
  );
}
