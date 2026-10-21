// Component test for the datasets table (SPEC §8.5): tangential datasets sit in their own group at the bottom,
// under a "Tangential" divider. Renders to static markup, so it needs src/generated/db.json (npm run build-data).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DatasetTable } from '../src/pages/evaluations/DatasetTable.tsx';
import type { DbDataset } from '../src/schema.ts';

const row = (id: string, extra: Partial<DbDataset> = {}): DbDataset => ({
  id,
  name: `Dataset ${id}`,
  kind: 'dataset',
  links: { home: null },
  sim_or_real: 'sim',
  provenance: 'test',
  used_by: [],
  basis_of: [],
  ...extra,
});

const render = (datasets: DbDataset[]) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(DatasetTable, { datasets })));

describe('datasets table', () => {
  // The router's layout effects warn on the server renderer; that warning is expected here.
  const error = console.error;
  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (!String(args[0]).includes('useLayoutEffect does nothing on the server')) error(...args);
    });
  });
  afterAll(() => vi.restoreAllMocks());

  it('puts tangential datasets under a Tangential divider at the bottom', () => {
    const html = render([row('tan-a', { tangent: true }), row('core-a'), row('sim-a', { kind: 'simulator' }), row('core-b', { kind: 'evaluation_setup', tangent: false })]);
    const at = (s: string) => html.indexOf(s);
    expect(at('data-testid="ds-row-sim-a"')).toBe(-1);
    for (const s of ['ds-row-core-a', 'ds-row-core-b', 'ds-tangent-divider', 'ds-row-tan-a']) expect(at(s), s).toBeGreaterThan(-1);
    expect(at('ds-row-core-a')).toBeLessThan(at('ds-tangent-divider'));
    expect(at('ds-row-core-b')).toBeLessThan(at('ds-tangent-divider'));
    expect(at('ds-tangent-divider')).toBeLessThan(at('ds-row-tan-a'));
    // The tangential row sits in the tangential group, drawn part-way transparent.
    const group = html.slice(at('data-testid="ds-group-tangent"'));
    expect(group).toMatch(/^data-testid="ds-group-tangent"><tr class="group-row ds-divider" data-testid="ds-tangent-divider"><th[^>]*>Tangential/);
    expect(group).toMatch(/<tr id="ds-tan-a" class="is-tangent" data-testid="ds-row-tan-a" data-tangent="true">/);
    expect(html.slice(0, at('data-testid="ds-group-tangent"'))).not.toContain('is-tangent');
  });

  it('draws no divider when no dataset is tangential', () => {
    const html = render([row('core-a'), row('core-b')]);
    expect(html).not.toContain('ds-tangent-divider');
    expect(html).not.toContain('Tangential');
  });
});
