// Methods top band (SPEC §7.1): level cards, a condensed timeline with one row per level, and the legend.
import { brushX, type BrushBehavior } from 'd3-brush';
import { select } from 'd3-selection';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, KnownsChips } from '../../components/Chip.tsx';
import { tx } from '../../data.ts';
import { EDGE_LABEL, EDGE_TYPES, edgeParam, parseEdgeTypes } from '../../lib/edges.ts';
import { matchesGlobal } from '../../lib/filters.ts';
import type { DbPaper, LevelId } from '../../schema.ts';
import { useUrl } from '../../state/url.ts';
import { BAND_LEVELS, CLUSTER_TINTS, GRAPH_LEVELS, TIMELINE_START, type FamilyInfo } from './constants.ts';

const PRE_W = 86;
const BREAK_W = 12;
const CHIP_H = 20;
const CHIP_GAP = 3;
const ROW_PAD = 6;

export interface Band {
  key: string;
  x0: number;
  x1: number;
  from: number;
  to: number;
  label: string;
  pre: boolean;
}

/** "Before" band (if any paper predates TIMELINE_START), a break, then one equal band per year. */
export function makeBands(width: number, minYear: number, maxYear: number): Band[] {
  const last = Math.max(maxYear, TIMELINE_START);
  const hasPre = minYear < TIMELINE_START;
  const nYears = last - TIMELINE_START + 1;
  const start = hasPre ? PRE_W + BREAK_W : 0;
  const bw = Math.max(1, (width - start) / nYears);
  const bands: Band[] = [];
  if (hasPre) bands.push({ key: 'pre', x0: 0, x1: PRE_W, from: minYear, to: TIMELINE_START - 1, label: `Before ${TIMELINE_START}`, pre: true });
  for (let i = 0; i < nYears; i++) {
    const y = TIMELINE_START + i;
    bands.push({ key: String(y), x0: start + i * bw, x1: start + (i + 1) * bw, from: y, to: y, label: String(y), pre: false });
  }
  return bands;
}

