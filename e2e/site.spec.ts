import { expect, test, type Page } from '@playwright/test';

// SPEC §13 end-to-end tests, numbered as in the spec.

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const params = (page: Page) => new URLSearchParams(new URL(page.url()).hash.split('?')[1] ?? '');

test('1. each page loads with no console errors', async ({ page }) => {
  const errors = trackErrors(page);
  for (const path of ['methods', 'evaluations', 'subproblems']) {
    await page.goto(`/#/${path}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  await page.goto('/#/subproblems?view=matrix');
  await expect(page.getByTestId('matrix')).toBeVisible();
  await page.goto('/#/methods?view=list');
  await expect(page.getByTestId('methods-list')).toBeVisible();
  expect(errors).toEqual([]);
});

test('2. a family filter set on Methods survives switching to Subproblems, and Back restores it', async ({ page }) => {
  await page.goto('/#/methods?view=graph');
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByRole('group', { name: 'Family' }).getByRole('button', { name: 'Goal Inference' }).click();
  await expect.poll(() => params(page).get('family')).toBe('goal_inference');
  await page.getByRole('link', { name: 'Subproblems' }).click();
  await expect(page).toHaveURL(/#\/subproblems/);
  expect(params(page).get('family')).toBe('goal_inference');
  await expect(page.getByRole('button', { name: 'Remove filter Family: Goal Inference' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/methods/);
  expect(params(page).get('family')).toBe('goal_inference');
  await expect(page.getByRole('button', { name: 'Remove filter Family: Goal Inference' })).toBeVisible();
});

test('3. ?paper=gap opens the drawer and Esc closes it', async ({ page }) => {
  await page.goto('/#/methods?paper=gap');
  const drawer = page.getByTestId('drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('GAP');
  await expect(drawer).toContainText('Robots That Take Initiative');
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  expect(params(page).get('paper')).toBeNull();
});

test('4. hovering a timeline chip highlights the graph node; GAP sits outside both cluster hulls', async ({ page }) => {
  await page.goto('/#/methods?view=graph');
  await expect(page.locator('.levelnav__toggles')).toHaveCount(0);
  await expect(page.getByTestId('levelcard-L0')).toHaveCount(0);
  await page.getByTestId('tchip-slate-pro').hover();
  await expect(page.getByTestId('node-slate-pro')).toHaveAttribute('data-hover', 'true');
  await page.getByTestId('node-nopa').hover();
  await expect(page.getByTestId('tchip-nopa')).toHaveAttribute('data-hover', 'true');
  await expect(page.getByTestId('tchip-slate-pro')).toHaveAttribute('data-hover', 'false');

  const hulls = page.locator('[data-testid^="hull-"]');
  await expect(hulls).toHaveCount(2);
  const inside = await page.evaluate(() => {
    const node = document.querySelector<SVGGElement>('[data-testid="node-gap"]')!;
    const cx = Number(node.getAttribute('data-cx'));
    const cy = Number(node.getAttribute('data-cy'));
    const svg = node.ownerSVGElement!;
    const pt = svg.createSVGPoint();
    pt.x = cx;
    pt.y = cy;
    return [...document.querySelectorAll<SVGPathElement>('[data-testid^="hull-"]')].map((h) => h.isPointInFill(pt));
  });
  expect(inside).toEqual([false, false]);
  // Cluster members do sit inside their own hull.
  const own = await page.evaluate(() => {
    const node = document.querySelector<SVGGElement>('[data-testid="node-slate-pro"]')!;
    const pt = node.ownerSVGElement!.createSVGPoint();
    pt.x = Number(node.getAttribute('data-cx'));
    pt.y = Number(node.getAttribute('data-cy'));
    return document.querySelector<SVGPathElement>('[data-testid="hull-temporal_imitation"]')!.isPointInFill(pt);
  });
  expect(own).toBe(true);
});

test('5. clicking ΔC↑ leaves net actions saved, perturbed actions, and F1 in the metrics list', async ({ page }) => {
  await page.goto('/#/evaluations');
  await page.getByTestId('term-dC_added').click();
  await expect.poll(() => params(page).get('term')).toBe('dC_added');
  const list = page.getByTestId('metrics-list');
  await expect(list.getByRole('listitem')).toHaveCount(3);
  for (const label of ['Net actions saved', 'Perturbed actions', 'F1']) await expect(list).toContainText(label);
});

test('6. the featured chart shows 2 bars, then 6 after the toggle', async ({ page }) => {
  await page.goto('/#/evaluations');
  await expect(page.getByTestId('featured-bar')).toHaveCount(2);
  await page.getByTestId('add-closed-loop').check();
  await expect(page.getByTestId('featured-bar')).toHaveCount(6);
});

test('7. selecting A2 lists NOPA, highlights G1, G2, A1 upstream and P2 downstream', async ({ page }) => {
  await page.goto('/#/subproblems');
  await page.getByTestId('subnode-A2').click();
  await expect.poll(() => params(page).get('sub')).toBe('A2');
  await expect(page.getByTestId('sub-detail')).toContainText('NOPA');
  for (const s of ['G1', 'G2', 'A1']) await expect(page.getByTestId(`subnode-${s}`)).toHaveAttribute('data-flow', 'up');
  await expect(page.getByTestId('subnode-P2')).toHaveAttribute('data-flow', 'down');
  for (const s of ['A3', 'P1']) await expect(page.getByTestId(`subnode-${s}`)).toHaveAttribute('data-flow', 'dim');
});

test('8. in matrix view, clicking a filled cell opens the drawer; goal inference does not list SLaTe-PRO', async ({ page }) => {
  await page.goto('/#/subproblems?view=matrix');
  await expect(page.getByTestId('cell-nopa-A2').getByRole('img', { name: 'Addresses' })).toBeVisible();
  // SLaTe-PRO skips goal inference: blank cell, not a button.
  await expect(page.getByTestId('cell-slate-pro-A2')).not.toHaveRole('button');
  await page.getByTestId('cell-nopa-A2').click();
  await expect(page.getByTestId('drawer')).toContainText('NOPA');
  expect(params(page).get('paper')).toBe('nopa');

  await page.goto('/#/subproblems?sub=A2');
  const detail = page.getByTestId('sub-detail');
  await expect(detail).toContainText('NOPA');
  await expect(detail).not.toContainText('SLaTe-PRO');
  await expect(page.getByTestId('work-slate-pro')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Status' })).toHaveCount(0);
});

test('9. pinning two papers puts both ids in compare=', async ({ page }) => {
  await page.goto('/#/methods?paper=gap');
  await page.getByTestId('drawer').getByRole('button', { name: 'Pin to compare' }).click();
  await page.goto('/#/methods?paper=nopa&compare=gap');
  await page.getByTestId('drawer').getByRole('button', { name: 'Pin to compare' }).click();
  await expect.poll(() => params(page).get('compare')).toBe('gap,nopa');
  await expect(page.getByTestId('compare-tray')).toContainText('GAP');
  await expect(page.getByTestId('compare-tray')).toContainText('NOPA');
});

test('10. at 375 px wide, no page scrolls horizontally', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  for (const path of ['methods', 'methods?view=graph', 'evaluations', 'subproblems', 'subproblems?view=matrix', 'methods?paper=gap&compare=gap,nopa']) {
    await page.goto(`/#/${path}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
  }
});

test('search opens a paper from the header box', async ({ page }) => {
  await page.goto('/#/methods');
  await page.keyboard.press('/');
  await page.keyboard.type('slate');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('drawer')).toContainText('SLaTe-PRO');
});

