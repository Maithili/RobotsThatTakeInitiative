// Validates data/ and writes src/generated/db.json (SPEC §5.4).
// `--check` validates without writing.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import yaml from 'js-yaml';
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
  mkdirSync(join(root, 'src/generated'), { recursive: true });
  const json = JSON.stringify(db);
  writeFileSync(join(root, 'src/generated/db.json'), json);
  console.log(`✓ wrote src/generated/db.json (${(json.length / 1024).toFixed(1)} KB): ${summary}`);
}
