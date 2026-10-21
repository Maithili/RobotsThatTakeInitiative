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

test('2. a level filter set on Methods survives switching to Subproblems, and Back restores it', async ({ page }) => {
  await page.goto('/#/methods');
  await page.getByTestId('levelcard-L2').click();
  await expect.poll(() => params(page).get('level')).toBe('L2');
  await page.getByRole('link', { name: 'Subproblems' }).click();
  await expect(page).toHaveURL(/#\/subproblems/);
  expect(params(page).get('level')).toBe('L2');
  await expect(page.getByRole('button', { name: /Remove filter Level/ })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/methods/);
  expect(params(page).get('level')).toBe('L2');
  await expect(page.getByTestId('levelcard-L2')).toHaveAttribute('aria-pressed', 'true');
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

test('4. clicking the L2 card highlights the L2 lanes', async ({ page }) => {
  await page.goto('/#/methods?view=graph');
  await expect(page.locator('.levelnav__toggles')).toHaveCount(0);
  await page.getByTestId('levelcard-L2').click();
  await expect.poll(() => params(page).get('level')).toBe('L2');
  const lanes = page.locator('[data-testid^="lane-L2"]');
  expect(await lanes.count()).toBeGreaterThan(0);
  for (const lane of await lanes.all()) await expect(lane).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId('lane-L1')).toHaveAttribute('data-active', 'false');
  await expect(page.getByTestId('lane-L0')).toHaveAttribute('data-active', 'false');
  await expect(page.getByLabel('Not yet classified')).toHaveCount(0);
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

test('8. in matrix view, clicking a cell opens the drawer', async ({ page }) => {
  await page.goto('/#/subproblems?view=matrix');
  await page.getByTestId('cell-nopa-A2').click();
  await expect(page.getByTestId('drawer')).toContainText('NOPA');
  expect(params(page).get('paper')).toBe('nopa');
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

test('the lineage graph lays out a 150-node synthetic fixture', async ({ page }) => {
  await page.goto('/#/methods?view=graph&synthetic=150');
  await expect(page.locator('[data-testid^="node-synthetic-"]')).toHaveCount(150);
  const overlaps = await page.evaluate(() => {
    const rects = [...document.querySelectorAll('[data-testid^="node-synthetic-"]')].map((n) => n.getBoundingClientRect());
    let n = 0;
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) n++;
      }
    return n;
  });
  expect(overlaps).toBe(0);
});
