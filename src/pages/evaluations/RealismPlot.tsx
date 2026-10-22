// Evaluation realism plot (SPEC §8.3): interaction (x, from each evaluation's loop type) by human behavior realism (y),
// action space complexity as color, one dot per paper from its main evaluations, a target past the top-right corner.
// Setting and robot realism show only in the hover card.
import { useEffect, useRef, useState, type FocusEvent, type SyntheticEvent } from 'react';
import { datasetById, FRAMEWORK_PAPER, paperLabel, tx } from '../../data.ts';
import { useUrl } from '../../state/url.ts';
import type { PaperEvalRow } from './merge.ts';
import { yearAfterName } from '../../lib/year.ts';
import { useWidth } from './useWidth.ts';

const R = 7;
const STEP = 2 * R + 5;
const CELL_H = 58;
const TOP = 56;
const BOTTOM = 64;
const TICK_CHARS = 22;
/** The hover card's width (SPEC §8.3); it never runs past the plot's right edge. */
const CARD_W = 280;
/** The plot's widest drawing (the SVG's CSS max-width). */
const MAX_W = 760;

/** Plot geometry for an available width. From 640 px up, the full layout, scaled to fit. Narrower, a compact one
 *  drawn at about its screen size, so tick labels stay readable on a phone instead of shrinking with the plot. */
export function realismLayout(width: number, columns: number) {
  if (width >= 640) return { left: 170, cellW: 170, target: 70, tickChars: TICK_CHARS };
  const left = 104;
  const target = 46;
  return { left, cellW: Math.max(76, Math.min(170, Math.floor((width - left - target) / columns))), target, tickChars: 13 };
}

/** CSS fill for an action-space-complexity level: one ramp step per level, in taxonomy order, gray when not assessed. */
export function actionSpaceFill(id: string | null, order: string[]): string {
  const i = id ? order.indexOf(id) : -1;
  return i >= 0 ? `var(--action-space-${i + 1})` : 'var(--action-space-none)';
}

/** Splits a tick label into lines of at most `max` characters, at spaces. */
export function wrapLabel(s: string, max = TICK_CHARS): string[] {
  const lines: string[] = [];
  for (const w of s.split(' ')) {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + ' ' + w).length <= max) lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
  }
  return lines;
}

type Axis = 'robot' | 'human' | 'environment' | 'interaction';

