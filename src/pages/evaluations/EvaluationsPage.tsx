import { Fragment, useMemo, useState } from 'react';
import { InputChip, LoopPill, MetricChip, TermDot } from '../../components/Chip.tsx';
import { EmptyState } from '../../components/EmptyState.tsx';
import { FilterBar } from '../../components/FilterBar.tsx';
import { Math as TeX } from '../../components/Math.tsx';
import { CaptureGlyph } from '../../components/StatusGlyph.tsx';
import { datasetById, db, FRAMEWORK_PAPER, paperLabel, papers, RTI_URL, tx } from '../../data.ts';
import { matchesGlobal } from '../../lib/filters.ts';
import { useUrl } from '../../state/url.ts';
import { FeaturedChart } from './FeaturedChart.tsx';
import { furthestLoop, mergePaper, rowMatches, type PaperEvalRow } from './merge.ts';
import { RealismPlot } from './RealismPlot.tsx';

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

// ---------- 8.4 protocols table: one row per paper ----------

type PSort = 'paper' | 'year' | 'env' | 'loop' | 'human' | 'metrics' | 'drift' | 'adapt' | 'baselines';
const CAP_ORDER = { yes: 2, partial: 1, no: 0 } as const;

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
    case 'metrics':
      return r.metrics.length;
    case 'drift':
      return r.drift ? CAP_ORDER[r.drift] : -1;
    case 'adapt':
      return r.adapt ? CAP_ORDER[r.adapt] : -1;
    case 'baselines':
      return r.baselines.length + r.otherBaselines.length;
  }
}

