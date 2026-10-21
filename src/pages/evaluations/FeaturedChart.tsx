import { scaleBand, scaleLinear } from 'd3-scale';
import { useMemo, useState } from 'react';
import { evalById, paperLabel, tx } from '../../data.ts';
import { useUrl } from '../../state/url.ts';

const W = 640;
const H = 260;
const M = { top: 16, right: 12, bottom: 44, left: 40 };

/** Grouped bars from taxonomy.featured_comparison (SPEC §8.2). */
export function FeaturedChart() {
  const url = useUrl();
  const fc = tx.featured_comparison;
  const [closed, setClosed] = useState(false);
  const metric = tx.metrics[fc.metric];

  const data = useMemo(
    () =>
      fc.methods.map((m) => ({
        method: m,
        values: fc.columns.map((c, i) => {
          const r = evalById.get(c.evaluation)?.evaluation.results?.find((x) => x.method === m && x.metric === fc.metric);
          return { col: i, label: c.label, value: r?.value ?? null };
        }),
      })),
    [fc],
  );

  const cols = closed ? fc.columns.map((_, i) => i) : [0];
  const x0 = scaleBand<string>().domain(fc.methods).range([M.left, W - M.right]).paddingInner(0.28).paddingOuter(0.14);
  const x1 = scaleBand<number>().domain(cols).range([0, x0.bandwidth()]).padding(0.08);
  const y = scaleLinear().domain([0, 1]).range([H - M.bottom, M.top]);
  const ticks = y.ticks(5);

  return (
    <section className="card featured" aria-labelledby="featured-title">
      <div className="section-title">
        <h2 id="featured-title">{fc.title}</h2>
        <label className="check">
          <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} data-testid="add-closed-loop" />
          Add closed loop
        </label>
      </div>
      <p className="small muted">
        {metric?.label} for each method, scored offline{closed ? ' and in closed loop' : ''}. Click a bar to open the method.
      </p>
      <div className="featured__chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${fc.title}. ${metric?.label} by method and evaluation.`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} className="chart-grid" />
              <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="chart-tick">
                {t.toFixed(1)}
              </text>
            </g>
          ))}
          <text x={12} y={(H - M.bottom + M.top) / 2} transform={`rotate(-90 12 ${(H - M.bottom + M.top) / 2})`} textAnchor="middle" className="chart-tick">
            {metric?.label}
          </text>
          {data.map((d) => (
            <g key={d.method} transform={`translate(${x0(d.method)},0)`}>
              {d.values.map((v) => {
                const visible = cols.includes(v.col);
                const bx = visible ? (x1(v.col) ?? 0) : x0.bandwidth() / 2;
                const bw = visible ? x1.bandwidth() : 0;
                const val = v.value ?? 0;
                return (
                  <g key={v.col} className={`bar-g bar-g--${v.col}`}>
                    <rect
                      style={{ x: bx, y: visible ? y(val) : y(0), width: bw, height: visible ? y(0) - y(val) : 0 }}
                      className={`bar bar--${v.col}${visible ? '' : ' is-hidden'}`}
                      data-testid={visible ? 'featured-bar' : undefined}
                      aria-hidden={visible ? undefined : true}
                      tabIndex={visible ? 0 : -1}
                      role={visible ? 'button' : undefined}
                      aria-label={visible ? `${paperLabel(d.method)}, ${v.label}: ${v.value ?? 'no value'}` : undefined}
                      onClick={() => visible && url.openPaper(d.method)}
                      onKeyDown={(e) => {
                        if (visible && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          url.openPaper(d.method);
                        }
                      }}
                    />
                    <text
                      style={{ transform: `translate(${bx + bw / 2}px, ${(visible ? y(val) : y(0)) - 5}px)` }}
                      textAnchor="middle"
                      className={`bar-label${visible ? '' : ' is-hidden'}`}
                    >
                      {v.value === null ? '—' : v.value.toFixed(3)}
                    </text>
                  </g>
                );
              })}
              <text x={x0.bandwidth() / 2} y={H - M.bottom + 18} textAnchor="middle" className="chart-cat">
                {paperLabel(d.method)}
              </text>
            </g>
          ))}
          <line x1={M.left} x2={W - M.right} y1={y(0)} y2={y(0)} className="chart-axis" />
        </svg>
        <ul className="legend featured__legend">
          {fc.columns.map((c, i) => (
            <li key={c.evaluation} className={cols.includes(i) ? undefined : 'is-off'}>
              <span className={`swatch bar--${i}`} aria-hidden="true" /> {c.label}
            </li>
          ))}
        </ul>
      </div>
      <p className="small muted">Source: {fc.source}.</p>
    </section>
  );
}