export function bandFor(bands: Band[], year: number): number {
  return bands.findIndex((b) => year >= b.from && year <= b.to);
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** `level=` names the selected card. It highlights that card's timeline row only (SPEC §6.2). */
function useSelectedLevel(): LevelId | null {
  const v = useUrl().get('level');
  return (BAND_LEVELS as readonly string[]).includes(v ?? '') ? (v as LevelId) : null;
}

function LevelCard({ level, count }: { level: LevelId; count: number }) {
  const url = useUrl();
  const L = tx.levels[level];
  const on = useSelectedLevel() === level;
  return (
    <button
      type="button"
      className={`levelcard levelcard--${level}${on ? ' is-on' : ''}`}
      aria-pressed={on}
      data-testid={`levelcard-${level}`}
      onClick={() => url.set({ level: on ? null : level })}
    >
      <span className="levelcard__top">
        <span className={`level-chip level-chip--${level}`}>{level}</span>
        <strong>{L.name}</strong>
        <span className="levelcard__count" aria-label={`${count} papers`}>
          {count}
        </span>
      </span>
      <KnownsChips knowns={L.knowns} />
      <span className="levelcard__def">{L.definition}</span>
    </button>
  );
}

function TimelineRow({
  level,
  papers,
  bands,
  width,
  hoverId,
  setHover,
}: {
  level: LevelId;
  papers: DbPaper[];
  bands: Band[];
  width: number;
  hoverId: string | null;
  setHover: (id: string | null) => void;
}) {
  const url = useUrl();
  const f = url.filters;
  const selected = useSelectedLevel() === level;
  const placed = useMemo(() => {
    const byBand = new Map<number, DbPaper[]>();
    for (const p of papers) {
      const i = bandFor(bands, p.year);
      if (i >= 0) byBand.set(i, [...(byBand.get(i) ?? []), p]);
    }
    const out: { p: DbPaper; band: Band; slot: number }[] = [];
    for (const [i, ps] of byBand) {
      ps.sort((a, b) => a.year - b.year || a.short_name.localeCompare(b.short_name)).forEach((p, slot) => out.push({ p, band: bands[i], slot }));
    }
    return out;
  }, [papers, bands]);
  const maxSlot = Math.max(0, ...placed.map((x) => x.slot + 1));
  const height = Math.max(44, ROW_PAD * 2 + maxSlot * (CHIP_H + CHIP_GAP) - CHIP_GAP);
  const inGraph = GRAPH_LEVELS.includes(level);

  return (
    <div
      className={`tl__row tl__row--${level}${selected ? ' is-on' : ''}`}
      style={{ minHeight: height }}
      data-testid={`timeline-${level}`}
      data-selected={selected ? 'true' : 'false'}
      role="list"
      aria-label={`${tx.levels[level].name} papers by year${selected ? ', selected' : ''}`}
    >
      {width > 0 &&
        bands.map((b) => <span key={b.key} className={`tl__band${b.pre ? ' tl__band--pre' : ''}`} style={{ left: b.x0, width: b.x1 - b.x0 }} aria-hidden="true" />)}
      {width > 0 &&
        placed.map(({ p, band, slot }) => {
          const dim = !matchesGlobal(p, f);
          return (
            <button
              key={p.id}
              type="button"
              role="listitem"
              className={`tl__chip tl__chip--${level}${dim ? ' is-dim' : ''}${hoverId === p.id ? ' is-hover' : ''}`}
              style={{ left: band.x0 + 2, width: band.x1 - band.x0 - 4, top: ROW_PAD + slot * (CHIP_H + CHIP_GAP), height: CHIP_H }}
              title={`${p.short_name} (${p.year})`}
              data-testid={`tchip-${p.id}`}
              data-hover={hoverId === p.id ? 'true' : 'false'}
              onMouseEnter={() => setHover(p.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(p.id)}
              onBlur={() => setHover(null)}
              onClick={() => url.set({ paper: p.id, focus: inGraph ? p.id : null }, { push: true })}
            >
              <span className="tl__chip-name">{p.short_name}</span>
              {band.pre && <span className="tl__chip-year">{p.year}</span>}
            </button>
          );
        })}
    </div>
  );
}

function TimelineAxis({ bands, width }: { bands: Band[]; width: number }) {
  const url = useUrl();
  const f = url.filters;
  const gRef = useRef<SVGGElement>(null);
  const brush = useRef<BrushBehavior<unknown> | null>(null);
  const pre = bands.find((b) => b.pre);

  useEffect(() => {
    const g = gRef.current;
    if (!g || !width || !bands.length) return;
    const b = brushX<unknown>()
      .extent([
        [0, 0],
        [width, 24],
      ])
      .on('end', (ev: { selection: [number, number] | null; sourceEvent?: unknown }) => {
        if (!ev.sourceEvent) return; // programmatic move
        if (!ev.selection) {
          url.set({ years: null });
          return;
        }
        const [a, z] = ev.selection;
        const hit = bands.filter((bd) => bd.x1 > a + 2 && bd.x0 < z - 2);
        if (!hit.length) return;
        url.set({ years: `${hit[0].from}-${hit[hit.length - 1].to}` });
      });
    brush.current = b;
    select(g).call(b);
    return () => {
      select(g).on('.brush', null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bands, width]);

  // Keep the brush in step with years= (chips, Back, typed input).
  useEffect(() => {
    const g = gRef.current;
    if (!g || !brush.current || !bands.length) return;
    if (!f.years) {
      select(g).call(brush.current.move, null);
      return;
    }
    const lo = Math.max(f.years[0], bands[0].from);
    const hi = Math.min(f.years[1], bands[bands.length - 1].to);
    const i0 = bands.findIndex((b) => b.to >= lo);
    let i1 = bands.length - 1;
    while (i1 > 0 && bands[i1].from > hi) i1--;
    if (i0 < 0 || i1 < i0) return;
    select(g).call(brush.current.move, [bands[i0].x0, bands[i1].x1]);
  }, [f.years, bands]);

  return (
    <div className="tl__axis">
      {width > 0 && (
        <svg width={width} height={40} aria-label="Year axis. Drag to filter years." role="img" data-testid="year-brush">
          <line x1={0} x2={pre ? pre.x1 : 0} y1={26} y2={26} className="tl__axisline" />
          <line x1={pre ? pre.x1 + BREAK_W : 0} x2={width} y1={26} y2={26} className="tl__axisline" />
          {pre && (
            <g className="tl__break" transform={`translate(${pre.x1 + BREAK_W / 2},26)`} aria-hidden="true">
              <line x1={-5} y1={5} x2={-1} y2={-5} />
              <line x1={1} y1={5} x2={5} y2={-5} />
            </g>
          )}
          {bands.map((b) => (
            <text key={b.key} x={(b.x0 + b.x1) / 2} y={14} textAnchor="middle" className={`tl__year${b.pre ? ' tl__year--pre' : ''}`}>
              {b.label}
            </text>
          ))}
          <g ref={gRef} transform="translate(0,2)" className="tl__brush" />
        </svg>
      )}
    </div>
  );
}

function Legend({ clusters, families }: { clusters: string[]; families: Record<string, FamilyInfo> }) {
  const url = useUrl();
  const shown = parseEdgeTypes(url.get('edges'));
  return (
    <aside className="mtop__legend" aria-label="Legend">
      <div className="lgd__group">
        <h2 className="strip__title">Edges</h2>
        <ul className="plain lgd">
          {EDGE_TYPES.map((t) => (
            <li key={t}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={shown.has(t)}
                  data-testid={`edges-${t}`}
                  onChange={(e) => {
                    const next = new Set(shown);
                    if (e.target.checked) next.add(t);
                    else next.delete(t);
                    url.set({ edges: edgeParam(next) });
                  }}
                />
                <svg width="30" height="10" aria-hidden="true">
                  <line x1="1" y1="5" x2="29" y2="5" className={`litg__edge litg__edge--${t}`} />
                </svg>
                {EDGE_LABEL[t].name}
              </label>
            </li>
          ))}
        </ul>
      </div>
      {clusters.length > 0 && (
        <div className="lgd__group">
          <h2 className="strip__title">Clusters</h2>
          <ul className="plain lgd">
            {clusters.map((c, i) => (
              <li key={c}>
                <span className={`swatch swatch--cluster-${i % CLUSTER_TINTS}`} aria-hidden="true" /> {families[c]?.name ?? c}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="lgd__group">
        <h2 className="strip__title">Levels</h2>
        <ul className="plain lgd lgd--row">
          {BAND_LEVELS.map((l) => (
            <li key={l}>
              <span className={`level-chip level-chip--${l}`}>{l}</span>
              <span className="small">{l === 'L2' ? 'Unprompted' : 'Collaborative'}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="lgd__group">
        <h2 className="strip__title">Tangential works</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={url.get('tangents') !== '0'}
            data-testid="show-tangents"
            onChange={(e) => url.set({ tangents: e.target.checked ? null : '0' })}
          />
          <span className="lgd__tangent" aria-hidden="true" />
          Show tangential works
        </label>
      </div>
      <div className="lgd__group">
        <h2 className="strip__title">Actions</h2>
        <ul className="plain lgd lgd--row">
          {Object.entries(tx.action_types).map(([id, a]) => (
            <li key={id}>
              <ActionIcon type={id} /> <span className="small">{a.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

export function TopBand({
  papers,
  clusters,
  families,
  hoverId,
  setHover,
}: {
  papers: DbPaper[];
  clusters: string[];
  families: Record<string, FamilyInfo>;
  hoverId: string | null;
  setHover: (id: string | null) => void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const rows = useMemo(() => Object.fromEntries(BAND_LEVELS.map((l) => [l, papers.filter((p) => p.level === l)])) as Record<LevelId, DbPaper[]>, [papers]);
  const shownPapers = BAND_LEVELS.flatMap((l) => rows[l]);
  const years = shownPapers.map((p) => p.year);
  const minYear = years.length ? Math.min(...years) : TIMELINE_START;
  const maxYear = years.length ? Math.max(...years) : TIMELINE_START;
  const bands = useMemo(() => (width ? makeBands(width, minYear, maxYear) : []), [width, minYear, maxYear]);

  return (
    <section className="mtop" aria-label="Levels and timeline">
      {BAND_LEVELS.map((l) => (
        <div key={l} className="mtop__level" style={{ display: 'contents' }}>
          <div className={`mtop__card mtop__card--${l}`}>
            <LevelCard level={l} count={rows[l].length} />
          </div>
          <div className={`mtop__tl mtop__tl--${l}`}>
            <TimelineRow level={l} papers={rows[l]} bands={bands} width={width} hoverId={hoverId} setHover={setHover} />
          </div>
        </div>
      ))}
      <div className="mtop__axis" ref={ref}>
        <TimelineAxis bands={bands} width={width} />
      </div>
      <Legend clusters={clusters} families={families} />
    </section>
  );
}
