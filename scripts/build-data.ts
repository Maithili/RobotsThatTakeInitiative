// Validates data/ and writes src/generated/db.json (SPEC §5.4).
// `--check` validates without writing.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import yaml from 'js-yaml';
import { inLiteratureGraph, layoutPapers, routePapers } from '../src/lib/literatureLayout.ts';
import { FOCUS_LEVELS, TANGENTS_IN_GRAPH } from '../src/pages/methods/constants.ts';
import { SYNTHETIC_FAMILIES, syntheticPapers } from '../src/pages/methods/synthetic.ts';
import { buildDb, type SourceFile } from '../src/validate.ts';

const root = join(import.meta.dirname, '..');
const dataDir = join(root, 'data');
const checkOnly = process.argv.includes('--check');

function loadDir(dir: string): SourceFile[] {
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith('.yaml') || n.endsWith('.yml'))
    .sort()
    .map((n) => ({ name: n.replace(/\.ya?ml$/, ''), data: yaml.load(readFileSync(join(dir, n), 'utf8')) }));
}

const SKIP = new Set(['node_modules', '.git', 'dist', 'playwright-report', 'test-results']);
function listFiles(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (SKIP.has(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) listFiles(p, out);
    else out.push(relative(root, p));
  }
  return out;
}

let result;
try {
  result = buildDb({
    taxonomy: yaml.load(readFileSync(join(dataDir, 'taxonomy.yaml'), 'utf8')),
    papers: loadDir(join(dataDir, 'papers')),
    datasets: loadDir(join(dataDir, 'datasets')),
    citations: existsSync(join(dataDir, 'citations.json')) ? JSON.parse(readFileSync(join(dataDir, 'citations.json'), 'utf8')) : undefined,
    manualCitations: existsSync(join(dataDir, 'citations-manual.yaml')) ? yaml.load(readFileSync(join(dataDir, 'citations-manual.yaml'), 'utf8')) : undefined,
    repoFiles: listFiles(root),
  });
} catch (e) {
  console.error(`✗ could not read data: ${(e as Error).message}`);
  process.exit(1);
}

for (const w of result.warnings) console.warn(`⚠ ${w}`);
for (const e of result.errors) console.error(`✗ ${e}`);
if (result.errors.length || !result.db) {
  console.error(`\n${result.errors.length} error(s). Data is invalid.`);
  process.exit(1);
}

const { db } = result;
const summary = `${db.papers.length} papers, ${db.datasets.length} datasets, ${result.warnings.length} warning(s)`;
if (checkOnly) {
  console.log(`✓ data is valid: ${summary}`);
} else {
  // Literature graph layout and edge routes (SPEC §7.2): computed once here, stored as x, y per paper and as
  // the routes that differ from the default curve.
  const t0 = performance.now();
  const inGraph = (p: Parameters<typeof inLiteratureGraph>[0]) => inLiteratureGraph(p, FOCUS_LEVELS, TANGENTS_IN_GRAPH);
  const graph = db.papers.filter(inGraph);
  const pos = layoutPapers(graph, Object.keys(db.taxonomy.families));
  for (const p of db.papers) Object.assign(p, pos.get(p.id) ?? {});
  db.routes = routePapers(graph, pos);
  const ms = performance.now() - t0;

  mkdirSync(join(root, 'src/generated'), { recursive: true });
  const json = JSON.stringify(db);
  writeFileSync(join(root, 'src/generated/db.json'), json);
  console.log(`✓ wrote src/generated/db.json (${(json.length / 1024).toFixed(1)} KB): ${summary}`);
  console.log(`✓ laid out and routed ${pos.size} graph papers in ${Math.round(ms)} ms`);

  // The synthetic fixture (?synthetic=1) gets its layout and routes the same way, in its own file. It depends only
  // on the code, so it is rebuilt only when the code that makes it changes.
  const synthFile = join(root, 'src/generated/synthetic-layout.json');
  const hash = createHash('sha1');
  for (const f of ['src/lib/literatureLayout.ts', 'src/lib/edgeRouting.ts', 'src/lib/scope.ts', 'src/pages/methods/synthetic.ts', 'scripts/build-data.ts', 'package-lock.json']) {
    hash.update(readFileSync(join(root, f)));
  }
  const version = hash.digest('hex');
  let cached = false;
  try {
    cached = JSON.parse(readFileSync(synthFile, 'utf8')).version === version;
  } catch {
    /* no fixture yet */
  }
  if (cached) {
    console.log('✓ synthetic fixture layout is up to date');
  } else {
    const t1 = performance.now();
    const synthetic = syntheticPapers().filter(inGraph);
    const synthPos = layoutPapers(synthetic, Object.keys(SYNTHETIC_FAMILIES));
    const synthRoutes = routePapers(synthetic, synthPos);
    writeFileSync(synthFile, JSON.stringify({ version, pos: Object.fromEntries([...synthPos].map(([id, p]) => [id, [p.x, p.y]])), routes: synthRoutes }));
    console.log(`✓ laid out and routed ${synthPos.size} synthetic papers in ${Math.round(performance.now() - t1)} ms`);
  }
}
