// Methods literature graph (SPEC §7.2): L2 papers in one cluster per family, a deterministic force layout,
// three edge styles, hover cards, and click-to-focus ancestry.
import { curveBasisClosed, line } from 'd3-shape';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActionIcon, InputChip, KnownsChips, LevelChip } from '../../components/Chip.tsx';
import { EmptyState } from '../../components/EmptyState.tsx';
import { paperLabel, tx } from '../../data.ts';
import { drawnRelation, EDGE_LABEL, earlierWorks, mergeEdges, parseEdgeTypes, type EdgeType, type Relation } from '../../lib/edges.ts';
import { matchesGlobal } from '../../lib/filters.ts';
import { ancestry } from '../../lib/graph.ts';
import { layoutLiterature, type PlacedNode } from '../../lib/literatureLayout.ts';
import type { DbPaper } from '../../schema.ts';
import { useUrl } from '../../state/url.ts';
import { CLUSTER_TINTS, FOCUS_LEVELS, type FamilyInfo } from './constants.ts';

const ACTION_ICON: Record<string, string> = { act: '▸', timing: '◷', initiate: '✦', inform: 'i', ask: '?' };
// A closed B-spline stays inside the hull polygon, so it never cuts into a pill of another cluster.
const hullPath = line<[number, number]>().curve(curveBasisClosed);

/** Point where the segment from `from` toward the center of `n` meets n's pill border (plus a gap). */
function border(n: PlacedNode, from: [number, number], gap: number): [number, number] {
  const dx = from[0] - n.x;
  const dy = from[1] - n.y;
  if (!dx && !dy) return [n.x, n.y];
  const sx = Math.abs(dx) > 1e-9 ? (n.w / 2 + gap) / Math.abs(dx) : Infinity;
  const sy = Math.abs(dy) > 1e-9 ? (n.h / 2 + gap) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy, 1);
  return [n.x + dx * s, n.y + dy * s];
}

function edgeGeometry(a: PlacedNode, b: PlacedNode) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(40, len * 0.12);
  const c: [number, number] = [mx - (dy / len) * bend, my + (dx / len) * bend];
  const p0 = border(a, c, 1);
  const p1 = border(b, c, 4);
  return { d: `M${p0[0]},${p0[1]} Q${c[0]},${c[1]} ${p1[0]},${p1[1]}`, mid: [(p0[0] + 2 * c[0] + p1[0]) / 4, (p0[1] + 2 * c[1] + p1[1]) / 4] as [number, number] };
}

function NodeCard({ p }: { p: DbPaper }) {
  const m = p.method;
  return (
    <>
      <div className="hovercard__top">
        <strong>{p.short_name}</strong> <span className="muted">{p.year}</span> {p.level && <LevelChip level={p.level} />}
        {p.tangent && <span className="tag">Tangential · {tx.tangent_types[p.tangent]?.label ?? p.tangent}</span>}
      </div>
      <div className="one-line small">{p.title}</div>
      {m?.core_strength && <div className="small">{m.core_strength}</div>}
      {m && (
        <div className="io small">
          <span className="io__side">{(m.inputs ?? []).length ? m.inputs!.map((i) => <InputChip key={i} id={i} />) : <span className="muted">—</span>}</span>
          <span className="io__arrow">→</span>
          <span className="io__side">
            {(m.action_types ?? []).length ? (
              m.action_types!.map((a) => (
                <span key={a} className="chip chip--action">
                  <ActionIcon type={a} /> {tx.action_types[a]?.label}
                </span>
              ))
            ) : (
              <span className="muted">—</span>
            )}
          </span>
        </div>
      )}
      {m && <KnownsChips knowns={m.knowns} />}
    </>
  );
}

function relationText(r: Relation, label: (id: string) => string) {
  return `${label(r.to)} ${EDGE_LABEL[r.type].forward} ${label(r.from)}`;
}

type Tip = { x: number; y: number; body: ReactNode } | null;

