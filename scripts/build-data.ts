// Validates data/ and writes src/generated/db.json (SPEC §5.4).
// `--check` validates without writing.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import yaml from 'js-yaml';
import { inLiteratureGraph, layoutPapers } from '../src/lib/literatureLayout.ts';
import { GRAPH_LEVELS, TANGENTS_IN_GRAPH } from '../src/pages/methods/constants.ts';
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
  // Literature graph layout (SPEC §7.2): computed once here, stored as x, y per paper.
  const t0 = performance.now();
  const inGraph = (p: Parameters<typeof inLiteratureGraph>[0]) => inLiteratureGraph(p, GRAPH_LEVELS, TANGENTS_IN_GRAPH);
  const pos = layoutPapers(db.papers.filter(inGraph), Object.keys(db.taxonomy.families));
  for (const p of db.papers) Object.assign(p, pos.get(p.id) ?? {});
  // The synthetic fixture (?synthetic=1) gets its layout the same way, in its own file.
  const synthetic = syntheticPapers();
  const synthPos = layoutPapers(synthetic.filter(inGraph), Object.keys(SYNTHETIC_FAMILIES));
  const ms = performance.now() - t0;

  mkdirSync(join(root, 'src/generated'), { recursive: true });
  const json = JSON.stringify(db);
  writeFileSync(join(root, 'src/generated/db.json'), json);
  writeFileSync(join(root, 'src/generated/synthetic-layout.json'), JSON.stringify(Object.fromEntries([...synthPos].map(([id, p]) => [id, [p.x, p.y]]))));
  console.log(`✓ wrote src/generated/db.json (${(json.length / 1024).toFixed(1)} KB): ${summary}`);
  console.log(`✓ laid out ${pos.size} graph papers and ${synthPos.size} synthetic ones in ${Math.round(ms)} ms`);
}
