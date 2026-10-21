import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Math as TeX } from '../../components/Math.tsx';
import { SUBS, tx } from '../../data.ts';
import { subproblemFlow } from '../../lib/graph.ts';
import type { SubproblemId } from '../../schema.ts';

const NODE_H = 64;
const IO = 56;
const GAP = 14;
const HEAD = 30;

type Box = { x: number; y: number; w: number; h: number };

function stagesInOrder() {
  return Object.keys(tx.stages).map((st) => ({ id: st, name: tx.stages[st].name, subs: SUBS.filter((s) => tx.subproblems[s].stage === st) }));
}

function layout(width: number, horizontal: boolean) {
  const stages = stagesInOrder();
  const nodes = new Map<SubproblemId, Box>();
  const stageBoxes: (Box & { id: string; name: string })[] = [];
  let input: Box;
  let output: Box;
  let height: number;
  if (horizontal) {
    const maxN = Math.max(...stages.map((s) => s.subs.length));
    const stageW = (width - 2 * IO - 4 * GAP) / stages.length;
    const nodeW = Math.min(stageW - 20, 210);
    height = HEAD + maxN * (NODE_H + GAP) + GAP;
    stages.forEach((st, i) => {
      const x = IO + GAP + i * (stageW + GAP);
      stageBoxes.push({ id: st.id, name: st.name, x, y: 0, w: stageW, h: height });
      const stackH = st.subs.length * (NODE_H + GAP) - GAP;
      const y0 = HEAD + (height - HEAD - stackH) / 2;
      st.subs.forEach((s, j) => nodes.set(s, { x: x + (stageW - nodeW) / 2, y: y0 + j * (NODE_H + GAP), w: nodeW, h: NODE_H }));
    });
    input = { x: 0, y: height / 2 - 20, w: IO - 8, h: 40 };
    output = { x: width - IO + 8, y: height / 2 - 20, w: IO - 8, h: 40 };
  } else {
    let y = 48;
    input = { x: width / 2 - 28, y: 0, w: 56, h: 34 };
    for (const st of stages) {
      const n = st.subs.length;
      const nodeW = Math.min((width - 24 - GAP * (n - 1)) / n, 200);
      const rowW = n * nodeW + (n - 1) * GAP;
      const h = HEAD + NODE_H + GAP;
      stageBoxes.push({ id: st.id, name: st.name, x: 0, y, w: width, h });
      st.subs.forEach((s, j) => nodes.set(s, { x: (width - rowW) / 2 + j * (nodeW + GAP), y: y + HEAD, w: nodeW, h: NODE_H }));
      y += h + GAP;
    }
    output = { x: width / 2 - 28, y, w: 56, h: 34 };
    height = y + 34;
  }
  return { nodes, stageBoxes, input, output, height };
}

function edgePath(a: Box, b: Box, horizontal: boolean): string {
  if (horizontal) {
    if (Math.abs(a.x - b.x) < 2) {
      // same column: loop out on the right
      const x = a.x + a.w;
      const y1 = a.y + a.h / 2;
      const y2 = b.y + b.h / 2;
      return `M${x},${y1} C${x + 26},${y1} ${x + 26},${y2} ${x + 2},${y2}`;
    }
    const x1 = a.x + a.w;
    const y1 = a.y + a.h / 2;
    const x2 = b.x;
    const y2 = b.y + b.h / 2;
    const mx = (x1 + x2) / 2;
    return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 3},${y2}`;
  }
  if (Math.abs(a.y - b.y) < 2) {
    const y = a.y + a.h;
    const x1 = a.x + a.w / 2;
    const x2 = b.x + b.w / 2;
    return `M${x1},${y} C${x1},${y + 22} ${x2},${y + 22} ${x2},${y + 2}`;
  }
  const x1 = a.x + a.w / 2;
  const y1 = a.y + a.h;
  const x2 = b.x + b.w / 2;
  const y2 = b.y;
  const my = (y1 + y2) / 2;
  return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2 - 3}`;
}

