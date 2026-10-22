// Methods literature graph (SPEC §7.2): the legend above, dots in one soft hull per family, tangential works in
// colored, labeled groups with no hull, positions from the build-time layout, three edge styles, zoom and pan, hover
// fading, collision-aware labels, and click-to-focus ancestry.
import { select } from 'd3-selection';
import { curveCatmullRomClosed, line } from 'd3-shape';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ActionIcon, InputChip, KnownsChips, LevelChip, TangentTag } from '../../components/Chip.tsx';
import { EmptyState } from '../../components/EmptyState.tsx';
import { FRAMEWORK_PAPER, paperLabel, tx } from '../../data.ts';
import { edgeKey, edgeRadius, FRAMEWORK_RING, geometryOf, stepIndex, type EdgeGeometry, type Routes } from '../../lib/edgeRouting.ts';
import { drawnRelation, EDGE_LABEL, earlierWorks, mergeEdges, parseEdgeTypes, type EdgeType, type PairEdge, type Relation } from '../../lib/edges.ts';
import { matchesGlobal } from '../../lib/filters.ts';
import { ancestry } from '../../lib/graph.ts';
import {
  dotRadius,
  hullOf,
  inLiteratureGraph,
  LABEL_GAP,
  LABEL_H,
  LABEL_PX,
  labelWidth,
  labelYear,
  linkedPapers,
  labelMinRadius,
  placeGroupLabels,
  placeLabels,
  textWidth,
  type LabelCandidate,
  type ScreenBox,
} from '../../lib/literatureLayout.ts';
import type { DbPaper } from '../../schema.ts';
import { useUrl } from '../../state/url.ts';
import { familyHue, FOCUS_LEVELS, FRAMEWORK_HUE, NO_CATEGORY_HUE, tangentHue, TANGENTS_IN_GRAPH, type FamilyInfo } from './constants.ts';
import { GraphLegend } from './GraphLegend.tsx';

/** Screen margin kept around the content when fitting. */
const FIT_MARGIN = 20;
/** Fitting never zooms in past this, so small graphs keep modest dots. */
const FIT_MAX = 1.35;
const ZOOM_MIN = 0.12;
const ZOOM_MAX = 4;
const MIN_H = 220;
const MOTION_MS = 280;
/** Tangential category labels: font size and box height in screen pixels (SPEC §7.2). */
const CAT_PX = 13;
const CAT_H = 17;

const hullPath = line<[number, number]>().curve(curveCatmullRomClosed.alpha(0.5));

interface GNode {
  p: DbPaper;
  id: string;
  x: number;
  y: number;
  r: number;
  /** Radius the edges stop at: the dot, or the ring around it. */
  rr: number;
  labelW: number;
  year: string | null;
  /** CSS hue slot: a family's ('0' to '3'), the framework paper's, a tangential category's, or gray ('none'). */
  hue: string;
  tangent: boolean;
  /** Tangential category, when the taxonomy knows the paper's tangent type. */
  cat: string | null;
  cluster: string | null;
  /** In a semi-tangential family: drawn at 75% opacity until its cluster is hovered (SPEC §7.2). */
  semi: boolean;
}