function ProtocolTable({ rows, onHoverMetric }: { rows: PaperEvalRow[]; onHoverMetric: (m: string | null) => void }) {
  const url = useUrl();
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
    ['env', 'Environment and datasets'],
    ['loop', 'Loop types'],
    ['human', 'Human models'],
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
                  <span className="chips">
                    {r.metrics.length ? r.metrics.map((m) => <MetricChip key={m} id={m} onHover={onHoverMetric} />) : <span className="muted">—</span>}
                  </span>
                </td>
                <td className="center">
                  <CaptureGlyph value={r.drift} label={tx.captures.state_drift.label} />
                </td>
                <td className="center">
                  <CaptureGlyph value={r.adapt} label={tx.captures.goal_adaptation.label} />
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

function CapturesLegend() {
  return (
    <ul className="legend small captures-legend" aria-label="Captures legend">
      <li>
        <strong>{tx.captures.state_drift.label}:</strong> {tx.captures.state_drift.definition}
      </li>
      <li>
        <strong>{tx.captures.goal_adaptation.label}:</strong> {tx.captures.goal_adaptation.definition}
      </li>
      <li>
        <span className="glyph">●</span> yes <span className="glyph">◐</span> partial <span className="glyph">○</span> no <span className="muted">—</span> not recorded. A paper
        with several entries shows its strongest value.
      </li>
    </ul>
  );
}

// ---------- 8.5 datasets and evaluation setups ----------

const KIND_LABEL: Record<string, string> = { dataset: 'Dataset', evaluation_setup: 'Setup' };
const RELATION_LABEL: Record<string, string> = { extends: 'Extends', uses: 'Uses', validates_against: 'Validated against' };

function DatasetTable() {
  const url = useUrl();
  const [kind, setKind] = useState('');
  const [sim, setSim] = useState('');
  const [goal, setGoal] = useState('');
  const [exec, setExec] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // Simulators never show as rows, only in the environment column (SPEC §8.5).
  const rows = db.datasets.filter(
    (d) =>
      d.kind !== 'simulator' &&
      (!kind || d.kind === kind) &&
      (!sim || d.sim_or_real === sim) &&
      (!goal || (d.goal_annotations ?? 'unknown') === goal) &&
      (!exec || (d.executable ?? 'unknown') === exec),
  );
  const sel = (label: string, value: string, set: (v: string) => void, opts: [string, string][]) => (
    <label className="colfilter">
      <select value={value} onChange={(e) => set(e.target.value)} aria-label={`Filter ${label}`}>
        <option value="">All</option>
        {opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  const plain = (vs: string[]) => vs.map((v) => [v, v] as [string, string]);
  const yn = (v: string | null | undefined) => v ?? <span className="muted">—</span>;
  const jump = (id: string) => {
    setKind('');
    setSim('');
    setGoal('');
    setExec('');
    setFlash(id);
    requestAnimationFrame(() => document.getElementById(`ds-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 1400);
  };
  const COLS = 12;
  return (
    <section aria-labelledby="ds-title" className="stack-sm">
      <div className="section-title">
        <h2 id="ds-title">Datasets and evaluation setups</h2>
        <span className="small muted">Closed-loop evaluation needs executable user actions; goal inference needs goal annotations.</span>
      </div>
      <div className="scroll-x">
        <table className="table" data-testid="dataset-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Kind</th>
              <th scope="col">Environment</th>
              <th scope="col">Based on</th>
              <th scope="col">Sim or real</th>
              <th scope="col">Span</th>
              <th scope="col">Households or users</th>
              <th scope="col">Observations</th>
              <th scope="col">Goal annotations</th>
              <th scope="col">Executable</th>
              <th scope="col">Human models and loops</th>
              <th scope="col">Used by</th>
            </tr>
            <tr className="filter-row">
              <td />
              <td>{sel('kind', kind, setKind, [['dataset', 'Dataset'], ['evaluation_setup', 'Setup']])}</td>
              <td />
              <td />
              <td>{sel('sim or real', sim, setSim, plain(['sim', 'real', 'both']))}</td>
              <td />
              <td />
              <td />
              <td>{sel('goal annotations', goal, setGoal, plain(['yes', 'partial', 'no', 'unknown']))}</td>
              <td>{sel('executable', exec, setExec, plain(['yes', 'no', 'unknown']))}</td>
              <td />
              <td />
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const users = [...new Set(d.used_by.map((u) => u.paper))];
              const active = url.get('dataset') === d.id;
              return (
                <Fragment key={d.id}>
                  <tr id={`ds-${d.id}`} className={flash === d.id ? 'pulse' : undefined} data-testid={`ds-row-${d.id}`}>
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
                    <td>{KIND_LABEL[d.kind] ?? d.kind}</td>
                    <td>{d.environment ? <span className="chip chip--dataset">{datasetById.get(d.environment)?.name ?? d.environment}</span> : <span className="muted">—</span>}</td>
                    <td>
                      {(d.based_on ?? []).length ? (
                        <ul className="plain small">
                          {d.based_on!.map((b) => (
                            <li key={`${b.relation}:${b.id}`}>
                              {RELATION_LABEL[b.relation]}{' '}
                              <button type="button" className="linkish" onClick={() => jump(b.id)}>
                                {datasetById.get(b.id)?.name ?? b.id}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{d.sim_or_real}</td>
                    <td>{yn(d.span)}</td>
                    <td className="num">{d.households_or_users ?? <span className="muted">—</span>}</td>
                    <td>{(d.observations ?? []).length ? d.observations!.map((o) => <InputChip key={o} id={o} />) : <span className="muted">—</span>}</td>
                    <td>{yn(d.goal_annotations)}</td>
                    <td>{yn(d.executable)}</td>
                    <td>
                      {d.kind === 'evaluation_setup' ? (
                        <span className="stack-xs small">
                          <span>{(d.human_models ?? []).join('; ') || <span className="muted">—</span>}</span>
                          <span className="chips">
                            {(d.loops ?? []).map((l) => (
                              <LoopPill key={l} loop={l} />
                            ))}
                          </span>
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {users.length ? (
                        <button
                          type="button"
                          className={active ? 'btn btn--sm is-on' : 'btn btn--sm'}
                          aria-pressed={active}
                          onClick={() => url.set({ dataset: active ? null : d.id })}
                          title="Filter the protocols table to evaluations that use this"
                        >
                          {users.map(paperLabel).join(', ')}
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                  {info === d.id && (
                    <tr className="info-row">
                      <td colSpan={COLS}>
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
                            {d.basis_of.length > 0 && (
                              <>
                                {' '}
                                · Basis of{' '}
                                {d.basis_of.map((b, i) => (
                                  <span key={b.id}>
                                    {i > 0 && ', '}
                                    <button type="button" className="linkish" onClick={() => jump(b.id)}>
                                      {datasetById.get(b.id)?.name ?? b.id}
                                    </button>
                                  </span>
                                ))}
                              </>
                            )}
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
                <td colSpan={COLS}>
                  <EmptyState compact>No dataset or setup matches these column filters.</EmptyState>
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

const REALISM_ORDER = {
  robot: Object.keys(tx.realism.robot.levels),
  human: Object.keys(tx.realism.human.levels),
  environment: Object.keys(tx.realism.environment.levels),
};
const paperRows: PaperEvalRow[] = papers.filter((p) => (p.evaluations ?? []).length).map((p) => mergePaper(p, LOOPS, REALISM_ORDER));

export function EvaluationsPage() {
  const url = useUrl();
  const [hoverMetric, setHoverMetric] = useState<string | null>(null);
  const hoverTerms = new Set(hoverMetric ? tx.metrics[hoverMetric]?.terms ?? [] : []);
  const loop = url.get('loop');
  const term = url.get('term');
  const metric = url.get('metric');
  const dataset = url.get('dataset');

  const rows = paperRows.filter(
    (r) => matchesGlobal(r.paper, url.filters) && rowMatches(r, { loop, term, metric, dataset, metricTerms: (m) => tx.metrics[m]?.terms ?? [] }),
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
            {metric && (
              <span className="chip">
                <span className="muted">Metric:</span> {tx.metrics[metric]?.label}
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
        <ProtocolTable rows={rows} onHoverMetric={setHoverMetric} />
        <CapturesLegend />
      </section>
      <MetricsList onHoverMetric={setHoverMetric} />
      <DatasetTable />
    </div>
  );
}