test('the literature graph lays out the synthetic fixture: 60 L2 papers in 4 clusters plus 15 tangential works', async ({ page }) => {
  await page.goto('/#/methods?view=graph&synthetic=1');
  await expect(page.locator('[data-testid^="node-synthetic-"]')).toHaveCount(75);
  await expect(page.locator('[data-testid^="node-synthetic-t"]')).toHaveCount(15);
  await expect(page.locator('[data-testid^="hull-"]')).toHaveCount(4);
  const overlaps = await page.evaluate(() => {
    const rects = [...document.querySelectorAll('[data-testid^="node-synthetic-"] .litg__pill')].map((n) => n.getBoundingClientRect());
    let n = 0;
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) n++;
      }
    return n;
  });
  expect(overlaps).toBe(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('11. the STOT to SLaTe-PRO edge is solid, and unchecking Cites removes every dotted edge', async ({ page }) => {
  await page.goto('/#/methods?view=graph');
  const e = page.getByTestId('edge-stot-slate-pro');
  await expect(e).toHaveAttribute('data-type', 'builds');
  await expect(page.getByTestId('edge-slate-pro-gap')).toHaveAttribute('data-type', 'benchmarks');
  await page.getByTestId('edges-cites').uncheck();
  await expect.poll(() => params(page).get('edges')).toBe('builds,benchmarks');
  await expect(page.locator('[data-type="cites"]')).toHaveCount(0);
  await expect(e).toHaveAttribute('data-type', 'builds');
  await page.getByTestId('edges-builds').uncheck();
  // With builds hidden, the pair falls back to its next relation or disappears.
  await expect(page.locator('[data-testid="edge-stot-slate-pro"][data-type="builds"]')).toHaveCount(0);
  await page.getByTestId('edges-builds').check();
  await page.getByTestId('edges-cites').check();
  await expect.poll(() => params(page).get('edges')).toBeNull();
});

test('selecting a level card highlights its timeline row only', async ({ page }) => {
  await page.goto('/#/methods?view=graph');
  const nodes = page.locator('[data-testid^="node-"]');
  const count = await nodes.count();
  await page.getByTestId('levelcard-L1').click();
  await expect.poll(() => params(page).get('level')).toBe('L1');
  await expect(page.getByTestId('levelcard-L1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('timeline-L1')).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('timeline-L2')).toHaveAttribute('data-selected', 'false');
  // The graph and the filter bar ignore it.
  await expect(nodes).toHaveCount(count);
  await expect(page.locator('[data-testid^="node-"].is-dim')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Remove filter Level/ })).toHaveCount(0);
  await page.getByTestId('levelcard-L1').click();
  await expect.poll(() => params(page).get('level')).toBeNull();
  await expect(page.getByTestId('timeline-L1')).toHaveAttribute('data-selected', 'false');
});

test('no subproblem codes appear as visible text', async ({ page }) => {
  // Codes (G1 to P2) stay in data files and URLs only (SPEC §11). RTI section references such as
  // "§III-A3" in provenance lines are section numbers, not subproblem codes, so they are skipped.
  const CODE = /\b[GAP][1-3]\b/;
  const views = [
    'methods',
    'methods?view=list',
    'evaluations',
    'subproblems',
    'subproblems?sub=A2',
    'subproblems?sub=P1',
    'subproblems?view=matrix',
    'methods?paper=gap',
    'methods?paper=slate-pro&compare=gap,slate-pro',
  ];
  for (const v of views) {
    await page.goto(`/#/${v}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    if (v.includes('compare=')) {
      await page.getByTestId('compare-tray').getByRole('button', { name: /^Compare/ }).click();
      await expect(page.getByRole('dialog', { name: 'Compare papers' })).toBeVisible();
    }
    const text = (await page.evaluate(() => document.body.innerText)).replace(/https?:\/\/\S+/g, '').replace(/§[\w.\-]+/g, '');
    const hit = text.match(new RegExp(`.{0,30}${CODE.source}.{0,30}`));
    expect(hit?.[0] ?? null, `subproblem code visible on ${v}`).toBeNull();
  }
});

test('12. datasets table has no simulator rows; GAP has one shaded protocol row that stays first', async ({ page }) => {
  await page.goto('/#/evaluations');
  const ds = page.getByTestId('dataset-table');
  await expect(ds.getByTestId('ds-row-virtualhome')).toHaveCount(0);
  await expect(ds.getByTestId('ds-row-homer-plus')).toContainText('VirtualHome');
  await expect(ds.getByTestId('ds-row-rti-closed-loop')).toContainText('Setup');
  const table = page.getByTestId('protocol-table');
  await expect(table.getByTestId('protocol-gap')).toHaveCount(1);
  const first = table.locator('tbody tr').first();
  await expect(first).toHaveAttribute('data-testid', 'protocol-gap');
  await expect(first).toHaveClass(/is-framework/);
  await expect(first.getByRole('link', { name: /Framework paper/ })).toHaveAttribute('href', 'https://arxiv.org/abs/2609.28910');
  await expect(first.locator('.loop-pill')).toHaveCount(3);
  for (const k of ['year', 'year', 'paper', 'loop']) {
    await page.getByTestId(`psort-${k}`).click();
    await expect(table.locator('tbody tr').first()).toHaveAttribute('data-testid', 'protocol-gap');
  }
  // Filters can still hide it.
  await page.getByTestId('loop-filter').selectOption('offline_replay');
  await expect.poll(() => params(page).get('loop')).toBe('offline_replay');
  await page.goto('/#/evaluations?loop=user_study_short');
  await expect(page.getByTestId('protocol-gap')).toHaveCount(0);
});

test('13. the realism plot puts GAP at task-specific policy and adaptive simulated user, simulator opacity', async ({ page }) => {
  await page.goto('/#/evaluations');
  const dot = page.getByTestId('realism-dot-gap');
  await expect(dot).toHaveAttribute('data-robot', 'task_specific');
  await expect(dot).toHaveAttribute('data-human', 'adaptive_sim');
  await expect(dot).toHaveAttribute('data-env', 'simulator');
  await expect(dot).toHaveAttribute('data-opacity', '0.25');
  await dot.hover();
  const card = page.getByTestId('realism-card');
  await expect(card).toBeVisible();
  const link = card.getByRole('link', { name: 'Paper ↗' });
  await expect(link).toHaveAttribute('href', 'https://arxiv.org/abs/2609.28910');
  await link.hover();
  await expect(card).toBeVisible();
  await expect(page.getByText('Organization adapted from')).toHaveCount(0);
});

test('14. a tangential work renders at half opacity, and unchecking Show tangential works removes it and its edges', async ({ page }) => {
  await page.goto('/#/methods?view=graph');
  const koch = page.getByTestId('node-koch-2024-proactive-hri-review');
  await expect(koch).toHaveAttribute('data-tangent', 'hri');
  await expect(koch).toHaveCSS('opacity', '0.5');
  await expect(page.getByTestId('tchip-koch-2024-proactive-hri-review')).toHaveCount(0);
  await koch.hover();
  await expect(koch).toHaveCSS('opacity', '1');
  await expect(page.getByLabel('Surveys')).toHaveCount(0);

  // The fixture has tangential works with edges.
  await page.goto('/#/methods?view=graph&synthetic=1');
  const t = page.getByTestId('node-synthetic-t0');
  await expect(t).toHaveCSS('opacity', '0.5');
  const tangentEdges = page.locator('.litg__edges g.is-tangent');
  expect(await tangentEdges.count()).toBeGreaterThan(0);
  await page.getByTestId('show-tangents').uncheck();
  await expect.poll(() => params(page).get('tangents')).toBe('0');
  await expect(page.locator('[data-testid^="node-synthetic-t"]')).toHaveCount(0);
  await expect(tangentEdges).toHaveCount(0);
  await expect(page.locator('[data-testid^="node-synthetic-"]')).toHaveCount(60);
});

test('the list view ends with tangential works grouped by type', async ({ page }) => {
  await page.goto('/#/methods?view=list');
  const groups = page.locator('[data-testid^="list-group-"]');
  await expect(groups.last()).toHaveAttribute('data-testid', 'list-group-tangent:hri');
  await expect(groups.last()).toContainText('Koch van den Broek 2024');
});