function NodeCard({ p }: { p: DbPaper }) {
  const m = p.method;
  return (
    <>
      <div className="hovercard__top">
        <strong>{p.short_name}</strong> <span className="muted">{p.year}</span> {p.level && <LevelChip level={p.level} />}
        {p.tangent && <TangentTag type={p.tangent} />}
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

const Dot = memo(function Dot({
  n,
  fill,
  cls,
  label,
  focusable,
  pulse,
}: {
  n: GNode;
  fill: string | undefined;
  cls: string;
  label: string;
  focusable: boolean;
  pulse: number;
}) {
  const hover = cls.includes(' is-hover');
  return (
    <g
      transform={`translate(${n.x},${n.y})`}
      className={cls}
      tabIndex={focusable ? 0 : -1}
      role="button"
      aria-label={label}
      data-id={n.id}
      data-tangent={n.p.tangent ?? undefined}
      data-testid={`node-${n.id}`}
      data-locate={n.id}
      data-cx={n.x}
      data-cy={n.y}
      data-r={n.r}
      data-hover={hover ? 'true' : 'false'}
    >
      {n.id === FRAMEWORK_PAPER && <circle className="litg__ring" r={n.r + FRAMEWORK_RING} />}
      <circle className="litg__dot" r={n.r} style={fill ? { fill } : undefined} />
      {pulse > 0 && <circle key={pulse} className="litg__pulse" r={n.r} />}
    </g>
  );
});

// Arrowheads come from CSS (marker-end), which picks the variant for the edge's state.
const Edge = memo(function Edge({ id, rel, geo, cls }: { id: string; rel: Relation; geo: EdgeGeometry; cls: string }) {
  return (
    <>
      <path
        d={geo.d}
        className={`litg__edge litg__edge--${rel.type}${cls}`}
        data-testid={`edge-${rel.from}-${rel.to}`}
        data-type={rel.type}
      />
      <path d={geo.d} className="litg__edge-hit" data-edge={id} />
    </>
  );
});

type Tip = { x: number; y: number; body: ReactNode } | null;

export function LiteratureGraph({
  papers,
  families,
  routes,
  hoverId,
  setHover,
}: {
  papers: DbPaper[];
  families: Record<string, FamilyInfo>;
  /** Edge routes from the build (db.routes, or the synthetic fixture's). */
  routes?: Routes;
  hoverId: string | null;
  setHover: (id: string | null) => void;
}) {
  const url = useUrl();
  const f = url.filters;
  const focus = url.get('focus');
  const openId = url.get('paper');
  const edgesParam = url.get('edges');
  const shown = useMemo(() => parseEdgeTypes(edgesParam), [edgesParam]);
  const showTangents = TANGENTS_IN_GRAPH && url.get('tangents') !== '0';

  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef<SVGGElement>(null);
  const textRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const tRef = useRef<ZoomTransform>(zoomIdentity);
  const autoFit = useRef(true);
  const armed = useRef(false);
  const anim = useRef(0);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [labelK, setLabelK] = useState(1);
  const [tip, setTip] = useState<Tip>(null);
  const [searched, setSearched] = useState<string | null>(null);
  const [pulse, setPulse] = useState<{ id: string; n: number } | null>(null);
  const [hint, setHint] = useState(false);
  /** Family whose name is hovered or focused. */
  const [hullHot, setHullHot] = useState<string | null>(null);

  // ---- data: nodes, edges, clusters (positions are fixed, so this changes only with the data) ----
  const nodes = useMemo(() => {
    const out = new Map<string, GNode>();
    for (const p of papers) {
      if (!inLiteratureGraph(p, FOCUS_LEVELS, TANGENTS_IN_GRAPH) || p.x === undefined || p.y === undefined) continue;
      const tangent = !!p.tangent;
      const fam = !tangent && p.method?.family && families[p.method.family] ? p.method.family : null;
      const cat = tangent && Object.prototype.hasOwnProperty.call(tx.tangent_types, p.tangent!) ? p.tangent! : null;
      const r = dotRadius(linkedPapers(p).size, tangent);
      // Families take their hue, tangential works their category's; GAP stays purple; the rest are gray.
      const hue = tangent ? tangentHue(tx.tangent_types, cat) : p.id === FRAMEWORK_PAPER ? FRAMEWORK_HUE : familyHue(families, fam);
      out.set(p.id, {
        p,
        id: p.id,
        x: p.x,
        y: p.y,
        r,
        rr: edgeRadius(r, p.id === FRAMEWORK_PAPER),
        labelW: labelWidth(p.short_name, p.year),
        year: labelYear(p.short_name, p.year),
        hue,
        tangent,
        cat,
        cluster: fam,
        semi: !!(fam && families[fam]?.semi_tangential),
      });
    }
    return out;
  }, [papers, families]);

  const label = useCallback((id: string) => nodes.get(id)?.p.short_name ?? paperLabel(id), [nodes]);
  const clusterOrder = useMemo(() => Object.keys(families).filter((fam) => [...nodes.values()].some((n) => n.cluster === fam)), [families, nodes]);

  const { pairs, neighbors } = useMemo(() => {
    const rels: Relation[] = [];
    for (const n of nodes.values()) {
      const p = n.p;
      for (const b of p.method?.builds_on ?? []) if (nodes.has(b)) rels.push({ type: 'builds', from: b, to: p.id });
      for (const b of p.benchmarks_against) if (nodes.has(b)) rels.push({ type: 'benchmarks', from: b, to: p.id });
      for (const c of p.cites) if (nodes.has(c)) rels.push({ type: 'cites', from: c, to: p.id });
    }
    const pairs = mergeEdges(rels);
    // Direct neighbors by any relation: hover keeps these in view, since cites lines show for the hovered paper.
    const neighbors = new Map<string, Set<string>>();
    for (const e of pairs) {
      const [a, b] = e.key.split('|');
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      if (!neighbors.has(b)) neighbors.set(b, new Set());
      neighbors.get(a)!.add(b);
      neighbors.get(b)!.add(a);
    }
    return { pairs, neighbors };
  }, [nodes]);

  // Edge routes come from the build, one per zoom step (SPEC §7.2 Edge routing): the route for the largest step at
  // or below the current zoom keeps clearance. Geometry is memoized by route, so an edge whose route does not change
  // with the zoom keeps the same path object and does not re-render.
  const step = stepIndex(labelK);
  const geoCache = useMemo(() => new Map<string, EdgeGeometry>(), [nodes, routes]);
  const geometry = (r: Relation) => {
    const key = edgeKey(r.from, r.to);
    const spec = routes?.[key]?.[step] ?? null;
    const ck = spec ? `${key}|${JSON.stringify(spec)}` : key;
    let g = geoCache.get(ck);
    if (!g) {
      g = geometryOf(nodes.get(r.from)!, nodes.get(r.to)!, spec);
      geoCache.set(ck, g);
    }
    return g;
  };

  const clusters = useMemo(
    () =>
      clusterOrder.map((c) => {
        const ms = [...nodes.values()].filter((n) => n.cluster === c);
        const hull = hullOf(ms);
        const top = Math.min(...hull.map((p) => p[1]));
        const xs = hull.map((p) => p[0]);
        return { id: c, hue: familyHue(families, c), hull, d: hullPath(hull) ?? '', top, cx: (Math.min(...xs) + Math.max(...xs)) / 2 };
      }),
    [clusterOrder, nodes, families],
  );

  const visible = useMemo(() => [...nodes.values()].filter((n) => showTangents || !n.tangent), [nodes, showTangents]);
  const isShown = useCallback((id: string) => {
    const n = nodes.get(id);
    return !!n && (showTangents || !n.tangent);
  }, [nodes, showTangents]);

  // Keyboard order: clusters in family order, then unclustered papers, then tangential works by category; by year
  // within each.
  const ordered = useMemo(() => {
    const cats = Object.keys(tx.tangent_types);
    const rank = (n: GNode) =>
      n.tangent ? clusterOrder.length + 1 + (n.cat ? cats.indexOf(n.cat) : cats.length) : n.cluster ? clusterOrder.indexOf(n.cluster) : clusterOrder.length;
    return [...visible].sort((a, b) => rank(a) - rank(b) || a.p.year - b.p.year || a.p.short_name.localeCompare(b.p.short_name));
  }, [visible, clusterOrder]);

  // Legend contents (SPEC §7.2): what the graph holds, whether or not tangential works are shown.
  const legend = useMemo(() => {
    const all = [...nodes.values()];
    return {
      categories: Object.keys(tx.tangent_types).filter((t) => all.some((n) => n.cat === t)),
      uncategorized: all.some((n) => n.hue === NO_CATEGORY_HUE),
      framework: nodes.has(FRAMEWORK_PAPER),
    };
  }, [nodes]);

  // Content bounds at zoom 1: dots, labels, hulls, and room for hull names.
  const bounds = useMemo(() => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const n of visible) {
      x0 = Math.min(x0, n.x - n.rr);
      x1 = Math.max(x1, n.x + n.r + LABEL_GAP + n.labelW);
      y0 = Math.min(y0, n.y - Math.max(n.rr, LABEL_H / 2));
      y1 = Math.max(y1, n.y + Math.max(n.rr, LABEL_H / 2));
    }
    for (const c of clusters) {
      for (const [x, y] of c.hull) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
      y0 = Math.min(y0, c.top - 20);
    }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }, [visible, clusters]);

  // ---- filters, focus, hover ----
  const matches = useMemo(() => new Set(visible.filter((n) => matchesGlobal(n.p, f)).map((n) => n.id)), [visible, f]);
  const lit = useMemo(() => {
    if (!focus || !nodes.has(focus)) return null;
    const { ancestors, descendants } = ancestry(focus, earlierWorks(pairs, shown));
    return new Set([focus, ...ancestors, ...descendants]);
  }, [focus, nodes, pairs, shown]);
  const hovered = hoverId && isShown(hoverId) ? hoverId : null;
  const hl = useMemo(() => {
    if (!hovered) return null;
    return new Set([hovered, ...[...(neighbors.get(hovered) ?? [])].filter(isShown)]);
  }, [hovered, neighbors, isShown]);
  // Semi-tangential families draw at 75% opacity; hovering the family name or one of its papers brings the
  // whole cluster to full opacity (SPEC §7.2).
  const hotCluster = hullHot ?? (hovered ? nodes.get(hovered)?.cluster ?? null : null);
  const isSemi = (n: GNode) => n.semi && n.cluster !== hotCluster;
  const semiFamily = (fam: string) => !!families[fam]?.semi_tangential && fam !== hotCluster;

  // ---- year ramp: darker means newer, over the years in view ----
  const [yr0, yr1] = useMemo(() => {
    const ys = visible.filter((n) => !n.tangent).map((n) => n.p.year);
    let lo = ys.length ? Math.min(...ys) : 2000;
    let hi = ys.length ? Math.max(...ys) : 2000;
    if (f.years) {
      lo = Math.max(lo, f.years[0]);
      hi = Math.min(hi, f.years[1]);
      if (lo > hi) [lo, hi] = [f.years[0], f.years[1]];
    }
    return [lo, hi];
  }, [visible, f.years]);
  // Tangential works take their category's color, drawn at 60% opacity by CSS (SPEC §7.2).
  const fillOf = (n: GNode) => {
    if (n.tangent) return `var(--tan-${n.hue})`;
    const t = yr1 > yr0 ? Math.max(0, Math.min(1, (n.p.year - yr0) / (yr1 - yr0))) : 1;
    return `color-mix(in oklab, var(--fam-${n.hue}-dark) ${Math.round(18 + 82 * t)}%, var(--fam-${n.hue}-light))`;
  };
  const inkOf = (n: GNode) => (n.tangent ? `var(--tan-${n.hue}-ink)` : `var(--fam-${n.hue}-ink)`);

  // ---- zoom ----
  const fitTransform = useCallback(
    (w: number, h: number) => {
      if (!isFinite(bounds.w)) return zoomIdentity;
      const k = Math.max(ZOOM_MIN, Math.min(FIT_MAX, (w - 2 * FIT_MARGIN) / bounds.w, (h - 2 * FIT_MARGIN) / bounds.h));
      return zoomIdentity.translate(w / 2 - k * (bounds.x0 + bounds.w / 2), h / 2 - k * (bounds.y0 + bounds.h / 2)).scale(k);
    },
    [bounds],
  );

  const applyTransform = useCallback((t: ZoomTransform) => {
    tRef.current = t;
    viewRef.current?.setAttribute('transform', t.toString());
    if (textRef.current) textRef.current.style.fontSize = `${LABEL_PX / t.k}px`;
    setLabelK((k) => (Math.abs(t.k - k) / k > 0.015 ? t.k : k));
  }, []);

  const animateTo = useCallback((t1: ZoomTransform) => {
    const svg = svgRef.current;
    const z = zoomRef.current;
    if (!svg || !z || !size) return;
    cancelAnimationFrame(anim.current);
    const sel = select(svg);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      z.transform(sel, t1);
      return;
    }
    const t0 = tRef.current;
    const c: [number, number] = [size.w / 2, size.h / 2];
    const a = t0.invert(c);
    const b = t1.invert(c);
    const start = performance.now();
    const step = (now: number) => {
      const s = Math.min(1, (now - start) / MOTION_MS);
      const e = s < 0.5 ? 2 * s * s : 1 - (-2 * s + 2) ** 2 / 2;
      const k = Math.exp(Math.log(t0.k) + (Math.log(t1.k) - Math.log(t0.k)) * e);
      const x = a[0] + (b[0] - a[0]) * e;
      const y = a[1] + (b[1] - a[1]) * e;
      z.transform(sel, zoomIdentity.translate(c[0] - k * x, c[1] - k * y).scale(k));
      if (s < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, [size]);

  const fit = useCallback(() => {
    if (!size) return;
    autoFit.current = true;
    animateTo(fitTransform(size.w, size.h));
  }, [size, fitTransform, animateTo]);

  const zoomBy = (factor: number) => {
    if (!size) return;
    autoFit.current = false;
    const t0 = tRef.current;
    const k = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, t0.k * factor));
    const [x, y] = t0.invert([size.w / 2, size.h / 2]);
    animateTo(zoomIdentity.translate(size.w / 2 - k * x, size.h / 2 - k * y).scale(k));
  };

  const centerOn = useCallback(
    (id: string, k?: number) => {
      const n = nodes.get(id);
      if (!n || !size) return;
      autoFit.current = false;
      const kk = k ?? tRef.current.k;
      animateTo(zoomIdentity.translate(size.w / 2 - kk * n.x, size.h / 2 - kk * n.y).scale(kk));
    },
    [nodes, size, animateTo],
  );

  // Size: full width; height follows the content's shape so no large empty band remains.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (!w || !isFinite(bounds.w)) return;
      const maxH = Math.max(420, Math.min(780, Math.round(window.innerHeight * 0.78)));
      const k = Math.min(FIT_MAX, (w - 2 * FIT_MARGIN) / bounds.w);
      const h = Math.round(Math.max(MIN_H, Math.min(maxH, bounds.h * k + 2 * FIT_MARGIN)));
      setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [bounds]);

  // d3-zoom: drag pans; the wheel zooms only with a modifier key or after a click inside the graph.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([ZOOM_MIN, ZOOM_MAX])
      .clickDistance(4)
      .filter((ev: Event) => {
        if (ev.type === 'wheel') {
          const w = ev as WheelEvent;
          return armed.current || w.ctrlKey || w.metaKey;
        }
        if (ev.type === 'touchstart') return armed.current || (ev as TouchEvent).touches.length > 1;
        const m = ev as MouseEvent;
        return !m.ctrlKey && !m.button;
      })
      .wheelDelta((ev: WheelEvent) => -ev.deltaY * (ev.deltaMode === 1 ? 0.05 : ev.deltaMode ? 1 : 0.002) * (ev.ctrlKey && Math.abs(ev.deltaY) < 40 ? 8 : 1))
      .on('zoom', (ev: { transform: ZoomTransform; sourceEvent: Event | null }) => {
        if (ev.sourceEvent) {
          autoFit.current = false;
          cancelAnimationFrame(anim.current);
          setTip(null);
        }
        applyTransform(ev.transform);
      });
    zoomRef.current = z;
    const sel = select(svg);
    sel.call(z).on('dblclick.zoom', null);
    let timer = 0;
    const onWheel = (e: WheelEvent) => {
      if (armed.current || e.ctrlKey || e.metaKey) return;
      setHint(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setHint(false), 1600);
    };
    svg.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      sel.on('.zoom', null);
      svg.removeEventListener('wheel', onWheel);
      window.clearTimeout(timer);
      cancelAnimationFrame(anim.current);
    };
  }, [applyTransform]);

  // Fit on load, and again on resize until the reader zooms or pans.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    const z = zoomRef.current;
    if (!svg || !z || !size || !autoFit.current) return;
    z.transform(select(svg), fitTransform(size.w, size.h));
  }, [size, fitTransform]);

  // Search: zoom to the paper and pulse it once (SPEC §6.3, §7.2).
  useEffect(() => {
    const onLocate = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (!id || !isShown(id) || !size) return;
      e.preventDefault();
      wrap.current?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      setSearched(id);
      setPulse((p) => ({ id, n: (p?.n ?? 0) + 1 }));
      centerOn(id, Math.min(ZOOM_MAX, Math.max(tRef.current.k, 1.4)));
    };
    window.addEventListener('rti:locate', onLocate);
    return () => window.removeEventListener('rti:locate', onLocate);
  }, [isShown, size, centerOn]);

  useEffect(() => {
    if (!pulse) return;
    const t = window.setTimeout(() => setPulse(null), 1300);
    return () => window.clearTimeout(t);
  }, [pulse]);

  useEffect(() => {
    if (!focus && !searched) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSearched(null);
      if (focus) url.set({ focus: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, searched, url]);

  // ---- tangential category labels (SPEC §7.2): one per category, in its color, near its papers ----
  // Family names, in screen pixels at the label zoom: no other label covers them.
  const hullNames = useMemo<ScreenBox[]>(
    () =>
      clusters.map((c) => {
        const w = textWidth(families[c.id]?.name ?? c.id, 14) / 2 + 2;
        return { x0: c.cx * labelK - w, x1: c.cx * labelK + w, y0: c.top * labelK - 20, y1: c.top * labelK - 2 };
      }),
    [clusters, families, labelK],
  );
  const catGroups = useMemo(
    () => Object.keys(tx.tangent_types).map((t) => ({ id: t, members: visible.filter((n) => n.cat === t) })).filter((g) => g.members.length),
    [visible],
  );
  const catBoxes = useMemo(() => {
    if (!catGroups.length) return new Map<string, ScreenBox>();
    // The edges drawn with the chosen edge types, as polylines; labels keep off them where they can.
    const lines = pairs.flatMap((e) => {
      const [a, b] = e.key.split('|');
      const r = isShown(a) && isShown(b) ? drawnRelation(e, shown) : null;
      return r ? [geometry(r).pts] : [];
    });
    const minR = labelMinRadius(visible.map((n) => n.rr), labelK);
    return placeGroupLabels(
      catGroups.map((g) => ({
        id: g.id,
        w: Math.ceil(textWidth(tx.tangent_types[g.id].label, CAT_PX) * 1.06),
        h: CAT_H,
        members: g.members.map((n) => ({ x: n.x, y: n.y, r: n.rr, labelW: n.labelW })),
      })),
      labelK,
      {
        dots: visible.map((n) => ({ x: n.x, y: n.y, r: n.rr })),
        labels: visible.filter((n) => n.rr >= minR).map((n) => ({ x: n.x, y: n.y, r: n.rr, w: n.labelW })),
        edges: lines,
        hulls: clusters.map((c) => c.hull),
        blocks: hullNames,
        bounds,
      },
    );
    // geometry() reads the route cache for this zoom step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catGroups, visible, pairs, shown, isShown, labelK, step, geoCache, clusters, hullNames, bounds]);

  // ---- labels: always for hover, focus, selection, and search; otherwise by size, without overlaps ----
  const tier0 = useMemo(() => new Set([hovered, focus, openId, searched].filter((x): x is string => !!x && isShown(x))), [hovered, focus, openId, searched, isShown]);
  const labeled = useMemo(() => {
    const cands: LabelCandidate[] = [];
    for (const n of visible) {
      const tier = tier0.has(n.id) ? 0 : hl?.has(n.id) || (lit?.has(n.id) && lit.size <= 40) ? 1 : 2;
      if (tier === 2 && (!matches.has(n.id) || (lit && !lit.has(n.id)))) continue;
      cands.push({ id: n.id, x: n.x, y: n.y, r: n.rr, w: n.labelW, tier });
    }
    // While hovering, faded dots do not block the labels of the hovered paper and its neighbors.
    const dots = visible.map((n) => ({ id: n.id, x: n.x, y: n.y, r: n.rr, soft: !!hl && !hl.has(n.id) }));
    // Family names and category labels block node labels.
    const blocks = [...hullNames, ...catBoxes.values()];
    return placeLabels(cands, dots, labelK, { minR: labelMinRadius(visible.map((n) => n.rr), labelK), blocks });
  }, [visible, tier0, hl, lit, matches, labelK, hullNames, catBoxes]);

  // ---- hover cards ----
  const toScreen = (x: number, y: number) => tRef.current.apply([x, y]);
  const showTip = (x: number, y: number, body: ReactNode, below = 8) => {
    const [sx, sy] = toScreen(x, y);
    const w = size?.w ?? 600;
    setTip({ x: Math.max(6, Math.min(sx - 40, w - 300)), y: sy + below, body });
  };
  // A node's card sits beside it, on the side away from its neighbors, so the highlighted links stay in view.
  const nodeTip = (id: string) => {
    const n = nodes.get(id);
    if (!n || !size) return;
    const t = tRef.current;
    const [sx, sy] = t.apply([n.x, n.y]);
    const nb = [...(neighbors.get(id) ?? [])].filter(isShown).map((o) => nodes.get(o)!);
    const towardRight = nb.length ? nb.reduce((s, o) => s + o.x, 0) / nb.length > n.x : sx < size.w / 2;
    const CARD_W = 300;
    const left = sx - n.rr * t.k - 14 - CARD_W;
    const right = sx + n.rr * t.k + LABEL_GAP + n.labelW + 14;
    let x = towardRight ? left : right;
    if (x < 6 || x + CARD_W > size.w - 6) x = towardRight ? right : left;
    if (x < 6 || x + CARD_W > size.w - 6) {
      // No room at either side: below the dot.
      setTip({ x: Math.max(6, Math.min(sx - 40, size.w - CARD_W - 6)), y: sy + n.rr * t.k + 10, body: <NodeCard p={n.p} /> });
      return;
    }
    setTip({ x, y: Math.max(6, Math.min(sy - 22, size.h - 150)), body: <NodeCard p={n.p} /> });
  };
  const edgeTip = (key: string) => {
    const e = pairs.find((x) => x.key === key);
    if (!e) return;
    const r = e.relations[0];
    const g = geometry(r);
    showTip(g.mid[0], g.mid[1], (
      <ul className="plain small">
        {e.relations.map((x) => (
          <li key={`${x.type}:${x.from}:${x.to}`}>{relationText(x, label)}</li>
        ))}
      </ul>
    ));
  };
  const familyTip = (c: (typeof clusters)[number]) => {
    const fam = families[c.id];
    showTip(c.cx, c.top - 4, (
      <>
        <strong>{fam?.name ?? c.id}</strong>
        {fam?.semi_tangential && <span className="tag">Semi-tangential</span>}
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
  };

  const categoryTip = (id: string) => {
    const b = catBoxes.get(id);
    const t = tx.tangent_types[id];
    if (!b || !t) return;
    showTip(b.x0 / labelK, b.y1 / labelK, (
      <>
        <strong>{t.label}</strong>
        <span className="tag">Tangential category</span>
        <span className="small">{t.definition}</span>
      </>
    ), 4);
  };

  const idAt = (t: EventTarget | null) => (t instanceof Element ? t.closest('[data-id]')?.getAttribute('data-id') ?? null : null);
  const edgeAt = (t: EventTarget | null) => (t instanceof Element ? t.closest('[data-edge]')?.getAttribute('data-edge') ?? null : null);
  const open = (id: string) => url.set({ focus: id, paper: id }, { push: true });

  // Keyboard focus on a node off screen pans to it.
  const ensureVisible = (id: string) => {
    const n = nodes.get(id);
    if (!n || !size) return;
    const [sx, sy] = toScreen(n.x, n.y);
    const m = 30;
    if (sx < m || sx > size.w - m || sy < m || sy > size.h - m) centerOn(id);
  };

  if (!nodes.size) return <EmptyState>No unprompted (L2) methods yet.</EmptyState>;

  // ---- edges to draw ----
  const touches = (e: PairEdge, id: string | null) => !!id && e.key.split('|').includes(id);
  const edgeEls: ReactNode[] = [];
  const drawEdge = (e: PairEdge, r: Relation) => {
    const a = nodes.get(r.from)!;
    const b = nodes.get(r.to)!;
    const tangentEdge = a.tangent || b.tangent;
    const semiEdge = !tangentEdge && (isSemi(a) || isSemi(b));
    const hot = !!hovered && (r.from === hovered || r.to === hovered);
    const dim =
      !matches.has(r.from) || !matches.has(r.to) || (!!lit && !(lit.has(r.from) && lit.has(r.to)) && r.from !== focus && r.to !== focus);
    const cls = `${dim ? ' is-dim' : ''}${tangentEdge ? ' is-tangent' : ''}${semiEdge ? ' is-semi' : ''}${hot ? ' is-hl' : ''}`;
    edgeEls.push(<Edge key={`${e.key}:${r.type}`} id={e.key} rel={r} geo={geometry(r)} cls={cls} />);
  };
  for (const e of pairs) {
    const [a, b] = e.key.split('|');
    if (!isShown(a) || !isShown(b)) continue;
    const r = drawnRelation(e, shown);
    if (r) drawEdge(e, r);
    else if (touches(e, hovered) || touches(e, focus)) {
      // Cites lines always show for the hovered or selected paper (SPEC §6.2, §7.2).
      const c = e.relations.find((x) => x.type === 'cites');
      if (c) drawEdge(e, c);
    }
  }

  const hotInk = hovered ? inkOf(nodes.get(hovered)!) : null;
  const hotCat = hovered ? nodes.get(hovered)!.cat : null;
  const narrowKeys = size && size.w < 520;

  return (
    <div
      className={`litg${hl ? ' is-hovering' : ''}`}
      data-testid="literature-graph"
      style={hotInk ? ({ '--hot': hotInk } as CSSProperties) : undefined}
    >
      <GraphLegend clusters={clusterOrder} families={families} categories={legend.categories} uncategorized={legend.uncategorized} framework={legend.framework} />
      <div
        className="litg__viewport"
        ref={wrap}
        style={{ height: size?.h ?? MIN_H }}
        onPointerDown={() => {
          armed.current = true;
        }}
        onPointerLeave={() => {
          armed.current = false;
          setTip(null);
        }}
      >
        <svg
          ref={svgRef}
          className="litg__svg"
          width="100%"
          height={size?.h ?? MIN_H}
          role="group"
          aria-label="Literature graph of unprompted (L2) methods. Drag to pan; use the buttons, or Ctrl and the wheel, to zoom."
          onMouseOver={(e) => {
            const id = idAt(e.target);
            if (id) {
              if (id !== hoverId) setHover(id);
              nodeTip(id);
              return;
            }
            const ek = edgeAt(e.target);
            if (ek) edgeTip(ek);
          }}
          onMouseOut={(e) => {
            const from = idAt(e.target);
            const to = idAt(e.relatedTarget);
            if (from && to !== from && !to) {
              setHover(null);
              setTip(null);
            }
            if (edgeAt(e.target) && !edgeAt(e.relatedTarget) && !to) setTip(null);
          }}
          onFocus={(e) => {
            const id = idAt(e.target);
            if (!id || !(e.target as Element).classList.contains('litg__node')) return;
            setHover(id);
            ensureVisible(id);
            nodeTip(id);
          }}
          onBlur={(e) => {
            if (idAt(e.target) && (e.target as Element).classList.contains('litg__node')) {
              setHover(null);
              setTip(null);
            }
          }}
          onClick={(e) => {
            const id = idAt(e.target);
            if (id) {
              open(id);
              return;
            }
            const t = e.target as Element;
            if (t === e.currentTarget || t.classList.contains('litg__hull') || t.classList.contains('litg__bg')) {
              setSearched(null);
              if (focus) url.set({ focus: null });
            }
          }}
          onKeyDown={(e) => {
            const id = idAt(e.target);
            if (id && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              open(id);
            }
          }}
        >
          <defs>
            {(['builds', 'benchmarks', 'cites'] as EdgeType[]).flatMap((t) =>
              ['', '-hot', '-semi', '-half', '-faint', '-ghost'].map((h) => (
                <marker
                  key={t + h}
                  id={`litg-arrow-${t}${h}`}
                  viewBox="0 0 10 10"
                  refX="9.5"
                  refY="5"
                  markerUnits="userSpaceOnUse"
                  markerWidth={t === 'cites' ? 5 : 6.5}
                  markerHeight={t === 'cites' ? 5 : 6.5}
                  orient="auto"
                >
                  <path d="M0,1 L10,5 L0,9 z" className={`litg__arrow litg__arrow--${t}${h ? ` is-${h.slice(1)}` : ''}`} />
                </marker>
              )),
            )}
          </defs>
          <rect className="litg__bg" width="100%" height="100%" />
          <g ref={viewRef}>
            <g className="litg__hulls">
              {clusters.map((c) => (
                <path key={c.id} d={c.d} className={`litg__hull litg__hull--${c.hue}${semiFamily(c.id) ? ' is-semi' : ''}`} data-testid={`hull-${c.id}`} />
              ))}
            </g>
            <g className="litg__edges">{edgeEls}</g>
            <g className="litg__nodes">
              {ordered.map((n) => {
                const dim = !matches.has(n.id) || (lit !== null && !lit.has(n.id));
                const cls = `litg__node${n.tangent ? ' is-tangent' : ''}${isSemi(n) ? ' is-semi' : ''}${n.id === FRAMEWORK_PAPER ? ' is-framework' : ''}${dim ? ' is-dim' : ''}${focus === n.id ? ' is-focus' : ''}${
                  lit?.has(n.id) && focus !== n.id ? ' is-lit' : ''
                }${hl?.has(n.id) ? ' is-hl' : ''}${hoverId === n.id ? ' is-hover' : ''}`;
                const aria = `${n.p.short_name}, ${n.p.year}${
                  n.p.tangent ? `, tangential: ${tx.tangent_types[n.p.tangent]?.label ?? n.p.tangent}` : n.cluster ? `, ${families[n.cluster]?.name ?? ''}` : ''
                }`;
                return <Dot key={n.id} n={n} fill={fillOf(n)} cls={cls} label={aria} focusable pulse={pulse?.id === n.id ? pulse.n : 0} />;
              })}
            </g>
            <g className="litg__text" ref={textRef}>
              {clusters.map((c) => (
                <text
                  key={c.id}
                  x={c.cx}
                  y={c.top}
                  dy="-0.5em"
                  textAnchor="middle"
                  className={`litg__hull-label litg__hull-label--${c.hue}${semiFamily(c.id) ? ' is-semi' : ''}`}
                  data-testid={`hull-label-${c.id}`}
                  tabIndex={0}
                  onMouseEnter={() => {
                    setHullHot(c.id);
                    familyTip(c);
                  }}
                  onFocus={() => {
                    setHullHot(c.id);
                    familyTip(c);
                  }}
                  onMouseLeave={() => {
                    setHullHot(null);
                    setTip(null);
                  }}
                  onBlur={() => {
                    setHullHot(null);
                    setTip(null);
                  }}
                >
                  {families[c.id]?.name ?? c.id}
                </text>
              ))}
              {catGroups.map((g) => {
                const b = catBoxes.get(g.id);
                if (!b) return null;
                const dim = !g.members.some((n) => matches.has(n.id) && (!lit || lit.has(n.id)));
                return (
                  <text
                    key={g.id}
                    x={b.x0 / labelK}
                    y={(b.y0 + b.y1) / 2 / labelK}
                    dy="0.35em"
                    className={`litg__cat-label tan-ink--${tangentHue(tx.tangent_types, g.id)}${hotCat === g.id ? ' is-hl' : ''}${dim ? ' is-dim' : ''}`}
                    data-testid={`cat-label-${g.id}`}
                    data-category={g.id}
                    tabIndex={0}
                    onMouseEnter={() => categoryTip(g.id)}
                    onFocus={() => categoryTip(g.id)}
                    onMouseLeave={() => setTip(null)}
                    onBlur={() => setTip(null)}
                  >
                    {tx.tangent_types[g.id].label}
                  </text>
                );
              })}
              {ordered.map((n) =>
                labeled.has(n.id) ? (
                  <text
                    key={n.id}
                    x={n.x + n.rr}
                    y={n.y}
                    dx="0.34em"
                    dy="0.35em"
                    className={`litg__label${n.tangent ? ' is-tangent' : ''}${isSemi(n) ? ' is-semi' : ''}${hl?.has(n.id) ? ' is-hl' : ''}${
                      !tier0.has(n.id) && (!matches.has(n.id) || (lit && !lit.has(n.id))) ? ' is-dim' : ''
                    }`}
                    data-id={n.id}
                    data-testid={`label-${n.id}`}
                    aria-hidden="true"
                  >
                    {n.p.short_name}
                    {n.year && (
                      <tspan className="litg__label-year" dx="0.3em">
                        {n.year}
                      </tspan>
                    )}
                  </text>
                ) : null,
              )}
            </g>
          </g>
        </svg>
        <div className="litg__controls" role="group" aria-label="Zoom">
          <button type="button" className="litg__ctl" aria-label="Zoom in" title="Zoom in" data-testid="zoom-in" onClick={() => zoomBy(1.6)}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 3v10M3 8h10" />
            </svg>
          </button>
          <button type="button" className="litg__ctl" aria-label="Zoom out" title="Zoom out" data-testid="zoom-out" onClick={() => zoomBy(1 / 1.6)}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 8h10" />
            </svg>
          </button>
          <button type="button" className="litg__ctl" aria-label="Fit to content" title="Fit to content" data-testid="zoom-fit" onClick={fit}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
            </svg>
          </button>
        </div>
        {hint && (
          <p className="litg__hint small" role="status">
            {narrowKeys ? 'Use the buttons to zoom' : 'Hold Ctrl or ⌘ while scrolling, or click the graph first, to zoom'}
          </p>
        )}
        {tip && (
          <div className="hovercard" style={{ left: tip.x, top: tip.y }} role="tooltip">
            {tip.body}
          </div>
        )}
      </div>
    </div>
  );
}
