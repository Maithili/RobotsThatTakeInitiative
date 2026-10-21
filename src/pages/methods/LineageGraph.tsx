import { brushX, type BrushBehavior } from 'd3-brush';
import { scaleBand } from 'd3-scale';
import { select } from 'd3-selection';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, InputChip, KnownsChips, LevelChip } from '../../components/Chip.tsx';
import { EmptyState } from '../../components/EmptyState.tsx';
import { tx } from '../../data.ts';
import { matchesGlobal } from '../../lib/filters.ts';
import { ancestry } from '../../lib/graph.ts';
import type { DbPaper, LevelId } from '../../schema.ts';
import { useUrl } from '../../state/url.ts';

const HEAD_W = 220;
const BAND_W = 150;
const NODE_W = 134;
const NODE_H = 28;
const GAP = 6;
const PAD = 12;
const AXIS_H = 44;

export interface Lane {
  id: string;
  level: LevelId;
  family: string | null;
  title: string;
  papers: DbPaper[];
}

/** Lanes top to bottom: one L2 sub-lane per family, "family not set", then L1, then L0. */
export function buildLanes(papers: DbPaper[]): Lane[] {
  const l2 = papers.filter((p) => p.level === 'L2');
  const lanes: Lane[] = Object.entries(tx.families).map(([fid, f]) => ({
    id: `L2:${fid}`,
    level: 'L2',
    family: fid,
    title: f.name,
    papers: l2.filter((p) => p.method?.family === fid),
  }));
  const unset = l2.filter((p) => !p.method?.family || !tx.families[p.method.family]);
  if (unset.length) lanes.push({ id: 'L2:none', level: 'L2', family: null, title: 'Family not set', papers: unset });
  lanes.push({ id: 'L1', level: 'L1', family: null, title: tx.levels.L1.name, papers: papers.filter((p) => p.level === 'L1') });
  lanes.push({ id: 'L0', level: 'L0', family: null, title: tx.levels.L0.name, papers: papers.filter((p) => p.level === 'L0') });
  return lanes;
}

interface Placed {
  p: DbPaper;
  x: number;
  y: number;
}

function HoverCard({ p, x, y }: { p: DbPaper; x: number; y: number }) {
  const m = p.method;
  return (
    <div className="hovercard" style={{ left: x, top: y }} role="tooltip">
      <div className="hovercard__top">
        <strong>{p.short_name}</strong> <span className="muted">{p.year}</span> <LevelChip level={p.level} />
      </div>
      <div className="one-line small">{p.title}</div>
      {m?.core_strength && <div className="small">{m.core_strength}</div>}
      <div className="io small">
        <span className="io__side">{(m?.inputs ?? []).length ? m!.inputs!.map((i) => <InputChip key={i} id={i} />) : <span className="muted">—</span>}</span>
        <span className="io__arrow">→</span>
        <span className="io__side">
          {(m?.action_types ?? []).length ? (
            m!.action_types!.map((a) => (
              <span key={a} className="chip chip--action">
                <ActionIcon type={a} /> {tx.action_types[a]?.label}
              </span>
            ))
          ) : (
            <span className="muted">—</span>
          )}
        </span>
      </div>
      <KnownsChips knowns={m?.knowns} />
    </div>
  );
}

