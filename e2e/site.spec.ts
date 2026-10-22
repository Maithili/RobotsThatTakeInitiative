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

/** Overlaps in the graph as drawn, by screen box: dots with dots, paper labels with each other and with other papers'
 *  dots, and category labels with dots, paper labels, and each other. Also counts the labels shown. */
async function graphOverlaps(page: Page) {
  return page.evaluate(() => {
    const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const boxes = (sel: string, name: (e: Element) => string) => [...document.querySelectorAll(sel)].map((e) => ({ id: name(e), r: e.getBoundingClientRect() }));
    const dots = boxes('.litg__node .litg__dot', (e) => `dot ${e.closest('[data-id]')!.getAttribute('data-id')}`);
    const labels = boxes('.litg__label', (e) => `label ${e.getAttribute('data-id')}`);
    const cats = boxes('.litg__cat-label', (e) => `category ${e.getAttribute('data-category')}`);
    const out: string[] = [];
    const among = (xs: typeof dots) => xs.forEach((a, i) => xs.slice(i + 1).forEach((b) => hit(a.r, b.r) && out.push(`${a.id} / ${b.id}`)));
    const across = (xs: typeof dots, ys: typeof dots) => xs.forEach((a) => ys.forEach((b) => a.id.split(' ')[1] !== b.id.split(' ')[1] && hit(a.r, b.r) && out.push(`${a.id} / ${b.id}`)));
    among(dots);
    among(labels);
    across(labels, dots);
    across(cats, dots);
    across(cats, labels);
    among(cats);
    return { overlaps: out, labels: labels.length, cats: cats.length };
  });
}

/** Forces a font on the graph's text before the page's own scripts run, as if the visitor's system had it. */
async function forceFont(page: Page, css: string) {
  await page.addInitScript((text) => {
    const add = () => {
      const s = document.createElement('style');
      s.textContent = text;
      document.documentElement.append(s);
    };
    if (document.documentElement) add();
    else new MutationObserver((_, o) => document.documentElement && (o.disconnect(), add())).observe(document, { childList: true });
  }, css);
}

