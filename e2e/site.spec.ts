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

/** Moves the mouse off the graph, so no hover state leaks into a check, and waits until the graph's zoom transform
 *  stops changing (fit on load, or a zoom animation). */
async function settleGraph(page: Page) {
  await page.mouse.move(1, 1);
  const view = page.locator('.litg__svg > g').first();
  await expect(view).toHaveAttribute('transform', /./);
  await expect(page.locator('.litg.is-hovering')).toHaveCount(0);
  let last = await view.getAttribute('transform');
  await expect
    .poll(async () => {
      const now = await view.getAttribute('transform');
      const same = now === last;
      last = now;
      return same;
    }, { intervals: [150] })
    .toBe(true);
}

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

test('2. a family filter set on Methods survives switching to Subproblems, Back restores it, and no L1 paper shows outside the top band', async ({ page }) => {
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

  // L1 papers sit in the Methods top band only (SPEC §6.2 Level scope).
  await page.goto('/#/methods?view=graph');
  const l1 = await page.getByTestId('timeline-L1').locator('[data-testid^="tchip-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.slice('tchip-'.length)));
  expect(l1.length).toBeGreaterThan(0);
  const none = async (selector: (id: string) => string, where: string) => {
    for (const id of l1) await expect(page.locator(selector(id)), `${id} on ${where}`).toHaveCount(0);
  };
  await expect(page.getByTestId('node-gap')).toBeVisible();
  await none((id) => `[data-testid="node-${id}"]`, 'the graph');
  await page.goto('/#/methods?view=list');
  await expect(page.getByTestId('methods-list')).toBeVisible();
  await none((id) => `[data-testid="methods-list"] [data-locate="${id}"]`, 'the list');
  await page.goto('/#/evaluations');
  await expect(page.getByTestId('protocol-gap')).toBeVisible();
  await none((id) => `[data-testid="protocol-${id}"]`, 'the protocols table');
  await expect(page.getByTestId('realism-dot-gap')).toBeVisible();
  await none((id) => `[data-testid="realism-dot-${id}"]`, 'the realism plot');
  await page.goto('/#/subproblems?view=matrix');
  await expect(page.getByTestId('matrix')).toBeVisible();
  await none((id) => `[data-testid="matrix"] [data-locate="${id}"]`, 'the matrix');
  for (const sub of ['G1', 'G2', 'A1', 'A2', 'A3', 'P1', 'P2']) {
    await page.goto(`/#/subproblems?sub=${sub}`);
    await expect(page.getByTestId('sub-detail')).toBeVisible();
    await none((id) => `[data-testid="work-${id}"]`, `the ${sub} detail`);
  }
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
  await page.getByTestId('tchip-slate-pro').hover();
  await expect(page.getByTestId('node-slate-pro')).toHaveAttribute('data-hover', 'true');
  await page.getByTestId('node-nopa').hover();
  await expect(page.getByTestId('tchip-nopa')).toHaveAttribute('data-hover', 'true');
  await expect(page.getByTestId('tchip-slate-pro')).toHaveAttribute('data-hover', 'false');

  // One hull per family with papers in the graph (two in the seed); GAP sits outside every one.
  const hulls = page.locator('path[data-testid^="hull-"]');
  expect(await hulls.count()).toBeGreaterThanOrEqual(2);
  const inside = await page.evaluate(() => {
    const node = document.querySelector<SVGGElement>('[data-testid="node-gap"]')!;
    const cx = Number(node.getAttribute('data-cx'));
    const cy = Number(node.getAttribute('data-cy'));
    const svg = node.ownerSVGElement!;
    const pt = svg.createSVGPoint();
    pt.x = cx;
    pt.y = cy;
    return [...document.querySelectorAll<SVGPathElement>('path[data-testid^="hull-"]')].map((h) => h.isPointInFill(pt));
  });
  expect(inside.length).toBeGreaterThanOrEqual(2);
  expect(inside.every((x) => !x)).toBe(true);
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

test('5. clicking ΔC↑ counts 12 metrics, hides tabs and rows with none, and keeps net actions saved, perturbed actions, and F1', async ({ page }) => {
  await page.goto('/#/evaluations');
  const term = page.getByTestId('term-dC_added');
  // Only categorized metrics count (SPEC §8.1).
  await expect(term.locator('.term__count')).toHaveText('12');
  await term.click();
  await expect.poll(() => params(page).get('term')).toBe('dC_added');
  await expect(page.getByTestId('metric-tabs').getByRole('tab')).toHaveText([
    'Change in user actions',
    'Object movement prediction',
    'Activity label prediction',
    'Task performance',
    'End-user perceptions',
  ]);
  const list = page.getByTestId('metrics-list');
  await expect(list.getByRole('listitem')).toHaveCount(2);
  for (const label of ['Net actions saved', 'Perturbed actions']) await expect(list).toContainText(label);
  // Papers with no ΔC↑ metric leave the table.
  const table = page.getByTestId('protocol-table');
  for (const id of ['gap', 'slate-pro', 'nopa']) await expect(table.getByTestId(`protocol-${id}`)).toHaveCount(1);
  for (const id of ['proact', 'anticipatory-tamp']) await expect(table.getByTestId(`protocol-${id}`)).toHaveCount(0);
  await page.getByTestId('metric-tab-object_movement_prediction').click();
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(list.getByTestId('metric-f1')).toContainText('F1');
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

test('the literature graph lays out the synthetic fixture: 300 L2 papers in 4 clusters plus 30 tangential works', async ({ page }) => {
  await page.goto('/#/methods?view=graph&synthetic=1');
  await expect(page.locator('[data-testid^="node-synthetic-"]')).toHaveCount(330);
  await expect(page.locator('[data-testid^="node-synthetic-t"]')).toHaveCount(30);
  await expect(page.locator('path[data-testid^="hull-"]')).toHaveCount(4);
  // Dots never overlap, and the labels shown at the fitted zoom overlap neither each other nor other dots.
  const overlaps = await page.evaluate(() => {
    const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const dots = [...document.querySelectorAll('[data-testid^="node-synthetic-"] .litg__dot')].map((n) => n.getBoundingClientRect());
    const labels = [...document.querySelectorAll('.litg__label')].map((n) => ({ id: n.getAttribute('data-id'), r: n.getBoundingClientRect() }));
    const cats = [...document.querySelectorAll('.litg__cat-label')].map((n) => n.getBoundingClientRect());
    let n = 0;
    for (let i = 0; i < dots.length; i++) for (let j = i + 1; j < dots.length; j++) if (hit(dots[i], dots[j])) n++;
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) if (hit(labels[i].r, labels[j].r)) n++;
    // Tangential category labels cover no dot, no paper label, and no other category label.
    for (let i = 0; i < cats.length; i++) {
      for (const d of dots) if (hit(cats[i], d)) n++;
      for (const l of labels) if (hit(cats[i], l.r)) n++;
      for (let j = i + 1; j < cats.length; j++) if (hit(cats[i], cats[j])) n++;
    }
    return { n, labels: labels.length, cats: cats.length };
  });
  expect(overlaps.n).toBe(0);
  // Every taxonomy category in the fixture gets its label; works of an unknown type get none.
  expect(overlaps.cats).toBe(3);
  // At the fitted zoom only the larger dots carry labels; zooming in reveals more.
  expect(overlaps.labels).toBeGreaterThan(0);
  expect(overlaps.labels).toBeLessThan(100);
  await page.getByTestId('zoom-in').click();
  await page.getByTestId('zoom-in').click();
  await expect.poll(async () => page.locator('.litg__label').count()).toBeGreaterThan(overlaps.labels);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('hovering a node in the synthetic fixture responds within 50 ms', async ({ page }) => {
  await page.goto('/#/methods?view=graph&synthetic=1');
  await expect(page.locator('[data-testid^="node-synthetic-"]')).toHaveCount(330);
  const times = await page.evaluate(async () => {
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
    const out: number[] = [];
    for (const id of ['synthetic-150', 'synthetic-20', 'synthetic-280', 'synthetic-t3', 'synthetic-77']) {
      const el = document.querySelector(`[data-testid="node-${id}"] .litg__dot`)!;
      await frame();
      const t0 = performance.now();
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await frame();
      out.push(performance.now() - t0);
      if (!document.querySelector(`[data-testid="node-${id}"]`)!.classList.contains('is-hl')) out.push(Infinity);
      el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
      await frame();
    }
    return out;
  });
  times.sort((a, b) => a - b);
  expect(times[Math.floor(times.length / 2)]).toBeLessThan(50);
});

test('the wheel zooms the graph only with a modifier key or after a click inside it', async ({ page }) => {
  await page.goto('/#/methods?view=graph&synthetic=1');
  const graph = page.getByTestId('literature-graph');
  const view = page.locator('.litg__svg > g').first();
  await expect(page.locator('[data-testid^="node-synthetic-"]')).toHaveCount(330);
  const pointAt = async (fx: number, fy: number) => {
    await graph.scrollIntoViewIfNeeded();
    const box = (await graph.boundingBox())!;
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
  };
  const before = await view.getAttribute('transform');
  await pointAt(0.5, 0.5);
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(250);
  expect(await view.getAttribute('transform')).toBe(before);
  await pointAt(0.5, 0.5);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  await expect.poll(() => view.getAttribute('transform')).not.toBe(before);
  // After a click inside the graph, the plain wheel zooms too.
  await page.getByTestId('zoom-fit').click();
  await expect.poll(() => view.getAttribute('transform')).toBe(before);
  await pointAt(0.02, 0.97);
  await page.mouse.down();
  await page.mouse.up();
  await page.mouse.wheel(0, -200);
  await expect.poll(() => view.getAttribute('transform')).not.toBe(before);
});

test('choosing a paper in search zooms the graph to it and labels it', async ({ page }) => {
  await page.goto('/#/methods?view=graph');
  await page.keyboard.press('/');
  await page.keyboard.type('streak');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('drawer')).toContainText('STREAK');
  await expect(page.getByTestId('label-streak')).toBeVisible();
  await expect(page.getByTestId('node-streak').locator('.litg__pulse')).toHaveCount(1);
});

test('11. the STOT to SLaTe-PRO edge is solid; cites show only on hover until "Show all citation lines"; fit shows every node', async ({ page }) => {
  await page.goto('/#/methods?view=graph');
  await settleGraph(page);
  const e = page.getByTestId('edge-stot-slate-pro');
  await expect(e).toHaveAttribute('data-type', 'builds');
  await expect(e).toHaveCSS('stroke-dasharray', 'none');
  const bench = page.getByTestId('edge-slate-pro-gap');
  await expect(bench).toHaveAttribute('data-type', 'benchmarks');
  expect(await bench.evaluate((el) => getComputedStyle(el).strokeDasharray)).not.toBe('none');
  // Absent edges= means builds and benchmarks; no dotted edge shows.
  expect(params(page).get('edges')).toBeNull();
  await expect(page.getByTestId('edges-cites')).not.toBeChecked();
  await expect(page.locator('[data-type="cites"]')).toHaveCount(0);
  await page.getByTestId('edges-builds').uncheck();
  await expect.poll(() => params(page).get('edges')).toBe('benchmarks');
  // With builds hidden, the pair falls back to its next relation or disappears.
  await expect(page.locator('[data-testid="edge-stot-slate-pro"][data-type="builds"]')).toHaveCount(0);
  await page.getByTestId('edges-builds').check();
  await expect.poll(() => params(page).get('edges')).toBeNull();

  // The fit button brings every node into view.
  for (let i = 0; i < 4; i++) await page.getByTestId('zoom-in').click();
  await settleGraph(page);
  const outside = () =>
    page.evaluate(() => {
      const frame = document.querySelector('.litg__svg')!.getBoundingClientRect();
      return [...document.querySelectorAll('[data-testid^="node-"] .litg__dot')].filter((d) => {
        const r = d.getBoundingClientRect();
        return r.left < frame.left || r.right > frame.right || r.top < frame.top || r.bottom > frame.bottom;
      }).length;
    });
  await expect.poll(outside).toBeGreaterThan(0);
  await page.getByTestId('zoom-fit').click();
  await settleGraph(page);
  await expect.poll(outside).toBe(0);

  // The seed has no citation between graph papers, so the fixture shows the hover rule.
  await page.goto('/#/methods?view=graph&synthetic=1');
  await expect(page.locator('[data-testid^="node-synthetic-"]')).toHaveCount(330);
  await settleGraph(page);
  await expect(page.locator('[data-type="cites"]')).toHaveCount(0);
  await page.getByTestId('node-synthetic-150').hover();
  const hovered = page.locator('[data-type="cites"]');
  await expect.poll(() => hovered.count()).toBeGreaterThan(0);
  for (const id of await hovered.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!))) expect(id).toContain('synthetic-150');
  await settleGraph(page);
  await expect(page.locator('[data-type="cites"]')).toHaveCount(0);
  await page.getByTestId('edges-cites').check();
  await expect.poll(() => params(page).get('edges')).toBe('builds,benchmarks,cites');
  await expect.poll(() => page.locator('[data-type="cites"]').count()).toBeGreaterThan(50);
});

test('selecting a level card highlights its timeline row only; L0 is a baseline card', async ({ page }) => {
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

  // L0: name, knowns, and definition, with no count, no timeline row, and no click action.
  const l0 = page.getByTestId('levelcard-L0');
  await expect(l0).toBeVisible();
  await expect(l0).toContainText('Reactive assistance');
  await expect(l0).toContainText('industrial manufacturing');
  await expect(l0).not.toHaveRole('button');
  await expect(l0.locator('.levelcard__count')).toHaveCount(0);
  await expect(page.getByTestId('timeline-L0')).toHaveCount(0);
  await expect(page.getByTestId('levelcard-L2').locator('.levelcard__count')).toBeVisible();
  await expect(page.getByTestId('levelcard-L1').locator('.levelcard__count')).toBeVisible();
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
  // 12 L2 papers with evaluations, PredictiveGraphs excluded.
  await expect(table.locator('tbody tr')).toHaveCount(12);
  await expect(table.getByTestId('protocol-gap')).toHaveCount(1);
  const first = table.locator('tbody tr').first();
  await expect(first).toHaveAttribute('data-testid', 'protocol-gap');
  await expect(first).toHaveClass(/is-framework/);
  await expect(first.getByRole('link', { name: /Framework paper/ })).toHaveAttribute('href', 'https://arxiv.org/abs/2609.28910');
  await expect(first.locator('.loop-pill')).toHaveCount(3);
  await expect(first.locator('.chip--category')).toHaveText(['Change in user actions', 'Object movement prediction']);
  for (const k of ['year', 'year', 'paper', 'categories', 'loop']) {
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

test('14. a tangential work renders at 60% opacity, and unchecking Show tangential works removes it, its edges, and its category label', async ({ page }) => {
  await page.goto('/#/methods?view=graph');
  const koch = page.getByTestId('node-koch-2024-proactive-hri-review');
  await expect(koch).toHaveAttribute('data-tangent', 'hri');
  await expect(koch).toHaveCSS('opacity', '0.6');
  await expect(page.getByTestId('tchip-koch-2024-proactive-hri-review')).toHaveCount(0);
  // Its label does not repeat the year that its short name holds.
  await expect(page.getByTestId('label-koch-2024-proactive-hri-review')).toHaveText('Koch van den Broek 2024');
  await koch.hover();
  await expect(koch).toHaveCSS('opacity', '1');
  await expect(page.getByLabel('Surveys')).toHaveCount(0);

  // The fixture has tangential works with edges (citations, shown here for all papers).
  await page.goto('/#/methods?view=graph&synthetic=1&edges=builds,benchmarks,cites');
  await expect(page.locator('[data-testid^="node-synthetic-"]')).toHaveCount(330);
  await settleGraph(page);
  const t = page.getByTestId('node-synthetic-t0');
  await expect(t).toHaveCSS('opacity', '0.6');
  const tangentEdges = page.locator('.litg__edges .litg__edge.is-tangent');
  expect(await tangentEdges.count()).toBeGreaterThan(0);
  await expect(page.locator('.litg__edges .litg__edge.is-tangent:not(.is-dim):not(.is-hl)').first()).toHaveCSS('stroke-opacity', '0.5');
  await page.getByTestId('show-tangents').uncheck();
  await expect.poll(() => params(page).get('tangents')).toBe('0');
  await expect(page.locator('[data-testid^="node-synthetic-t"]')).toHaveCount(0);
  await expect(tangentEdges).toHaveCount(0);
  await expect(page.locator('.litg__cat-label')).toHaveCount(0);
  await expect(page.locator('[data-testid^="node-synthetic-"]')).toHaveCount(300);
});

test('15. the protocols table shows metric categories, never metric names; a group is one item; PredictiveGraphs and ProAct closed loop are gone', async ({ page }) => {
  await page.goto('/#/evaluations');
  const table = page.getByTestId('protocol-table');
  await expect(table.locator('tbody tr').first()).toBeVisible();
  await expect(table.locator('.chip--metric')).toHaveCount(0);
  const labels = [
    'Change in user actions',
    'Object movement prediction',
    'Activity label prediction',
    'Task performance',
    'End-user perceptions',
    'Implicit need detection',
    'Coordination fluency',
  ];
  const chips = await table.locator('.chip--category').allTextContents();
  expect(chips.length).toBeGreaterThan(0);
  for (const c of chips) expect(labels).toContain(c);
  const text = await table.innerText();
  for (const name of ['Net actions saved', 'Perturbed actions', 'Object F1', 'Used objects', 'Speedup', 'Goal precision', 'Detection F1', 'OID recall']) {
    expect(text).not.toContain(name);
  }
  // One chip per category, in category order.
  await expect(table.getByTestId('protocol-globe').locator('.chip--category')).toHaveText(['Object movement prediction', 'Activity label prediction']);

  // PredictiveGraphs is off this page.
  await expect(table.getByTestId('protocol-saavedra-2026-scene-graphs')).toHaveCount(0);
  await expect(page.getByTestId('realism-dot-saavedra-2026-scene-graphs')).toHaveCount(0);

  // ProAct keeps only its offline entry.
  const proact = table.getByTestId('protocol-proact');
  await expect(proact.locator('.loop-pill')).toHaveText(['Offline replay']);

  // The Task performance tab lists goal precision, recall, and F1 as one item, and selecting it filters the table.
  await page.getByTestId('metric-tab-task_performance').click();
  await expect.poll(() => params(page).get('category')).toBe('task_performance');
  await expect(page.getByTestId('metric-tab-task_performance')).toHaveAttribute('aria-selected', 'true');
  const list = page.getByTestId('metrics-list');
  await expect(list.getByRole('listitem')).toHaveCount(8);
  const group = list.getByTestId('metric-group-goal_prf');
  await expect(group).toContainText('Goal precision, recall, and F1');
  await expect(group.locator('.chip--member')).toHaveText(['Goal precision', 'Goal recall', 'Goal F1']);
  await expect(list.getByRole('listitem').filter({ hasText: 'Goal recall' })).toHaveCount(1);
  await expect(table.locator('tbody tr')).toHaveCount(5);
  await expect(table.getByTestId('protocol-gap')).toHaveCount(0);

  // A category chip in the table selects its tab; metric= still filters and opens its tab.
  await page.goto('/#/evaluations');
  await page.getByTestId('protocol-proact').locator('.chip--category', { hasText: 'Implicit need detection' }).click();
  await expect.poll(() => params(page).get('category')).toBe('implicit_need_detection');
  await expect(page.getByTestId('metric-tab-implicit_need_detection')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('drawer')).toHaveCount(0);
  await page.goto('/#/evaluations?metric=speedup');
  await expect(page.getByTestId('metric-tab-task_performance')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('protocol-table').locator('tbody tr')).toHaveCount(2);

  // PredictiveGraphs stays on the graph and the Subproblems page.
  await page.goto('/#/methods?view=graph');
  await expect(page.getByTestId('node-saavedra-2026-scene-graphs')).toHaveCount(1);
  await page.goto('/#/subproblems?sub=A3');
  await expect(page.getByTestId('sub-detail')).toContainText('PredictiveGraphs');
});

test('the legend sits in the graph panel directly above the graph; the top band keeps the level cards and the timeline', async ({ page }) => {
  await page.goto('/#/methods?view=graph');
  const legend = page.getByRole('complementary', { name: 'Legend' });
  await expect(legend).toHaveCount(1);
  // Inside the graph panel, right above the graph, and not in the top band.
  await expect(page.getByTestId('literature-graph').getByRole('complementary', { name: 'Legend' })).toBeVisible();
  await expect(page.locator('.mtop').getByRole('complementary')).toHaveCount(0);
  await expect(page.locator('.mtop')).not.toContainText('Show tangential works');
  const lb = (await legend.boundingBox())!;
  const gb = (await page.locator('.litg__svg').boundingBox())!;
  expect(lb.y + lb.height).toBeLessThanOrEqual(gb.y + 1);
  expect(gb.y - (lb.y + lb.height)).toBeLessThan(4);
  // The timeline takes the width the legend left.
  const band = (await page.locator('.mtop').boundingBox())!;
  const axis = (await page.locator('.mtop__axis').boundingBox())!;
  expect(band.x + band.width - (axis.x + axis.width)).toBeLessThan(20);

  // Edge styles with their checkboxes, families with hull tints, tangential categories in their colors with no hull,
  // gray for no category, the framework ring, dot size and darkness, and Show tangential works.
  await expect(legend).toContainText('Edges');
  for (const t of ['builds', 'benchmarks', 'cites']) await expect(legend.getByTestId(`edges-${t}`)).toHaveCount(1);
  for (const f of ['goal_inference', 'temporal_imitation', 'implicit_cues']) {
    await expect(legend.getByTestId(`legend-family-${f}`).locator('.lgd__hull .lgd__dot')).toHaveCount(1);
  }
  await expect(legend.getByTestId('legend-tangent-search')).toHaveText('Dynamic mapping and object search');
  await expect(legend.getByTestId('legend-tangent-hri')).toHaveText('User perceptions of proactivity');
  await expect(legend.locator('[data-testid^="legend-tangent-"] .lgd__hull')).toHaveCount(0);
  await expect(legend.getByTestId('legend-tangent-search').locator('.lgd__dot')).toHaveCSS('opacity', '0.6');
  await expect(legend.getByTestId('legend-none')).toHaveText('No category');
  await expect(legend.getByTestId('legend-framework')).toContainText('Framework paper');
  await expect(legend.getByTestId('legend-framework').locator('.lgd__dot--ring')).toHaveCount(1);
  await expect(legend).toContainText('Larger');
  await expect(legend).toContainText('Darker');
  await expect(legend).toContainText('Show tangential works');
  // No action-type or level groups.
  await expect(legend.getByRole('heading', { name: 'Actions' })).toHaveCount(0);
  await expect(legend.getByRole('heading', { name: 'Levels' })).toHaveCount(0);
  await expect(legend.locator('.action-icon')).toHaveCount(0);
  await expect(legend.locator('.level-chip')).toHaveCount(0);

  // On a narrow screen the row wraps, and the page still does not scroll sideways.
  await page.setViewportSize({ width: 375, height: 800 });
  await expect.poll(async () => (await legend.boundingBox())!.width).toBeLessThan(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('tangential categories draw in their own colors with a label each and no hull; papers with no category are gray', async ({ page }) => {
  await page.goto('/#/methods?view=graph');
  await settleGraph(page);
  // A visible label in the category's color, and no hull element for the category.
  const label = page.getByTestId('cat-label-search');
  await expect(label).toBeVisible();
  await expect(label).toHaveText('Dynamic mapping and object search');
  await expect(page.getByTestId('cat-label-hri')).toHaveText('User perceptions of proactivity');
  await expect(page.locator('[data-testid="hull-search"], [data-testid="hull-hri"]')).toHaveCount(0);
  await expect(page.locator('path[data-testid^="hull-"]')).toHaveCount(3);
  const resolved = (v: string) =>
    page.evaluate((c) => {
      const el = document.createElement('span');
      el.style.color = c;
      document.body.append(el);
      const out = getComputedStyle(el).color;
      el.remove();
      return out;
    }, v);
  expect(await label.evaluate((el) => getComputedStyle(el).fill)).toBe(await resolved('var(--tan-amber-ink)'));
  // Its papers: dots in the category's color at 60% opacity.
  for (const id of ['sgm', 'flowmaps', 'evolvingnav', 'tap', 'mullen-2025-home-emergency']) {
    const n = page.getByTestId(`node-${id}`);
    await expect(n).toHaveAttribute('data-tangent', 'search');
    await expect(n).toHaveCSS('opacity', '0.6');
    await expect(n.locator('.litg__dot')).toHaveCSS('fill', await resolved('var(--tan-amber)'));
  }
  await expect(page.getByTestId('node-koch-2024-proactive-hri-review').locator('.litg__dot')).toHaveCSS('fill', await resolved('var(--tan-magenta)'));
  // Each label sits next to its papers and covers none of the dots or paper labels.
  const geo = await page.evaluate(() => {
    const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const out: Record<string, { covered: string[]; nearest: number }> = {};
    for (const t of document.querySelectorAll('.litg__cat-label')) {
      const r = t.getBoundingClientRect();
      const covered = [...document.querySelectorAll('.litg__node .litg__dot, .litg__label')]
        .filter((e) => hit(r, e.getBoundingClientRect()))
        .map((e) => e.closest('[data-id]')?.getAttribute('data-id') ?? '?');
      const members = [...document.querySelectorAll(`.litg__node[data-tangent="${t.getAttribute('data-category')}"] .litg__dot`)].map((d) => d.getBoundingClientRect());
      const nearest = Math.min(...members.map((m) => Math.hypot(Math.max(0, r.left - m.right, m.left - r.right), Math.max(0, r.top - m.bottom, m.top - r.bottom))));
      out[t.getAttribute('data-category')!] = { covered, nearest };
    }
    return out;
  });
  expect(Object.keys(geo).sort()).toEqual(['hri', 'search']);
  for (const [cat, g] of Object.entries(geo)) {
    expect(g.covered, `${cat} label covers`).toEqual([]);
    expect(g.nearest, `${cat} label distance to its papers`).toBeLessThan(40);
  }
  // Core papers with no family are gray; GAP keeps purple with its ring.
  for (const id of ['anticipatory-tamp', 'talukder-2025-anticipatory-planning', 'courteous-anticipation']) {
    await expect(page.getByTestId(`node-${id}`).locator('.litg__dot')).toHaveAttribute('style', /var\(--fam-none-dark\)/);
  }
  await expect(page.getByTestId('node-gap').locator('.litg__dot')).toHaveAttribute('style', /var\(--fam-framework-dark\)/);
  await expect(page.getByTestId('node-gap').locator('.litg__ring')).toHaveCSS('stroke', await resolved('var(--fam-framework-dark)'));

  // The hover card and the drawer name the category.
  await page.getByTestId('node-sgm').hover();
  await expect(page.locator('.hovercard')).toContainText('Dynamic mapping and object search');
  await page.getByTestId('node-koch-2024-proactive-hri-review').hover();
  await expect(page.locator('.hovercard')).toContainText('User perceptions of proactivity');
  await page.goto('/#/methods?paper=sgm');
  await expect(page.getByTestId('drawer').getByTestId('tangent-tag')).toContainText('Dynamic mapping and object search');
  await expect(page.getByTestId('drawer-tangent')).toContainText('Models how homes change over time');

  // The fixture exercises several groups: three labeled categories, and gray works of an unknown type with no label.
  await page.goto('/#/methods?view=graph&synthetic=1');
  await expect(page.locator('[data-testid^="node-synthetic-"]')).toHaveCount(330);
  for (const c of ['hri', 'conversational', 'search']) await expect(page.getByTestId(`cat-label-${c}`)).toBeVisible();
  await expect(page.locator('.litg__cat-label')).toHaveCount(3);
  await expect(page.locator('path[data-testid^="hull-"]')).toHaveCount(4);
  const unknown = page.locator('.litg__node[data-tangent="synthetic_unknown"] .litg__dot');
  await expect(unknown).toHaveCount(3);
  await expect(unknown.first()).toHaveAttribute('style', /var\(--tan-none\)/);
});

test('the list view ends with tangential works grouped by category, in taxonomy order', async ({ page }) => {
  await page.goto('/#/methods?view=list');
  await expect(page.getByTestId('methods-list')).toBeVisible();
  const ids = await page.locator('[data-testid^="list-group-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!));
  const first = ids.findIndex((id) => id.startsWith('list-group-tangent:'));
  expect(first).toBeGreaterThan(0);
  expect(ids.slice(first)).toEqual(['list-group-tangent:hri', 'list-group-tangent:search']);
  await expect(page.getByTestId('list-group-tangent:hri')).toContainText('Koch van den Broek 2024');
  await expect(page.getByTestId('list-group-tangent:hri').getByTestId('tangent-tag')).toContainText('User perceptions of proactivity');
  await expect(page.getByTestId('list-group-tangent:search').getByTestId('tangent-tag')).toContainText('Dynamic mapping and object search');
});

test('a semi-tangential family draws at 75% opacity (dots, hull, name, label, edges) until hovered, and the legend says so', async ({ page }) => {
  // Synthetic family D is semi-tangential; synthetic-3 is one of its papers.
  await page.goto('/#/methods?view=graph&synthetic=1&edges=builds,benchmarks,cites');
  await expect(page.locator('[data-testid^="node-synthetic-"]')).toHaveCount(330);
  await settleGraph(page);
  const node = page.getByTestId('node-synthetic-3');
  await expect(node).toHaveClass(/is-semi/);
  await expect(node).toHaveCSS('opacity', '0.75');
  await expect(page.getByTestId('hull-synthetic_d')).toHaveCSS('opacity', '0.75');
  await expect(page.getByTestId('hull-label-synthetic_d')).toHaveCSS('opacity', '0.75');
  await expect(page.getByTestId('hull-synthetic_a')).toHaveCSS('opacity', '1');
  await expect(page.getByTestId('node-synthetic-0')).toHaveCSS('opacity', '1');
  const semiEdges = page.locator('.litg__edges .litg__edge.is-semi:not(.is-dim):not(.is-hl)');
  expect(await semiEdges.count()).toBeGreaterThan(0);
  await expect(semiEdges.first()).toHaveCSS('stroke-opacity', '0.75');
  // Tangential works keep 60% opacity.
  await expect(page.getByTestId('node-synthetic-t0')).toHaveCSS('opacity', '0.6');
  await expect(page.getByTestId('legend-family-synthetic_d')).toContainText('semi-tangential');
  await expect(page.getByTestId('legend-family-synthetic_d').locator('.lgd__hull')).toHaveCSS('opacity', '0.75');
  await expect(page.getByTestId('legend-family-synthetic_a')).not.toContainText('semi-tangential');

  // Hovering a paper brings its cluster to full opacity.
  await node.hover();
  await expect(node).toHaveCSS('opacity', '1');
  await expect(page.getByTestId('hull-synthetic_d')).toHaveCSS('opacity', '1');
  await settleGraph(page);
  await expect(node).toHaveCSS('opacity', '0.75');
  // So does hovering the family name.
  await page.getByTestId('hull-label-synthetic_d').hover();
  await expect(page.getByTestId('hull-synthetic_d')).toHaveCSS('opacity', '1');
  await expect(node).toHaveCSS('opacity', '1');
  await expect(page.locator('.hovercard')).toContainText('Semi-tangential');
});

test('the metrics list shows direction and unit, and metric chips name the direction', async ({ page }) => {
  await page.goto('/#/evaluations');
  await expect(page.getByTestId('metric-dir-perturbed_actions')).toContainText('↓');
  await expect(page.getByTestId('metric-dir-perturbed_actions')).toContainText('%');
  await expect(page.getByTestId('metric-dir-perturbed_actions').getByRole('img', { name: 'Lower is better' })).toBeVisible();
  await page.getByTestId('metric-tab-object_movement_prediction').click();
  await expect(page.getByTestId('metric-dir-f1')).toContainText('↑');
  await expect(page.getByTestId('metric-dir-f1')).toContainText('fraction');
  // A group whose members differ in direction marks each member.
  await expect(page.getByTestId('metric-used_wrong').getByRole('img', { name: 'Lower is better' })).toBeVisible();
  await expect(page.getByTestId('metric-used_correct').getByRole('img', { name: 'Higher is better' })).toBeVisible();
  // Metric chips live in the drawer now; the protocols table shows categories.
  await page.goto('/#/evaluations?paper=gap');
  const chip = page.getByTestId('drawer').locator('.chip--metric').first();
  await expect(chip).toHaveAttribute('title', /(higher|lower) is better · unit: /);
});

test('tangential datasets sit under the Tangential divider at 60% opacity', async ({ page }) => {
  await page.goto('/#/evaluations');
  const table = page.getByTestId('dataset-table');
  await expect(table).toBeVisible();
  const tangential = table.locator('tr[data-tangent="true"]');
  const n = await tangential.count();
  // The component test (tests/dataset-table.test.ts) covers this with a fixture; here, the real data.
  if (!n) {
    await expect(table.getByTestId('ds-tangent-divider')).toHaveCount(0);
    return;
  }
  const group = table.getByTestId('ds-group-tangent');
  await expect(group.locator('tr').first()).toHaveAttribute('data-testid', 'ds-tangent-divider');
  await expect(group.getByTestId('ds-tangent-divider')).toContainText('Tangential');
  await expect(group.locator('tr[data-tangent="true"]')).toHaveCount(n);
  await expect(table.getByTestId('ds-group-core').locator('tr[data-tangent="true"]')).toHaveCount(0);
  await expect(tangential.first()).toHaveCSS('opacity', '0.6');
});

test('the drawer shows where each citation comes from on hover', async ({ page }) => {
  await page.goto('/#/methods?paper=nakahashi-2015-subgoal');
  const cites = page.getByTestId('drawer-cites').getByRole('button');
  expect(await cites.count()).toBeGreaterThan(0);
  await expect(cites.first()).toHaveAttribute('title', /^Sources?: \S/);
  await page.goto('/#/methods?paper=baker-2009-inverse-planning');
  await expect(page.getByTestId('drawer-cited-by').getByRole('button').first()).toHaveAttribute('title', /^Sources?: \S/);
});
