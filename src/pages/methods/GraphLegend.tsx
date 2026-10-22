// Legend for the literature graph (SPEC §7.2): a compact row directly above the graph that wraps on narrow screens.
// Edge styles with their checkboxes, families with their hull tints, tangential categories with their dot colors and
// no hull, gray for papers with no category, the framework-paper ring, dot size and darkness, and the
// "Show tangential works" checkbox. No action-type or level groups.
import { tx } from '../../data.ts';
import { EDGE_LABEL, EDGE_TYPES, edgeParam, parseEdgeTypes, type EdgeType } from '../../lib/edges.ts';
import { useUrl } from '../../state/url.ts';
import { familyHue, tangentHue, TANGENTS_IN_GRAPH, type FamilyInfo } from './constants.ts';

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
  clusters,
  families,
  categories,
  uncategorized,
  framework,
}: {
  /** Families with papers in the graph, in taxonomy order. */
  clusters: string[];
  families: Record<string, FamilyInfo>;
  /** Tangential categories with papers in the graph, in taxonomy order. */
  categories: string[];
  /** Whether some paper fits no category and shows gray. */
  uncategorized: boolean;
  /** Whether the framework paper is in the graph. */
  framework: boolean;
}) {
  const url = useUrl();
  const shown = parseEdgeTypes(url.get('edges'));
  return (
    <aside className="litg__legend" aria-label="Legend" data-testid="graph-legend">
      <div className="lgd__group" role="group" aria-label="Edges">
        <span className="lgd__title">Edges</span>
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
      {clusters.length > 0 && (
        <div className="lgd__group" role="group" aria-label="Families">
          <span className="lgd__title">Families</span>
          {clusters.map((c) => {
            const semi = !!families[c]?.semi_tangential;
            const hue = familyHue(families, c);
            return (
              <span key={c} className="lgd__item" data-testid={`legend-family-${c}`} title={semi ? 'Semi-tangential family: drawn lighter until hovered' : families[c]?.definition}>
                <span className={`lgd__hull lgd__hull--${hue}${semi ? ' is-semi' : ''}`} aria-hidden="true">
                  <span className={`lgd__dot lgd__dot--${hue}`} />
                </span>
                {families[c]?.name ?? c}
                {semi && <span className="muted">· semi-tangential</span>}
              </span>
            );
          })}
        </div>
      )}
      {categories.length > 0 && (
        <div className="lgd__group" role="group" aria-label="Tangential categories">
          <span className="lgd__title">Tangential</span>
          {categories.map((t) => (
            <span key={t} className="lgd__item" data-testid={`legend-tangent-${t}`} title={tx.tangent_types[t]?.definition}>
              <span className={`lgd__dot lgd__dot--tan tan-dot--${tangentHue(tx.tangent_types, t)}`} aria-hidden="true" />
              {tx.tangent_types[t]?.label ?? t}
            </span>
          ))}
        </div>
      )}
      <div className="lgd__group" role="group" aria-label="Dots">
        <span className="lgd__title">Dots</span>
        {uncategorized && (
          <span className="lgd__item" data-testid="legend-none">
            <span className="lgd__dot lgd__dot--none" aria-hidden="true" /> No category
          </span>
        )}
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
