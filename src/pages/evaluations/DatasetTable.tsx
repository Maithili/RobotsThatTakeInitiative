// Datasets and evaluation setups table (SPEC §8.5). No column filters since Oct 22 2026 (SPEC §16).
import { Fragment, useState } from 'react';
import { InputChip, LoopPill } from '../../components/Chip.tsx';
import { EmptyState } from '../../components/EmptyState.tsx';
import { datasetById, db, onEvaluations, paperById, paperLabel, tx } from '../../data.ts';
import type { DbDataset } from '../../schema.ts';
import { useUrl } from '../../state/url.ts';
import { datasetGroups } from './merge.ts';

const KIND_LABEL: Record<string, string> = { dataset: 'Dataset', evaluation_setup: 'Setup' };
const COLS = 7;
const LOOPS = Object.keys(tx.loop_types);

/** Level scope (SPEC §6.2): "used by" counts only papers the Evaluations page shows. */
const inScope = (r: { paper: string }) => {
  const p = paperById.get(r.paper);
  return !!p && onEvaluations(p);
};

/** `datasets` defaults to the database; tests pass a fixture. */
export function DatasetTable({ datasets = db.datasets }: { datasets?: DbDataset[] }) {
  const url = useUrl();
  const [info, setInfo] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const nameOf = (id: string) => datasets.find((d) => d.id === id)?.name ?? datasetById.get(id)?.name ?? id;
  // Simulators never show as rows, only in the environment column (SPEC §8.5).
  const rows = datasets.filter((d) => d.kind !== 'simulator');
  // The main group, then activity datasets and tangential ones, each under its own divider.
  const groups = datasetGroups(rows);
  const jump = (id: string) => {
    setFlash(id);
    requestAnimationFrame(() => document.getElementById(`ds-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 1400);
  };

  const row = (d: DbDataset) => {
    const users = [...new Set(d.used_by.filter(inScope).map((u) => u.paper))];
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
          <td>{d.sim_or_real}</td>
          <td>{d.span ?? <span className="muted">—</span>}</td>
          <td>
            {(d.observations ?? []).length ? (
              <span className="chips">
                {d.observations!.map((o) => (
                  <InputChip key={o} id={o} />
                ))}
              </span>
            ) : (
              <span className="muted">—</span>
            )}
          </td>
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
              <span data-testid={`ds-users-${d.id}`}>
                {users.map((u, i) => (
                  <Fragment key={u}>
                    {i > 0 && ', '}
                    <button type="button" className="linkish" onClick={() => url.openPaper(u)}>
                      {paperLabel(u)}
                    </button>
                  </Fragment>
                ))}
              </span>
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
                  ) : d.reference ? (
                    // A paper outside the database: a citation linked to its landing page.
                    <span data-testid={`ds-reference-${d.id}`}>
                      <a href={d.reference.url} target="_blank" rel="noreferrer">
                        {d.reference.title} ↗
                      </a>{' '}
                      {d.reference.authors}, {d.reference.venue} {d.reference.year}
                    </span>
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
        <span className="small muted">What each one records, and the papers on this page that use it.</span>
      </div>
      <div className="scroll-x">
        <table className="table" data-testid="dataset-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Kind</th>
              <th scope="col">Sim or real</th>
              <th scope="col">Span</th>
              <th scope="col">Modality</th>
              <th scope="col">Human models and loops</th>
              <th scope="col">Used by</th>
            </tr>
          </thead>
          <tbody data-testid="ds-group-core">
            {groups.core.map(row)}
            {!rows.length && (
              <tr>
                <td colSpan={COLS}>
                  <EmptyState compact>No dataset or setup in the database yet.</EmptyState>
                </td>
              </tr>
            )}
          </tbody>
          {groups.activity.length > 0 && (
            <tbody data-testid="ds-group-activity">
              <tr className="group-row ds-divider" data-testid="ds-activity-divider">
                <th colSpan={COLS} scope="colgroup">
                  Activity datasets <span className="muted">· {groups.activity.length}</span>
                </th>
              </tr>
              {groups.activity.map(row)}
            </tbody>
          )}
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
