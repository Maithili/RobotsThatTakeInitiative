import { Fragment, useMemo, useState } from 'react';
import { InputChip, LoopPill, MetricChip, TermDot } from '../../components/Chip.tsx';
import { EmptyState } from '../../components/EmptyState.tsx';
import { FilterBar } from '../../components/FilterBar.tsx';
import { Math as TeX } from '../../components/Math.tsx';
import { CaptureGlyph } from '../../components/StatusGlyph.tsx';
import { datasetById, db, evalRows, paperLabel, tx, type EvalRow } from '../../data.ts';
import { matchesGlobal } from '../../lib/filters.ts';
import { toggleInList, useUrl } from '../../state/url.ts';
import { FeaturedChart } from './FeaturedChart.tsx';

const TERMS = Object.keys(tx.net_value.terms);
const LOOPS = Object.keys(tx.loop_types);
const METRICS = Object.keys(tx.metrics);

function metricsForTerm(term: string) {
  return METRICS.filter((m) => tx.metrics[m].terms.includes(term));
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

// ---------- 8.3 loop-type scale ----------

function LoopScale() {
  const url = useUrl();
  const loops = url.list('loop');
  const counts = useMemo(() => Object.fromEntries(LOOPS.map((l) => [l, evalRows.filter((r) => r.evaluation.loop === l).length])), []);
  return (
    <section className="card" aria-labelledby="loop-title">
      <div className="section-title">
        <h2 id="loop-title">How close to real use is the evaluation?</h2>
        <span className="small muted">Click steps to filter the protocols table.</span>
      </div>
      <ol className="loopscale">
        {LOOPS.map((l, i) => {
          const L = tx.loop_types[l];
          const on = loops.includes(l);
          return (
            <li key={l} className={`loopscale__step loopscale__step--${i}${on ? ' is-on' : ''}`}>
              <button type="button" aria-pressed={on} onClick={() => url.set({ loop: toggleInList(loops, l) })} data-testid={`loop-${l}`}>
                <span className="loopscale__top">
                  <strong>{L.label}</strong>
                  <span className="loopscale__count">{counts[l]}</span>
                </span>
                <span className="small">{L.definition}</span>
              </button>
              {(L.refs ?? []).length > 0 && (
                <span className="loopscale__refs small">
                  See{' '}
                  {L.refs!.map((r) => (
                    <button key={r} type="button" className="linkish" onClick={() => url.openPaper(r)}>
                      {paperLabel(r)}
                    </button>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <ul className="legend small captures-legend" aria-label="Captures legend">
        <li>
          <strong>{tx.captures.state_drift.label}:</strong> {tx.captures.state_drift.definition}
        </li>
        <li>
          <strong>{tx.captures.goal_adaptation.label}:</strong> {tx.captures.goal_adaptation.definition}
        </li>
        <li>
          <span className="glyph">●</span> yes <span className="glyph">◐</span> partial <span className="glyph">○</span> no <span className="muted">—</span> not recorded
        </li>
      </ul>
    </section>
  );
}

// ---------- 8.4 protocols table ----------

type PSort = 'paper' | 'env' | 'loop' | 'human' | 'metrics' | 'drift' | 'adapt' | 'baselines';
const CAP_ORDER = { yes: 2, partial: 1, no: 0 } as const;

function pval(r: EvalRow, k: PSort): string | number {
  const e = r.evaluation;
  switch (k) {
    case 'paper':
      return r.paper.short_name.toLowerCase();
    case 'env':
      return [e.environment, ...(e.datasets ?? [])].filter(Boolean).join();
    case 'loop':
      return LOOPS.indexOf(e.loop);
    case 'human':
      return e.human_model ?? '';
    case 'metrics':
      return (e.metrics ?? []).length;
    case 'drift':
      return e.captures?.state_drift ? CAP_ORDER[e.captures.state_drift] : -1;
    case 'adapt':
      return e.captures?.goal_adaptation ? CAP_ORDER[e.captures.goal_adaptation] : -1;
    case 'baselines':
      return (e.baselines ?? []).length + (e.other_baselines ?? []).length;
  }
}

function ProtocolTable({ rows, onHoverMetric }: { rows: EvalRow[]; onHoverMetric: (m: string | null) => void }) {
  const url = useUrl();
  const [sort, setSort] = useState<{ key: PSort; dir: 1 | -1 }>({ key: 'loop', dir: 1 });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const sorted = [...rows].sort((a, b) => {
    const va = pval(a, sort.key);
    const vb = pval(b, sort.key);
    return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir || a.paper.year - b.paper.year;
  });
  const cols: [PSort, string][] = [
    ['paper', 'Paper'],
    ['env', 'Environment and datasets'],
    ['loop', 'Loop type'],
    ['human', 'Human model'],
    ['metrics', 'Metrics'],
    ['drift', tx.captures.state_drift.label],
    ['adapt', tx.captures.goal_adaptation.label],
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
                <button type="button" className="th-sort" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : 1 }))}>
                  {label}
                  <span aria-hidden="true">{sort.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const e = r.evaluation;
            const nb = (e.baselines ?? []).length + (e.other_baselines ?? []).length;
            const isOpen = open.has(e.id);
            return (
              <tr key={e.id} className="clickable" onClick={() => url.openPaper(r.paper.id)} data-testid={`protocol-${e.id}`}>
                <td>
                  <button type="button" className="linkish strong" onClick={(ev) => {
                    ev.stopPropagation();
                    url.openPaper(r.paper.id);
                  }}>
                    {r.paper.short_name}
                  </button>{' '}
                  <span className="muted">{r.paper.year}</span>
                </td>
                <td>
                  {e.environment && <span className="chip chip--dataset">{datasetById.get(e.environment)?.name}</span>}{' '}
                  {(e.datasets ?? []).map((d) => (
                    <span key={d} className="chip">
                      {datasetById.get(d)?.name ?? d}
                    </span>
                  ))}
                  {!e.environment && !(e.datasets ?? []).length && <span className="muted">—</span>}
                </td>
                <td>
                  <LoopPill loop={e.loop} />
                </td>
                <td>{e.human_model ?? <span className="muted">—</span>}</td>
                <td>
                  <span className="chips">
                    {(e.metrics ?? []).length ? e.metrics!.map((m) => <MetricChip key={m} id={m} onHover={onHoverMetric} />) : <span className="muted">—</span>}
                  </span>
                </td>
                <td className="center">
                  <CaptureGlyph value={e.captures?.state_drift} label={tx.captures.state_drift.label} />
                </td>
                <td className="center">
                  <CaptureGlyph value={e.captures?.goal_adaptation} label={tx.captures.goal_adaptation.label} />
                </td>
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
                            if (n.has(e.id)) n.delete(e.id);
                            else n.add(e.id);
                            return n;
                          });
                        }}
                      >
                        {nb} {isOpen ? '▴' : '▾'}
                      </button>
                      {isOpen && (
                        <ul className="plain small baselines">
                          {(e.baselines ?? []).map((b) => (
                            <li key={b}>
                              <button type="button" className="linkish" onClick={(ev) => {
                                ev.stopPropagation();
                                url.openPaper(b);
                              }}>
                                {paperLabel(b)}
                              </button>
                            </li>
                          ))}
                          {(e.other_baselines ?? []).map((b) => (
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

// ---------- 8.5 datasets ----------

function DatasetTable() {
  const url = useUrl();
  const [kind, setKind] = useState('');
  const [sim, setSim] = useState('');
  const [goal, setGoal] = useState('');
  const [exec, setExec] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const rows = db.datasets.filter(
    (d) => (!kind || d.kind === kind) && (!sim || d.sim_or_real === sim) && (!goal || (d.goal_annotations ?? 'unknown') === goal) && (!exec || (d.executable ?? 'unknown') === exec),
  );
  const sel = (label: string, value: string, set: (v: string) => void, opts: string[]) => (
    <label className="colfilter">
      <select value={value} onChange={(e) => set(e.target.value)} aria-label={`Filter ${label}`}>
        <option value="">All</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
  const yn = (v: string | null | undefined) => v ?? <span className="muted">—</span>;
  return (
    <section aria-labelledby="ds-title" className="stack-sm">
      <div className="section-title">
        <h2 id="ds-title">Datasets and simulators</h2>
        <span className="small muted">Closed-loop evaluation needs executable user actions; goal inference needs goal annotations.</span>
      </div>
      <div className="scroll-x">
        <table className="table" data-testid="dataset-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Kind</th>
              <th scope="col">Sim or real</th>
              <th scope="col">Span</th>
              <th scope="col">Households or users</th>
              <th scope="col">Observations</th>
              <th scope="col">Goal annotations</th>
              <th scope="col">Executable</th>
              <th scope="col">Used by</th>
            </tr>
            <tr className="filter-row">
              <td />
              <td>{sel('kind', kind, setKind, ['dataset', 'simulator', 'benchmark'])}</td>
              <td>{sel('sim or real', sim, setSim, ['sim', 'real', 'both'])}</td>
              <td />
              <td />
              <td />
              <td>{sel('goal annotations', goal, setGoal, ['yes', 'partial', 'no', 'unknown'])}</td>
              <td>{sel('executable', exec, setExec, ['yes', 'no', 'unknown'])}</td>
              <td />
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const users = [...new Set(d.used_by.map((u) => u.paper))];
              const active = url.get('dataset') === d.id;
              return (
                <Fragment key={d.id}>
                  <tr>
                    <td>
                      <span className="ds-name">
                        {d.links.home ? (
                          <a href={d.links.home} target="_blank" rel="noreferrer" className="strong">
                            {d.name} ↗
                          </a>
                        ) : (
                          <strong>{d.name}</strong>
                        )}
                        <button
                          type="button"
                          className="info-btn"
                          aria-label={`About ${d.name}`}
                          aria-expanded={info === d.id}
                          onClick={() => setInfo((i) => (i === d.id ? null : d.id))}
                        >
                          i
                        </button>
                      </span>
                    </td>
                    <td>{d.kind}</td>
                    <td>{d.sim_or_real}</td>
                    <td>{yn(d.span)}</td>
                    <td className="num">{d.households_or_users ?? <span className="muted">—</span>}</td>
                    <td>{(d.observations ?? []).length ? d.observations!.map((o) => <InputChip key={o} id={o} />) : <span className="muted">—</span>}</td>
                    <td>{yn(d.goal_annotations)}</td>
                    <td>{yn(d.executable)}</td>
                    <td>
                      {users.length ? (
                        <button
                          type="button"
                          className={active ? 'btn btn--sm is-on' : 'btn btn--sm'}
                          aria-pressed={active}
                          onClick={() => url.set({ dataset: active ? null : d.id })}
                          title="Filter the protocols table to evaluations that use this"
                        >
                          {d.used_by.length} eval{d.used_by.length === 1 ? '' : 's'} · {users.map(paperLabel).join(', ')}
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                  {info === d.id && (
                    <tr className="info-row">
                      <td colSpan={9}>
                        <div className="info-panel small">
                          <p>{d.notes ?? <span className="muted">No notes.</span>}</p>
                          <p>
                            Introduced in:{' '}
                            {d.introduced_in ? (
                              <button type="button" className="linkish" onClick={() => url.openPaper(d.introduced_in!)}>
                                {paperLabel(d.introduced_in)}
                              </button>
                            ) : (
                              <span className="muted">—</span>
                            )}
                            {d.environment && <> · Runs in {datasetById.get(d.environment)?.name}</>}
                          </p>
                          <p className="muted">Source: {d.provenance}</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={9}>
                  <EmptyState compact>No dataset matches these column filters.</EmptyState>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------- 8.6 metrics ----------

function MetricsList({ onHoverMetric }: { onHoverMetric: (m: string | null) => void }) {
  const url = useUrl();
  const term = url.get('term');
  const metric = url.get('metric');
  const shown = term ? metricsForTerm(term) : METRICS;
  return (
    <section aria-labelledby="metrics-title" className="stack-sm">
      <div className="section-title">
        <h2 id="metrics-title">Metrics</h2>
        <span className="small muted">Which terms of ΔV − ΔC each metric measures. Click a row to filter protocols.</span>
      </div>
      {shown.length === 0 ? (
        <EmptyState>No metric in the database measures this term yet.</EmptyState>
      ) : (
        <ul className="metrics" data-testid="metrics-list">
          {shown.map((m) => {
            const M = tx.metrics[m];
            const on = metric === m;
            return (
              <li key={m}>
                <button
                  type="button"
                  className={on ? 'metric-row is-on' : 'metric-row'}
                  aria-pressed={on}
                  onClick={() => url.set({ metric: on ? null : m })}
                  onMouseEnter={() => onHoverMetric(m)}
                  onMouseLeave={() => onHoverMetric(null)}
                  onFocus={() => onHoverMetric(m)}
                  onBlur={() => onHoverMetric(null)}
                  data-testid={`metric-${m}`}
                >
                  <strong className="metric-row__label">{M.label}</strong>
                  <span className="metric-row__def small">{M.definition}</span>
                  <span className="chips">
                    {M.terms.map((t) => (
                      <span key={t} className="chip">
                        <TermDot term={t} /> <TeX tex={tx.net_value.terms[t].tex} />
                      </span>
                    ))}
                  </span>
                  <span className={`kind kind--${M.kind}`} title={tx.metric_kinds[M.kind]}>
                    {M.kind}
                  </span>
                  <span className="metric-row__used small muted">used in {db.metric_used_by[m]?.length ?? 0}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------- page ----------

export function EvaluationsPage() {
  const url = useUrl();
  const [hoverMetric, setHoverMetric] = useState<string | null>(null);
  const hoverTerms = new Set(hoverMetric ? tx.metrics[hoverMetric]?.terms ?? [] : []);
  const loops = url.list('loop');
  const term = url.get('term');
  const metric = url.get('metric');
  const dataset = url.get('dataset');

  const rows = evalRows.filter((r) => {
    const e = r.evaluation;
    if (!matchesGlobal(r.paper, url.filters)) return false;
    if (loops.length && !loops.includes(e.loop)) return false;
    if (term && !(e.metrics ?? []).some((m) => tx.metrics[m]?.terms.includes(term))) return false;
    if (metric && !(e.metrics ?? []).includes(metric)) return false;
    if (dataset && e.environment !== dataset && !(e.datasets ?? []).includes(dataset)) return false;
    return true;
  });

  return (
    <div className="page">
      <div className="page__intro">
        <h1>Evaluations</h1>
        <p className="lede">How methods are scored: which terms of the net value each metric measures, and whether the loop with the user is closed.</p>
      </div>
      <div className="eval-top">
        <NetValueNavigator hoverTerms={hoverTerms} />
        <FeaturedChart />
      </div>
      <LoopScale />
      <FilterBar
        controls={['level', 'family', 'theme']}
        extra={
          <span className="filterbar__extra chips">
            {term && (
              <span className="chip">
                <span className="muted">Term:</span> <TeX tex={tx.net_value.terms[term]?.tex ?? term} />
                <button type="button" className="chip__x" aria-label="Remove term filter" onClick={() => url.set({ term: null })}>
                  ×
                </button>
              </span>
            )}
            {metric && (
              <span className="chip">
                <span className="muted">Metric:</span> {tx.metrics[metric]?.label}
                <button type="button" className="chip__x" aria-label="Remove metric filter" onClick={() => url.set({ metric: null })}>
                  ×
                </button>
              </span>
            )}
            {loops.map((l) => (
              <span key={l} className="chip">
                <span className="muted">Loop:</span> {tx.loop_types[l]?.label}
                <button type="button" className="chip__x" aria-label={`Remove loop filter ${tx.loop_types[l]?.label}`} onClick={() => url.set({ loop: loops.filter((x) => x !== l) })}>
                  ×
                </button>
              </span>
            ))}
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
            {rows.length} of {evalRows.length}
          </span>
        </div>
        <ProtocolTable rows={rows} onHoverMetric={setHoverMetric} />
      </section>
      <MetricsList onHoverMetric={setHoverMetric} />
      <DatasetTable />
    </div>
  );
}