export function RealismPlot({ rows, matches }: { rows: PaperEvalRow[]; matches: Set<string> }) {
  const url = useUrl();
  const RX = Object.keys(tx.realism.interaction.levels);
  const RY = Object.keys(tx.realism.human.levels);
  const AS = tx.action_space_complexity;
  const AS_ORDER = Object.keys(AS.levels);
  const placed = rows.filter((r) => r.realism.interaction && r.realism.human);
  const skipped = rows.length - placed.length;
  const [card, setCard] = useState<{ row: PaperEvalRow; left: number; top: number } | null>(null);
  const closeTimer = useRef<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const { left: LEFT, cellW: CELL_W, target: TARGET, tickChars } = realismLayout(Math.min(MAX_W, useWidth(wrap, MAX_W)), RX.length);

  const W = LEFT + RX.length * CELL_W + TARGET;
  const H = TOP + RY.length * CELL_H + BOTTOM;
  const cellX = (i: number) => LEFT + i * CELL_W;
  const cellY = (j: number) => TOP + (RY.length - 1 - j) * CELL_H; // far at the bottom, close at the top

  // Pack dots per cell, centered, by action space complexity (low first, not assessed last), then year.
  const rank = (r: PaperEvalRow) => (r.actionSpaceComplexity ? AS_ORDER.indexOf(r.actionSpaceComplexity) : AS_ORDER.length);
  const byCell = new Map<string, PaperEvalRow[]>();
  for (const r of [...placed].sort(
    (a, b) => rank(a) - rank(b) || a.paper.year - b.paper.year || a.paper.short_name.localeCompare(b.paper.short_name),
  )) {
    const k = `${r.realism.interaction}|${r.realism.human}`;
    byCell.set(k, [...(byCell.get(k) ?? []), r]);
  }
  const perRow = Math.max(1, Math.floor((CELL_W - 12) / STEP));
  const dots = [...byCell.entries()].flatMap(([k, rs]) => {
    const [rx, ry] = k.split('|');
    const i = RX.indexOf(rx);
    const j = RY.indexOf(ry);
    const rowsInCell = Math.ceil(rs.length / perRow);
    const top = cellY(j) + CELL_H / 2 - ((rowsInCell - 1) * STEP) / 2;
    return rs.map((r, n) => {
      const line = Math.floor(n / perRow);
      const inLine = Math.min(perRow, rs.length - line * perRow);
      const left = cellX(i) + CELL_W / 2 - ((inLine - 1) * STEP) / 2;
      return { r, x: left + (n % perRow) * STEP, y: top + line * STEP };
    });
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
  /** Opens the card under a dot, kept inside the plot's width so it never runs off a narrow screen. */
  const open = (row: PaperEvalRow, e: SyntheticEvent<SVGGElement>) => {
    cancelClose();
    const w = wrap.current;
    if (!w) return;
    const wr = w.getBoundingClientRect();
    const dr = e.currentTarget.getBoundingClientRect();
    const x = dr.left + dr.width / 2 - wr.left;
    setCard({ row, left: Math.max(0, Math.min(x - 20, wr.width - CARD_W)), top: dr.bottom - wr.top + 6 });
  };
  /** Keyboard: the card closes when focus leaves the plot and its card, or on Esc. */
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      cancelClose();
      setCard(null);
    }
  };
  const levelLabel = (axis: Axis, id: string | null) => (id ? tx.realism[axis].levels[id]?.label ?? id : 'Not stated');
  const actionSpaceLabel = (id: string | null) => (id ? AS.levels[id]?.label ?? id : 'Not assessed');
  const refLevels = (['interaction', 'human'] as const).flatMap((axis) =>
    Object.entries(tx.realism[axis].levels)
      .filter(([, l]) => (l.refs ?? []).length)
      .map(([id, l]) => ({ key: `${axis}-${id}`, label: l.label, refs: l.refs! })),
  );

  return (
    <section className="card realism" aria-labelledby="realism-title">
      <div className="section-title">
        <h2 id="realism-title">How close to the real target is each evaluation?</h2>
        <span className="small muted">One dot per paper, from its main evaluation. Click a dot for details.</span>
      </div>
      <div
        className="realism__wrap"
        ref={wrap}
        onMouseLeave={scheduleClose}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && card) {
            cancelClose();
            setCard(null);
          }
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="realism__svg" role="group" aria-label="Evaluation realism plot" data-testid="realism-plot">
          {/* bands */}
          {RX.map((rx, i) =>
            RY.map((ry, j) => <rect key={`${rx}|${ry}`} x={cellX(i)} y={cellY(j)} width={CELL_W} height={CELL_H} className={`realism__cell${(i + j) % 2 ? ' is-alt' : ''}`} />),
          )}
          {/* axes */}
          {RX.map((rx, i) => (
            <text key={rx} x={cellX(i) + CELL_W / 2} y={TOP + RY.length * CELL_H + 18} textAnchor="middle" className="realism__tick" data-testid={`realism-x-${rx}`}>
              {wrapLabel(tx.realism.interaction.levels[rx].label, tickChars).map((line, n) => (
                <tspan key={n} x={cellX(i) + CELL_W / 2} dy={n ? 13 : 0}>
                  {line}
                </tspan>
              ))}
            </text>
          ))}
          {RY.map((ry, j) => {
            const lines = wrapLabel(tx.realism.human.levels[ry].label, tickChars);
            return (
              <text
                key={ry}
                x={LEFT - 8}
                y={cellY(j) + CELL_H / 2 + 4 - ((lines.length - 1) * 13) / 2}
                textAnchor="end"
                className="realism__tick"
                data-testid={`realism-y-${ry}`}
              >
                {lines.map((line, n) => (
                  <tspan key={n} x={LEFT - 8} dy={n ? 13 : 0}>
                    {line}
                  </tspan>
                ))}
              </text>
            );
          })}
          <text x={LEFT + (RX.length * CELL_W) / 2} y={H - 8} textAnchor="middle" className="realism__axis">
            {tx.realism.interaction.label} →
          </text>
          <text x={14} y={TOP + (RY.length * CELL_H) / 2} textAnchor="middle" className="realism__axis" transform={`rotate(-90 14 ${TOP + (RY.length * CELL_H) / 2})`}>
            {tx.realism.human.label} →
          </text>
          {/* target past the top-right corner */}
          <g className="realism__target" aria-label="Target: real humans who adapt to the robot" role="img">
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
            const assessed = !!r.actionSpaceComplexity && r.actionSpaceComplexity in AS.levels;
            return (
              <g
                key={r.paper.id}
                className={`realism__dot${dim ? ' is-dim' : ''}${framework ? ' is-framework' : ''}${assessed ? '' : ' is-unassessed'}`}
                tabIndex={0}
                role="button"
                aria-label={`${r.paper.short_name}, ${r.paper.year}: ${levelLabel('interaction', r.realism.interaction)}, ${levelLabel('human', r.realism.human)}, ${
                  assessed ? `action space complexity ${actionSpaceLabel(r.actionSpaceComplexity)}` : 'action space complexity not assessed'
                }`}
                data-testid={`realism-dot-${r.paper.id}`}
                data-interaction={r.realism.interaction ?? ''}
                data-human={r.realism.human ?? ''}
                data-env={r.realism.environment ?? ''}
                data-robot={r.realism.robot ?? ''}
                data-action-space={r.actionSpaceComplexity ?? ''}
                onMouseEnter={(e) => open(r, e)}
                onMouseLeave={scheduleClose}
                onFocus={(e) => open(r, e)}
                onClick={() => url.openPaper(r.paper.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    url.openPaper(r.paper.id);
                  }
                }}
              >
                {framework && <circle cx={x} cy={y} r={R + 3.5} className="realism__ring" />}
                <circle cx={x} cy={y} r={R} className="realism__fill" style={{ fill: actionSpaceFill(r.actionSpaceComplexity, AS_ORDER) }} />
                <circle cx={x} cy={y} r={R} className="realism__outline" />
              </g>
            );
          })}
        </svg>
        {card && (
          <div
            className="hovercard realism__card"
            style={{ left: card.left, top: card.top }}
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
            <dl className="realism__levels small" data-testid="realism-card-levels">
              <dt>Interaction</dt>
              <dd data-testid="realism-card-interaction">{levelLabel('interaction', card.row.realism.interaction)}</dd>
              <dt>Human behavior</dt>
              <dd data-testid="realism-card-human">{levelLabel('human', card.row.realism.human)}</dd>
              <dt>{AS.label}</dt>
              <dd data-testid="realism-card-action-space" title={card.row.actionSpaceComplexity ? AS.levels[card.row.actionSpaceComplexity]?.definition : undefined}>
                <svg width="10" height="10" aria-hidden="true" className="realism__swatch">
                  <circle cx="5" cy="5" r="4.5" style={{ fill: actionSpaceFill(card.row.actionSpaceComplexity, AS_ORDER) }} />
                </svg>
                {actionSpaceLabel(card.row.actionSpaceComplexity)}
              </dd>
              <dt>Setting</dt>
              <dd data-testid="realism-card-setting">{levelLabel('environment', card.row.realism.environment)}</dd>
              <dt>Robot</dt>
              <dd data-testid="realism-card-robot">{levelLabel('robot', card.row.realism.robot)}</dd>
              <dt>All loops</dt>
              <dd>{card.row.loops.map((l) => tx.loop_types[l]?.label ?? l).join('; ') || '—'}</dd>
              <dt>Data</dt>
              <dd>{[...card.row.environments, ...card.row.datasets].map((d) => datasetById.get(d)?.name ?? d).join(', ') || '—'}</dd>
            </dl>
          </div>
        )}
      </div>
      <ul className="legend small realism__legend" aria-label={`${AS.label} colors`} data-testid="action-space-legend">
        <li className="muted" title={AS.definition}>
          {AS.label}:
        </li>
        <li
          className="realism__ramp-item"
          title={AS_ORDER.map((id) => `${AS.levels[id].label}: ${AS.levels[id].definition}`).join('\n')}
          data-testid="action-space-legend-ramp"
        >
          Low
          <span
            className="realism__ramp"
            aria-hidden="true"
            style={{ background: `linear-gradient(90deg, ${AS_ORDER.map((id) => actionSpaceFill(id, AS_ORDER)).join(', ')})` }}
          />
          High
          <span className="sr-only">
            {AS_ORDER.map((id) => ` ${AS.levels[id].label}: ${AS.levels[id].definition}`).join('')}
          </span>
        </li>
        <li className="is-unassessed" title="No level recorded for this paper's evaluations yet." data-testid="action-space-legend-none">
          <svg width="16" height="16" aria-hidden="true">
            <circle cx="8" cy="8" r="6" className="realism__fill" style={{ fill: actionSpaceFill(null, AS_ORDER) }} />
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
        {refLevels.map((l) => (
          <li key={l.key} data-testid={`realism-ref-${l.key}`}>
            {l.label}: see{' '}
            {l.refs.map((r) => (
              <button key={r} type="button" className="linkish" onClick={() => url.openPaper(r)}>
                {paperLabel(r)}
              </button>
            ))}
          </li>
        ))}
      </ul>
      {skipped > 0 && (
        <p className="small muted" data-testid="realism-skipped">
          {skipped} paper{skipped === 1 ? '' : 's'} with evaluations but no interaction or human behavior level {skipped === 1 ? 'is' : 'are'} not plotted.
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
