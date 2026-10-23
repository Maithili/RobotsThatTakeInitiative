// Evaluations page (SPEC §8). It has no filters: Maithili removed them on Oct 22 2026, pending her redesign (§16).
// The page ignores the global filters and its old params (loop, term, category, metric, dataset).
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { LoopPill, TermDot } from '../../components/Chip.tsx';
import { EmptyState } from '../../components/EmptyState.tsx';
import { Math as TeX } from '../../components/Math.tsx';
import { datasetById, db, FRAMEWORK_PAPER, onEvaluations, paperById, paperLabel, papers, PAPER_URL, tx } from '../../data.ts';
import { categoryItems, DIRECTION, itemSummary, termTags, unitText, type MetricDirection, type MetricItem, type TermTag } from '../../lib/metrics.ts';
import type { DbPaper } from '../../schema.ts';
import { useUrl } from '../../state/url.ts';
import { DatasetTable } from './DatasetTable.tsx';
import { FeaturedChart } from './FeaturedChart.tsx';
import { furthestLoop, interactionOf, mergePaper, type PaperEvalRow, type RealismOrder } from './merge.ts';
import { RealismPlot } from './RealismPlot.tsx';

const TERMS = Object.keys(tx.net_value.terms);
const LOOPS = Object.keys(tx.loop_types);
const METRICS = Object.keys(tx.metrics);
const CATEGORIES = Object.keys(tx.metric_categories);
const REALISM_ORDER: RealismOrder = {
  robot: Object.keys(tx.realism.robot.levels),
  human: Object.keys(tx.realism.human.levels),
  environment: Object.keys(tx.realism.environment.levels),
  interaction: Object.keys(tx.realism.interaction.levels),
  interactionOf: (loop) => interactionOf({ loop }, tx.loop_types),
};
const ACTION_SPACE_ORDER = Object.keys(tx.action_space_complexity.levels);

const categoryOf = (m: string) => tx.metrics[m]?.category;

/** Level scope (SPEC §6.2) and `evaluations_exclude` (§8.4): this page counts and shows only these papers. */
const inScope = (r: { paper: string }) => {
  const p = paperById.get(r.paper);
  return !!p && onEvaluations(p);
};
const paperRows: PaperEvalRow[] = papers
  .filter((p) => onEvaluations(p) && (p.evaluations ?? []).length)
  .map((p) => mergePaper(p, LOOPS, REALISM_ORDER, { order: CATEGORIES, of: categoryOf }, ACTION_SPACE_ORDER));

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

function metricsForTerm(term: string) {
  return METRICS.filter((m) => LISTED.has(m) && tx.metrics[m].terms.includes(term));
}

// ---------- 8.1 net value navigator ----------