export function LineageGraph({ papers }: { papers: DbPaper[] }) {
  const url = useUrl();
  const f = url.filters;
  const focus = url.get('focus');
  const showBaselines = url.get('edges') === 'baselines';
  const [hover, setHover] = useState<string | null>(null);
  const brushRef = useRef<SVGGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const brush = useRef<BrushBehavior<unknown> | null>(null);

  const lanes = useMemo(() => buildLanes(papers), [papers]);
  const shown = useMemo(() => lanes.flatMap((l) => l.papers), [lanes]);
  const years = useMemo(() => {
    if (!shown.length) return [] as number[];
    const ys = shown.map((p) => p.year);
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }, [shown]);
  const x = useMemo(() => scaleBand<number>().domain(years).range([0, years.length * BAND_W]).paddingInner(0), [years]);
  const plotW = years.length * BAND_W;

  // Stack nodes within lane × year; lane height grows to fit.
  const layout = useMemo(() => {
    const placed = new Map<string, Placed>();
    const laneBoxes: { lane: Lane; top: number; height: number }[] = [];
    let top = 0;
    for (const lane of lanes) {
      const byYear = new Map<number, DbPaper[]>();
      for (const p of [...lane.papers].sort((a, b) => a.short_name.localeCompare(b.short_name))) {
        byYear.set(p.year, [...(byYear.get(p.year) ?? []), p]);
      }
      const maxStack = Math.max(1, ...[...byYear.values()].map((v) => v.length));
      const height = Math.max(lane.level === 'L2' && lane.family ? 92 : 64, PAD * 2 + maxStack * (NODE_H + GAP) - GAP);
      for (const [yr, ps] of byYear) {
        ps.forEach((p, i) => placed.set(p.id, { p, x: (x(yr) ?? 0) + (BAND_W - NODE_W) / 2, y: top + PAD + i * (NODE_H + GAP) }));
      }
      laneBoxes.push({ lane, top, height });
      top += height;
    }
    return { placed, laneBoxes, height: top };
  }, [lanes, x]);

  const edges = useMemo(() => {
    const out: { from: string; to: string; kind: 'builds' | 'baseline' }[] = [];
    for (const p of shown) {
      for (const b of p.method?.builds_on ?? []) if (layout.placed.has(b)) out.push({ from: b, to: p.id, kind: 'builds' });
      if (showBaselines) {
        const bs = new Set((p.evaluations ?? []).flatMap((e) => e.baselines ?? []));
        for (const b of bs) if (layout.placed.has(b) && b !== p.id) out.push({ from: b, to: p.id, kind: 'baseline' });
      }
    }
    return out;
  }, [shown, layout, showBaselines]);

  const lit = useMemo(() => {
    if (!focus || !layout.placed.has(focus)) return null;
    const bo = Object.fromEntries(papers.map((p) => [p.id, p.method?.builds_on ?? []]));
    const { ancestors, descendants } = ancestry(focus, bo);
    return new Set([focus, ...ancestors, ...descendants]);
  }, [focus, layout, papers]);

  const matches = useMemo(() => new Set(shown.filter((p) => matchesGlobal(p, f)).map((p) => p.id)), [shown, f]);
  const activeLevels = new Set(f.level);

  // Esc clears the ancestry focus.
  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') url.set({ focus: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, url]);

  // Time brush on the year axis sets years=.
  useEffect(() => {
    const g = brushRef.current;
    if (!g || !years.length) return;
    const b = brushX<unknown>()
      .extent([
        [0, 0],
        [plotW, 26],
      ])
      .on('end', (ev: { selection: [number, number] | null; sourceEvent?: unknown }) => {
        if (!ev.sourceEvent) return; // programmatic move
        if (!ev.selection) {
          url.set({ years: null });
          return;
        }
        const [a, z] = ev.selection;
        const i0 = Math.max(0, Math.min(years.length - 1, Math.round(a / BAND_W)));
        const i1 = Math.max(i0, Math.min(years.length - 1, Math.round(z / BAND_W) - 1));
        url.set({ years: `${years[i0]}-${years[i1]}` });
      });
    brush.current = b;
    select(g).call(b);
    return () => {
      select(g).on('.brush', null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years, plotW]);

  // Keep the brush in step with years= (chips, Back, typed input).
  useEffect(() => {
    const g = brushRef.current;
    if (!g || !brush.current || !years.length) return;
    if (!f.years) {
      select(g).call(brush.current.move, null);
      return;
    }
    const i0 = Math.max(0, years.indexOf(Math.max(f.years[0], years[0])));
    const lastIdx = years.indexOf(Math.min(f.years[1], years[years.length - 1]));
    const i1 = lastIdx < 0 ? years.length - 1 : lastIdx;
    select(g).call(brush.current.move, [i0 * BAND_W, (i1 + 1) * BAND_W]);
  }, [f.years, years]);

  // Start scrolled to the most recent years, where most work sits.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [years.length]);

  if (!shown.length) {
    return <EmptyState>No classified methods match yet.</EmptyState>;
  }

  const hovered = hover ? layout.placed.get(hover) : undefined;
  const totalW = HEAD_W + plotW;

  return (
    <div className="lg" data-testid="lineage-graph">
      <div
        ref={scrollRef}
        className="lg__scroll"
        onClick={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('lg__lane') || (e.target as Element).tagName === 'svg') {
            if (focus) url.set({ focus: null });
          }
        }}
      >
        <div className="lg__canvas" style={{ width: totalW, height: layout.height + AXIS_H }}>
          {layout.laneBoxes.map(({ lane, top, height }) => {
            const fam = lane.family ? tx.families[lane.family] : null;
            const on = activeLevels.has(lane.level);
            return (
              <div
                key={lane.id}
                className={`lg__lane lg__lane--${lane.level}${on ? ' is-active' : ''}${activeLevels.size && !on ? ' is-dim' : ''}`}
                style={{ top, height, width: totalW }}
                data-testid={`lane-${lane.id}`}
                data-active={on ? 'true' : 'false'}
              >
                <div className="lg__head">
                  <div className="lg__head-top">
                    <span className={`level-chip level-chip--${lane.level}`}>{lane.level}</span>
                    <span className="lg__head-name">{lane.title}</span>
                    <span className="lg__count">{lane.papers.length}</span>
                  </div>
                  {fam?.scope_line && (
                    <div className="lg__scope" tabIndex={0} aria-describedby={`fam-${lane.family}`}>
                      {fam.scope_line}
                      <div className="lg__famtip" role="tooltip" id={`fam-${lane.family}`}>
                        <strong>{fam.name}</strong>
                        <span>{fam.definition}</span>
                        {fam.strength && (
                          <span>
                            <em>Strength.</em> {fam.strength}
                          </span>
                        )}
                        {(fam.limitations ?? []).map((l) => (
                          <span key={l}>
                            <em>Limitation.</em> {l}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {fam?.note && !fam.scope_line && <div className="lg__scope muted">{fam.note}</div>}
                </div>
                {lane.papers.length === 0 && (
                  <div className="lg__empty" style={{ left: HEAD_W + 12 }}>
                    <EmptyState compact>No {lane.level === 'L2' ? `${lane.title.toLowerCase()} ` : `${lane.level} `}works yet.</EmptyState>
                  </div>
                )}
              </div>
            );
          })}

          {/* year grid */}
          <svg className="lg__edges" width={plotW} height={layout.height} style={{ left: HEAD_W }} aria-hidden="true">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" className="lg__arrowhead" />
              </marker>
            </defs>
            {years.map((y) => (
              <line key={y} x1={x(y)} x2={x(y)} y1={0} y2={layout.height} className="lg__gridline" />
            ))}
            {edges.map((e) => {
              const a = layout.placed.get(e.from)!;
              const b = layout.placed.get(e.to)!;
              const sameCol = a.x === b.x;
              const x1 = sameCol ? a.x + NODE_W : a.x + NODE_W;
              const y1 = a.y + NODE_H / 2;
              const x2 = sameCol ? b.x + NODE_W : b.x;
              const y2 = b.y + NODE_H / 2;
              const d = sameCol
                ? `M${x1},${y1} C${x1 + 30},${y1} ${x2 + 30},${y2} ${x2},${y2}`
                : `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2 - 2},${y2}`;
              const dim = (lit && !(lit.has(e.from) && lit.has(e.to))) || !matches.has(e.from) || !matches.has(e.to);
              return (
                <path
                  key={`${e.kind}:${e.from}:${e.to}`}
                  d={d}
                  className={`lg__edge lg__edge--${e.kind}${dim ? ' is-dim' : ''}`}
                  markerEnd="url(#arrow)"
                  data-testid={`edge-${e.kind}`}
                />
              );
            })}
          </svg>

          {layout.laneBoxes.flatMap(({ lane }) =>
            [...lane.papers]
              .sort((a, b) => a.year - b.year || a.short_name.localeCompare(b.short_name))
              .map((p) => {
                const pos = layout.placed.get(p.id)!;
                const dim = !matches.has(p.id) || (lit !== null && !lit.has(p.id));
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`lg__node lg__node--${p.level}${dim ? ' is-dim' : ''}${focus === p.id ? ' is-focus' : ''}${lit?.has(p.id) && focus !== p.id ? ' is-lit' : ''}`}
                    style={{ left: HEAD_W + pos.x, top: pos.y, width: NODE_W, height: NODE_H }}
                    data-locate={p.id}
                    data-testid={`node-${p.id}`}
                    aria-label={`${p.short_name}, ${p.year}, ${p.level}`}
                    onMouseEnter={() => setHover(p.id)}
                    onMouseLeave={() => setHover((h) => (h === p.id ? null : h))}
                    onFocus={() => setHover(p.id)}
                    onBlur={() => setHover((h) => (h === p.id ? null : h))}
                    onClick={() => url.set({ focus: p.id, paper: p.id }, { push: true })}
                  >
                    <span className="lg__node-name">{p.short_name}</span>
                    <span className="lg__node-icons">
                      {(p.method?.action_types ?? []).map((a) => (
                        <ActionIcon key={a} type={a} />
                      ))}
                    </span>
                  </button>
                );
              }),
          )}

          {hovered && (
            <HoverCard
              p={hovered.p}
              x={Math.min(HEAD_W + hovered.x, totalW - 300)}
              y={hovered.y + NODE_H + 6 > layout.height - 120 ? Math.max(0, hovered.y - 128) : hovered.y + NODE_H + 6}
            />
          )}

          {/* year axis with time brush */}
          <div className="lg__axis" style={{ top: layout.height, width: totalW }}>
            <div className="lg__axis-head small muted">Year · drag to filter</div>
            <svg width={plotW} height={AXIS_H} style={{ left: HEAD_W }} className="lg__axis-svg" aria-label="Year axis. Drag to filter years.">
              {years.map((y) => (
                <text key={y} x={(x(y) ?? 0) + BAND_W / 2} y={17} textAnchor="middle" className="lg__year">
                  {y}
                </text>
              ))}
              <g ref={brushRef} transform="translate(0,4)" className="lg__brush" data-testid="year-brush" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
