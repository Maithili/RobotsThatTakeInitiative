// Datasets and evaluation setups table (SPEC §8.5).
import { Fragment, useState } from 'react';
import { InputChip, LoopPill } from '../../components/Chip.tsx';
import { EmptyState } from '../../components/EmptyState.tsx';
import { datasetById, db, onEvaluations, paperById, paperLabel, tx } from '../../data.ts';
import type { DbDataset } from '../../schema.ts';
import { useUrl } from '../../state/url.ts';
import { datasetGroups } from './merge.ts';

const KIND_LABEL: Record<string, string> = { dataset: 'Dataset', evaluation_setup: 'Setup' };
const RELATION_LABEL: Record<string, string> = { extends: 'Extends', uses: 'Uses', validates_against: 'Validated against' };
const COLS = 12;
const LOOPS = Object.keys(tx.loop_types);

/** Level scope (SPEC §6.2): "used by" counts only papers the Evaluations page shows. */
const inScope = (r: { paper: string }) => {
  const p = paperById.get(r.paper);
  return !!p && onEvaluations(p);
};

/** `datasets` defaults to the database; tests pass a fixture. */
export function DatasetTable({ datasets = db.datasets }: { datasets?: DbDataset[] }) {
  const url = useUrl();
  const [kind, setKind] = useState('');
  const [sim, setSim] = useState('');
  const [goal, setGoal] = useState('');
  const [exec, setExec] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const nameOf = (id: string) => datasets.find((d) => d.id === id)?.name ?? datasetById.get(id)?.name ?? id;
  // Simulators never show as rows, only in the environment column (SPEC §8.5).
  const rows = datasets.filter(
    (d) =>
      d.kind !== 'simulator' &&
      (!kind || d.kind === kind) &&
      (!sim || d.sim_or_real === sim) &&
      (!goal || (d.goal_annotations ?? 'unknown') === goal) &&
      (!exec || (d.executable ?? 'unknown') === exec),
  );
  // Tangential datasets form their own group at the bottom, under a "Tangential" divider.
  const groups = datasetGroups(rows);
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

  const row = (d: DbDataset) => {
    const users = [...new Set(d.used_by.filter(inScope).map((u) => u.paper))];
    const active = url.get('dataset') === d.id;
    const cls = [flash === d.id && 'pulse', d.tangent && 'is-tangent'].filter(Boolean).join(' ') || undefined;
    return (
      <Fragment key={d.id}>
        <tr id={`ds-${d.id}`} className={cls} data-testid={`ds-row-${d.id}`} data-tangent={d.tangent ? 'true' : undefined}>
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
          <td>{d.environment ? <span className="chip chip--dataset">{nameOf(d.environment)}</span> : <span className="muted">—</span>}</td>
          <td>
            {(d.based_on ?? []).length ? (
              <ul className="plain small">
                {d.based_on!.map((b) => (
                  <li key={`${b.relation}:${b.id}`}>
                    {RELATION_LABEL[b.relation]}{' '}
                    <button type="button" className="linkish" onClick={() => jump(b.id)}>
                      {nameOf(b.id)}
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
                  {/* In scale order, as in the protocols table. */}
                  {LOOPS.filter((l) => (d.loops ?? []).includes(l)).map((l) => (
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
          <tr className={d.tangent ? 'info-row is-tangent' : 'info-row'}>
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
                            {nameOf(b.id)}
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
  };

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
          <tbody data-testid="ds-group-core">
            {groups.core.map(row)}
            {!rows.length && (
              <tr>
                <td colSpan={COLS}>
                  <EmptyState compact>No dataset or setup matches these column filters.</EmptyState>
                </td>
              </tr>
            )}
          </tbody>
          {groups.tangent.length > 0 && (
            <tbody data-testid="ds-group-tangent">
              <tr className="group-row ds-divider" data-testid="ds-tangent-divider">
                <th colSpan={COLS} scope="colgroup">
                  Tangential <span className="muted">· {groups.tangent.length}</span>
                </th>
              </tr>
              {groups.tangent.map(row)}
            </tbody>
          )}
        </table>
      </div>
    </section>
  );
}