/** Interactive RTI Fig. 2: ξ → Grounding → Anticipation → Planning → aʳ. */
export function SubproblemNavigator({ selected, onSelect, counts }: { selected: SubproblemId | null; onSelect: (s: SubproblemId | null) => void; counts: Record<string, number> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const horizontal = width >= 860;
  const L = useMemo(() => layout(width, horizontal), [width, horizontal]);
  const dependsOn = useMemo(() => Object.fromEntries(SUBS.map((s) => [s, tx.subproblems[s].depends_on])), []);
  const flow = selected ? subproblemFlow(selected, dependsOn) : null;
  const role = (s: SubproblemId) => (!flow ? '' : s === selected ? 'is-selected' : flow.upstream.has(s) ? 'is-up' : flow.downstream.has(s) ? 'is-down' : 'is-dim');

  const edges = SUBS.flatMap((s) => tx.subproblems[s].depends_on.map((d) => ({ from: d, to: s })));
  const firstGround = L.stageBoxes[0];
  const lastPlan = SUBS.filter((s) => tx.subproblems[s].stage === 'planning').pop()!;

  return (
    <section className="card subnav" aria-label="Subproblem map">
      <div className="subnav__legend small">
        <span>
          <span className="swatch swatch--up" aria-hidden="true" /> Upstream (depends on)
        </span>
        <span>
          <span className="swatch swatch--down" aria-hidden="true" /> Downstream (feeds)
        </span>
        <span className="muted">Badge: works that address it under current filters</span>
      </div>
      <div ref={ref} className={`subnav__canvas${horizontal ? '' : ' is-vertical'}`} style={{ height: L.height }}>
        {L.stageBoxes.map((st) => (
          <div key={st.id} className={`subnav__stage subnav__stage--${st.id}`} style={{ left: st.x, top: st.y, width: st.w, height: st.h }} title={tx.stages[st.id].definition}>
            <span className="subnav__stage-name">{st.name}</span>
          </div>
        ))}
        <svg className="subnav__edges" width={width} height={L.height} aria-hidden="true">
          <defs>
            <marker id="sarrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="subnav__head" />
            </marker>
          </defs>
          <path
            d={
              horizontal
                ? `M${L.input.x + L.input.w},${L.input.y + L.input.h / 2} L${firstGround.x - 3},${L.input.y + L.input.h / 2}`
                : `M${L.input.x + L.input.w / 2},${L.input.y + L.input.h} L${L.input.x + L.input.w / 2},${firstGround.y - 3}`
            }
            className="subnav__edge"
            markerEnd="url(#sarrow)"
          />
          {(() => {
            const b = L.nodes.get(lastPlan)!;
            const d = horizontal
              ? `M${b.x + b.w},${b.y + b.h / 2} C${L.output.x - 10},${b.y + b.h / 2} ${L.output.x - 20},${L.output.y + L.output.h / 2} ${L.output.x - 3},${L.output.y + L.output.h / 2}`
              : `M${b.x + b.w / 2},${b.y + b.h} L${L.output.x + L.output.w / 2},${L.output.y - 3}`;
            return <path d={d} className="subnav__edge" markerEnd="url(#sarrow)" />;
          })()}
          {edges.map((e) => {
            const a = L.nodes.get(e.from)!;
            const b = L.nodes.get(e.to)!;
            let cls = 'subnav__edge';
            if (flow && selected) {
              const inUp = (flow.upstream.has(e.from) || e.from === selected) && (flow.upstream.has(e.to) || e.to === selected);
              const inDown = (flow.downstream.has(e.to) || e.to === selected) && (flow.downstream.has(e.from) || e.from === selected);
              cls += inUp ? ' is-up' : inDown ? ' is-down' : ' is-dim';
            }
            return <path key={`${e.from}-${e.to}`} d={edgePath(a, b, horizontal)} className={cls} markerEnd="url(#sarrow)" />;
          })}
        </svg>
        <div className="subnav__io" style={{ left: L.input.x, top: L.input.y, width: L.input.w, height: L.input.h }} title="Observed history of user actions">
          <TeX tex={'\\xi_{0:t}'} />
        </div>
        <div className="subnav__io" style={{ left: L.output.x, top: L.output.y, width: L.output.w, height: L.output.h }} title="Robot action">
          <TeX tex={'a^r_t'} />
        </div>
        {SUBS.map((s) => {
          const b = L.nodes.get(s)!;
          const S = tx.subproblems[s];
          return (
            <button
              key={s}
              type="button"
              className={`subnav__node ${role(s)}`}
              style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
              aria-pressed={selected === s}
              data-testid={`subnode-${s}`}
              data-flow={role(s).replace('is-', '') || 'none'}
              onClick={() => onSelect(selected === s ? null : s)}
            >
              <span className="subnav__id">{s}</span>
              <span className="subnav__name">{S.name}</span>
              <span className="subnav__badge" aria-label={`${counts[s] ?? 0} works address ${s}`}>
                {counts[s] ?? 0}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