function NetValueNavigator({ hoverTerms }: { hoverTerms: Set<string> }) {
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
          // Not a button: terms filter nothing (SPEC §8.1). Focus still shows the definition.
          return (
            <div key={t} className={`term term--${t}${hoverTerms.has(t) ? ' is-hot' : ''}`} tabIndex={0} aria-describedby={`term-def-${t}`} data-testid={`term-${t}`}>
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
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------- 8.4 protocols table: one row per paper ----------

type PSort = 'paper' | 'year' | 'env' | 'loop' | 'human' | 'categories' | 'baselines';

/** A row's sort value. An empty string means the cell shows "—". */
function pval(r: PaperEvalRow, k: PSort): string | number {
  const name = (d: string) => (datasetById.get(d)?.name ?? d).toLowerCase();
  switch (k) {
    case 'paper':
      return r.paper.short_name.toLowerCase();
    case 'year':
      return r.paper.year;
    case 'env':
      // By the names the cell shows.
      return [...r.environments, ...r.datasets].map(name).join(',');
    case 'loop':
      return furthestLoop(r, LOOPS);
    case 'human':
      return r.humans.join('; ').toLowerCase();
    case 'categories':
      // By the first category in category order, then the next.
      return r.categories.map((c) => String(CATEGORIES.indexOf(c)).padStart(2, '0')).join(',');
    case 'baselines':
      return r.baselines.length + r.otherBaselines.length;
  }
}

/** Ascending or descending, with empty cells ("—") last either way. */
function compareRows(va: string | number, vb: string | number, dir: 1 | -1): number {
  const ea = va === '';
  const eb = vb === '';
  if (ea !== eb) return ea ? 1 : -1;
  return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
}

function ProtocolTable({ rows }: { rows: PaperEvalRow[] }) {
  const url = useUrl();
  const [sort, setSort] = useState<{ key: PSort; dir: 1 | -1 }>({ key: 'loop', dir: 1 });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const sorted = [...rows].sort((a, b) => {
    // The framework paper stays first under every sort (SPEC §8.4).
    const fa = a.paper.id === FRAMEWORK_PAPER ? 0 : 1;
    const fb = b.paper.id === FRAMEWORK_PAPER ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return compareRows(pval(a, sort.key), pval(b, sort.key), sort.dir) || a.paper.year - b.paper.year || a.paper.short_name.localeCompare(b.paper.short_name);
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
  if (!rows.length) return <EmptyState>No evaluation in the database yet.</EmptyState>;
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
                    <a className="tag tag--framework" href={PAPER_URL} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()}>
                      Framework paper ↗
                    </a>
                  )}
                </td>
                <td className="num">{r.paper.year}</td>
                <td>
                  <span className="chips">
                    {r.categories.length ? (
                      r.categories.map((c) => (
                        <span key={c} className="chip chip--category" data-category={c}>
                          {tx.metric_categories[c].label}
                        </span>
                      ))
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </span>
                </td>
                <td>
                  <span className="chips">
                    {r.environments.map((d) => (
                      <span key={d} className="chip chip--dataset">
                        {datasetById.get(d)?.name ?? d}
                      </span>
                    ))}
                    {r.datasets.map((d) => (
                      <span key={d} className="chip">
                        {datasetById.get(d)?.name ?? d}
                      </span>
                    ))}
                    {!r.environments.length && !r.datasets.length && <span className="muted">—</span>}
                  </span>
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

/** ↑ or ↓. There is no mixed arrow: a group whose members differ gives each member its own (SPEC §8.6). */
function Direction({ direction, testId }: { direction: MetricDirection; testId: string }) {
  const d = DIRECTION[direction];
  return (
    <span className="metric-row__arrow" role="img" aria-label={d.label} title={d.label} data-testid={testId}>
      {d.glyph}
    </span>
  );
}

function Unit({ units, testId }: { units: string[]; testId: string }) {
  return (
    <span className="metric-row__unit" data-testid={testId}>
      {units.map(unitText).join(', ')}
    </span>
  );
}

/** A name followed by its arrow and unit. The last word stays on one line with them, so a unit never wraps alone. */
function NameLine({ label, strong, children }: { label: string; strong?: boolean; children: ReactNode }) {
  const cut = label.lastIndexOf(' ') + 1;
  const Name = strong ? 'strong' : 'span';
  return (
    <>
      {cut > 0 && <Name>{label.slice(0, cut)}</Name>}
      <span className="metric-row__glue">
        <Name>{label.slice(cut)}</Name>
        {children}
      </span>
    </>
  );
}

/** Static ΔV and ΔC tags (SPEC §8.6). Renders nothing when there are none. */
function TermTags({ tags, className, testId }: { tags: TermTag[]; className: string; testId: string }) {
  if (!tags.length) return null;
  return (
    <span className={className} data-testid={testId}>
      {tags.map((t) => (
        <span key={t} className="term-tag">
          {t}
        </span>
      ))}
    </span>
  );
}

function MetricRow({ item, onHoverTerms }: { item: MetricItem; onHoverTerms: (t: string[]) => void }) {
  const url = useUrl();
  const key = item.id;
  const { label, definition } = item.group ? tx.metric_groups[key] : tx.metrics[key];
  const sum = itemSummary(item, tx.metrics, TERMS);
  const users = ROW_PAPERS.get(key) ?? [];
  // A group whose members differ in direction lists its members, each with its own arrow, and with its own unit
  // when the units differ too. Otherwise the units follow the row's name and arrow.
  const mixed = sum.direction === null;
  const oneUnit = sum.units.length === 1;
  // Hovering a row highlights its terms in the navigator (SPEC §8.1). The row filters nothing.
  return (
    <li className="metric-row" onMouseEnter={() => onHoverTerms(sum.terms)} onMouseLeave={() => onHoverTerms([])} data-testid={`metric-row-${key}`}>
      <div className="metric-row__main">
        <span className="metric-row__name">
          <NameLine label={label} strong>
            {sum.direction && (
              <>
                {' '}
                <Direction direction={sum.direction} testId={`metric-dir-${key}`} />
              </>
            )}
            {(!mixed || oneUnit) && (
              <>
                {' '}
                <Unit units={sum.units} testId={`metric-unit-${key}`} />
              </>
            )}
          </NameLine>
          {mixed && (
            <span className="metric-row__members" data-testid={`metric-members-${key}`}>
              {item.members.map((m) => (
                <span key={m} className="metric-row__member">
                  <NameLine label={tx.metrics[m].label}>
                    {' '}
                    <Direction direction={tx.metrics[m].direction} testId={`metric-dir-${m}`} />
                    {!oneUnit && (
                      <>
                        {' '}
                        <Unit units={[tx.metrics[m].unit]} testId={`metric-unit-${m}`} />
                      </>
                    )}
                  </NameLine>
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="metric-row__def">{definition}</span>
      </div>
      <span className="metric-row__papers" role="group" aria-label={`Papers that use ${label}`}>
        {users.map((p, i) => (
          <Fragment key={p.id}>
            {i > 0 && ', '}
            <button type="button" className="linkish metric-row__paper" onClick={() => url.openPaper(p.id)}>
              {p.short_name}
            </button>
          </Fragment>
        ))}
      </span>
      <TermTags tags={termTags(sum.terms)} className="metric-row__tags" testId={`metric-tags-${key}`} />
    </li>
  );
}

/** Collapsed boxes persist per viewer. With nothing stored, every box is expanded (SPEC §8.6). */
const COLLAPSED_KEY = 'evaluations-collapsed-metric-boxes';

function readCollapsed(): Set<string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string' && BOXES.includes(c)) : []);
  } catch {
    return new Set();
  }
}

function writeCollapsed(s: Set<string>) {
  try {
    if (s.size) localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...s]));
    else localStorage.removeItem(COLLAPSED_KEY);
  } catch {
    // Storage blocked: the boxes still collapse for this visit.
  }
}

/** A category's tags: the union over the metrics it lists. */
const BOX_TAGS = new Map(BOXES.map((c) => [c, termTags((ITEMS.get(c) ?? []).flatMap((it) => it.members.flatMap((m) => tx.metrics[m].terms)))]));

function MetricsList({ onHoverTerms }: { onHoverTerms: (t: string[]) => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);
  useEffect(() => writeCollapsed(collapsed), [collapsed]);
  const toggle = (c: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  const allCollapsed = BOXES.length > 0 && BOXES.every((c) => collapsed.has(c));
  return (
    <section aria-labelledby="metrics-title" className="stack-sm">
      <div className="section-title">
        <h2 id="metrics-title">Metrics</h2>
        {BOXES.length > 0 && (
          <button type="button" className="linkish small section-title__end" data-testid="metric-collapse-all" onClick={() => setCollapsed(new Set(allCollapsed ? [] : BOXES))}>
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        )}
      </div>
      {!BOXES.length ? (
        <EmptyState>No paper on this page uses a categorized metric.</EmptyState>
      ) : (
        <div className="metric-boxes" data-testid="metric-boxes">
          {BOXES.map((c) => {
            const items = ITEMS.get(c) ?? [];
            const open = !collapsed.has(c);
            return (
              <section
                key={c}
                id={`metric-box-${c}`}
                className={`metric-box${open ? '' : ' is-collapsed'}`}
                aria-labelledby={`metric-box-title-${c}`}
                data-testid={`metric-box-${c}`}
              >
                <h3 className="metric-box__head">
                  <button
                    type="button"
                    className="metric-box__toggle"
                    aria-expanded={open}
                    aria-controls={`metric-rows-${c}`}
                    data-testid={`metric-box-toggle-${c}`}
                    onClick={() => toggle(c)}
                  >
                    <span className="metric-box__chev" aria-hidden="true">
                      {open ? '▾' : '▸'}
                    </span>
                    <span id={`metric-box-title-${c}`} className="metric-box__title">
                      {tx.metric_categories[c].label}
                    </span>
                    <TermTags tags={BOX_TAGS.get(c) ?? []} className="metric-box__tags" testId={`metric-box-tags-${c}`} />
                  </button>
                </h3>
                <ul className="metric-rows" id={`metric-rows-${c}`} hidden={!open}>
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
  const [hover, setHover] = useState<string[]>([]);
  const hoverTerms = new Set(hover);

  return (
    <div className="page">
      <div className="page__intro">
        <h1>Evaluations</h1>
      </div>
      <div className="eval-top">
        <NetValueNavigator hoverTerms={hoverTerms} />
        <FeaturedChart />
      </div>
      <RealismPlot rows={paperRows} />
      <section aria-labelledby="proto-title" className="stack-sm">
        <div className="section-title">
          <h2 id="proto-title">Evaluation protocols</h2>
          <span className="small muted">{paperRows.length} papers</span>
        </div>
        <ProtocolTable rows={paperRows} />
      </section>
      <MetricsList onHoverTerms={setHover} />
      <DatasetTable />
    </div>
  );
}
