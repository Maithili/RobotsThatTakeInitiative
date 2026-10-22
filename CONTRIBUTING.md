# Contributing

The map is a set of YAML files in [`data/`](data). Each paper is one file. The site is built from them, and a validator checks every file on each pull request.

There are two ways to help:

- **Suggest a paper or a correction** through a GitHub issue: [suggest a paper](https://github.com/Maithili/RobotsThatTakeInitiative/issues/new?template=add-paper.yml) or [suggest a correction](https://github.com/Maithili/RobotsThatTakeInitiative/issues/new?template=fix-paper.yml). No setup needed.
- **Edit the data yourself** and open a pull request, as described below.

## Rules

1. **Landing pages only.** `links.paper` must be a DOI page, a publisher or proceedings page, an arXiv abstract page, or an OpenReview forum. Never a `.pdf` link. Do not add PDF files to the repo. The validator rejects both.
2. **Tag only what the source states.** Do not infer a level, family, lineage edge, modality, or metric from a title or abstract. If you are not sure, leave the field empty. Empty fields show as "—" on the site with a link to suggest a value.
3. **Provenance is required.** Every paper has a `provenance` line saying where its tags come from, such as `RTI §III-B, Table I` or `Read by MP, Oct 2026`.
4. **Run `npm run fetch-citations`** after adding papers, so the thin dotted "cites" edges stay current. It needs network access and works best with `S2_API_KEY` set. Citations it misses go in [`data/citations-manual.yaml`](data/citations-manual.yaml) as `{from, to, source, where?}`, where `from` cites `to`, `source` names who checked it against the reference list, and `where` gives the location in `from`'s text.
5. **Run `npm run validate`** before you open the pull request.

## Add a paper

```bash
npm install
npm run new-paper -- smith-2026-handover
```

This creates `data/papers/smith-2026-handover.yaml` with every field and a comment for each. Fill what the paper states, delete the blocks you do not fill, then run:

```bash
npm run validate
npm run dev        # optional: see it on the site at http://localhost:5173
```

The id is the method's own name if it has one (`slate-pro`), otherwise `firstauthor-year-keyword`. It must match the file name.

## Fields

Every id below is defined in [`data/taxonomy.yaml`](data/taxonomy.yaml), which follows the RTI paper. Only the maintainer changes its definitions; you can propose new observation modalities or metrics in a pull request.

| Field | What to put | Defined in |
|---|---|---|
| `short_name` | The paper's name for its method or system, else "FirstAuthor Year". ≤ 24 characters. | |
| `title`, `authors`, `venue`, `year` | As on the landing page. | |
| `type` | `survey` for surveys (adds a "Survey" chip in the drawer); omit otherwise. | |
| `tangent` | Marks a tangential work, such as an HRI study of proactivity. It needs no method block and shows in the literature graph at half opacity. | [`tangent_types`](data/taxonomy.yaml) |
| `links.paper` / `code` / `project` | Landing page; official code; project page. | |
| `ids.doi` / `ids.arxiv` | Bare DOI (`10.1145/…`) and arXiv id (`2401.01234`) from the landing page. `fetch-citations` uses them. | |
| `provenance` | Where the tags come from. ≤ 140 characters. | |
| `method.knowns` | `{goal, human_policy}`, each `known` or `unknown`. The level is derived: both known → L0, goal known → L1, both unknown → L2. A paper without a clear level gets no method block. | [`levels`](data/taxonomy.yaml) |
| `method.family` | L2 only. | [`families`](data/taxonomy.yaml) |
| `method.action_types` | What the robot does proactively. | [`action_types`](data/taxonomy.yaml) |
| `method.inputs` | What the robot observes. | [`observation_modalities`](data/taxonomy.yaml) |
| `method.core_strength` | One line, ≤ 120 characters. | |
| `method.builds_on` | Ids of papers this one extends (solid edges). The maintainer fills these. | |
| `themes` | Cross-cutting themes. | [`themes`](data/taxonomy.yaml) |
| `subproblems` | Map from the subproblem codes `G1`…`P2` (see the taxonomy) to `{status, relation, approach?, note}`. `status` is `addresses`, `assumes`, or `skips`. `relation` is `direct` (works on it in a proactivity setting) or `adjacent` (a starting point from another field). `note` (≤ 140) says what part of the subproblem the work solves. | [`subproblems`](data/taxonomy.yaml), [`statuses`](data/taxonomy.yaml), [`relations`](data/taxonomy.yaml) |
| `evaluations` | One entry per evaluation protocol: `id`, `loop`, `environment`, `datasets`, `human_model`, `metrics`, `baselines` (compared methods in the database, read from the experiments section; dashed edges), `other_baselines`, `captures`, `realism` (`{robot, human, environment}` levels, only as the paper states them), `provenance`, `results`. | [`loop_types`](data/taxonomy.yaml), [`metrics`](data/taxonomy.yaml), [`captures`](data/taxonomy.yaml), [`realism`](data/taxonomy.yaml) |

Datasets, evaluation setups, and simulators live in [`data/datasets/`](data/datasets), one file each, with `kind` (`dataset`, `evaluation_setup`, or `simulator`), `sim_or_real`, `span`, `households_or_users`, `observations`, `goal_annotations`, `executable`, `environment` (a simulator), `based_on` (`[{id, relation}]` with `extends`, `uses`, or `validates_against`), `human_models` and `loops` (setups only), `notes`, `tangent` (`true` for a tangential dataset, such as one a tangential work introduced; it shows in its own group at the bottom of the table), and `provenance`. Simulators never show as rows on the site.

## What the validator checks

Errors (the build fails): schema mismatches, ids not in the taxonomy, references to papers or datasets that do not exist, an id that differs from its file name, duplicate evaluation ids, text over its length cap, PDF links or files, `goal: unknown` with `human_policy: known`, a family on a non-L2 paper, cycles in `builds_on`, a metric with an unknown `category` or `group`, a metric group whose members span categories, an `evaluations_exclude` id that is not a paper, and entries in `data/citations-manual.yaml` with unknown ids, a self-citation, or a pair listed twice.

Warnings (the build passes): a missing `links.paper`, a `builds_on` target newer than the paper, a result metric not listed in its evaluation, a paper that nothing shows or references, and a `data/citations.json` that is missing, stale, or incomplete.

## Working on the site

```bash
npm run dev        # dev server
npm test           # unit tests (Vitest)
npm run e2e        # end-to-end tests (Playwright; run `npx playwright install chromium` once)
npm run build      # production build into dist/
```

The code is Vite, React, and TypeScript. Data loading and validation live in `src/schema.ts` and `src/validate.ts`; the three pages are in `src/pages/`.
