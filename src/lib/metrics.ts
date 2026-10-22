// Metric display helpers (SPEC §5.1, §8.6). Pure, so tests can import them without the generated database.

export type MetricDirection = 'higher' | 'lower';

export const DIRECTION: Record<MetricDirection, { glyph: string; label: string }> = {
  higher: { glyph: '↑', label: 'Higher is better' },
  lower: { glyph: '↓', label: 'Lower is better' },
};

/** Tooltip for a metric chip: definition and kind, then direction and unit. */
export function metricTooltip(m: { definition: string; kind: string; direction: MetricDirection; unit: string }): string {
  const d = DIRECTION[m.direction];
  return `${m.definition} (${m.kind}) · ${d.glyph} ${d.label.toLowerCase()} · unit: ${m.unit}`;
}

interface CategorizedMetric {
  terms: string[];
  direction: MetricDirection;
  unit: string;
  category?: string;
  group?: string;
}

/** One item in a metrics tab (SPEC §8.6): a metric on its own (`group` null, one member), or a group of metrics. */
export interface MetricItem {
  /** The metric id, or the group id. */
  id: string;
  group: string | null;
  members: string[];
}

/** The items of one category, in taxonomy order. A group sits at its first member's place, with its members in
 *  taxonomy order. `keep` drops metrics, such as those no paper on the page uses; a group with no kept member drops. */
export function categoryItems(category: string, metrics: Record<string, CategorizedMetric>, keep: (id: string) => boolean = () => true): MetricItem[] {
  const items: MetricItem[] = [];
  const groups = new Map<string, MetricItem>();
  for (const [id, m] of Object.entries(metrics)) {
    if (m.category !== category || !keep(id)) continue;
    if (!m.group) {
      items.push({ id, group: null, members: [id] });
      continue;
    }
    const g = groups.get(m.group);
    if (g) g.members.push(id);
    else {
      const item = { id: m.group, group: m.group, members: [id] };
      groups.set(m.group, item);
      items.push(item);
    }
  }
  return items;
}

/** What an item shows: its members' terms (in `termOrder`), their shared direction or null if they differ, and units. */
export function itemSummary(item: MetricItem, metrics: Record<string, CategorizedMetric>, termOrder: string[]) {
  const ms = item.members.map((id) => metrics[id]);
  const terms = termOrder.filter((t) => ms.some((m) => m.terms.includes(t)));
  const dirs = [...new Set(ms.map((m) => m.direction))];
  return { terms, direction: dirs.length === 1 ? dirs[0] : null, units: [...new Set(ms.map((m) => m.unit))] };
}
