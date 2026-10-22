// Legend for the literature graph (SPEC §7.2): a compact row directly above the graph that wraps on narrow screens.
// Edge styles with their checkboxes, the framework-paper ring, dot size and darkness, and the "Show tangential works"
// checkbox. Families and tangential categories are named on the graph itself, so the legend has no rows for them, and no
// group titles (per Maithili, Oct 22 2026).
import { EDGE_LABEL, EDGE_TYPES, edgeParam, parseEdgeTypes, type EdgeType } from '../../lib/edges.ts';
import { useUrl } from '../../state/url.ts';
import { TANGENTS_IN_GRAPH } from './constants.ts';

/** Edge legend sample: a short line in the edge's style with a small arrowhead. */
function EdgeSample({ type }: { type: EdgeType }) {
  return (
    <svg width="30" height="10" viewBox="0 0 30 10" aria-hidden="true" className="lgd__edge">
      <path d="M1,5 H23" className={`litg__edge litg__edge--${type}`} />
      <path d={type === 'cites' ? 'M23,2.6 L28,5 L23,7.4 z' : 'M22,2 L28.5,5 L22,8 z'} className={`litg__arrow litg__arrow--${type}`} />
    </svg>
  );
}

const EDGE_LEGEND: Record<EdgeType, string> = {
  builds: EDGE_LABEL.builds.name,
  benchmarks: EDGE_LABEL.benchmarks.name,
  cites: 'Show all citation lines',
};

export function GraphLegend({
  framework,
}: {
  /** Whether the framework paper is in the graph. */
  framework: boolean;
}) {
  const url = useUrl();
  const shown = parseEdgeTypes(url.get('edges'));
  return (
    <aside className="litg__legend" aria-label="Legend" data-testid="graph-legend">
      <div className="lgd__group" role="group" aria-label="Edges">
        {EDGE_TYPES.map((t) => (
          <label key={t} className="check lgd__item">
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
            <EdgeSample type={t} />
            {EDGE_LEGEND[t]}
          </label>
        ))}
      </div>
      <div className="lgd__group" role="group" aria-label="Dots">
        {framework && (
          <span className="lgd__item" data-testid="legend-framework">
            <span className="lgd__dot lgd__dot--framework lgd__dot--ring" aria-hidden="true" /> Framework paper
          </span>
        )}
        <span className="lgd__item">
          <span className="lgd__sizes" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          Larger: more links
        </span>
        <span className="lgd__item">
          <span className="lgd__ramp" aria-hidden="true" />
          Darker: newer
        </span>
      </div>
      {TANGENTS_IN_GRAPH && (
        <label className="check lgd__item lgd__toggle">
          <input type="checkbox" checked={url.get('tangents') !== '0'} data-testid="show-tangents" onChange={(e) => url.set({ tangents: e.target.checked ? null : '0' })} />
          Show tangential works
        </label>
      )}
    </aside>
  );
}
