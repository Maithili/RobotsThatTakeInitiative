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