export function LiteratureGraph({
  papers,
  families,
  hoverId,
  setHover,
}: {
  papers: DbPaper[];
  families: Record<string, FamilyInfo>;
  hoverId: string | null;
  setHover: (id: string | null) => void;
}) {
  const url = useUrl();
  const f = url.filters;
  const focus = url.get('focus');
  const shown = parseEdgeTypes(url.get('edges'));
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<Tip>(null);
  const [scale, setScale] = useState(1);

  // Core: L2 papers with a method block and no tangent. Tangential works join at half opacity (SPEC §7.2).
  const nodesIn = useMemo(() => papers.filter((p) => p.tangent || (p.method && p.level && FOCUS_LEVELS.includes(p.level))), [papers]);
  const showTangents = url.get('tangents') !== '0';
  const byId = useMemo(() => new Map(nodesIn.map((p) => [p.id, p])), [nodesIn]);
  const isTangent = (id: string) => !!byId.get(id)?.tangent;
  const label = (id: string) => byId.get(id)?.short_name ?? paperLabel(id);
  const clusterOrder = useMemo(() => Object.keys(families).filter((fam) => nodesIn.some((p) => !p.tangent && p.method?.family === fam)), [families, nodesIn]);

  const edges = useMemo(() => {
    const rels: Relation[] = [];
    for (const p of nodesIn) {
      for (const b of p.method?.builds_on ?? []) if (byId.has(b)) rels.push({ type: 'builds', from: b, to: p.id });
      for (const b of p.benchmarks_against) if (byId.has(b)) rels.push({ type: 'benchmarks', from: b, to: p.id });
      for (const c of p.cites) if (byId.has(c)) rels.push({ type: 'cites', from: c, to: p.id });
    }
    return mergeEdges(rels);
  }, [nodesIn, byId]);

  const layout = useMemo(
    () =>
      layoutLiterature(
        nodesIn.map((p) => ({
          id: p.id,
          cluster: !p.tangent && p.method?.family && families[p.method.family] ? p.method.family : null,
          label: p.short_name,
          year: p.year,
          icons: (p.method?.action_types ?? []).length,
          tangent: !!p.tangent,
        })),
        clusterOrder,
        edges.map((e) => ({ source: e.relations[0].from, target: e.relations[0].to })),
      ),
    [nodesIn, families, clusterOrder, edges],
  );

  // Rendered size: the graph fits its container width and never scales up.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, (el.clientWidth - 2) / layout.bbox.w));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout.bbox.w]);

  const lit = useMemo(() => {
    if (!focus || !layout.nodes.has(focus)) return null;
    const { ancestors, descendants } = ancestry(focus, earlierWorks(edges, shown));
    return new Set([focus, ...ancestors, ...descendants]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, layout, edges, url.get('edges')]);

  const matches = useMemo(() => new Set(nodesIn.filter((p) => matchesGlobal(p, f)).map((p) => p.id)), [nodesIn, f]);

  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') url.set({ focus: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, url]);

  if (!nodesIn.length) return <EmptyState>No unprompted (L2) methods yet.</EmptyState>;

  const { bbox } = layout;
  const toPx = (x: number, y: number) => {
    const svg = svgRef.current;
    const box = wrap.current;
    const off = svg && box ? svg.getBoundingClientRect().left - box.getBoundingClientRect().left : 0;
    return { x: off + (x - bbox.x) * scale, y: (y - bbox.y) * scale };
  };
  const showTip = (x: number, y: number, body: ReactNode) => {
    const p = toPx(x, y);
    const w = wrap.current?.clientWidth ?? 600;
    setTip({ x: Math.max(4, Math.min(p.x - 140, w - 300)), y: p.y + 10, body });
  };
  const ordered = [...layout.nodes.values()].sort((a, b) => {
    const ca = a.cluster ? clusterOrder.indexOf(a.cluster) : clusterOrder.length;
    const cb = b.cluster ? clusterOrder.indexOf(b.cluster) : clusterOrder.length;
    const pa = byId.get(a.id)!;
    const pb = byId.get(b.id)!;
    return ca - cb || pa.year - pb.year || pa.short_name.localeCompare(pb.short_name);
  });

  return (
    <div className="litg" ref={wrap} data-testid="literature-graph" onMouseLeave={() => setTip(null)}>
      <svg
        ref={svgRef}
        className="litg__svg"
        viewBox={`${bbox.x} ${bbox.y} ${bbox.w} ${bbox.h}`}
        width={bbox.w * scale}
        height={bbox.h * scale}
        role="group"
        aria-label="Literature graph of unprompted (L2) methods"
        onClick={(e) => {
          const t = e.target as Element;
          if ((t === e.currentTarget || t.classList.contains('litg__hull')) && focus) url.set({ focus: null });
        }}
      >
        <defs>
          {(['builds', 'benchmarks', 'cites'] as EdgeType[]).map((t) => (
            <marker
              key={t}
              id={`arrow-${t}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth={t === 'cites' ? 5 : 7}
              markerHeight={t === 'cites' ? 5 : 7}
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" className={`litg__arrow litg__arrow--${t}`} />
            </marker>
          ))}
        </defs>

        <g className="litg__hulls">
          {layout.clusters.map((c) => {
            const i = clusterOrder.indexOf(c.id);
            const fam = families[c.id];
            const famTip = () =>
              showTip(c.centroid[0], c.top, (
                <>
                  <strong>{fam?.name ?? c.id}</strong>
                  {fam?.scope_line && <span className="small">{fam.scope_line}</span>}
                  {fam?.strength && (
                    <span className="small">
                      <em>Strength.</em> {fam.strength}
                    </span>
                  )}
                  {(fam?.limitations ?? []).map((l) => (
                    <span key={l} className="small">
                      <em>Limitation.</em> {l}
                    </span>
                  ))}
                </>
              ));
            return (
              <g key={c.id}>
                <path d={hullPath(c.hull) ?? ''} className={`litg__hull litg__hull--${i % CLUSTER_TINTS}`} data-testid={`hull-${c.id}`} />
                <text
                  x={c.centroid[0]}
                  y={c.top - 4}
                  textAnchor="middle"
                  className="litg__hull-label"
                  tabIndex={0}
                  onMouseEnter={famTip}
                  onFocus={famTip}
                  onMouseLeave={() => setTip(null)}
                  onBlur={() => setTip(null)}
                >
                  {fam?.name ?? c.id}
                </text>
              </g>
            );
          })}
        </g>

        <g className="litg__edges">
          {edges.map((e) => {
            const r = drawnRelation(e, shown);
            if (!r) return null;
            const touchesTangent = isTangent(r.from) || isTangent(r.to);
            if (touchesTangent && !showTangents) return null;
            const hot = touchesTangent && (hoverId === r.from || hoverId === r.to);
            const a = layout.nodes.get(r.from)!;
            const b = layout.nodes.get(r.to)!;
            const { d, mid } = edgeGeometry(a, b);
            const dim = (lit && !(lit.has(r.from) && lit.has(r.to))) || !matches.has(r.from) || !matches.has(r.to);
            const body = (
              <ul className="plain small">
                {e.relations.map((x) => (
                  <li key={`${x.type}:${x.from}:${x.to}`}>{relationText(x, label)}</li>
                ))}
              </ul>
            );
            return (
              <g key={e.key} className={[dim && 'is-dim', touchesTangent && 'is-tangent', hot && 'is-hot'].filter(Boolean).join(' ') || undefined}>
                <path d={d} className={`litg__edge litg__edge--${r.type}`} markerEnd={`url(#arrow-${r.type})`} data-testid={`edge-${r.from}-${r.to}`} data-type={r.type} />
                <path d={d} className="litg__edge-hit" onMouseEnter={() => showTip(mid[0], mid[1], body)} onMouseLeave={() => setTip(null)} />
              </g>
            );
          })}
        </g>

        <g className="litg__nodes">
          {ordered.map((n) => {
            const p = byId.get(n.id)!;
            if (p.tangent && !showTangents) return null;
            const dim = !matches.has(n.id) || (lit !== null && !lit.has(n.id));
            const icons = p.method?.action_types ?? [];
            const open = () => url.set({ focus: n.id, paper: n.id }, { push: true });
            return (
              <g
                key={n.id}
                transform={`translate(${n.x - n.w / 2},${n.y - n.h / 2})`}
                className={`litg__node litg__node--${p.level ?? 'none'}${p.tangent ? ' is-tangent' : ''}${dim ? ' is-dim' : ''}${focus === n.id ? ' is-focus' : ''}${lit?.has(n.id) && focus !== n.id ? ' is-lit' : ''}${hoverId === n.id ? ' is-hover' : ''}`}
                tabIndex={0}
                role="button"
                aria-label={`${p.short_name}, ${p.year}${p.tangent ? `, tangential: ${tx.tangent_types[p.tangent]?.label ?? p.tangent}` : p.method?.family ? `, ${families[p.method.family]?.name ?? ''}` : ''}`}
                data-tangent={p.tangent ?? undefined}
                data-testid={`node-${n.id}`}
                data-locate={n.id}
                data-cx={n.x}
                data-cy={n.y}
                data-hover={hoverId === n.id ? 'true' : 'false'}
                onMouseEnter={() => {
                  setHover(n.id);
                  showTip(n.x, n.y + n.h / 2, <NodeCard p={p} />);
                }}
                onMouseLeave={() => {
                  setHover(null);
                  setTip(null);
                }}
                onFocus={() => {
                  setHover(n.id);
                  showTip(n.x, n.y + n.h / 2, <NodeCard p={p} />);
                }}
                onBlur={() => {
                  setHover(null);
                  setTip(null);
                }}
                onClick={open}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    open();
                  }
                }}
              >
                <rect className="litg__pill" width={n.w} height={n.h} rx={n.h / 2} />
                <rect className="litg__stripe" x={0} y={0} width={7} height={n.h} rx={3} />
                <text x={13} y={n.h / 2 + 4} className="litg__name">
                  {p.short_name}
                  <tspan className="litg__year" dx={5}>
                    {p.year}
                  </tspan>
                </text>
                {icons.map((a, i) => (
                  <text key={a} x={n.w - 10 - (icons.length - 1 - i) * 12} y={n.h / 2 + 4} textAnchor="middle" className={`litg__icon action-icon--${a}`} aria-hidden="true">
                    {ACTION_ICON[a] ?? '•'}
                  </text>
                ))}
              </g>
            );
          })}
        </g>
      </svg>
      {tip && (
        <div className="hovercard" style={{ left: tip.x, top: tip.y }} role="tooltip">
          {tip.body}
        </div>
      )}
    </div>
  );
}
