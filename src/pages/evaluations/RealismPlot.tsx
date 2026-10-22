// Evaluation realism plot (SPEC §8.3): environment realism (x) by human realism (y), task complexity as color,
// one dot per paper, a target past the top-right corner. Robot realism shows only in the hover card.
import { useEffect, useRef, useState } from 'react';
import { datasetById, FRAMEWORK_PAPER, paperLabel, tx } from '../../data.ts';
import { useUrl } from '../../state/url.ts';
import type { PaperEvalRow } from './merge.ts';
import { yearAfterName } from '../../lib/year.ts';

const R = 7;
const STEP = 2 * R + 5;
const CELL_W = 150;
const CELL_H = 54;
const LEFT = 150;
const TOP = 56;
const BOTTOM = 52;
const TARGET = 70;

/** CSS fill for a task-complexity level: one ramp step per level, in taxonomy order, gray when not assessed. */
export function complexityFill(id: string | null, order: string[]): string {
  const i = id ? order.indexOf(id) : -1;
  return i >= 0 ? `var(--complexity-${i + 1})` : 'var(--complexity-none)';
}

export function RealismPlot({ rows, matches }: { rows: PaperEvalRow[]; matches: Set<string> }) {
  const url = useUrl();
  const RX = Object.keys(tx.realism.environment.levels);
  const RY = Object.keys(tx.realism.human.levels);
  const TC = tx.task_complexity;
  const TC_ORDER = Object.keys(TC.levels);
  const placed = rows.filter((r) => r.realism.environment && r.realism.human);
  const skipped = rows.length - placed.length;
  const [card, setCard] = useState<{ row: PaperEvalRow; x: number; y: number } | null>(null);
  const closeTimer = useRef<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const W = LEFT + RX.length * CELL_W + TARGET;
  const H = TOP + RY.length * CELL_H + BOTTOM;
  const cellX = (i: number) => LEFT + i * CELL_W;
  const cellY = (j: number) => TOP + (RY.length - 1 - j) * CELL_H; // far at the bottom, close at the top

  // Pack dots per cell in year order.
  const byCell = new Map<string, PaperEvalRow[]>();
  for (const r of [...placed].sort((a, b) => a.paper.year - b.paper.year || a.paper.short_name.localeCompare(b.paper.short_name))) {
    const k = `${r.realism.environment}|${r.realism.human}`;
    byCell.set(k, [...(byCell.get(k) ?? []), r]);
  }
  const perRow = Math.max(1, Math.floor((CELL_W - 12) / STEP));
  const dots = [...byCell.entries()].flatMap(([k, rs]) => {
    const [rx, ry] = k.split('|');
    const i = RX.indexOf(rx);
    const j = RY.indexOf(ry);
    return rs.map((r, n) => ({ r, x: cellX(i) + 10 + R + (n % perRow) * STEP, y: cellY(j) + 10 + R + Math.floor(n / perRow) * STEP }));
  });
  const order = [...dots].sort((a, b) => a.r.paper.year - b.r.paper.year || a.r.paper.short_name.localeCompare(b.r.paper.short_name));

  const cancelClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setCard(null), 250);
  };
  useEffect(() => () => cancelClose(), []);
  const open = (row: PaperEvalRow, x: number, y: number) => {
    cancelClose();
    const svg = wrap.current?.querySelector('svg');
    const scale = svg ? svg.getBoundingClientRect().width / W : 1;
    setCard({ row, x: x * scale, y: y * scale });
  };
  const levelLabel = (axis: 'robot' | 'human' | 'environment', id: string | null) => (id ? tx.realism[axis].levels[id]?.label ?? id : 'Not stated');
  const complexityLabel = (id: string | null) => (id ? TC.levels[id]?.label ?? id : 'Not assessed');

  return (
    <section className="card realism" aria-labelledby="realism-title">
      <div className="section-title">
        <h2 id="realism-title">How close to the real target is each evaluation?</h2>
        <span className="small muted">One dot per paper, at the closest level it reaches on each axis. Click a dot for details.</span>
      </div>
      <div className="realism__wrap" ref={wrap} onMouseLeave={scheduleClose}>
        <svg viewBox={`0 0 ${W} ${H}`} className="realism__svg" role="group" aria-label="Evaluation realism plot" data-testid="realism-plot">
          {/* bands */}
          {RX.map((rx, i) =>
            RY.map((ry, j) => <rect key={`${rx}|${ry}`} x={cellX(i)} y={cellY(j)} width={CELL_W} height={CELL_H} className={`realism__cell${(i + j) % 2 ? ' is-alt' : ''}`} />),
          )}
          {/* axes */}
          {RX.map((rx, i) => (
            <text key={rx} x={cellX(i) + CELL_W / 2} y={TOP + RY.length * CELL_H + 18} textAnchor="middle" className="realism__tick" data-testid={`realism-x-${rx}`}>
              {tx.realism.environment.levels[rx].label}
            </text>
          ))}
          {RY.map((ry, j) => (
            <text key={ry} x={LEFT - 8} y={cellY(j) + CELL_H / 2 + 4} textAnchor="end" className="realism__tick" data-testid={`realism-y-${ry}`}>
              {tx.realism.human.levels[ry].label}
            </text>
          ))}
          <text x={LEFT + (RX.length * CELL_W) / 2} y={H - 8} textAnchor="middle" className="realism__axis">
            {tx.realism.environment.label} →
          </text>
          <text x={14} y={TOP + (RY.length * CELL_H) / 2} textAnchor="middle" className="realism__axis" transform={`rotate(-90 14 ${TOP + (RY.length * CELL_H) / 2})`}>
            {tx.realism.human.label} →
          </text>
          {/* target past the top-right corner */}
          <g className="realism__target" aria-label="Target: target users in their own setting" role="img">
            <circle cx={LEFT + RX.length * CELL_W + TARGET / 2} cy={TOP - 22} r={22} />
            <text x={LEFT + RX.length * CELL_W + TARGET / 2} y={TOP - 15} textAnchor="middle" className="realism__star">
              ★
            </text>
            <text x={LEFT + RX.length * CELL_W + TARGET / 2} y={TOP + 14} textAnchor="middle" className="realism__tick">
              Target
            </text>
          </g>
          {/* dots */}
          {order.map(({ r, x, y }) => {
            const dim = !matches.has(r.paper.id);
            const framework = r.paper.id === FRAMEWORK_PAPER;
            const assessed = !!r.complexity && r.complexity in TC.levels;
            return (
              <g
                key={r.paper.id}
                className={`realism__dot${dim ? ' is-dim' : ''}${framework ? ' is-framework' : ''}${assessed ? '' : ' is-unassessed'}`}
                tabIndex={0}
                role="button"
                aria-label={`${r.paper.short_name}, ${r.paper.year}: ${levelLabel('human', r.realism.human)}, ${levelLabel('environment', r.realism.environment)}, ${
                  assessed ? `${complexityLabel(r.complexity)} task complexity` : 'task complexity not assessed'
                }`}
                data-testid={`realism-dot-${r.paper.id}`}
                data-robot={r.realism.robot ?? ''}
                data-human={r.realism.human ?? ''}
                data-env={r.realism.environment ?? ''}
                data-complexity={r.complexity ?? ''}
                onMouseEnter={() => open(r, x, y)}
                onMouseLeave={scheduleClose}
                onFocus={() => open(r, x, y)}
                onClick={() => url.openPaper(r.paper.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    url.openPaper(r.paper.id);
                  }
                }}
              >
                {framework && <circle cx={x} cy={y} r={R + 3.5} className="realism__ring" />}
                <circle cx={x} cy={y} r={R} className="realism__fill" style={{ fill: complexityFill(r.complexity, TC_ORDER) }} />
                <circle cx={x} cy={y} r={R} className="realism__outline" />
              </g>
            );
          })}
        </svg>
        {card && (
          <div
            className="hovercard realism__card"
            style={{ left: Math.max(0, card.x - 20), top: card.y + 14 }}
            role="dialog"
            aria-label={`${card.row.paper.short_name} evaluation`}
            data-testid="realism-card"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <div className="hovercard__top">
              <strong>{card.row.paper.short_name}</strong>{yearAfterName(card.row.paper) !== null && <> <span className="muted">{card.row.paper.year}</span></>}
            </div>
            <div className="one-line small">{card.row.paper.title}</div>
            <div className="realism__links">
              {card.row.paper.links.paper && (
                <a className="btn btn--sm" href={card.row.paper.links.paper} target="_blank" rel="noreferrer">
                  Paper ↗
                </a>
              )}
              {card.row.paper.links.code && (
                <a className="btn btn--sm" href={card.row.paper.links.code} target="_blank" rel="noreferrer">
                  Code ↗
                </a>
              )}
            </div>
            <dl className="realism__levels small">
              <dt>People</dt>
              <dd>{levelLabel('human', card.row.realism.human)}</dd>
              <dt>Setting</dt>
              <dd>{levelLabel('environment', card.row.realism.environment)}</dd>
              <dt>Task complexity</dt>
              <dd data-testid="realism-card-complexity" title={card.row.complexity ? TC.levels[card.row.complexity]?.definition : undefined}>
                <svg width="10" height="10" aria-hidden="true" className="realism__swatch">
                  <circle cx="5" cy="5" r="4.5" style={{ fill: complexityFill(card.row.complexity, TC_ORDER) }} />
                </svg>
                {complexityLabel(card.row.complexity)}
              </dd>
              <dt>Robot</dt>
              <dd>{levelLabel('robot', card.row.realism.robot)}</dd>
              <dt>Loops</dt>
              <dd>{card.row.loops.map((l) => tx.loop_types[l]?.label ?? l).join('; ') || '—'}</dd>
              <dt>Data</dt>
              <dd>{[...card.row.environments, ...card.row.datasets].map((d) => datasetById.get(d)?.name ?? d).join(', ') || '—'}</dd>
            </dl>
          </div>
        )}
      </div>
      <ul className="legend small realism__legend" aria-label={`${TC.label} colors`} data-testid="complexity-legend">
        <li className="muted" title={TC.definition}>
          {TC.label}:
        </li>
        {TC_ORDER.map((id) => (
          <li key={id} title={TC.levels[id].definition} data-testid={`complexity-legend-${id}`}>
            <svg width="16" height="16" aria-hidden="true">
              <circle cx="8" cy="8" r="6" className="realism__fill" style={{ fill: complexityFill(id, TC_ORDER) }} />
              <circle cx="8" cy="8" r="6" className="realism__outline" />
            </svg>
            {TC.levels[id].label}
            <span className="sr-only">: {TC.levels[id].definition}</span>
          </li>
        ))}
        <li className="is-unassessed" title="No level recorded for this paper's evaluations yet." data-testid="complexity-legend-none">
          <svg width="16" height="16" aria-hidden="true">
            <circle cx="8" cy="8" r="6" className="realism__fill" style={{ fill: complexityFill(null, TC_ORDER) }} />
            <circle cx="8" cy="8" r="6" className="realism__outline" />
          </svg>
          Not assessed
        </li>
        <li>
          <svg width="18" height="18" aria-hidden="true">
            <circle cx="9" cy="9" r="7.5" className="realism__ring" />
          </svg>
          Framework paper
        </li>
        {Object.entries(tx.realism.human.levels)
          .filter(([, l]) => (l.refs ?? []).length)
          .map(([id, l]) => (
            <li key={id}>
              {l.label}: see{' '}
              {l.refs!.map((r) => (
                <button key={r} type="button" className="linkish" onClick={() => url.openPaper(r)}>
                  {paperLabel(r)}
                </button>
              ))}
            </li>
          ))}
      </ul>
      {skipped > 0 && (
        <p className="small muted" data-testid="realism-skipped">
          {skipped} paper{skipped === 1 ? '' : 's'} with evaluations but no stated people or setting level {skipped === 1 ? 'is' : 'are'} not plotted.
        </p>
      )}
      {tx.realism.source_url && (
        <p className="small muted realism__credit">
          Organization adapted from{' '}
          <a href={tx.realism.source_url} target="_blank" rel="noreferrer">
            this paper ↗
          </a>
          .
        </p>
      )}
    </section>
  );
}
