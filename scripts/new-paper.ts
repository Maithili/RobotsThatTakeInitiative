// Scaffolds data/papers/<id>.yaml. Usage: npm run new-paper -- <id>
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const id = process.argv[2];
if (!id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
  console.error('Usage: npm run new-paper -- <kebab-case-id>   e.g. smith-2025-handover');
  process.exit(1);
}
const file = join(import.meta.dirname, '..', 'data', 'papers', `${id}.yaml`);
if (existsSync(file)) {
  console.error(`${file} already exists`);
  process.exit(1);
}

writeFileSync(
  file,
  `# See CONTRIBUTING.md for every field. Tag only what the paper (or your source) states.
# Delete the blocks you do not fill. Run \`npm run validate\` when done.
id: ${id}
short_name: ""            # the paper's own name for its method, else "FirstAuthor Year" (≤ 24 chars)
title: ""
authors: []
venue: null
year: 2026
links:
  paper: null             # landing page (DOI, proceedings, arXiv abs, OpenReview). Never a .pdf
ids: {}                   # doi: "10.…" and/or arxiv: "2401.01234", from the landing page; used by fetch-citations
provenance: ""            # where the tags come from (≤ 140 chars)
method:
  knowns: {goal: unknown, human_policy: unknown}   # known | unknown. Drop the method block if the paper has no level
  family: null            # L2 only: goal_inference | temporal_imitation, or null
  action_types: []        # act | timing | initiate | inform | ask
  inputs: []              # object_movements | activity_labels | video (what the method takes in at run time)
  core_strength: null     # one line (≤ 120 chars)
  builds_on: []           # paper ids this paper extends. Maithili fills these
themes: []
subproblems: {}
  # A2: {status: addresses, relation: direct, approach: learned, note: "..."}
evaluations: []
  # - id: ${id}-original
  #   loop: offline_replay
  #   datasets: []
  #   metrics: []
  #   baselines: []        # compared methods in the database, from the experiments section
  #   provenance: ""
`,
);
console.log(`Created data/papers/${id}.yaml`);