/** Zooms in twice with the buttons and waits for the zoom to settle. */
async function zoomInTwice(page: Page) {
  await page.getByTestId('zoom-in').click();
  await page.getByTestId('zoom-in').click();
  await settleGraph(page);
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

test('2. an input filter set on Methods survives switching to Subproblems, Back restores it, and no L1 paper shows outside the top band', async ({ page }) => {
  await page.goto('/#/methods?view=graph');
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByRole('group', { name: 'Input' }).getByRole('button', { name: 'Object movements' }).click();
  await expect.poll(() => params(page).get('input')).toBe('object_movements');
  await page.getByRole('link', { name: 'Subproblems' }).click();
  await expect(page).toHaveURL(/#\/subproblems/);
  expect(params(page).get('input')).toBe('object_movements');
  await expect(page.getByRole('button', { name: 'Remove filter Input: Object movements' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/methods/);
  expect(params(page).get('input')).toBe('object_movements');
  await expect(page.getByRole('button', { name: 'Remove filter Input: Object movements' })).toBeVisible();

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

test('the Filters dropdown offers Object movements, Activity labels, and Video as inputs, with no Family, Action, or Theme section; old family=, action=, and theme= links filter nothing', async ({ page }) => {
  // Per Maithili, Oct 22 2026 (SPEC §16).
  const legends = (p: Page) => p.locator('.filterbar__panel legend').allTextContents();
  await page.goto('/#/methods?view=graph');
  await page.getByRole('button', { name: /^Filters/ }).click();
  expect(await legends(page)).toEqual(['Input', 'Years']);
  const input = page.getByRole('group', { name: 'Input' });
  await expect(input.getByRole('button')).toHaveText(['Object movements', 'Activity labels', 'Video']);
  for (const name of ['Family', 'Action', 'Theme']) await expect(page.getByRole('group', { name })).toHaveCount(0);
  await expect(page.locator('.filterbar__panel')).not.toContainText(/Object relocations|Scene graphs|Language|Goal Inference|Acts|Continual learning/);

  // Object movements keeps the papers that take them in and dims the rest.
  await input.getByRole('button', { name: 'Object movements' }).click();
  await expect.poll(() => params(page).get('input')).toBe('object_movements');
  for (const id of ['gap', 'stot', 'slate-pro', 'streak']) await expect(page.getByTestId(`node-${id}`)).not.toHaveClass(/is-dim/);
  for (const id of ['nopa', 'watch-and-help', 'din-2025-proactivity']) await expect(page.getByTestId(`node-${id}`)).toHaveClass(/is-dim/);
  await page.mouse.move(1, 1);
  await page.getByTestId('node-gap').hover();
  await expect(page.locator('.litg .hovercard .chip--input')).toHaveText(['Object movements']);

  // The Subproblems page offers the same inputs and nothing else, and no theme chips.
  await page.goto('/#/subproblems');
  await page.getByRole('button', { name: /^Filters/ }).click();
  expect(await legends(page)).toEqual(['Input']);
  await expect(page.getByRole('group', { name: 'Input' }).getByRole('button')).toHaveText(['Object movements', 'Activity labels', 'Video']);
  await expect(page.getByRole('group', { name: 'Themes' })).toHaveCount(0);

  // An old link with a removed param shows and filters exactly what a bare link does.
  const counts = async (qs: string) => {
    await page.goto(`/#/methods?view=graph${qs}`);
    await expect(page.getByTestId('node-gap')).toBeVisible();
    const graph = await page.locator('[data-testid^="node-"]').count();
    const dim = await page.locator('[data-testid^="node-"].is-dim').count();
    const chips = await page.locator('.filterbar .chip').count();
    await page.goto(`/#/methods?view=list${qs}`);
    const list = await page.getByTestId('methods-list').locator('tr[data-locate]').count();
    await page.goto(`/#/subproblems?view=matrix${qs}`);
    const matrix = await page.getByTestId('matrix').locator('[data-locate]').count();
    return { graph, dim, chips, list, matrix };
  };
  const bare = await counts('');
  expect(bare.dim).toBe(0);
  for (const qs of ['&family=goal_inference', '&theme=continual_learning', '&action=act', '&family=temporal_imitation&theme=user_interaction&action=ask']) {
    expect(await counts(qs), qs).toEqual(bare);
    await expect(page.getByRole('region', { name: 'Filters' })).toContainText('No filters');
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

test('5. ΔC↑ counts 10 metrics; its card is not a button and filters nothing', async ({ page }) => {
  await page.goto('/#/evaluations');
  const term = page.getByTestId('term-dC_added');
  // Only categorized metrics count (SPEC §8.1).
  await expect(term.locator('.term__count')).toHaveText('10');
  // The card still explains itself on hover, but filters nothing (SPEC §8, Oct 22 2026).
  await expect(page.getByTestId('term-dV').getByRole('tooltip')).toBeHidden();
  await term.hover();
  await expect(term.getByRole('tooltip')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Net value terms' }).getByRole('button')).toHaveCount(0);
  await term.click();
  expect(new URL(page.url()).hash).toBe('#/evaluations');
  await expect(page.getByTestId('metric-boxes').locator('.metric-box')).toHaveCount(7);
  await expect(page.locator('.metric-row.is-dim, .metric-box.is-dim, .metric-row[data-dim]')).toHaveCount(0);
  await expect(page.getByTestId('protocol-table').locator('tbody tr')).toHaveCount(11);
  // Hovering a metric row still highlights the terms it serves.
  await page.getByTestId('metric-row-perturbed_actions').hover();
  await expect(term).toHaveClass(/is-hot/);
  await expect(page.getByTestId('term-dV')).not.toHaveClass(/is-hot/);
});

test('6. the featured chart shows all 6 bars at load, offline next to closed loop, with no toggle', async ({ page }) => {
  await page.goto('/#/evaluations');
  await expect(page.getByTestId('featured-bar')).toHaveCount(6);
  await expect(page.getByTestId('add-closed-loop')).toHaveCount(0);
  await expect(page.getByText('Add closed loop')).toHaveCount(0);
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

/** Each subproblem edge on the map, as "from-to", grouped by its data-flow. */
async function edgeFlows(page: Page) {
  const edges = await page.locator('[data-testid^="subedge-"]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-testid')!.slice('subedge-'.length), e.getAttribute('data-flow')!]));
  const by = (f: string) => edges.filter(([, x]) => x === f).map(([id]) => id).sort();
  return { up: by('up'), down: by('down'), dim: by('dim'), none: by('none'), all: edges.length };
}

test('the subproblem map lights every dependency path into the selected subproblem as upstream and out of it as downstream', async ({ page }) => {
  // Edges from data/taxonomy.yaml depends_on, as prerequisite-dependent.
  await page.goto('/#/subproblems');
  expect(await edgeFlows(page)).toEqual({ up: [], down: [], dim: [], none: ['A1-A2', 'A1-P2', 'A2-P2', 'A3-P2', 'G1-A1', 'G1-A2', 'G1-A3', 'G1-G2', 'G2-A1', 'G2-A3', 'P1-P2'], all: 11 });

  // Goal-space representation starts the flow: nothing upstream, everything it feeds downstream.
  await page.getByTestId('subnode-G1').click();
  await expect.poll(() => params(page).get('sub')).toBe('G1');
  expect(await edgeFlows(page)).toEqual({ up: [], down: ['A1-A2', 'A1-P2', 'A2-P2', 'A3-P2', 'G1-A1', 'G1-A2', 'G1-A3', 'G1-G2', 'G2-A1', 'G2-A3'], dim: ['P1-P2'], none: [], all: 11 });

  // Goal inference sits in the middle: the paths from goal space, action-goal association, and human policy into it are
  // upstream; its edge to action selection is downstream. Edges that bypass it dim.
  await page.getByTestId('subnode-A2').click();
  await expect.poll(() => params(page).get('sub')).toBe('A2');
  expect(await edgeFlows(page)).toEqual({ up: ['A1-A2', 'G1-A1', 'G1-A2', 'G1-G2', 'G2-A1'], down: ['A2-P2'], dim: ['A1-P2', 'A3-P2', 'G1-A3', 'G2-A3', 'P1-P2'], none: [], all: 11 });

  const drawn = await page.evaluate(() => {
    const pts = (d: string) => (d.match(/-?[\d.]+,-?[\d.]+/g) ?? []).map((s) => s.split(',').map(Number));
    const edges = [...document.querySelectorAll('[data-testid^="subedge-"]')].map((e) => {
      const [from, to] = e.getAttribute('data-testid')!.slice('subedge-'.length).split('-');
      const p = pts(e.getAttribute('d')!);
      const head = document.querySelector(`${e.getAttribute('marker-end')!.slice(4, -1)} path`)!;
      return { from, to, start: p[0], end: p[p.length - 1], flow: e.getAttribute('data-flow'), stroke: getComputedStyle(e).stroke, head: getComputedStyle(head).fill };
    });
    // An arrowhead that lands where the target's own edges leave reads as an edge pointing back into it.
    const clashes = edges.flatMap((a) => edges.filter((b) => b.from === a.to && Math.hypot(a.end[0] - b.start[0], a.end[1] - b.start[1]) < 8).map((b) => `${a.from}-${a.to} ends on ${b.from}-${b.to}`));
    const heads = edges.filter((e) => e.flow === 'up' || e.flow === 'down').filter((e) => e.head !== e.stroke).map((e) => `${e.from}-${e.to}`);
    return { clashes, heads };
  });
  expect(drawn.clashes).toEqual([]);
  // Arrowheads take the color of their edge.
  expect(drawn.heads).toEqual([]);
});

test('a subproblem lists only works that solve it with a named approach, each marked direct or adjacent by a full or half moon', async ({ page }) => {
  await page.goto('/#/subproblems?sub=A1');
  const detail = page.getByTestId('sub-detail');
  await expect(detail.getByTestId('work-nikolaidis-2015-joint-action')).toBeVisible();
  await expect(detail.locator('h3', { hasText: /^Other/ })).toHaveCount(0);
  // These address human policy learning in their tags but name no approach for it.
  for (const id of ['gap', 'sgm', 'flowmaps', 'evolvingnav', 'tap']) await expect(page.getByTestId(`work-${id}`)).toHaveCount(0);
  // The badge and the list use the same rule.
  const rows = await detail.locator('[data-testid^="work-"]').count();
  await expect(page.getByTestId('subnode-A1').locator('.subnav__badge')).toHaveText(String(rows));

  await expect(page.getByTestId('work-nikolaidis-2015-joint-action').getByRole('img', { name: /^Direct: / })).toBeVisible();
  await expect(page.getByTestId('work-sakr-2025-everyday-users').getByRole('img', { name: /^Adjacent: / })).toBeVisible();
  await expect(page.getByTestId('work-sakr-2025-everyday-users').locator('[data-relation="adjacent"]')).toHaveAttribute('title', 'Adjacent: A starting point from an adjacent field.');
  await expect(detail.locator('.rel')).toHaveCount(0);
  // The relation chips carry the same moons, so they read as the legend.
  const chips = page.getByRole('group', { name: 'Relation' });
  await expect(chips.getByRole('button', { name: 'Direct' }).locator('.glyph--rel-direct')).toHaveCount(1);
  await expect(chips.getByRole('button', { name: 'Adjacent' }).locator('.glyph--rel-adjacent')).toHaveCount(1);

  // GAP names no approach on any subproblem, so the drawer no longer sends readers to the Subproblems page for it.
  await page.goto('/#/methods?paper=gap');
  await expect(page.getByTestId('drawer').getByRole('link', { name: 'Evaluations', exact: true })).toBeVisible();
  await expect(page.getByTestId('drawer').getByRole('link', { name: 'Subproblems', exact: true })).toHaveCount(0);
  await page.goto('/#/methods?paper=nopa');
  await expect(page.getByTestId('drawer').getByRole('link', { name: 'Subproblems', exact: true })).toBeVisible();
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
  // Dots never overlap. The labels shown at the fitted zoom overlap neither each other nor other dots, and the
  // tangential category labels cover no dot, no paper label, and no other category label.
  const fitted = await graphOverlaps(page);
  expect(fitted.overlaps).toEqual([]);
  // Every taxonomy category in the fixture gets its label; works of an unknown type get none.
  expect(fitted.cats).toBe(3);
  // At the fitted zoom only the larger dots carry labels; zooming in reveals more, still without overlaps.
  expect(fitted.labels).toBeGreaterThan(0);
  expect(fitted.labels).toBeLessThan(100);
  await zoomInTwice(page);
  const zoomed = await graphOverlaps(page);
  expect(zoomed.labels).toBeGreaterThan(fitted.labels);
  expect(zoomed.overlaps).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

// Label placement uses the text as the browser draws it, so it holds whatever the visitor's fonts. Each variant
// forces a font on the graph's text: the wide one is DejaVu Sans (the Ubuntu CI runner's UI font) with its letters
// spaced out, so text runs wider than the build-time estimates on any machine; the narrow one is condensed.
const FONTS = {
  wide: ':root { --font: "DejaVu Sans", Verdana, sans-serif !important; } .litg__text text { letter-spacing: 0.05em !important; }',
  narrow: ':root { --font: "DejaVu Sans Condensed", "Arial Narrow", sans-serif !important; } .litg__text text { letter-spacing: -0.05em !important; }',
};
for (const [name, css] of Object.entries(FONTS)) {
  test(`with a ${name} font, the synthetic fixture's labels overlap no label or dot`, async ({ page }) => {
    const catWidths = () =>
      page.locator('.litg__cat-label').evaluateAll((els) => Object.fromEntries(els.map((e) => [e.getAttribute('data-category')!, e.getBoundingClientRect().width])));
    await page.goto('/#/methods?view=graph&synthetic=1');
    await expect(page.locator('.litg__cat-label')).toHaveCount(3);
    const usual = await catWidths();
    await forceFont(page, css);
    await page.reload();
    await expect(page.locator('[data-testid^="node-synthetic-"]')).toHaveCount(330);
    await expect(page.locator('.litg__cat-label')).toHaveCount(3);
    // The forced font is in effect: every category label is wider (or narrower) than in this machine's own font.
    const forced = await catWidths();
    for (const [cat, w] of Object.entries(usual)) {
      if (name === 'wide') expect(forced[cat], cat).toBeGreaterThan(w);
      else expect(forced[cat], cat).toBeLessThan(w);
    }
    const fitted = await graphOverlaps(page);
    expect(fitted.overlaps).toEqual([]);
    expect(fitted.labels).toBeGreaterThan(0);
    await zoomInTwice(page);
    const zoomed = await graphOverlaps(page);
    expect(zoomed.labels).toBeGreaterThan(fitted.labels);
    expect(zoomed.overlaps).toEqual([]);
  });
}

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

  // The synthetic fixture shows the hover rule at scale (GAP's own lines have their own test).
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

test('selecting a level card highlights its timeline row only; there is no L0 card', async ({ page }) => {
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

  // No L0 card and no L0 timeline row.
  await expect(page.getByTestId('levelcard-L0')).toHaveCount(0);
  await expect(page.locator('.mtop')).not.toContainText('L0');
  await expect(page.getByTestId('timeline-L0')).toHaveCount(0);
  await expect(page.getByTestId('levelcard-L2').locator('.levelcard__count')).toBeVisible();
  await expect(page.getByTestId('levelcard-L1').locator('.levelcard__count')).toBeVisible();

  // Tangential works stay out of the timeline, so the L2 lane holds only the core: Goal Inference, Temporal
  // Imitation, and GAP (per Maithili, Oct 22 2026). The anticipatory planning papers and Din 2025 left it.
  await expect(page.getByTestId('levelcard-L2').locator('.levelcard__count')).toHaveText('9');
  await expect(page.getByTestId('timeline-L2').locator('[data-testid^="tchip-"]')).toHaveCount(9);
  await expect(page.getByTestId('tchip-gap')).toHaveCount(1);
  for (const id of ['anticipatory-tamp', 'talukder-2025-anticipatory-planning', 'courteous-anticipation', 'din-2025-proactivity']) {
    await expect(page.getByTestId(`tchip-${id}`), id).toHaveCount(0);
  }
});

test('no subproblem codes appear as visible text', async ({ page }) => {
  // Codes (G1 to P2) stay in data files and URLs only (SPEC §11). GAP paper section references such as
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
  await expect(ds).not.toContainText('VirtualHome');
  await expect(ds.getByTestId('ds-row-homer-llm-closed-loop')).toContainText('Setup');
  const table = page.getByTestId('protocol-table');
  // Simulators show only in the protocols table's environment and datasets column.
  await expect(table.getByTestId('protocol-gap').locator('td').nth(3)).toContainText('VirtualHome');
  // 11 L2 papers with evaluations, PredictiveGraphs and Din 2025 excluded.
  await expect(table.locator('tbody tr')).toHaveCount(11);
  // Metric categories come right after Year (SPEC §8.4).
  await expect(table.locator('thead th')).toHaveText([/^Paper/, /^Year/, /^Metric categories/, /^Environment and datasets/, /^Loop types/, /^Human models/, /^Baselines/]);
  await expect(table.locator('tbody tr').first().locator('td').nth(2).locator('.chip--category')).toHaveText(['Change in user actions', 'Object movement prediction']);
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
  // No filter can hide it: an old loop= link is ignored (SPEC §8, Oct 22 2026).
  await page.goto('/#/evaluations?loop=user_study_short');
  await expect(page.getByTestId('protocol-gap')).toHaveCount(1);
  await expect(page.getByTestId('protocol-table').locator('tbody tr')).toHaveCount(11);
});

test('the datasets table keeps name, kind, sim or real, span, modality, setup, and used by, with no column filters; a used-by name opens the drawer', async ({ page }) => {
  // Per Maithili, Oct 22 2026 (SPEC §8.5, §16).
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#/evaluations');
  const ds = page.getByTestId('dataset-table');
  await expect(ds.locator('thead th')).toHaveText(['Name', 'Kind', 'Sim or real', 'Span', 'Modality', 'Human models and loops', 'Used by']);
  await expect(ds.locator('select, .filter-row')).toHaveCount(0);
  await expect(page.getByText(/Closed-loop evaluation needs executable/)).toHaveCount(0);
  const cell = (id: string, i: number) => ds.getByTestId(`ds-row-${id}`).locator('td').nth(i);
  // Modality uses the input vocabulary.
  await expect(cell('homer', 4).locator('.chip--input')).toHaveText(['Object movements']);
  for (const id of ['homer-plus', 'homer-noise']) await expect(cell(id, 4).locator('.chip--input')).toHaveText(['Object movements', 'Activity labels']);
  await expect(cell('evoworld-bench', 4).locator('.chip--input')).toHaveText(['Object movements', 'Video']);
  await expect(cell('coin-ownership', 4)).toHaveText('—');
  // Span is "Several weeks" for every HOMER dataset. COIN keeps its own.
  for (const id of ['homer', 'homer-plus', 'homer-noise', 'homer-llm-closed-loop']) await expect(cell(id, 3), id).toHaveText('Several weeks');
  await expect(cell('coin-ownership', 3)).toHaveText('Seven days');
  // Used by lists paper names that open the drawer, and sets no filter.
  const users = ds.getByTestId('ds-users-homer-plus');
  await expect(users.getByRole('button')).toHaveText(['GAP', 'GLOBE', 'SLaTe-PRO']);
  await expect(users.locator('[aria-pressed]')).toHaveCount(0);
  await users.getByRole('button', { name: 'GLOBE', exact: true }).click();
  await expect.poll(() => params(page).get('paper')).toBe('globe');
  expect(params(page).get('dataset')).toBeNull();
  await expect(page.getByTestId('drawer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('protocol-table').locator('tbody tr')).toHaveCount(11);
  // The info panel keeps the notes, the introducing paper, what it is the basis of, and the source.
  await page.getByRole('button', { name: 'About HOMER', exact: true }).click();
  const panel = page.locator('.info-panel');
  await expect(panel).toContainText('108 objects per household');
  await expect(panel).toContainText('Introduced in: STOT');
  await expect(panel).toContainText('Basis of');
  await expect(panel.getByRole('button', { name: 'HOMER+', exact: true })).toBeVisible();
  // No Source line, here or anywhere.
  await expect(panel).not.toContainText('Source:');
});

test('the datasets table has an Activity datasets group with six rows between the main and tangential groups, and Used by fills for the linked evaluations', async ({ page }) => {
  // Per Maithili, Oct 22 2026 (SPEC §8.5, §16).
  await page.goto('/#/evaluations');
  const ds = page.getByTestId('dataset-table');
  const groupIds = await ds.locator('tbody').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  expect(groupIds).toEqual(['ds-group-core', 'ds-group-activity', 'ds-group-tangent']);
  const activity = ds.getByTestId('ds-group-activity');
  await expect(activity.getByTestId('ds-activity-divider')).toContainText('Activity datasets');
  await expect(activity.locator('tr[data-testid^="ds-row-"] .ds-name')).toHaveText([/^50 Salads/, /^CAD-120/, /^Ego4D/, /^EPIC-KITCHENS-100/, /^ProAct-75/, /^VidHOI/]);
  await expect(activity.locator('tr[data-testid^="ds-row-"]').first()).toHaveCSS('opacity', '1');
  // Every activity dataset records video; those whose sources name activity or action labels show them too.
  for (const id of ['ego4d', 'epic-kitchens-100', 'cad-120', 'proact-75']) await expect(ds.getByTestId(`ds-row-${id}`).locator('.chip--input'), id).toHaveText(['Activity labels', 'Video']);
  for (const id of ['50-salads', 'vidhoi']) await expect(ds.getByTestId(`ds-row-${id}`).locator('.chip--input'), id).toHaveText(['Video']);
  // The main group gains the Watch-And-Help task set and O-WAH; their Used by lists the linked papers. ALFRED is not listed.
  const core = ds.getByTestId('ds-group-core');
  for (const id of ['wah-task-set', 'o-wah']) await expect(core.getByTestId(`ds-row-${id}`)).toHaveCount(1);
  await expect(ds.getByTestId('ds-row-alfred')).toHaveCount(0);
  const users = (id: string) => ds.getByTestId(`ds-users-${id}`).getByRole('button');
  await expect(users('wah-task-set')).toHaveText(['Watch-And-Help']);
  await expect(users('o-wah')).toHaveText(['NOPA']);
  await expect(users('proact-75')).toHaveText(['ProAct']);
  // CAD-120 and VidHOI are used only by L1 papers, which the Evaluations page leaves out (SPEC §6.2); their drawers name them.
  for (const id of ['cad-120', 'vidhoi', 'ego4d']) await expect(ds.getByTestId(`ds-row-${id}`).locator('td').last()).toHaveText('—');
  // The info panel cites an introducing paper outside the database with a link, and one inside it as a paper link.
  await page.getByRole('button', { name: 'About Ego4D', exact: true }).click();
  const ref = page.getByTestId('ds-reference-ego4d');
  await expect(page.locator('.info-panel')).toContainText('Introduced in: Ego4D: Around the World in 3,000 Hours of Egocentric Video ↗');
  await expect(ref.getByRole('link')).toHaveAttribute('href', /^https:\/\/openaccess\.thecvf\.com\/.+\.html$/);
  await expect(ref).toContainText('CVPR 2022');
  await page.getByRole('button', { name: 'About ProAct-75', exact: true }).click();
  await page.locator('.info-panel').getByRole('button', { name: 'ProAct', exact: true }).click();
  await expect.poll(() => params(page).get('paper')).toBe('proact');
  await expect(page.getByTestId('drawer')).toContainText('ProAct-75');
  await page.goto('/#/evaluations?paper=koppula-2016-anticipating');
  await expect(page.getByTestId('drawer')).toContainText('CAD-120');
  // The protocols table shows the new datasets beside each paper.
  await page.goto('/#/evaluations');
  await expect(page.getByTestId('protocol-watch-and-help').locator('td').nth(3)).toContainText('Watch-And-Help task set');
});

/** Action space complexity fills (SPEC §8.3), as computed CSS colors, per theme. */
const ACTION_SPACE_FILL = {
  light: { low: 'rgb(126, 186, 113)', medium: 'rgb(85, 150, 71)', high: 'rgb(55, 112, 41)', very_high: 'rgb(35, 75, 25)', none: 'rgb(213, 215, 220)' },
  dark: { low: 'rgb(63, 110, 53)', medium: 'rgb(88, 153, 74)', high: 'rgb(128, 194, 113)', very_high: 'rgb(184, 231, 174)', none: 'rgb(61, 64, 73)' },
} as const;
const ACTION_SPACE_LABEL: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', very_high: 'Very high' };

const INTERACTION_LABEL: Record<string, RegExp> = { open_loop: /^Open loop$/, closed_loop: /^Closed loop robot\s*actions$/, adaptive_humans: /^Adaptive humans$/ };
const HUMAN_LABEL: Record<string, RegExp> = { scripted: /^Scripted behavior$/, crowdsourced: /^Generated behavior\s*from crowdsourced data$/, real_humans: /^Real humans$/ };

/** Checks that a realism dot carries these levels and sits inside that column and row of the plot. */
async function expectRealismCell(page: Page, id: string, x: string, y: string) {
  const plot = page.getByTestId('realism-plot');
  const dot = page.getByTestId(`realism-dot-${id}`);
  await expect(dot, id).toHaveAttribute('data-interaction', x);
  await expect(dot, id).toHaveAttribute('data-human', y);
  const mid = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  const d = mid((await dot.locator('.realism__fill').boundingBox())!);
  const xs = await Promise.all(Object.keys(INTERACTION_LABEL).map(async (k) => mid((await plot.getByTestId(`realism-x-${k}`).boundingBox())!).x));
  const ys = await Promise.all(Object.keys(HUMAN_LABEL).map(async (k) => mid((await plot.getByTestId(`realism-y-${k}`).boundingBox())!).y));
  const cx = xs[Object.keys(INTERACTION_LABEL).indexOf(x)];
  const cy = ys[Object.keys(HUMAN_LABEL).indexOf(y)];
  expect(Math.abs(d.x - cx), `${id} column`).toBeLessThan(Math.abs(xs[1] - xs[0]) / 2);
  expect(Math.abs(d.y - cy), `${id} row`).toBeLessThan(Math.abs(ys[1] - ys[0]) / 2);
}

test('13. the realism plot places each paper by interaction and human behavior from its main evaluations; GAP has a ring and a card with every level', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/#/evaluations');
  const section = page.locator('section.realism');
  const plot = page.getByTestId('realism-plot');
  await expect(section).toContainText('One dot per paper, from its main evaluation. Click a dot for details.');
  // Axes: interaction (x, from the loop type) by human behavior (y). Setting and robot are not axes.
  await expect(plot.locator('[data-testid^="realism-x-"]')).toHaveText(Object.values(INTERACTION_LABEL));
  await expect(plot.locator('[data-testid^="realism-y-"]')).toHaveText(Object.values(HUMAN_LABEL));
  for (const gone of ['Simulator', "Users' own homes", 'Task-specific policy', 'Recorded behavior', 'Real participants']) {
    await expect(plot.getByText(gone)).toHaveCount(0);
  }
  await expect(plot.getByRole('img', { name: /^Target/ })).toHaveCount(1);
  await expect(page.getByTestId('realism-ref-interaction-adaptive_humans')).toHaveText(/^Adaptive humans: see Zhang 2023/);

  // Their simulated, scripted evaluations are main; their user studies do not move the dots.
  await expectRealismCell(page, 'nopa', 'closed_loop', 'scripted');
  await expectRealismCell(page, 'watch-and-help', 'closed_loop', 'scripted');

  // GAP, wherever its main evaluations put it.
  const dot = page.getByTestId('realism-dot-gap');
  const gx = (await dot.getAttribute('data-interaction')) ?? '';
  const gy = (await dot.getAttribute('data-human')) ?? '';
  expect(Object.keys(INTERACTION_LABEL)).toContain(gx);
  expect(Object.keys(HUMAN_LABEL)).toContain(gy);
  await expectRealismCell(page, 'gap', gx, gy);
  // Its action space level, whatever it is; empty means not assessed.
  const level = (await dot.getAttribute('data-action-space')) ?? '';
  expect(['', ...Object.keys(ACTION_SPACE_LABEL)]).toContain(level);
  const key = (level || 'none') as keyof (typeof ACTION_SPACE_FILL)['light'];
  // Fully opaque, filled with its level's ramp step, or gray with a dashed edge when not assessed. GAP keeps its ring.
  const fill = dot.locator('.realism__fill');
  await expect(fill).toHaveCSS('fill', ACTION_SPACE_FILL.light[key]);
  await expect(fill).toHaveCSS('fill-opacity', '1');
  await expect(dot).toHaveCSS('opacity', '1');
  await expect(dot.locator('.realism__ring')).toHaveCount(1);
  if (!level) await expect(dot).toHaveClass(/is-unassessed/);
  // The dark theme has its own steps.
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(fill).toHaveCSS('fill', ACTION_SPACE_FILL.dark[key]);
  await page.emulateMedia({ colorScheme: 'light' });
  // The legend is one Low-to-High gradient with every level's definition on hover, then Not assessed.
  const legend = page.getByTestId('action-space-legend');
  await expect(legend).toContainText('Action space complexity:');
  const ramp = page.getByTestId('action-space-legend-ramp');
  await expect(ramp).toHaveText(/^Low\s*High/);
  await expect(ramp.locator('.realism__ramp')).toHaveCSS('background-image', /linear-gradient/);
  await expect(ramp).toHaveAttribute('title', /Medium: 50 to 100 options, such as 10 objects on any of 10 locations\./);
  await expect(ramp).toHaveAttribute('title', /Very high: .*unbounded/);
  await expect(page.getByTestId('action-space-legend-none')).toHaveText(/^Not assessed/);
  // A dot with a level takes its ramp color: Watch-And-Help's helper has 167 actions per step on average.
  const wah = page.getByTestId('realism-dot-watch-and-help');
  await expect(wah).toHaveAttribute('data-action-space', 'high');
  await expect(wah.locator('.realism__fill')).toHaveCSS('fill', ACTION_SPACE_FILL.light.high);

  // Dots in a cell sit centered on its column, ordered by action space complexity (low first, not assessed last), then by year.
  const rankOf = (l: string) => (l ? Object.keys(ACTION_SPACE_LABEL).indexOf(l) : Object.keys(ACTION_SPACE_LABEL).length);
  const dots = await page.locator('[data-testid^="realism-dot-"]').evaluateAll((els) =>
    els.map((el) => {
      const b = el.querySelector('.realism__fill')!.getBoundingClientRect();
      return { x: el.getAttribute('data-interaction')!, y: el.getAttribute('data-human')!, l: el.getAttribute('data-action-space') ?? '', cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
    }),
  );
  for (const k of new Set(dots.map((d) => `${d.x}|${d.y}`))) {
    const cell = dots.filter((d) => `${d.x}|${d.y}` === k).sort((a, b) => a.cy - b.cy || a.cx - b.cx);
    const ranks = cell.map((d) => rankOf(d.l));
    expect(ranks, `${k} order`).toEqual([...ranks].sort((a, b) => a - b));
    const col = (await plot.getByTestId(`realism-x-${cell[0].x}`).boundingBox())!;
    for (const line of new Set(cell.map((d) => Math.round(d.cy)))) {
      const xs = cell.filter((d) => Math.round(d.cy) === line).map((d) => d.cx);
      expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - (col.x + col.width / 2)), `${k} centered`).toBeLessThan(2);
    }
  }

  // The card lists interaction, human behavior, action space complexity, setting, and robot, in that order.
  await dot.hover();
  const card = page.getByTestId('realism-card');
  await expect(card).toBeVisible();
  await expect(card.locator('dt')).toHaveText(['Interaction', 'Human behavior', 'Action space complexity', 'Setting', 'Robot', 'All loops', 'Data']);
  await expect(card.getByTestId('realism-card-interaction')).toHaveText(INTERACTION_LABEL[gx]);
  await expect(card.getByTestId('realism-card-human')).toHaveText(HUMAN_LABEL[gy]);
  await expect(card.getByTestId('realism-card-action-space')).toHaveText(level ? ACTION_SPACE_LABEL[level] : 'Not assessed');
  await expect(card.getByTestId('realism-card-setting')).toHaveText('Simulator');
  await expect(card.getByTestId('realism-card-robot')).toHaveText('Task-specific policy');
  const link = card.getByRole('link', { name: 'Paper ↗' });
  await expect(link).toHaveAttribute('href', 'https://arxiv.org/abs/2609.28910');
  await link.hover();
  await expect(card).toBeVisible();
  await expect(page.getByText('Organization adapted from')).toHaveCount(0);

  // Papers with no interaction or human behavior level are counted, not plotted. The table has 11 rows.
  const placed = await page.locator('[data-testid^="realism-dot-"]').count();
  const left = 11 - placed;
  if (left > 0) await expect(page.getByTestId('realism-skipped')).toHaveText(new RegExp(`^${left} papers? with evaluations but no interaction or human behavior level (is|are) not plotted\\.$`));
  else await expect(page.getByTestId('realism-skipped')).toHaveCount(0);
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

test('15. the protocols table shows metric categories, never metric names; metrics show as category boxes with paper links; PredictiveGraphs and ProAct closed loop are gone', async ({ page }) => {
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

  // Every category box shows at once, in category order. There are no tabs.
  await expect(page.getByRole('tab')).toHaveCount(0);
  const boxes = page.getByTestId('metric-boxes');
  await expect(boxes.locator('.metric-box__title')).toHaveText(labels);
  for (const box of await boxes.locator('.metric-box').all()) await expect(box).toBeVisible();

  // Task performance lists goal precision, recall, and F1 as one row, linked to the papers that use it.
  const task = page.getByTestId('metric-box-task_performance');
  await expect(task.locator('.metric-row')).toHaveCount(6);
  const goal = task.getByTestId('metric-row-goal_prf');
  await expect(goal.locator('.metric-row__name')).toHaveText('Goal precision, recall, and F1 ↑ fraction');
  await expect(goal.locator('.metric-row__paper')).toHaveText(['Watch-And-Help', 'NOPA']);
  for (const m of ['goal_predicate_precision', 'goal_predicate_recall', 'goal_predicate_f1']) await expect(page.getByTestId(`metric-row-${m}`)).toHaveCount(0);
  // There is no hover card.
  await goal.hover();
  await expect(goal.getByRole('tooltip')).toHaveCount(0);

  // A paper link opens the drawer and leaves metric= alone.
  await goal.getByRole('button', { name: 'NOPA' }).click();
  const drawer = page.getByTestId('drawer');
  await expect(drawer).toBeVisible();
  await expect.poll(() => params(page).get('paper')).toBe('nopa');
  expect(params(page).get('metric')).toBeNull();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();

  // Rows and category chips select and filter nothing (SPEC §8, Oct 22 2026).
  await expect(page.getByTestId('metric-boxes').locator('.metric-row__main button, button.metric-row__main')).toHaveCount(0);
  await expect(table.locator('button.chip--category')).toHaveCount(0);
  await goal.locator('.metric-row__main').click();
  await page.getByTestId('protocol-proact').locator('.chip--category', { hasText: 'Implicit need detection' }).click({ position: { x: 4, y: 4 } });
  await expect.poll(() => params(page).get('paper')).toBe('proact');
  await page.keyboard.press('Escape');
  for (const k of ['metric', 'category']) expect(params(page).get(k)).toBeNull();
  await expect(table.locator('tbody tr')).toHaveCount(11);
  // Old metric= and category= links mark and filter nothing.
  await page.goto('/#/evaluations?metric=speedup&category=implicit_need_detection');
  await expect(page.locator('.metric-row.is-on, .metric-box.is-on')).toHaveCount(0);
  await expect(page.getByTestId('protocol-table').locator('tbody tr')).toHaveCount(11);

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
  // The graph panel has its title above the legend, and the page has no lede.
  await expect(page.getByTestId('graph-title')).toHaveText('Literature that addresses and is tangentially related to Unprompted Proactivity');
  expect((await page.getByTestId('graph-title').boundingBox())!.y).toBeLessThan(lb.y);
  await expect(page.locator('.page__intro .lede')).toHaveCount(0);
  // The graph comes first; the band with the level cards and timeline sits below it.
  expect(band.y).toBeGreaterThanOrEqual(gb.y + gb.height);
  const axis = (await page.locator('.mtop__axis').boundingBox())!;
  expect(band.x + band.width - (axis.x + axis.width)).toBeLessThan(20);

  // Edge styles with their checkboxes, the framework ring, dot size and darkness, and Show tangential works.
  // No group titles, and no family, tangential-category, or no-category rows: the graph names those itself.
  for (const t of ['builds', 'benchmarks', 'cites']) await expect(legend.getByTestId(`edges-${t}`)).toHaveCount(1);
  for (const gone of ['Edges', 'Families', 'Tangential', 'Dots', 'No category', 'Goal Inference', 'Temporal Imitation', 'semi-tangential', 'Dynamic mapping', 'Anticipatory task planning', 'Implicit cues']) {
    await expect(legend).not.toContainText(gone);
  }
  await expect(legend.locator('[data-testid^="legend-family-"], [data-testid^="legend-tangent-"], [data-testid="legend-none"]')).toHaveCount(0);
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

test('tangential categories draw in their own colors with a label each and no hull; no seed paper is gray, and works of an unknown type are', async ({ page }) => {
  await page.goto('/#/methods?view=graph');
  await settleGraph(page);
  // A visible label in the category's color, and no hull element for the category.
  const label = page.getByTestId('cat-label-search');
  await expect(label).toBeVisible();
  await expect(label).toHaveText('Dynamic mapping and object search');
  await expect(page.getByTestId('cat-label-hri')).toHaveText('User perceptions of proactivity');
  await expect(page.getByTestId('cat-label-planning')).toHaveText('Anticipatory task planning');
  await expect(page.getByTestId('cat-label-implicit_cues')).toHaveText('Implicit cues');
  for (const c of ['hri', 'search', 'planning', 'implicit_cues']) await expect(page.getByTestId(`cat-label-${c}`)).toBeVisible();
  await expect(page.locator('[data-testid="hull-search"], [data-testid="hull-hri"], [data-testid="hull-planning"], [data-testid="hull-implicit_cues"]')).toHaveCount(0);
  // Only the two families draw hulls; Implicit Cues is no longer a family (per Maithili, Oct 22 2026).
  await expect(page.locator('path[data-testid^="hull-"]')).toHaveCount(2);
  await expect(page.locator('[data-testid="hull-goal_inference"], [data-testid="hull-temporal_imitation"]')).toHaveCount(2);
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
  // Each category's papers: dots in the category's color at 60% opacity, under a label in the category's ink.
  const categories = {
    search: { hue: 'amber', ids: ['sgm', 'flowmaps', 'evolvingnav', 'tap', 'mullen-2025-home-emergency'] },
    hri: { hue: 'magenta', ids: ['koch-2024-proactive-hri-review'] },
    planning: { hue: 'brown', ids: ['anticipatory-tamp', 'talukder-2025-anticipatory-planning', 'courteous-anticipation'] },
    implicit_cues: { hue: 'fern', ids: ['din-2025-proactivity'] },
  };
  for (const [cat, { hue, ids }] of Object.entries(categories)) {
    expect(await page.getByTestId(`cat-label-${cat}`).evaluate((el) => getComputedStyle(el).fill), cat).toBe(await resolved(`var(--tan-${hue}-ink)`));
    for (const id of ids) {
      const n = page.getByTestId(`node-${id}`);
      await expect(n).toHaveAttribute('data-tangent', cat);
      await expect(n).toHaveCSS('opacity', '0.6');
      await expect(n.locator('.litg__dot')).toHaveCSS('fill', await resolved(`var(--tan-${hue})`));
    }
  }
  // The new hues resolve to their tokens in this (light) theme.
  expect(await resolved('var(--tan-brown)')).toBe('rgb(138, 96, 64)');
  expect(await resolved('var(--tan-fern)')).toBe('rgb(70, 128, 33)');
  expect(await resolved('var(--tan-fern-ink)')).toBe('rgb(54, 102, 24)');
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
  expect(Object.keys(geo).sort()).toEqual(['hri', 'implicit_cues', 'planning', 'search']);
  for (const [cat, g] of Object.entries(geo)) {
    expect(g.covered, `${cat} label covers`).toEqual([]);
    expect(g.nearest, `${cat} label distance to its papers`).toBeLessThan(40);
  }
  // As drawn at the fitted zoom, no dot, paper label, or category label overlaps another.
  const drawn = await graphOverlaps(page);
  expect(drawn.overlaps).toEqual([]);
  expect(drawn.cats).toBe(4);

  // No seed paper is gray: every node is in one of the two families, is GAP (purple, with its ring), or is tangential.
  const fills = await page.locator('.litg__node').evaluateAll((els) =>
    els.map((n) => ({ id: n.getAttribute('data-id')!, tangent: n.getAttribute('data-tangent'), style: n.querySelector('.litg__dot')!.getAttribute('style') ?? '' })),
  );
  expect(fills.filter((n) => /--fam-none|--tan-none/.test(n.style)).map((n) => n.id)).toEqual([]);
  const core = fills.filter((n) => !n.tangent);
  expect(core.filter((n) => !/var\(--fam-[01]-dark\)/.test(n.style) && n.id !== 'gap').map((n) => n.id)).toEqual([]);
  await expect(page.getByTestId('node-gap').locator('.litg__dot')).toHaveAttribute('style', /var\(--fam-framework-dark\)/);
  await expect(page.getByTestId('node-gap').locator('.litg__ring')).toHaveCSS('stroke', await resolved('var(--fam-framework-dark)'));

  // The hover card and the drawer name the category.
  await page.getByTestId('node-sgm').hover();
  await expect(page.locator('.hovercard')).toContainText('Dynamic mapping and object search');
  await page.getByTestId('node-koch-2024-proactive-hri-review').hover();
  await expect(page.locator('.hovercard')).toContainText('User perceptions of proactivity');
  await page.getByTestId('node-anticipatory-tamp').hover();
  await expect(page.locator('.hovercard')).toContainText('Anticipatory task planning');
  await expect(page.getByTestId('node-anticipatory-tamp')).toHaveCSS('opacity', '1');
  await page.getByTestId('node-din-2025-proactivity').hover();
  await expect(page.locator('.hovercard')).toContainText('Implicit cues');
  await page.goto('/#/methods?paper=sgm');
  await expect(page.getByTestId('drawer').getByTestId('tangent-tag')).toContainText('Dynamic mapping and object search');
  await expect(page.getByTestId('drawer-tangent')).toContainText('Models how homes change over time');
  await page.goto('/#/methods?paper=courteous-anticipation');
  await expect(page.getByTestId('drawer-tangent')).toContainText('Anticipatory task planning');
  await expect(page.getByTestId('drawer-tangent')).toContainText("Plans the robot's current task while preparing for likely future tasks.");
  await page.goto('/#/methods?paper=din-2025-proactivity');
  await expect(page.getByTestId('drawer-tangent')).toContainText('Implicit cues');
  await expect(page.getByTestId('drawer-tangent')).toContainText('Reacts to implicit cues in the scene or from people, without a stated goal.');
  await expect(page.getByTestId('drawer').locator('.tan-dot--fern')).toHaveCSS('background-color', 'rgb(70, 128, 33)');

  // In the dark theme the new categories take their own dark-theme stops, still at 60% opacity.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/#/methods?view=graph');
  await settleGraph(page);
  for (const [id, fill] of [['din-2025-proactivity', 'rgb(148, 206, 120)'], ['courteous-anticipation', 'rgb(180, 138, 102)']] as const) {
    await expect(page.getByTestId(`node-${id}`).locator('.litg__dot')).toHaveCSS('fill', fill);
    await expect(page.getByTestId(`node-${id}`)).toHaveCSS('opacity', '0.6');
  }
  await expect(page.getByTestId('cat-label-implicit_cues')).toHaveCSS('fill', 'rgb(180, 227, 160)');
  await expect(page.getByTestId('cat-label-planning')).toHaveCSS('fill', 'rgb(216, 184, 150)');
  await page.emulateMedia({ colorScheme: 'light' });

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

test('the anticipatory planning papers, now tangential, keep their protocol rows and realism dots; Din 2025 stays off the Evaluations page', async ({ page }) => {
  // They keep their knowns and L2 level (per Maithili, Oct 22 2026), which is what puts a paper on this page.
  await page.goto('/#/evaluations');
  const planning = ['anticipatory-tamp', 'talukder-2025-anticipatory-planning', 'courteous-anticipation'];
  for (const id of planning) {
    await expect(page.getByTestId(`protocol-${id}`), id).toHaveCount(1);
    await expect(page.getByTestId(`realism-dot-${id}`), id).toHaveCount(1);
  }
  await expect(page.getByTestId('protocol-din-2025-proactivity')).toHaveCount(0);
  await expect(page.getByTestId('realism-dot-din-2025-proactivity')).toHaveCount(0);
  // The Subproblems page lists none of the four: none names an approach from the taxonomy (SPEC §9).
  await page.goto('/#/subproblems?view=matrix');
  await expect(page.getByTestId('matrix')).toBeVisible();
  for (const id of [...planning, 'din-2025-proactivity']) await expect(page.getByTestId('matrix').locator(`[data-locate="${id}"]`), id).toHaveCount(0);
});

test('the list view ends with tangential works grouped by category, in taxonomy order', async ({ page }) => {
  await page.goto('/#/methods?view=list');
  await expect(page.getByTestId('methods-list')).toBeVisible();
  const ids = await page.locator('[data-testid^="list-group-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!));
  const first = ids.findIndex((id) => id.startsWith('list-group-tangent:'));
  expect(first).toBeGreaterThan(0);
  expect(ids.slice(first)).toEqual(['list-group-tangent:hri', 'list-group-tangent:search', 'list-group-tangent:planning', 'list-group-tangent:implicit_cues']);
  await expect(page.getByTestId('list-group-tangent:hri')).toContainText('Koch van den Broek 2024');
  await expect(page.getByTestId('list-group-tangent:hri').getByTestId('tangent-tag')).toContainText('User perceptions of proactivity');
  await expect(page.getByTestId('list-group-tangent:search').getByTestId('tangent-tag')).toContainText('Dynamic mapping and object search');
  await expect(page.getByTestId('list-group-tangent:planning').getByTestId('tangent-tag')).toContainText('Anticipatory task planning');
  await expect(page.getByTestId('list-group-tangent:planning').locator('tr[data-locate]')).toHaveCount(3);
  await expect(page.getByTestId('list-group-tangent:implicit_cues').getByTestId('tangent-tag')).toContainText('Implicit cues');
  await expect(page.getByTestId('list-group-tangent:implicit_cues')).toContainText('Din 2025');
  // The core groups are the two families and GAP; Implicit Cues is no longer a family, and only GAP has none.
  const core = ids.slice(0, first);
  expect(core).not.toContain('list-group-L2:implicit_cues');
  await expect(page.getByTestId('list-group-L2:none').locator('tr[data-locate]')).toHaveCount(1);
  await expect(page.getByTestId('list-group-L2:none').locator('tr[data-locate="gap"]')).toHaveCount(1);
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

test('metric rows show direction, unit, and ΔV or ΔC tags in the row, with no hover card and no ↕; metric chips name the direction', async ({ page }) => {
  await page.goto('/#/evaluations');
  await expect(page.getByTestId('metric-dir-perturbed_actions')).toHaveText('↓');
  await expect(page.getByTestId('metric-dir-perturbed_actions')).toHaveAttribute('aria-label', 'Lower is better');
  await expect(page.getByTestId('metric-dir-f1')).toHaveText('↑');
  // The unit follows the name and arrow, in small, light, italic text.
  const saved = page.getByTestId('metric-row-net_actions_saved');
  await expect(saved.locator('.metric-row__name')).toHaveText('Net actions saved ↑ %');
  await expect(page.getByTestId('metric-unit-net_actions_saved')).toHaveCSS('font-style', 'italic');
  await expect(page.getByTestId('metric-unit-robot_time_actions')).toHaveText('s, actions');

  // Term tags: only ΔV and ΔC, the union over the row's metrics, and none for a row that serves no term.
  const tags = (key: string) => page.getByTestId(`metric-row-${key}`).locator('.term-tag');
  await expect(tags('perturbed_actions')).toHaveText(['ΔC']);
  await expect(tags('task_success_rate')).toHaveText(['ΔV']);
  await expect(tags('cumulative_reward')).toHaveText(['ΔV', 'ΔC']);
  await expect(tags('robot_time_actions')).toHaveText(['ΔC']);
  await expect(tags('user_ratings')).toHaveText(['ΔV', 'ΔC']);
  await expect(tags('goal_prf')).toHaveCount(0);
  await expect(tags('step_detection')).toHaveCount(0);
  // They sit in the row's bottom-right corner and do nothing on click.
  const used = page.getByTestId('metric-row-used_unused_objects');
  const rb = (await used.boundingBox())!;
  const tb = (await used.getByTestId('metric-tags-used_unused_objects').boundingBox())!;
  expect(rb.x + rb.width - (tb.x + tb.width)).toBeLessThan(8);
  expect(rb.y + rb.height - (tb.y + tb.height)).toBeLessThan(8);
  expect(tb.y - rb.y).toBeGreaterThan(rb.height / 2);
  await expect(used.locator('.term-tag button, button.term-tag, .term-tag[tabindex]')).toHaveCount(0);

  // No hover card and no term dots in the metrics section.
  const perturbed = page.getByTestId('metric-row-perturbed_actions');
  await perturbed.hover();
  await expect(perturbed.getByRole('tooltip')).toHaveCount(0);
  await expect(page.getByTestId('metric-boxes').locator('.term-dot')).toHaveCount(0);

  // A group whose members differ in direction has no arrow on the group row; each member carries its own.
  await expect(page.getByTestId('metric-dir-used_unused_objects')).toHaveCount(0);
  await expect(page.getByTestId('metric-members-used_unused_objects').locator('.metric-row__member')).toHaveText([
    'Used objects, correct ↑',
    'Used objects, wrong ↓',
    'Used objects, missed ↓',
    'Unused objects, correct ↑',
    'Unused objects, wrong ↓',
  ]);
  await expect(page.getByTestId('metric-unit-used_unused_objects')).toHaveText('%');
  // When the units differ too, each member carries its own unit.
  await expect(page.getByTestId('metric-members-task_cost').locator('.metric-row__member')).toHaveText(['Average cost per task ↓ cost units', 'Cost reduction ↑ %']);
  await expect(page.getByTestId('metric-unit-task_cost')).toHaveCount(0);
  // A group with one direction keeps one arrow and lists no members.
  await expect(page.getByTestId('metric-dir-goal_prf')).toHaveText('↑');
  await expect(page.getByTestId('metric-members-goal_prf')).toHaveCount(0);

  // No ↕ anywhere on the page.
  expect(await page.evaluate(() => document.body.innerText)).not.toContain('↕');
  expect(await page.content()).not.toContain('↕');

  // Metric chips live in the drawer now; the protocols table shows categories.
  await page.goto('/#/evaluations?paper=gap');
  const chip = page.getByTestId('drawer').locator('.chip--metric').first();
  await expect(chip).toHaveAttribute('title', /(higher|lower) is better · unit: /);
});

test('definitions do not repeat their metric names', async ({ page }) => {
  await page.goto('/#/evaluations');
  await expect(page.getByTestId('metric-row-object_f1').locator('.metric-row__def')).toHaveText('Predicted against true object at each time step.');
  await expect(page.getByTestId('metric-row-speedup').locator('.metric-row__def')).toHaveText('Episode length with the user alone divided by episode length with the helper, minus 1.');
  for (const row of await page.locator('.metric-row').all()) {
    const name = (await row.locator('.metric-row__name strong').allTextContents()).join('').trim().toLowerCase();
    const def = (await row.locator('.metric-row__def').textContent())!.toLowerCase();
    expect(def, name).not.toContain(name);
  }
});

test('category boxes show ΔV and ΔC tags by their headers and collapse to the header line', async ({ page }) => {
  await page.goto('/#/evaluations');
  const head = (c: string) => page.getByTestId(`metric-box-toggle-${c}`).locator('.term-tag');
  await expect(head('change_in_user_actions')).toHaveText(['ΔC']);
  await expect(head('task_performance')).toHaveText(['ΔV', 'ΔC']);
  await expect(head('end_user_perceptions')).toHaveText(['ΔV', 'ΔC']);
  await expect(head('implicit_need_detection')).toHaveCount(0);
  await expect(head('coordination_fluency')).toHaveCount(0);

  // Boxes start expanded. Clicking a header collapses its box to the header line, and clicking again expands it.
  const box = page.getByTestId('metric-box-task_performance');
  const toggle = page.getByTestId('metric-box-toggle-task_performance');
  const rows = box.locator('.metric-row');
  await expect(rows.first()).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  for (const r of await rows.all()) await expect(r).toBeHidden();
  await expect(box.locator('.metric-box__title')).toBeVisible();
  expect((await box.boundingBox())!.height).toBeLessThan(48);
  await expect(page.getByTestId('metric-row-net_actions_saved')).toBeVisible();
  // Collapsing sets no URL state.
  expect(new URL(page.url()).hash).toBe('#/evaluations');
  await toggle.click();
  await expect(rows.first()).toBeVisible();

  // One control collapses and expands every box.
  const all = page.getByTestId('metric-collapse-all');
  await expect(all).toHaveText('Collapse all');
  await all.click();
  await expect(page.locator('.metric-row:visible')).toHaveCount(0);
  await expect(all).toHaveText('Expand all');
  // The state persists per viewer, and an old category= link opens no box.
  await page.reload();
  await expect(page.locator('.metric-row:visible')).toHaveCount(0);
  await page.goto('/#/evaluations?category=task_performance');
  await expect(page.locator('.metric-row:visible')).toHaveCount(0);
  // With one box open, the control collapses all; then it expands all.
  await page.goto('/#/evaluations');
  await toggle.click();
  await expect(rows.first()).toBeVisible();
  await expect(all).toHaveText('Collapse all');
  await all.click();
  await expect(page.locator('.metric-box:not(.is-collapsed)')).toHaveCount(0);
  await expect(all).toHaveText('Expand all');
  await all.click();
  await expect(page.locator('.metric-box.is-collapsed')).toHaveCount(0);
  await expect(page.locator('.metric-row:visible').first()).toBeVisible();
});

test('16. a bare URL starts with nothing filtered, dimmed, or highlighted on every page', async ({ page }) => {
  await page.goto('/#/evaluations');
  const table = page.getByTestId('protocol-table');
  // Every table row shows.
  await expect(table.locator('tbody tr')).toHaveCount(11);
  await expect(page.getByText('11 papers', { exact: true })).toBeVisible();
  // No filter bar, term, category, metric, or loop filter: the page has no filters (SPEC §8, Oct 22 2026).
  await expect(page.locator('.filterbar')).toHaveCount(0);
  await expect(page.getByTestId('loop-filter')).toHaveCount(0);
  await expect(page.locator('[aria-pressed="true"], .chip--on, .term.is-on, .term.is-hot')).toHaveCount(0);
  // Every metric row at full strength, every box expanded, nothing highlighted.
  expect(await page.locator('.metric-row').count()).toBeGreaterThan(0);
  await expect(page.locator('.metric-row.is-dim, .metric-row.is-on')).toHaveCount(0);
  await expect(page.locator('.metric-box.is-dim, .metric-box.is-on, .metric-box.is-collapsed')).toHaveCount(0);
  await expect(page.locator('.metric-row:visible').first()).toHaveCSS('opacity', '1');
  await expect(page.locator('.metric-row__main').first()).toHaveCSS('opacity', '1');
  await expect(page.locator('.realism__dot.is-dim')).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('#/evaluations');

  await page.goto('/#/methods');
  await expect(page.getByTestId('node-gap')).toBeVisible();
  await expect(page.locator('.filterbar .chip')).toHaveCount(0);
  await expect(page.locator('[data-testid^="levelcard-"][aria-pressed="true"], [data-testid^="timeline-"][data-selected="true"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="node-"].is-dim, [data-testid^="node-"].is-focus, [data-testid^="node-"].is-lit')).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('#/methods');

  // No subproblem is selected: the panel lists all seven.
  await page.goto('/#/subproblems');
  await expect(page.locator('.overview__row')).toHaveCount(7);
  await expect(page.getByTestId('sub-detail')).toHaveCount(0);
  await expect(page.locator('.filterbar .chip')).toHaveCount(0);
  for (const s of ['G1', 'G2', 'A1', 'A2', 'A3', 'P1', 'P2']) await expect(page.getByTestId(`subnode-${s}`)).toHaveAttribute('data-flow', 'none');
  await expect(page.locator('[data-testid^="subnode-"][aria-pressed="true"]')).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('#/subproblems');
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

test('GAP cites NOPA: the drawer lists it, and hovering GAP draws its dotted citation lines', async ({ page }) => {
  await page.goto('/#/methods?paper=gap');
  const nopa = page.getByTestId('drawer-cites').getByRole('button', { name: 'NOPA', exact: true });
  await expect(nopa).toHaveAttribute('title', /GAP reference list.*ref\. \[21\]/);

  await page.goto('/#/methods?view=graph');
  await settleGraph(page);
  await expect(page.locator('[data-type="cites"]')).toHaveCount(0);
  await page.getByTestId('node-gap').hover();
  const line = page.getByTestId('edge-nopa-gap');
  await expect(line).toHaveAttribute('data-type', 'cites');
  expect(await line.evaluate((el) => getComputedStyle(el).strokeDasharray)).not.toBe('none');
  // Only GAP's own citation lines show.
  const shown = await page.locator('[data-type="cites"]').evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!));
  expect(shown.length).toBeGreaterThan(1);
  for (const id of shown) expect(id).toMatch(/^edge-.+-gap$/);
});

// QA: Evaluations
test.describe('QA: Evaluations', () => {
  test('the page has no lede and no filters, and old params or global filters leave it unfiltered', async ({ page }) => {
    // Per Maithili, Oct 22 2026: "remove all filters from the evals for now" (SPEC §8, §16).
    await page.goto('/#/evaluations');
    await expect(page.locator('.page__intro')).toHaveText('Evaluations');
    await expect(page.getByText(/How methods are scored/)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Filters' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Filters/ })).toHaveCount(0);
    await expect(page.locator('select, input[type="search"]:not(.search__input), .filterbar')).toHaveCount(0);
    const dots = await page.locator('[data-testid^="realism-dot-"]').count();
    const metricRows = await page.locator('.metric-row').count();
    for (const qs of [
      'loop=offline_replay&term=dC_saved&category=task_performance&metric=speedup&dataset=homer',
      'loop=bogus&term=bogus&category=bogus&metric=bogus&dataset=bogus',
      'q=zzz&input=video&years=2025-2026&family=goal_inference&theme=continual_learning',
    ]) {
      await page.goto(`/#/evaluations?${qs}`);
      await expect(page.getByTestId('protocol-table').locator('tbody tr'), qs).toHaveCount(11);
      await expect(page.locator('[data-testid^="realism-dot-"]'), qs).toHaveCount(dots);
      await expect(page.locator('.realism__dot.is-dim, .metric-row.is-dim, .metric-box.is-dim, .metric-row.is-on, .metric-box.is-on'), qs).toHaveCount(0);
      await expect(page.locator('.metric-row'), qs).toHaveCount(metricRows);
      await expect(page.getByTestId('featured-bar'), qs).toHaveCount(6);
    }
  });

  test('at 390 px the realism plot and featured chart keep readable text, and every realism card stays on screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/evaluations');
    // Rendered size of 11-unit SVG text: the SVG's on-screen width over its viewBox width.
    const textPx = (sel: string) =>
      page.locator(sel).evaluate((svg) => (11 * svg.getBoundingClientRect().width) / Number(svg.getAttribute('viewBox')!.split(' ')[2]));
    expect(await textPx('.realism__svg')).toBeGreaterThanOrEqual(9);
    expect(await textPx('.featured__chart svg')).toBeGreaterThanOrEqual(10.5);
    const dots = page.locator('[data-testid^="realism-dot-"]');
    expect(await dots.count()).toBeGreaterThan(0);
    for (const dot of await dots.all()) {
      await dot.hover();
      const id = (await dot.getAttribute('data-testid'))!;
      const b = (await page.getByTestId('realism-card').boundingBox())!;
      expect(b.x, id).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, id).toBeLessThanOrEqual(390);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('the realism card closes when keyboard focus leaves the plot, and on Esc', async ({ page }) => {
    await page.goto('/#/evaluations');
    const card = page.getByTestId('realism-card');
    await page.getByTestId('realism-dot-proact').focus();
    await expect(card).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
    await page.getByTestId('realism-dot-globe').focus();
    await expect(card).toBeVisible();
    await page.getByTestId('psort-paper').focus();
    await expect(card).toBeHidden();
  });

  test('a featured bar near zero can still be hovered and clicked', async ({ page }) => {
    await page.goto('/#/evaluations');
    const bar = page.getByTestId('featured-bar').nth(4);
    await expect(bar).toHaveAttribute('aria-label', 'STREAK, Closed loop, LLM user: 0.002');
    const b = (await bar.boundingBox())!;
    expect(b.height).toBeGreaterThan(50);
    await page.mouse.click(b.x + b.width / 2, b.y + b.height - 10);
    await expect.poll(() => params(page).get('paper')).toBe('streak');
  });

  test('datasets table: the info panel stays in the visible part of the table at 390 px, and loop pills run in scale order', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/evaluations');
    await page.getByRole('button', { name: 'About HOMER', exact: true }).click();
    const panel = page.locator('.info-panel');
    await expect(panel).toContainText('Introduced in');
    let b = (await panel.boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(390);
    // Scrolled sideways, the panel stays in view.
    await page.getByTestId('dataset-table').locator('xpath=..').evaluate((e) => (e.scrollLeft = 600));
    await expect.poll(async () => (await panel.boundingBox())!.x).toBeGreaterThanOrEqual(0);
    b = (await panel.boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(390);
    await expect(page.getByTestId('ds-row-homer-llm-closed-loop').locator('.loop-pill')).toHaveText(['Closed loop, scripted human', 'Closed loop, adaptive simulated human']);
  });

  test('protocols table: dataset chips keep a gap, empty cells sort last both ways, and the framework tag meets AA', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/#/evaluations');
    const chips = page.getByTestId('protocol-globe').locator('td').nth(3).locator('.chip');
    await expect(chips).toHaveText(['HOMER+', 'HOMER-Noise']);
    const [a, c] = [(await chips.nth(0).boundingBox())!, (await chips.nth(1).boundingBox())!];
    expect(c.x - (a.x + a.width)).toBeGreaterThanOrEqual(3);
    // Rows with no environment or dataset ("—") sort last, ascending and descending. GAP stays pinned first.
    const rows = page.getByTestId('protocol-table').locator('tbody tr');
    for (let i = 0; i < 2; i++) {
      await page.getByTestId('psort-env').click();
      const empty = await rows.evaluateAll((rs) => rs.map((r) => (r.querySelectorAll('td')[3].querySelector('.chip') ? 0 : 1)));
      expect(empty.slice(1)).toEqual([...empty.slice(1)].sort((x, y) => x - y));
    }
    // The "Framework paper" tag text reads at 4.5:1 or more on GAP's shaded row.
    const ratio = await page.getByTestId('protocol-gap').locator('.tag--framework').evaluate((el) => {
      const rgb = (s: string) => {
        const m = s.match(/[\d.]+/g)!.map(Number);
        return s.startsWith('color(') ? m.slice(0, 3).map((v) => v * 255) : m.slice(0, 3);
      };
      const lum = (c: number[]) =>
        c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      const fg = lum(rgb(getComputedStyle(el).color));
      const bg = lum(rgb(getComputedStyle(el.closest('td')!).backgroundColor));
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

// QA: Subproblems and site

test('the drawer subproblem strip keeps every name whole, with no mid-word breaks', async ({ page }) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#/subproblems?paper=nopa');
    const ids = page.getByTestId('drawer').locator('.sub-strip__id');
    await expect(ids).toHaveCount(7);
    const broken = await ids.evaluateAll((els) =>
      els.filter((el) => {
        // A word split across lines shows as a line box narrower than the word itself, or as overflow.
        const words = (el.textContent ?? '').split(/[\s-]+/);
        const probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:inherit';
        el.appendChild(probe);
        const tooWide = words.some((w) => {
          probe.textContent = w;
          return probe.getBoundingClientRect().width > el.clientWidth;
        });
        probe.remove();
        return tooWide || el.scrollWidth > el.clientWidth + 1;
      }).map((el) => el.textContent),
    );
    expect(broken, `at ${width} px`).toEqual([]);
  }
});

test('the drawer marks "assumes given" with its own glyph, not the half moon, and keys the strip with a legend', async ({ page }) => {
  await page.goto('/#/subproblems?paper=nopa');
  const drawer = page.getByTestId('drawer');
  const strip = drawer.locator('.sub-strip');
  // NOPA assumes goal space given, addresses goal inference, and skips goal anticipation.
  const cell = strip.getByRole('listitem').filter({ hasText: 'Goal space' });
  await expect(cell).toHaveAttribute('title', 'Goal-space representation: assumes given');
  const assumes = cell.getByRole('img', { name: 'Assumes given' });
  await expect(assumes).toBeVisible();
  // A ring with a center dot: two circles and no half-disc path, unlike the adjacent half moon.
  await expect(assumes.locator('circle')).toHaveCount(2);
  await expect(assumes.locator('path')).toHaveCount(0);
  await expect(strip.getByRole('listitem').filter({ hasText: 'Goal inference' }).getByRole('img', { name: 'Addresses' })).toBeVisible();
  await expect(strip.getByRole('listitem').filter({ hasText: 'Cost model' })).toHaveAttribute('title', 'Cost modeling: not tagged');
  // Glyphs in the same strip row sit on one line, however many lines their labels take.
  const pos = await strip.locator('[data-status]').evaluateAll((els) =>
    els.map((e) => ({ row: Math.round(e.closest('[role="listitem"]')!.getBoundingClientRect().top), top: Math.round(e.getBoundingClientRect().top) })),
  );
  for (const row of new Set(pos.map((p) => p.row))) expect(new Set(pos.filter((p) => p.row === row).map((p) => p.top)).size).toBe(1);
  const legend = drawer.getByRole('list', { name: 'Status legend' });
  for (const label of ['Addresses', 'Assumes given', 'Skips', 'Blank: not tagged']) await expect(legend).toContainText(label);
  // The compare view shows the same legend.
  await page.goto('/#/subproblems?compare=nopa,stot');
  await page.getByTestId('compare-tray').getByRole('button', { name: /^Compare/ }).click();
  await expect(page.getByRole('dialog', { name: 'Compare papers' }).getByRole('list', { name: 'Status legend' })).toContainText('Assumes given');
});

test('closing the drawer with the close button returns focus to the row that opened it, every time', async ({ page }) => {
  await page.goto('/#/subproblems?sub=A2');
  await page.getByTestId('work-proact').click();
  await page.getByTestId('drawer').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('drawer')).toHaveCount(0);
  await expect(page.getByTestId('work-proact')).toBeFocused();
  // A later close goes back to the new opener, not a stale one.
  await page.getByTestId('work-nopa').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('work-nopa')).toBeFocused();
  // Opening another paper from the page while the drawer is open makes that row the opener.
  await page.getByTestId('work-proact').click();
  await page.getByTestId('work-nopa').click();
  await expect.poll(() => params(page).get('paper')).toBe('nopa');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('work-nopa')).toBeFocused();
});

test('the drawer sends readers to the subproblem and to the paper on the Subproblems page', async ({ page }) => {
  // From the matrix, a subproblem link leaves the matrix to show that subproblem.
  await page.goto('/#/subproblems?view=matrix&paper=nopa');
  await page.getByTestId('drawer').locator('.sub-rows').getByRole('link', { name: 'Goal inference' }).click();
  await expect(page.getByTestId('sub-detail')).toContainText('Goal inference');
  expect(params(page).get('view')).toBeNull();
  // "Appears on" selects a subproblem that lists the paper, so its row is on screen.
  await page.goto('/#/methods?paper=nopa');
  await page.getByTestId('drawer').getByRole('link', { name: 'Subproblems', exact: true }).click();
  await expect.poll(() => params(page).get('sub')).toBe('A2');
  await expect(page.getByTestId('work-nopa')).toBeVisible();
  await page.goto('/#/subproblems?sub=G2&paper=saycan');
  await page.getByTestId('drawer').getByRole('link', { name: 'Subproblems', exact: true }).click();
  await expect.poll(() => params(page).get('sub')).toBe('G1');
  await expect(page.getByTestId('work-saycan')).toBeVisible();
});

test("relation chips that empty a list say so once, with a way back; database statements ignore the reader's filters", async ({ page }) => {
  // Goal-space representation has only adjacent works.
  await page.goto('/#/subproblems?sub=G1&relation=direct');
  const detail = page.getByTestId('sub-detail');
  await expect(detail).toContainText('No work in the database addresses goal-space representation directly.');
  await expect(detail.getByRole('link', { name: /Suggest a paper/ })).toHaveCount(1);
  await detail.getByRole('button', { name: 'Show all relations' }).click();
  await expect.poll(() => params(page).get('relation')).toBeNull();
  await expect(page.getByTestId('work-saycan')).toBeVisible();
  // Goal inference has direct works: a text filter that leaves only adjacent ones must not say the database has none.
  await page.goto('/#/subproblems?sub=A2&q=amado');
  await expect(page.getByTestId('work-amado-2018-lstm')).toBeVisible();
  await expect(detail).not.toContainText('directly');
  await page.goto('/#/subproblems?sub=A2&q=amado&relation=direct');
  await expect(page.getByTestId('relation-empty')).toHaveText('No direct work addresses it under these filters. Show all relations.');
  await expect(detail.getByRole('link', { name: /Suggest a paper/ })).toHaveCount(0);
});

test('the subproblem map stays legible top to bottom: arrowheads clear the stage names, names fit their nodes', async ({ page }) => {
  for (const width of [360, 600, 899]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#/subproblems?sub=A1');
    const canvas = page.locator('.subnav__canvas');
    await expect(canvas).toHaveClass(/is-vertical/);
    const problems = await canvas.evaluate((c) => {
      const box = c.getBoundingClientRect();
      const out: string[] = [];
      const labels = [...c.querySelectorAll('.subnav__stage-name')].map((l) => ({ name: l.textContent, r: l.getBoundingClientRect() }));
      for (const e of c.querySelectorAll<SVGPathElement>('.subnav__edges path')) {
        const len = e.getTotalLength();
        // The arrowhead: the last 12 px of the edge. The line before it may pass behind a name.
        for (let d = 0; d <= 12; d += 2) {
          const p = e.getPointAtLength(Math.max(0, len - d));
          const x = box.left + p.x;
          const y = box.top + p.y;
          for (const l of labels) if (x >= l.r.left && x <= l.r.right && y >= l.r.top && y <= l.r.bottom) out.push(`arrowhead on ${l.name}`);
        }
      }
      for (const n of c.querySelectorAll<HTMLElement>('.subnav__node')) {
        const name = n.querySelector<HTMLElement>('.subnav__name')!;
        const badge = n.querySelector<HTMLElement>('.subnav__badge')!.getBoundingClientRect();
        const nr = n.getBoundingClientRect();
        const tr = document.createRange();
        tr.selectNodeContents(name);
        for (const r of tr.getClientRects()) {
          if (r.right > nr.right - 1 || r.bottom > nr.bottom - 1) out.push(`${name.textContent} overflows its node`);
          if (r.left < badge.right && badge.left < r.right && r.top < badge.bottom && badge.top < r.bottom) out.push(`${name.textContent} under its badge`);
        }
      }
      return [...new Set(out)];
    });
    expect(problems, `at ${width} px`).toEqual([]);
  }
  // From 900 px the map runs left to right (SPEC §9.1).
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/#/subproblems');
  await expect(page.locator('.subnav__canvas')).not.toHaveClass(/is-vertical/);
});

test('shell: page titles, a one-row header at 1024 px, and search results that stay on screen with the year once', async ({ page }) => {
  for (const [path, title] of [['methods', 'Methods'], ['evaluations', 'Evaluations'], ['subproblems', 'Subproblems']]) {
    await page.goto(`/#/${path}`);
    await expect(page).toHaveTitle(`${title} · Robots That Take Initiative`);
  }
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto('/#/subproblems');
  // The header refits once web fonts load, so wait for it to settle on one row.
  await expect
    .poll(async () => {
      const tabs = (await page.locator('.tabs').boundingBox())!;
      const tools = (await page.locator('.header__tools').boundingBox())!;
      return Math.abs(tabs.y + tabs.height / 2 - (tools.y + tools.height / 2));
    })
    .toBeLessThan(4);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/subproblems');
  await page.keyboard.press('/');
  await page.keyboard.type('amado');
  const results = page.getByRole('listbox', { name: 'Search results' });
  const box = (await results.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  const first = results.getByRole('option').first();
  await expect(first.locator('.search__name')).toHaveText('Amado 2018a');
  await expect(first.locator('.search__year')).toHaveCount(0);
});

test('the overview groups subproblems by stage; the matrix keys its gaps', async ({ page }) => {
  await page.goto('/#/subproblems');
  await expect(page.locator('.overview__stage-name')).toHaveText(['Grounding', 'Anticipation', 'Planning']);
  const planning = page.getByRole('region', { name: 'Planning' });
  await expect(planning.locator('.overview__row')).toHaveCount(2);
  await expect(planning).toContainText('Coordinated action selection');
  await page.goto('/#/subproblems?view=matrix');
  await expect(page.getByTestId('gaps-legend')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Gaps' }).check();
  await expect(page.getByTestId('gaps-legend')).toContainText('Gap: a method that does not address the subproblem.');
});

// QA: Methods

type QaBox = { x0: number; y0: number; x1: number; y1: number };
const qaMeets = (a: QaBox, b: QaBox) => a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5;
const qaInside = (a: QaBox, b: QaBox) => a.x0 >= b.x0 - 0.5 && a.x1 <= b.x1 + 0.5 && a.y0 >= b.y0 - 0.5 && a.y1 <= b.y1 + 0.5;

/** Screen boxes of the graph's hover card, its viewport, every dot by paper id, and every shown paper label. */
async function qaGraphBoxes(page: Page) {
  return page.evaluate(() => {
    const box = (e: Element) => {
      const b = e.getBoundingClientRect();
      return { x0: b.left, y0: b.top, x1: b.right, y1: b.bottom };
    };
    const card = document.querySelector('.litg .hovercard');
    return {
      card: card ? box(card) : null,
      view: box(document.querySelector('.litg__viewport')!),
      controls: box(document.querySelector('.litg__controls')!),
      dots: Object.fromEntries([...document.querySelectorAll('.litg__node')].map((n) => [n.getAttribute('data-id')!, box(n.querySelector('.litg__dot')!)])),
      labels: Object.fromEntries([...document.querySelectorAll('.litg__label')].map((l) => [l.getAttribute('data-id')!, box(l)])),
      names: [...document.querySelectorAll('.litg__hull-label, .litg__cat-label')].map((t) => ({ id: t.getAttribute('data-testid')!, box: box(t) })),
    };
  });
}

test('QA: a node card stays inside the graph and off its paper; GAP\'s card leaves the Goal Inference cluster and GAP\'s linked papers in view', async ({ page }) => {
  await page.goto('/#/methods?view=graph');
  await settleGraph(page);
  const card = page.locator('.litg .hovercard');
  await page.getByTestId('node-gap').hover();
  await expect(card).toBeVisible();
  const linked = await page.locator('.litg__node.is-hl').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')!));
  expect(linked).toContain('nopa');
  const b = await qaGraphBoxes(page);
  for (const id of new Set([...linked, 'watch-and-help', 'nopa', 'proact'])) {
    expect(qaMeets(b.card!, b.dots[id]), `GAP's card covers ${id}`).toBe(false);
    if (b.labels[id]) expect(qaMeets(b.card!, b.labels[id]), `GAP's card covers the label of ${id}`).toBe(false);
  }
  expect(qaInside(b.card!, b.view)).toBe(true);

  const ids = await page.locator('.litg__node').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')!));
  for (const id of ids) {
    const node = page.getByTestId(`node-${id}`);
    const name = (await node.getAttribute('aria-label'))!.split(', ')[0];
    await node.hover();
    // The card for this paper, shown once it has its spot (not the previous paper's card).
    await expect(card.locator('.hovercard__top strong')).toHaveText(name);
    await expect(card).toBeVisible();
    const s = await qaGraphBoxes(page);
    expect(qaInside(s.card!, s.view), `${id}'s card leaves the graph`).toBe(true);
    expect(qaMeets(s.card!, s.dots[id]), `${id}'s card covers its own dot`).toBe(false);
    expect(qaMeets(s.card!, s.labels[id]), `${id}'s card covers its own label`).toBe(false);
  }
});

test('QA: a family name\'s card stays inside the graph and leaves the family\'s papers in view', async ({ page }) => {
  await page.goto('/#/methods?view=graph');
  await settleGraph(page);
  const card = page.locator('.litg .hovercard');
  for (const [fam, members] of [
    ['goal_inference', ['watch-and-help', 'nopa', 'proact']],
    ['temporal_imitation', ['stot', 'slate-pro', 'streak', 'globe', 'saavedra-2026-scene-graphs']],
  ] as const) {
    await page.getByTestId(`hull-label-${fam}`).hover();
    await expect(card.locator('strong').first()).toHaveText(fam === 'goal_inference' ? 'Goal Inference' : 'Temporal Imitation');
    await expect(card).toBeVisible();
    const b = await qaGraphBoxes(page);
    expect(qaInside(b.card!, b.view), `${fam} card leaves the graph`).toBe(true);
    for (const id of members) expect(qaMeets(b.card!, b.dots[id]), `${fam} card covers ${id}`).toBe(false);
    await page.mouse.move(1, 1);
  }
});

test('QA: one Esc after clicking a node closes the drawer and clears the focus', async ({ page }) => {
  await page.goto('/#/methods?view=graph');
  await settleGraph(page);
  await page.getByTestId('node-stot').click();
  await expect(page.getByTestId('drawer')).toBeVisible();
  expect(params(page).get('focus')).toBe('stot');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('drawer')).toBeHidden();
  await expect.poll(() => params(page).get('focus')).toBeNull();
  await expect(page.locator('.litg__node.is-dim')).toHaveCount(0);
});

test('QA: family names and category labels never overlap, at 390 px or zoomed out, and the zoom controls cover no paper', async ({ page }) => {
  const check = async (where: string) => {
    const b = await qaGraphBoxes(page);
    b.names.forEach((a, i) => b.names.slice(i + 1).forEach((c) => expect(qaMeets(a.box, c.box), `${where}: ${a.id} / ${c.id}`).toBe(false)));
    return b;
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/methods?view=graph');
  await settleGraph(page);
  const b = await check('390 px');
  for (const [id, box] of [...Object.entries(b.dots), ...Object.entries(b.labels)]) expect(qaMeets(box, b.controls), `the zoom controls cover ${id}`).toBe(false);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/#/methods?view=graph');
  await settleGraph(page);
  const scale = async () => Number((await page.locator('.litg__svg > g').first().getAttribute('transform'))!.match(/scale\(([\d.]+)\)/)![1]);
  const fitted = await scale();
  for (let i = 0; i < 4; i++) {
    await page.getByTestId('zoom-out').click();
    await settleGraph(page);
  }
  // Zooming out stops at half the fitted zoom.
  expect(await scale()).toBeCloseTo(fitted / 2, 2);
  await check('zoomed out');
});

test('QA: the "Before 2021" band shows whole short names and does not repeat a year the name holds', async ({ page }) => {
  await page.goto('/#/methods');
  for (const id of ['huang-2016-anticipatory', 'koppula-2016-anticipating']) {
    const chip = page.getByTestId(`tchip-${id}`);
    await expect(chip.locator('.tl__chip-name')).toHaveText(/\b2016$/);
    await expect(chip.locator('.tl__chip-year')).toHaveCount(0);
    expect(await chip.locator('.tl__chip-name').evaluate((e) => e.scrollWidth - e.clientWidth), `${id} is cut off`).toBeLessThanOrEqual(0);
  }
});

test('QA: hovering an edge highlights it; a hidden focused tangential work dims nothing; list text keeps proportional numerals', async ({ page }) => {
  await page.goto('/#/methods?view=graph');
  await settleGraph(page);
  await page.getByTestId('node-stot').scrollIntoViewIfNeeded();
  const hit = page.locator('[data-edge="slate-pro|stot"], [data-edge="stot|slate-pro"]').first();
  const mid = await hit.evaluate((p: SVGPathElement) => {
    const q = p.getPointAtLength(p.getTotalLength() / 2);
    const m = p.getScreenCTM()!;
    return { x: q.x * m.a + q.y * m.c + m.e, y: q.x * m.b + q.y * m.d + m.f };
  });
  await page.mouse.move(mid.x, mid.y);
  await expect(page.locator('.litg .hovercard')).toContainText('SLaTe-PRO builds on STOT');
  await expect(page.getByTestId('edge-stot-slate-pro')).toHaveClass(/\bis-hl\b/);
  await page.mouse.move(1, 1);
  await expect(page.getByTestId('edge-stot-slate-pro')).not.toHaveClass(/\bis-hl\b/);

  await page.goto('/#/methods?view=graph&focus=flowmaps&tangents=0');
  await expect(page.getByTestId('node-flowmaps')).toHaveCount(0);
  await expect(page.locator('.litg__node')).not.toHaveCount(0);
  await expect(page.locator('.litg__node.is-dim')).toHaveCount(0);

  await page.goto('/#/methods?view=list');
  const row = page.locator('[data-testid="methods-list"] tr[data-locate="watch-and-help"]');
  await expect(row.locator('.title-cell')).toHaveCSS('font-variant-numeric', 'normal');
  await expect(row.locator('td.num').first()).toHaveCSS('font-variant-numeric', 'tabular-nums');
});
