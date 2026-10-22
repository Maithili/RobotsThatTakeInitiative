# Robots That Take Initiative: Literature Map

Implementation spec, draft of Oct 21, 2026.
Owner: Maithili Patel. Builder: coding agent.
Companion file: `spec/SEED.md` lists the initial data, drawn from the GAP paper.

---

## 1. Goal

Build an interactive static website that organizes the literature on robot proactivity through the framework in Patel and Chernova, *Robots That Take Initiative: A Framework for Building and Evaluating Proactive Robots* (https://arxiv.org/abs/2609.28910). This spec calls it **the GAP paper**.

Readers come to find papers. The site gives them three entry points, one per page.

1. **Methods.** Proactive methods classified by level (L0, L1, L2), shown on a lineage graph with each method's core strength and its input and output modalities.
2. **Evaluations.** Datasets and their characteristics, the metrics people use and which terms of the net value ΔV − ΔC each one measures, and whether each evaluation runs open loop or closed loop.
3. **Subproblems.** Works under each of the seven subproblems, with the part of the subproblem each one solves.

## 2. Principles

- **One database, three lenses.** The site stores each paper once. The three pages are views of the same data. Clicking a paper on any page opens the same detail drawer.
- **The formalism is the schema.** Levels, families, subproblems, net value terms, and loop types come from the GAP paper and live in one taxonomy file.
- **Lists and visuals, not prose.** Every text field has a length cap. No page shows a paragraph longer than two lines. Each definition is one line.
- **Links only.** The site links to paper landing pages (DOI, publisher or proceedings page, arXiv abstract, OpenReview). The repo never stores PDF files, and no link points to a PDF file.
- **No guessed data.** A field is either filled from a stated source or left empty. Empty fields render as "—" with a link to suggest a value. The builder never infers a level, a lineage edge, a modality, or a metric from a title or abstract. Graph edges come only from the three sources in §5.5.
- **Every view has a URL.** Filters, the open paper, and the comparison set live in the URL, so any view can be shared or linked from a slide.

## 3. Scope

**In scope.** Three pages. A shared shell with navigation, search, the paper drawer, and a compare tray. Data files with validation. Contributions through GitHub issues and pull requests. CI and deployment to GitHub Pages.

**Out of scope.** User accounts, comments, a backend database, hosted PDFs, automatic paper scraping, and a results leaderboard. The site shows one featured results chart (§8.2) and nothing more.

## 4. Stack and repo layout

- Vite, React 18, TypeScript in strict mode, npm.
- `react-router-dom` with `HashRouter`, since GitHub Pages has no server-side routing.
- `d3-scale`, `d3-shape`, `d3-brush`, `d3-force`, and `d3-polygon` (individual modules) for the timeline, the literature graph and its cluster hulls, and the chart. No chart library.
- KaTeX for math.
- `js-yaml` 4 and `zod` for loading and validating data. js-yaml 4 loads `yes` and `no` as strings, which the schemas expect. `tsx` runs the scripts.
- Plain CSS with custom-property tokens. No CSS framework.
- Vitest for unit tests and Playwright for end-to-end tests.
- Pin exact versions in `package.json` and commit the lockfile.
- Vite `base` is `/RobotsThatTakeInitiative/`.

```
data/
  taxonomy.yaml          the formalism (§5.1). Only Maithili changes its definitions.
  papers/<id>.yaml       one file per paper (§5.2)
  datasets/<id>.yaml     datasets, evaluation setups, simulators (§5.3)
  citations.json         generated citation edges, committed (§5.5)
  SEED_REPORT.md         written during seeding (§14, M2)
scripts/
  build-data.ts          validates data and writes src/generated/db.json
  new-paper.ts           `npm run new-paper -- <id>` scaffolds a paper file
  fetch-citations.ts     `npm run fetch-citations` writes data/citations.json (§5.5)
src/
  schema.ts              zod schemas, shared by the script and the app
  generated/db.json      build output, gitignored
  state/url.ts           URL state read and write
  components/            Shell, Search, PaperDrawer, CompareTray, FilterBar, Chip, StatusGlyph, Math
  pages/methods/
  pages/evaluations/
  pages/subproblems/
  styles/tokens.css
tests/                   Vitest
e2e/                     Playwright
.github/workflows/       ci.yml, deploy.yml
.github/ISSUE_TEMPLATE/  add-paper.yml, fix-paper.yml
.github/pull_request_template.md
CONTRIBUTING.md
README.md
spec/                    this spec. Do not edit.
```

Replace the current Java `.gitignore` with Node entries (`node_modules`, `dist`, `src/generated`, Playwright reports) and add `*.pdf`.

## 5. Data model

### 5.1 `data/taxonomy.yaml`

Create this file with the content below. The definitions come from the GAP paper. Keep their wording.

```yaml
levels:                       # ordered by increasing unknowns
  L0:
    name: Reactive assistance
    knowns: {goal: known, human_policy: known}
    definition: The goal, and user action sequences if collaborating, are known to the robot. Realistic only in rigid settings such as industrial manufacturing.
  L1:
    name: Collaborative proactive assistance
    knowns: {goal: known, human_policy: unknown}
    definition: The robot knows the task goal but must infer user actions to coordinate effectively.
  L2:
    name: Unprompted proactive assistance
    knowns: {goal: unknown, human_policy: unknown}
    definition: The robot acts towards predicted needs without being prompted at all.

families:                     # L2 only, from GAP paper §III-B
  goal_inference:
    name: Goal Inference
    definition: Online goal inference followed by goal-conditioned planning.
    scope_line: Infers the current goal. Assumes the goal space, action-goal association, and human policy are given. Does not anticipate future goals.
    limitations:
      - Needs the full set of goals with ground-truth goal annotations for past actions.
      - Assists only with the current task, once the belief concentrates.
      - Ignores habits and preferred variants.
  temporal_imitation:
    name: Temporal Imitation
    definition: Learns what the user tends to do next from temporal patterns and imitates the predicted action.
    scope_line: Anticipates future goals at the action level. Skips goal inference and human policy learning. Assumes uniform cost across actions.
    strength: Predicts minutes to hours ahead, with no need for close collaboration.
    limitations:
      - Discards the intentional structure of behavior that a goal-level model can exploit.
  implicit_cues:
    name: Implicit Cues
    definition: Reacts to implicit cues in the scene or from people, without a stated goal.
    semi_tangential: true     # per Maithili, Oct 21 2026. Drawn part-way transparent (§7.2).

action_types:                 # GAP paper §II
  act:      {label: Acts, definition: Executes actions that serve anticipated needs.}
  timing:   {label: Times, definition: Decides the precise timing of an action.}
  initiate: {label: Initiates, definition: Chooses to initiate an interaction.}
  inform:   {label: Informs, definition: Provides extra information.}
  ask:      {label: Asks, definition: Actively asks questions.}

observation_modalities:       # extend as papers need, one line each
  object_relocations: {label: Object relocations, definition: Timestamped moves of objects between locations.}
  scene_graph:        {label: Scene graphs, definition: Graphs of objects and their spatial relations over time.}
  video:              {label: Video, definition: Camera frames of the user and scene.}
  language:           {label: Language, definition: Spoken or written user input.}

stages:
  grounding:    {name: Grounding,    definition: Models the intentional structure behind user actions.}
  anticipation: {name: Anticipation, definition: Reasons over temporal user behavior to provide an anticipated need, goal, or action.}
  planning:     {name: Planning,     definition: Predicts robot actions by optimizing toward an anticipated variable.}

subproblems:                  # GAP paper Table I and §III-A. input/output are TeX.
  G1:
    name: Goal-space representation
    short: Goal space
    stage: grounding
    input: '\xi_{0:t}'
    output: '\mathcal{G}'
    challenge: Keeping the goal space coarse enough to model intent yet fine enough to separate variations.
    depends_on: []
    approaches: {hierarchical: Hierarchical representations, open_set_language: Open-set representations grounded in language}
  G2:
    name: Action-goal association
    short: Action-goal association
    stage: grounding
    input: '\xi_{0:t},\ \mathcal{G}'
    output: 'g_{0:t}'
    challenge: Disentangling interleaved actions across concurrent goals and isolating extraneous ones.
    depends_on: [G1]
    approaches: {symbolic: Symbolic models, learned: Learned models, hindsight_relabeling: Hindsight relabeling}
  A1:
    name: Human policy learning
    short: Human policy
    stage: anticipation
    input: '\xi_{0:t},\ \mathcal{G},\ g_{0:t}'
    output: '\pi^h'
    challenge: Adapting based on limited user-specific data.
    depends_on: [G1, G2]
    approaches: {lfd: Learning from demonstration, lfo: Learning from observation, clustering_mixture: User clustering and mixture models, guided_demonstration: Guiding users toward effective demonstrations}
  A2:
    name: Goal inference
    short: Goal inference
    stage: anticipation
    input: '\xi_{t-\Delta t:t},\ \mathcal{G},\ \pi^h'
    output: 'g_t'
    challenge: Disambiguating among many goals and assisting despite uncertainty over goals.
    depends_on: [G1, A1]
    approaches: {symbolic: Symbolic, learned: Learned, hybrid: Hybrid}
  A3:
    name: Goal anticipation
    short: Goal anticipation
    stage: anticipation
    input: '\xi_{0:t},\ \mathcal{G},\ g_{0:t}'
    output: 'g_{t:t+\Delta t}\ \text{or}\ \phi'
    challenge: Learning from wider context, such as habitual behavior patterns.
    depends_on: [G1, G2]
    approaches: {language_model: Language models, temporal_sequence: Temporal sequence prediction, probabilistic_filtering: Probabilistic filtering of object movement}
  P1:
    name: Cost modeling
    short: Cost model
    stage: planning
    input: 's_t,\ a^r_t,\ a^h_t'
    output: 'c_h(a^h_t)'
    challenge: Cost components are personal, context-dependent, and depend on the robot's concurrent actions.
    depends_on: []
    approaches: {task_complexity: Task complexity, fatigue: Effort and fatigue, preference_feedback: Preferences from user feedback, interruptibility: Interruptibility}
  P2:
    name: Coordinated action selection
    short: Action selection
    stage: planning
    input: '\xi_{0:t},\ c_h(\cdot),\ \pi^h,\ g_{t:t+\Delta t}'
    output: 'a^r_t'
    challenge: Optimizing against a learned, adaptive human rather than a ground-truth or scripted one.
    depends_on: [P1, A1, A2, A3]   # A2 -> P2 pending confirmation (see §15)
    approaches: {cirl: Cooperative inverse RL, proactive_communication: Proactive communication, hedging: Hedging under uncertainty}

tangent_types:                # works next to the algorithmic core. Maithili adds more.
  hri:            {label: User perceptions of proactivity, definition: User studies and reviews of how people see and define proactive robots.}
  conversational: {label: Conversational proactivity, definition: Proactivity in conversational settings.}
  search:         {label: Dynamic mapping and object search, definition: Models how homes change over time and finds objects or people in them, given what to find.}

themes:                       # cross-cutting, GAP paper §III-A
  joint_optimization: {label: Joint optimization, definition: Optimizing across subproblems instead of solving each alone.}
  personalization:    {label: Personalization, definition: Learning user-specific patterns.}
  continual_learning: {label: Continual learning, definition: Adapting to drifting needs without forgetting.}
  user_interaction:   {label: User interaction, definition: Resolving uncertainty and answering user queries.}

statuses:
  addresses: {glyph: "●", label: Addresses}
  assumes:   {glyph: "◐", label: Assumes given}
  skips:     {glyph: "○", label: Skips}

relations:
  direct:   {label: Direct, definition: Works on this subproblem in a proactivity setting.}
  adjacent: {label: Adjacent, definition: A starting point from an adjacent field.}

net_value:                    # GAP paper §II-A
  headline: '\Delta V - \Delta C'
  counterfactual: Effectiveness compares the trajectory ξ with the robot against the trajectory ξ′ that would unfold without it.
  terms:
    dV:       {label: "ΔV · value gained",      tex: '\Delta V',        definition: Achieving goals the user would otherwise leave uncompleted, or freeing time for other valued goals.}
    dC_saved: {label: "ΔC↓ · human cost saved", tex: '\Delta C_h\downarrow', definition: Reducing the cost of a goal the user would have completed anyway.}
    dC_added: {label: "ΔC↑ · human cost added", tex: '\Delta C_h\uparrow',   definition: An incorrect robot action forces the user to undo or redo actions.}
    Cr:       {label: "C_r · robot cost",       tex: 'C_r',             definition: Physical wear and charge consumption, often assumed zero.}

metric_categories:            # per Maithili, Oct 22 2026. Ordered. Each metric has a `category` (or none, see §8.6) and an optional `group`.
  change_in_user_actions:     {label: Change in user actions}
  object_movement_prediction: {label: Object movement prediction}
  activity_label_prediction:  {label: Activity label prediction}
  task_performance:           {label: Task performance}
  end_user_perceptions:       {label: End-user perceptions}
  implicit_need_detection:    {label: Implicit need detection}
  coordination_fluency:       {label: Coordination fluency}

metric_groups:                # metrics listed as one item in the metrics section, with one short definition
  # e.g. goal_prf: {label: "Goal precision, recall, and F1", definition: ...}

evaluations_exclude: [saavedra-2026-scene-graphs]   # object search papers stay off the Evaluations page (Maithili, Oct 22 2026)

metric_kinds:                 # each metric also carries direction (higher or lower is better), unit, and a one-line `mapping_note` on why it serves its terms
  direct:    Measures one or more terms.
  proxy:     Mixes terms or measures them indirectly.
  unrelated: Does not map to ΔV − ΔC.

metrics:                      # GAP paper §IV-A2. Add more as papers come in.
  net_actions_saved:
    label: Net actions saved
    definition: Skipped user actions minus undo actions, as a percentage of baseline user actions.
    terms: [dC_saved, dC_added]
    kind: direct
    direction: higher
    unit: "%"
  perturbed_actions:
    label: Perturbed actions
    definition: User actions corrected because of a wrong robot action, as a percentage of baseline user actions.
    terms: [dC_added]
    kind: direct
    direction: lower
    unit: "%"
  f1:
    label: F1
    definition: Skipped actions as true positives, undo and corrected as false positives, done as-is as false negatives.
    terms: [dC_saved, dC_added]
    kind: proxy
    direction: higher
    unit: fraction

loop_types:                   # ordered
  offline_replay:
    label: Offline replay
    definition: Scores each robot action against a fixed record of human behavior.
  closed_scripted:
    label: Closed loop, scripted human
    definition: Robot actions change the state, and a scripted human continues its routine from that state.
  closed_adaptive:
    label: Closed loop, adaptive simulated human
    definition: A simulated human, such as an LLM proxy, adapts its actions to the robot.
    refs: [zhang-2023-llm-human-models]
  user_study_short:
    label: User study, short
    definition: Real users interact with the robot in one or a few sessions.
  user_study_longitudinal:
    label: User study, longitudinal
    definition: Real users live or work with the robot over weeks or longer.

captures:                     # GAP paper Appendix I
  state_drift:     {label: State drift, definition: Robot errors shift the state, which compounds cost (Relaxation 1).}
  goal_adaptation: {label: Goal adaptation, definition: The user reallocates effort to new goals in response to the robot (Relaxation 2).}
  values: [yes, partial, no]

realism:                      # the plot in §8.3: environment (x) by human (y). Robot shows only in the hover card. Levels ordered from far to close. Pending Maithili's review.
  robot:
    label: "Robot: closer to the target robot"
    levels:
      wizard:            {label: Wizard or oracle, definition: A person or an oracle with ground truth chooses the robot's actions.}
      task_specific:     {label: Task-specific policy, definition: A policy learned for this task chooses the robot's actions.}
      generalist:        {label: Generalist policy, definition: A general-purpose policy, such as an LLM planner, chooses the robot's actions.}
  human:
    label: "People: closer to the target users"
    levels:
      recorded:          {label: Recorded behavior, definition: Replayed human behavior that does not respond to the robot.}
      scripted:          {label: Scripted simulated user, definition: A simulated user that follows fixed rules.}
      adaptive_sim:      {label: Adaptive simulated user, definition: A simulated user that adapts to the robot, such as an LLM proxy., refs: [zhang-2023-llm-human-models]}
      non_target:        {label: Real participants, definition: Real people who are not the target users, such as students.}
      target_users:      {label: Target users, definition: The people the robot is meant to assist.}
  environment:
    label: "Setting: closer to the target setting"
    levels:
      simulator:         {label: Simulator}
      vr:                {label: VR}
      lab:               {label: Lab}
      own_home:          {label: Users' own homes}
  source_url: null       # link to the paper this organization comes from, once it is public

action_space_complexity:      # colors the dots in §8.3. Per Maithili, Oct 22 2026. Levels ordered from low to high, at most 4 (one per ramp step).
  label: Action space complexity
  definition: The number of options the policy has at a given point in time.
  levels:
    low:       {label: Low, definition: "A fixed set of under 50 options, such as activity labels."}
    medium:    {label: Medium, definition: "50 to 100 options, such as 10 objects on any of 10 locations."}
    high:      {label: High, definition: "More than 100 options."}
    very_high: {label: Very high, definition: "Generative: an unbounded set of options."}

featured_comparison:          # drives the chart in §8.2
  title: Offline evaluation overstates performance
  metric: f1
  methods: [slate-pro, streak]
  columns:
    - {evaluation: gap-offline,         label: Offline}
    - {evaluation: gap-closed-llm,      label: "Closed loop, LLM user"}
    - {evaluation: gap-closed-scripted, label: "Closed loop, scripted user"}
  source: GAP paper, Table II
```

### 5.2 `data/papers/<id>.yaml`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | kebab-case string | yes | Equals the file name. Use the method's own name if it has one (`slate-pro`), else `firstauthor-year-keyword`. |
| `short_name` | string ≤ 24 | yes | The name the paper gives its method or system. Otherwise "FirstAuthor Year". |
| `title` | string | yes | |
| `authors` | string[] | yes | |
| `venue` | string | no | |
| `year` | int | yes | |
| `type` | `research` or `survey` | no | Default `research`. A survey shows a "Survey" chip in the drawer. |
| `links.paper` | URL or null | yes | Landing page. The validator rejects URLs whose path ends in `.pdf`. |
| `links.code`, `links.project` | URL | no | |
| `ids.doi`, `ids.arxiv` | string | no | `fetch-citations` uses these to find the paper (§5.5). Fill them whenever the landing page shows them. |
| `bibtex` | string | no | |
| `provenance` | string ≤ 140 | yes | Where the tags come from, such as "GAP paper §III-B, Table I" or "Read by MP, Oct 2026". |
| `method` | object | no | Its presence puts the paper on the Methods page. |
| `method.knowns` | `{goal, human_policy}`, each `known` or `unknown` | yes, in a method block | Level is derived (§5.4). A paper without a level gets no method block, so the Methods page shows only classified works. |
| `method.family` | family id | no | L2 only. |
| `method.action_types` | action type id[] | no | Output side. |
| `method.inputs` | modality id[] | no | Input side. |
| `method.core_strength` | string ≤ 120 | no | One line. |
| `method.builds_on` | paper id[] | no | Solid "builds on" edges (§5.5). This paper extends those papers. Only Maithili adds these. |
| `themes` | theme id[] | no | |
| `tangent` | tangent type id | no | Marks a tangential work. It needs no method block and shows in the literature graph in its category's color at 60% opacity (§7.2). |
| `subproblems` | map from G1…P2 to `{status, relation, approach?, note}` | no | `note` ≤ 140 says what part of the subproblem the work solves. `approach` must be one of that subproblem's approaches. |
| `evaluations` | list of evaluation entries | no | Their presence puts the paper on the Evaluations page. |

Evaluation entry:

| Field | Type | Notes |
|---|---|---|
| `id` | kebab-case string | Unique across all papers. |
| `environment` | id of a `simulator` entry, or null | |
| `datasets` | dataset id[] | |
| `loop` | loop type id or null | Null until someone reads the paper's evaluation. |
| `human_model` | string ≤ 60 or null | Such as "LLM (gpt-4o-mini)", "Scripted", "Real users (n=12)". |
| `metrics` | metric id[] | |
| `baselines` | paper id[] | Methods the paper compares against. Drives the dashed "benchmarks against" edges (§5.5). |
| `other_baselines` | string[] | Baselines with no paper, such as "Oracle". Ablations of the paper's own method are left out of `baselines` and `other_baselines`, and the validator rejects entries that say "ablation". |
| `captures` | `{state_drift, goal_adaptation}`, each `yes`, `partial`, `no`, or null | |
| `provenance` | string ≤ 140 | |
| `results` | list of `{method, method_label?, metric, value, sd?}` | `method` is a paper id. Use `method_label` alone for a baseline with no paper. |
| `realism` | `{robot, human, environment}`, each a level id from `realism` or null | Filled only from what the paper states about its evaluation. `human` and `environment` place the dot in the plot in §8.3; `robot` shows only in its hover card. |
| `action_space_complexity` | level id from `action_space_complexity` or null | The number of options the evaluated policy has at one decision point. Set it from a count the paper's own text states, from arithmetic on stated counts (the comment says "derived"), or from Maithili's tag (the comment says so). A comment gives the count and its source. Otherwise null. Colors the dot in §8.3. |

Example:

```yaml
id: slate-pro
short_name: SLaTe-PRO
title: Predicting Routine Object Usage for Proactive Robot Assistance
authors: [M. Patel, A. G. Prakash, S. Chernova]
venue: CoRL
year: 2023
links: {paper: null}
provenance: GAP paper §II, §III-B, Table I, §IV
method:
  knowns: {goal: unknown, human_policy: unknown}
  family: temporal_imitation
  action_types: [act]
  inputs: [scene_graph]
  core_strength: null
  builds_on: [stot]
subproblems:
  A3: {status: addresses, relation: direct, approach: temporal_sequence, note: Extracts habitual patterns from a history of observed actions}
  A1: {status: skips, relation: direct, note: Skips human-policy learning}
evaluations:
  - id: slate-pro-original
    loop: offline_replay
    provenance: GAP paper §I, §IV
```

### 5.3 `data/datasets/<id>.yaml`

| Field | Type | Notes |
|---|---|---|
| `id`, `name` | string | |
| `kind` | `dataset`, `evaluation_setup`, or `simulator` | Simulators stay in the data so datasets and setups can name their `environment`. The site never lists a simulator as a row. |
| `introduced_in` | paper id or null | |
| `links.home` | URL or null | Landing page, never a PDF. |
| `sim_or_real` | `sim`, `real`, or `both` | |
| `span` | string ≤ 40 or null | Such as "Several weeks". |
| `households_or_users` | int, string, or null | |
| `observations` | modality id[] | |
| `goal_annotations` | `yes`, `partial`, `no`, or null | Goal-inference methods need these. |
| `executable` | `yes`, `no`, or null | Whether user actions can run in a simulator so robot actions change the state. Closed loop needs this. |
| `environment` | simulator id or null | The simulator it runs in. |
| `based_on` | list of `{id, relation}` | Other datasets this one relates to. `relation` is `extends` (adds to that dataset), `uses` (runs on it unchanged), or `validates_against` (checks its own data against it). |
| `human_models` | string[], each ≤ 60 | Setups only. Such as "LLM (gpt-4o-mini)", "Scripted". |
| `loops` | loop type id[] | Setups only. |
| `notes` | string ≤ 140 | |
| `tangent` | boolean | Default false. A tangential dataset shows part-way transparent in its own group at the bottom of the datasets table (§8.5). Datasets introduced by tangential papers are tangential. |
| `provenance` | string ≤ 140 | |

### 5.4 Validation and derived fields (`scripts/build-data.ts`)

The build fails on any of these errors.

- A file does not match its schema, or uses an id that is not in the taxonomy.
- An id in `builds_on`, `baselines`, `datasets`, `environment`, `introduced_in`, `results.method`, or `loop_types.*.refs` does not exist.
- A paper `id` differs from its file name, or two evaluations share an id.
- A text field exceeds its cap.
- A link path ends in `.pdf` (ignore case and query string), or any `.pdf` file exists in the repo.
- `knowns` is `{goal: unknown, human_policy: known}`. That combination is not a level in the formalism.
- `family` is set on a paper whose level is not L2.
- `builds_on` contains a cycle.

The build prints these warnings and passes.

- `links.paper` is null.
- A `builds_on` target is newer than the paper. Preprints can cause this.
- A result's metric is not in its evaluation's `metrics`.
- A paper has no method, subproblem, or evaluation block and nothing references it.
- `data/citations.json` lists a paper id that no longer exists, or is missing a paper. Rerun `fetch-citations`.

`db.json` adds these derived fields.

- `level`: L0 if both known, L1 if goal known and policy unknown, L2 if both unknown, null if `knowns` is null.
- `built_upon_by`, `benchmarked_in`, and `cited_by`: reverse edges of `builds_on`, `baselines`, and citations.
- `edges`: one entry per pair of papers, with its drawn type (by the precedence in §5.5) and the full list of relations.
- `used_by` for each dataset and each metric.
- Per-subproblem counts by status.
- A lowercase search string per paper built from short name, title, authors, venue, and year.

### 5.5 Graph edges

The lineage graph draws three kinds of edges between papers. Each kind has one source.

| Edge | Line | Source | Who fills it |
|---|---|---|---|
| Builds on | Solid, 2 px, arrowhead | `method.builds_on` | Maithili only |
| Benchmarks against | Dashed, 1.5 px, arrowhead | `evaluations[].baselines` | Read from the paper's experiments section, with the section in that evaluation's `provenance` |
| Cites | Thin dotted, 1 px, low contrast, small arrowhead | `data/citations.json` plus `data/citations-manual.yaml` | `scripts/fetch-citations.ts`, plus hand-curated entries checked against each paper's reference list |

`data/citations-manual.yaml` holds hand-curated citations: a list of `{from, to, source, where?}`, where `from` cites `to`, both paper ids. `source` names who checked it (such as "Librarian, Oct 21 2026") and `where` gives the location in `from`'s text. The build merges these with `citations.json` and drops duplicates. The validator rejects unknown ids. The drawer's cites and cited-by lists show the source on hover.

Rules.

- Every edge points from the earlier work to the later one, that is, from the paper that is built on, benchmarked, or cited to the paper that does so.
- Only edges between two papers in the database count.
- Each pair of papers gets one line. Builds on outranks benchmarks against, which outranks cites. The edge hover card lists every relation between the pair.

`scripts/fetch-citations.ts`, run as `npm run fetch-citations`:

- Finds each paper on Semantic Scholar by `ids.doi`, then `ids.arxiv`, then an exact normalized title match with the year within one. It never accepts a fuzzy match.
- Fetches each found paper's reference list and keeps the references that are papers in the database.
- Writes `data/citations.json` with `generated_at`, `source`, one `{s2_id, cites}` entry per paper id, and an `unresolved` list. The file is committed. The build reads it and never calls the network.
- Reads an optional `S2_API_KEY` from the environment and stays within the public rate limit without one.
- Prints the papers it could not find. CONTRIBUTING.md tells contributors to run it after adding papers.

## 6. Shared shell

### 6.1 Header

Site name (links to Methods), tabs for Methods, Evaluations, and Subproblems, the search box, a "Contribute" button, and a "Paper ↗" link to the GAP paper arXiv page. The active tab is marked. Switching tabs keeps the query string.

### 6.2 URL state

| Param | Scope | Example | Meaning |
|---|---|---|---|
| `level` | Methods | `L1` | Selected level card. It highlights that card's timeline row only. |
| `family` | global | `temporal_imitation` | Family filter |
| `action` | global | `act,ask` | Action type filter |
| `input` | global | `scene_graph` | Input modality filter |
| `theme` | global | `continual_learning` | Theme filter |
| `years` | global | `2015-2026` | Year range |
| `q` | global | `goal` | Text filter |
| `paper` | global | `gap` | Open drawer |
| `compare` | global | `gap,slate-pro` | Compare set, up to 3 |
| `view` | per page | `list`, `matrix` | View toggle |
| `edges` | Methods | `builds,benchmarks,cites` | Edge types drawn for all papers. Absent means builds and benchmarks. Cites lines always show for the hovered or selected paper. |
| `tangents` | Methods | `0` | Hides tangential works. Absent means shown. |
| `focus` | Methods | `slate-pro` | Ancestry focus |
| `term` | Evaluations | `dC_added` | Net value term |
| `loop` | Evaluations | `closed_scripted,closed_adaptive` | Loop type filter |
| `category` | Evaluations | `task_performance` | Metric category: highlights its box in the metrics list and filters the protocols table |
| `metric` | Evaluations | `f1`, `goal_prf` | Metric filter. A metric group id matches any of its members. |
| `sub` | Subproblems | `A2` | Selected subproblem |
| `gaps` | Subproblems | `1` | Gaps mode in the matrix |

Rules.

- **Level scope.** One constant holds the focus levels (`FOCUS_LEVELS = ['L2']`).
  - Methods top band (§7.1): L2 and L1 papers.
  - Methods bottom half (graph and list) and the whole Evaluations page (protocols table, realism plot, dataset "used by" counts): only papers at a focus level. Papers with no level stay out, with one exception: tangential works stay in the graph and list (§7.2).
  - Subproblems page (lists, counts, matrix): papers at a focus level plus papers with no level, such as related works from other fields. Never L1 papers.
  - L1 papers otherwise appear only in the drawer, when opened from the L1 timeline row or from search.
- Global filters apply on every page. A paper with no method block fails any `family`, `action`, or `input` filter.
- Page params stay in the URL when the reader switches pages, so coming back restores the view. Each page ignores params that are not its own.
- Filter changes use `replaceState`. Opening a paper or switching pages uses `pushState`, so Back closes the drawer.
- Every page has a filter bar that shows active global filters as removable chips, with "Clear all".
- On graphs, filters dim non-matching items to 20% opacity. In lists and tables, filters hide them.

### 6.3 Search

A header box, focused by `/` or Ctrl/⌘+K. It matches short name, title, authors, venue, and year with simple token-prefix scoring (no library). The dropdown shows up to 8 results with short name, year, and level chip. Enter opens the drawer. On Methods it also scrolls to the node and pulses it once. On Subproblems it scrolls to the row.

### 6.4 Paper drawer

A 420 px right-side panel, and a bottom sheet under 640 px. Sections in order, with empty sections omitted (except Level).

1. Short name, year, venue. Title. Authors, truncated after six with "+n".
2. Links as buttons: Paper ↗, Code ↗, Project ↗ (only those present). "Copy BibTeX" if present.
3. Level: knowns chips in the style of the GAP paper Fig. 1 right panel ("g known · π^h unknown → L1"), then family.
4. Core strength (one line). Inputs → action types as chips.
5. Subproblems: a strip of seven cells labeled with subproblem short names and status glyphs, then one row per tagged subproblem with note and relation.
6. Evaluations: per entry, a loop-type pill, datasets, metric chips colored by net value term, and captures glyphs.
7. Lineage: builds on, built upon by, benchmarks against, benchmarked in, cites, cited by. Only papers in the database. All clickable.
8. "Appears on": links to each page that shows this paper, focused on it.
9. Footer: provenance line, "Suggest a correction" (§10), "Pin to compare".

Fields that exist but are empty render "—". Esc closes the drawer.

### 6.5 Compare tray

Readers pin up to 3 papers. The pin button disables at 3 with a short message. A bottom bar shows pinned chips and a "Compare" button. The compare view puts papers in columns and these rows: level and knowns, family, action types, inputs, core strength, the seven subproblem status glyphs, evaluations (loop types and metrics), year, links. Rows where all values match are greyed.

### 6.6 Empty states

Every list, graph, and panel has an empty state that says what is missing and links to "Suggest a paper", such as "No L0 works yet. Suggest one."

## 7. Methods page

The page has two parts. A top band holds the level cards and a condensed timeline. Below it, the main graphic is an interconnected literature graph, with its legend directly above it.

### 7.1 Top band

Left to right: level cards, then the condensed timeline across the remaining width. The legend sits with the graph (§7.2), not in the top band.

- **Level cards.** Three stacked cards, L2 on top, then L1, then L0. The L2 and L1 cards show name, knowns chips, one-line definition, and paper count. The L0 card is a baseline description: name, knowns chips, and definition, with no paper count, no timeline row, and no click action. Clicking the L2 or L1 card selects that level and sets `level=`. Clicking it again clears the selection. No toggle bar for g and π^h.
- **Condensed timeline.** One row beside the L2 card and one beside the L1 card, holding that level's papers with no breakdown by family. The two rows share one year axis. From 2021 on, each year gets one equal-width band. All earlier papers share one narrow band at the left labeled "Before 2021", in year order, with each paper's year in small text and an axis break mark before 2021. One constant holds the cutoff (`TIMELINE_START = 2021`). Papers show as compact chips with the short name, stacked when they share a year.
  - Hovering a chip highlights the same paper in the graph, and hovering a graph node highlights its chip.
  - Clicking a chip opens the drawer and, if the paper is in the graph, focuses its node.
  - A time brush on the shared axis sets `years=`.

### 7.2 Literature graph

- **Scope.** The core of the graph is algorithmic: every paper at a level in `FOCUS_LEVELS` (L2) with a method block and no `tangent`. L1 papers appear only in the top band (§6.2 Level scope).
- **Semi-tangential families.** A family with `semi_tangential: true` (Implicit Cues to start) gets its own cluster like any family, drawn at 75% opacity: dots, hull, label, and its edges. Hover brings it to full opacity. Its papers count as L2 everywhere else.
- **Legend**, directly above the graph inside the graph panel (a compact row that wraps on narrow screens), per Maithili. It shows:
  - the three edge styles with checkboxes bound to `edges=` (builds on and benchmarks on by default, "Show all citation lines" off)
  - the families, each with its hull tint
  - the tangential categories, each with its dot color and no hull
  - "No category" in gray
  - the framework-paper ring
  - dot size and darkness
  - a "Show tangential works" checkbox bound to `tangents=`

  It has no action-type or level groups. The top band keeps only the level cards and the timeline.
- **Tangential works.** Papers with a `tangent` also show in the graph, along with the edges that touch them. They don't appear in the timeline, and they sit outside the cluster hulls.
  - Each tangential category (each `tangent_types` entry) has its own color, set by a `color` slot in the taxonomy.
  - Its papers are dots in that color at 60% opacity, with no hull or background shading.
  - Each category has a text label in its color near its papers, such as "Dynamic mapping and object search" or "User perceptions of proactivity".
  - Hover or focus brings a tangential node and its edges to full opacity, and its hover card names its category.
- **Clusters.** One cluster per L2 family, so Goal Inference and Temporal Imitation to start. Each cluster draws as a soft tinted hull behind its nodes, labeled with the family name, with the scope line, strength, and limitations on hover. Papers with no family sit outside the hulls, in the space between the clusters. GAP is one of these.
- **Layout.** Computed once at build time in `scripts/build-data.ts` and stored as x, y per paper in `db.json`, so the graph loads instantly and papers keep their positions between visits. `d3-force` runs a fixed number of ticks from seeded positions. Cluster centers sit evenly spaced on a circle, which puts two clusters left and right. Each node pulls toward its cluster center, and nodes with no family pull toward the point between clusters. Tangential works pull toward an anchor for their own category, placed in the band just outside the clusters, so each category forms a loose labeled group, never far off. The layout is spring-style, to keep edges from crossing nodes and each other. Every edge type (builds on, benchmarks, cites) acts as a spring that pulls its two papers together, all nodes repel each other, and a collision force keeps dots and their labels apart. An extra force pushes each node away from edges it is not part of. After the simulation settles, a deterministic clean-up pass nudges nodes within their cluster to remove remaining edge–node overlaps and reduce edge crossings. Filters dim nodes and never move them.
- **Growth.** Adding papers or a new family needs no layout code change. A new family gets its own cluster. The graph stays readable and responsive with a synthetic fixture of 300 papers in 4 clusters plus 30 tangential works: pan and zoom stay smooth, and hover responds within 50 ms.
- **Nodes** are dots, in the style of ResearchRabbit, matching the mock Maithili approved:
  - Radius grows with the number of database papers the node connects to by any edge type, from 7 px to a capped maximum.
  - Fill hue is the family: teal for Goal Inference, coral for Temporal Imitation, and further hues for new families. Papers that fit no category, meaning core papers with no family and tangential works with no known type, stay gray. GAP (`FRAMEWORK_PAPER`) keeps purple, with a purple ring.
  - Darker fill means a newer paper, from the year's position in the visible range.
  - Every dot has a thin outline in the page background color.
  - Tangential works are slightly smaller dots in their category's color at 60% opacity (see Tangential works above).
  - No pills, no boxes, no action-type icons on the node.
- **Labels** sit to the right of the dot as plain text: short name, then the two-digit year in muted text (" '23"). Don't repeat a year that the short name already contains. At the fitted zoom, only the larger dots show labels, with collision-aware placement that hides overlapping labels. Zooming in reveals more. Hover, focus, selection, and search always show a node's label.
- **Clusters** draw as soft tinted ellipses or rounded hulls behind their dots, with the family name above in the cluster's dark stop. The scope line, strength, and limitations show on hover over the name.
- **Edge routing.** No edge may pass through or touch a node that isn't one of its two ends. If one still would after layout, the edge bends around that node. Its curve's control point moves sideways, to whichever side clears every node with the smaller bend. If one bend isn't enough, the edge becomes a smooth path through a waypoint beside each obstacle. Clearance is the node's drawn radius plus 6 px, and it holds at every zoom level.
- **Edges** follow §5.5 as thin gray curves that start and end at the dot edges, with small arrowheads. Builds on is solid, benchmarks dashed, and cites dotted and lighter. Cites lines draw only for the hovered or selected paper unless "Show all citation lines" is on. Hovering an edge lists every relation between its two papers.
- **Zoom and pan** use `d3-zoom`. On load, the graph fits its content with a small margin, so no large empty areas remain. Controls for zoom in, zoom out, and fit sit in the graph's corner. Choosing a paper in search zooms to it and pulses it once. The wheel zooms only with a modifier key or inside the graph after a click, so page scrolling isn't hijacked.
- **Hover or focus** on a node fades everything except that paper and its direct neighbors, colors its edges with its family's dark stop, and shows a card with short name and year, title, core strength, inputs → action types, and knowns chips.
- **Click** on a node highlights its ancestors and descendants through the edge types currently shown, dims the rest, sets `focus=`, and opens the drawer. Clicking empty canvas or pressing Esc clears the focus.
- **Rendering.** SVG. Keep the element count per node small, so 330 nodes stay smooth.
- **Filter bar**: family, action type, input modality, theme, years. Selecting a level card affects only the top band.
- **View toggle**, Graph or List. The list covers the same papers as the graph: L2 methods grouped by family, then tangential works grouped by tangent type, with sortable columns for short name, year, title, inputs, action types, core strength, and count of subproblems addressed. List is the default under 640 px.
- The graph fits its container width and scales down on narrow screens. The page itself never scrolls horizontally.

## 8. Evaluations page

Sections from top to bottom. A bare `#/evaluations` URL starts unfiltered: no term, category, metric, or loop type selected, every protocol row shown, and every metric row at full strength.

### 8.1 Net value navigator

- The headline ΔV − ΔC in KaTeX, with the `counterfactual` line under it.
- Below, four focusable term buttons in order: ΔV, ΔC↓, ΔC↑, C_r. Each shows its label, its one-line definition on hover and focus, and a count of metrics that measure it.
- Clicking a term sets `term=`. It dims the metric rows that do not measure that term (§8.6) and filters the protocol table to papers with a metric that measures it.
- Hovering or focusing a metric anywhere on the page highlights its terms.
- A term with no metrics shows "No metric in the database measures this term yet." With the seed data, ΔV and C_r show this.

### 8.2 Featured comparison

A grouped bar chart built from `featured_comparison`. Each method's Offline bar always shows next to its two closed-loop bars, with no toggle. Bars carry value labels. The caption names the source ("GAP paper, Table II"). Clicking a bar opens that method's drawer.

### 8.3 Evaluation realism plot

This plot shows how close each paper's evaluation is to the real target, on two axes from `realism` in the taxonomy, with action space complexity as color. The idea comes from a figure in a paper that is not yet public (§16).

- **x axis**: environment realism, from Simulator on the left to Users' own homes on the right. **y axis**: human realism, far at the bottom. Each axis has one band per level, in taxonomy order, labeled with the level names.
- **No robot axis.** Every evaluation in the database uses a task-specific policy, so robot realism would not separate papers (per Maithili, Oct 22 2026). `realism.robot` stays in the data and in the hover card.
- **Color** is action space complexity (`action_space_complexity` in the taxonomy): the number of options the policy has at a given point in time, which stands in for the complexity of the policy. It uses one four-step sequential green ramp, light for low and dark for very high on the light theme, with its own steps on the dark theme so very high keeps the most contrast. Purple stays GAP's, and the ramp avoids the tangential-category hues. An evaluation with no level is pale gray with a dashed outline. Dots are fully opaque. A compact legend under the plot shows the ramp as one gradient pill with "Low" and "High" at its ends (every level and its definition on hover), then "Not assessed" and the framework-paper ring.
- A dashed "target" circle with a star sits past the top-right corner, beyond the last band on both axes.
- **One dot per paper.** A paper with several evaluation entries takes the closest level on each axis and the most complex action space level across its entries. A paper appears only when it has both a human and an environment level. A note under the plot counts the papers it leaves out.
- Dots that share a cell pack into a small grid inside it, ordered by year, so they never overlap. GAP's dot has a ring in the framework-paper color, and its fill follows action space complexity like every other dot.
- **Hover or focus** on a dot shows a card with short name, year, title, Paper ↗ and Code ↗ links, the people, setting, action space complexity, and robot levels in words, loop types, and datasets. The card stays open while the pointer moves into it, so its links can be clicked. Clicking a dot opens the drawer.
- Filters dim dots. Dots are keyboard-focusable in year order.
- **Credit line.** When `realism.source_url` is set, the caption reads "Organization adapted from" with a link to that paper. It stays null until the paper is public.
- The loop-type filter moves to the filter bar as a dropdown bound to `loop=`.

### 8.4 Evaluation protocols table

One row per paper, GAP included, however many evaluation entries the paper has. The row merges them. Columns, in this order (per Maithili, Oct 22 2026): paper (short name), year, metric categories (one chip per distinct category label among the paper's metrics, in category order; never individual metric names), environment and datasets (union), loop types (one pill per distinct type, in scale order), human models (union), baselines (union, count, expandable). All columns sort. The table has no state drift or goal adaptation columns and no captures legend, per Maithili; `captures` stays in the data and shows only in the drawer. Loop type sorts by the paper's furthest type on the scale. A paper appears only if it is at a focus level (§6.2), is not in `evaluations_exclude`, and has at least one evaluation entry. A paper matches `loop=`, `term=`, `category=`, or `metric=` when any of its entries does. Clicking a row opens the drawer, which lists each evaluation entry separately.

GAP's row sits at the top in a shaded band, since GAP is part of the paper the site is built on. It stays at the top under every sort and carries a small "Framework paper" tag linking to the arXiv page. Filters can still hide it. One constant names this paper (`FRAMEWORK_PAPER = 'gap'`).

### 8.5 Datasets and evaluation setups table

Rows are entries of kind `dataset` or `evaluation_setup`. Simulators never appear as rows. They show only in the environment column. Tangential datasets (`tangent: true`) form their own group at the bottom, drawn at 60% opacity, under a "Tangential" divider.

Columns: name, kind (Dataset or Setup), environment, based on (such as "Extends HOMER" or "Validated against HOMER", each linked to that row), sim or real, span, households or users, observations, goal annotations, executable, human models and loops (setups only), used by. Column filters for kind, sim or real, goal annotations, and executable. The name links to `links.home`. An info button opens a small panel with notes and the introducing paper. Clicking "used by" filters the protocol table to evaluations that use that dataset.

### 8.6 Metrics list

A vertical list of category boxes, one per metric category in category order, all visible at once with no tabs (per Maithili, Oct 22 2026). Each box shows only categories that a paper on the page uses. The box heading is the category label, followed by the term tags of its metrics. Its rows are the metrics themselves, as a concise list:
- Similar metrics collapse into one row through `group`, for example "Goal precision, recall, and F1" or "Ratings of goal knowledge, helpfulness, and trust".
- Each row shows the metric or group name, ↑ or ↓, the unit in small light italic text, and a one-line definition. There is no ↕. A group whose members differ in direction has no arrow on its name and lists its members, each with its own ↑ or ↓, and with its own unit when the units differ too. A group with one direction and several units lists the units.
- A definition says what is measured without repeating the metric's name.
- Each row links to the papers that use it, as short-name links that open the drawer.
- Static term tags sit in the row's bottom-right corner, with two labels and no arrows: ΔV for `dV`, and ΔC for `dC_saved`, `dC_added`, and `Cr`. A row shows the union over its metrics, and a row whose metrics serve no term shows none. Rows have no hover card.

Clicking a category header collapses its box to the header line, and clicking again expands it. Boxes start expanded, and one "Collapse all / Expand all" control acts on every box. Collapse state stays out of the URL. It persists per viewer in `localStorage` (inside try/catch), and a selected category or metric opens its box.

Clicking a category chip in the protocols table sets `category=`, filters the table, and scrolls to and highlights that box. Clicking a metric row sets `metric=`. A group row sets the group id, which matches papers that use any of its members. When a term is selected (§8.1), rows whose metrics do not measure it dim rather than hide.

Metrics with no category never show on this page. That covers metrics used only by tangential or excluded papers (object search, persistence, emergencies) and Din 2025's relation accuracy. Computational metrics (training time, training samples, inference time, planning time) and ProAct's saved steps metrics are out of the data entirely, per Maithili: ProAct's evaluation is activity prediction, not closed loop.

## 9. Subproblems page

This page shows the different methodologies for each subproblem, so it lists a work under a subproblem only when its tag there is `addresses` and names an approach from that subproblem's `approaches` list in the taxonomy. Works that assume a subproblem is given, skip it, or address it without a named approach do not appear here. This is a display rule: the paper data keeps every tag, and the tags still show in the paper drawer and the compare view. Every list and count on the page uses the rule (overview counts, navigator badges, detail lists, matrix), as does the drawer's "Appears on" link to this page.

### 9.1 Navigator

An interactive version of GAP paper Fig. 2. It runs left to right on wide screens and top to bottom under 900 px: ξ₀:ₜ → Grounding (goal space, action-goal association) → Anticipation (human policy, goal inference, goal anticipation) → Planning (cost model, action selection) → aʳₜ. Each node shows its name and a badge counting the works the page lists under it under the current filters. Edges come from `depends_on` and point from a prerequisite to the subproblem that depends on it. An edge within a stage crosses the gap between its two nodes, so its arrowhead never lands where the target's edges to the next stage leave.

Selecting a node sets `sub=`. Its upstream dependencies (all transitive ancestors through `depends_on`) take one highlight color, its downstream dependents (all transitive descendants) another, and the rest dim. An edge is upstream when both its ends are the selected node or its ancestors, and downstream when both are the selected node or its descendants, so the lit edges are exactly the dependency paths into and out of the selected node. Arrowheads take their edge's color.

### 9.2 Detail panel

With nothing selected, the panel lists all seven subproblems with the count of works that address each. With a subproblem selected, it shows:

- name, input → output in KaTeX, and the one-line challenge;
- the works listed under it, grouped by approach in taxonomy order, each row with a relation glyph (a full moon for direct, a half moon for adjacent, with the relation's definition as its tooltip and label), short name, year, and note, and a click that opens the drawer;
- filter chips for relation (direct, adjacent), which carry the same glyphs and so serve as their legend;
- an empty state when no work addresses it directly, such as "No work in the database addresses goal-space representation directly. Suggest one."

### 9.3 Themes

Filter chips for the four themes, bound to the global `theme=`.

### 9.4 Matrix view

`view=matrix` replaces the detail panel with a matrix. Rows are papers the page lists under at least one subproblem, grouped by level and family (method papers first). Columns are the seven subproblems, labeled with short names under their stage headers, and each column header shows how many works the page lists under it. A cell shows ● when the page lists the work under that subproblem and stays blank otherwise. Clicking a filled cell opens the drawer. The header row and first column stay sticky. The "Gaps" toggle (`gaps=1`) dims filled cells and outlines empty cells in method rows.

## 10. Contribution flow

- **CONTRIBUTING.md** explains how to add a paper (copy the template or run `npm run new-paper -- <id>`), links each field to its taxonomy definition, and states the rules: landing-page links only, no PDFs, tag only what the paper states, provenance required, run `npm run validate`.
- **`add-paper.yml` issue form** with fields for title, link, short name, goal known or unknown, human policy known or unknown, family, action types, inputs, subproblems (text, one per line like "A2: addresses, note"), evaluation (loop type, datasets, metrics), and provenance.
- **`fix-paper.yml` issue form** with fields for paper id, field, correction, and source. The drawer's "Suggest a correction" opens it with the id and title prefilled through query parameters.
- **Contribute button** opens a small popover with "Suggest a paper" (the add form), "Edit data on GitHub" (the `data/papers` folder), and "Read the guide" (CONTRIBUTING.md).
- **PR template** with a checklist: validate passes, provenance filled, links are landing pages.

## 11. Visual design

- Calm and academic. Dense but scannable. Content width up to 1280 px, with the graph and matrix allowed full width.
- Color tokens on `:root`, redefined for dark mode under `prefers-color-scheme`, plus a manual theme toggle saved in `localStorage` inside try/catch.
- **Levels** use one sequential hue ramp, lightest for L0 and darkest for L2, since levels are ordered by unknowns. Color never carries meaning alone. Lanes have labels and chips say "L1".
- **Statuses** use glyphs ● ◐ ○, with a blank cell for "not tagged". Every view that uses them shows a legend.
- **Action space complexity** (§8.3) uses one sequential green ramp (`--action-space-1` to `--action-space-4`), with its own dark-theme steps, and pale gray for "Not assessed".
- **No subproblem codes.** G1, G2, A1, A2, A3, P1, and P2 never appear as visible text. The UI uses subproblem names, or the `short` labels where space is tight. Codes stay in data files and URLs.
- **Net value terms** use four categorical colors plus their symbols. The same colors appear in the equation, metric chips, and table dots.
- System UI sans-serif for the interface, KaTeX for math, tabular numerals in tables.
- Motion stays at or under 300 ms and turns off under `prefers-reduced-motion`.

## 12. Accessibility, responsiveness, performance

- Every interactive element is reachable by keyboard. Graph nodes take focus in cluster order, then year order. Enter opens the drawer and Esc closes it.
- Glyphs and icons carry ARIA labels ("Addresses", "Acts").
- Text and UI contrast meets WCAG AA in both themes.
- The site works from 360 px to 1920 px wide. The page never scrolls horizontally. The graph and matrix scroll inside their own containers.
- `db.json` stays under 500 KB at 300 papers. Filtering responds in under 100 ms.

## 13. Testing, CI, deployment

**npm scripts**: `dev`, `build` (runs `build-data` first), `validate`, `test`, `e2e`, `new-paper`, `preview`.

**Unit tests (Vitest)**: level derivation, every validator rule with a failing fixture (including a metric with an unknown category or group, a group whose members span categories, a group definition over 140 characters, an `evaluations_exclude` id that is not a paper, an unknown `action_space_complexity` level, an `action_space_complexity` scale with no levels or more than four, and an `opacity` on a realism level), the `evaluations_exclude` scope, the most complex action space level across a paper's entries and its ramp color, metric box rows (a group as one row, at its first member, dimmed only when no member measures the selected term, tagged ΔV or ΔC by the union of its members' terms), the category filter, `metric=` with a group id, URL state round trip, search scoring, subproblem upstream and downstream sets, ancestry traversal, edge precedence and merging, and `fetch-citations` resolution against mocked API responses (DOI match, arXiv match, exact title match, near-miss title rejected).

**End-to-end tests (Playwright)** on the seed data:

1. Each page loads with no console errors.
2. Setting the Goal Inference family filter on Methods and switching to Subproblems keeps the filter. Back restores the previous view. No L1 paper appears in the graph, the list view, the protocols table, the realism plot, or the Subproblems page.
3. `?paper=gap` opens the drawer, and Esc closes it.
4. Hovering a timeline chip highlights the same node in the graph. GAP's node sits outside both cluster hulls.
5. ΔC↑ counts 12 metrics, all categorized. Clicking it keeps all seven metric boxes, dims every row in the Implicit need detection and Coordination fluency boxes, and hides the protocol rows of papers with no ΔC↑ metric, such as ProAct and Anticipatory TAMP. Net actions saved, perturbed actions, and F1 stay at full strength.
6. The featured chart shows 6 bars at load, with no toggle.
7. Selecting A2 lists NOPA, highlights G1, G2, and A1 upstream, and highlights P2 downstream.
8. In matrix view, clicking a filled cell opens the drawer. Selecting goal inference does not list SLaTe-PRO, which skips it.
9. Pinning two papers puts both ids in `compare=`.
10. At 375 px wide, no page scrolls horizontally.
11. On Methods, the STOT to SLaTe-PRO edge is solid. With "Show all citation lines" off, no dotted edge shows until a node is hovered. The fit button brings every node into view. No drawn edge, in the seed data or the synthetic fixture, passes within clearance of a node that isn't one of its ends. A unit test over the edge geometry checks this; it would catch Watch-And-Help to NOPA passing through ProAct.
12. On Evaluations, the datasets and evaluation setups table has no VirtualHome row, and VirtualHome appears in the environment column. The protocols table's columns run paper, year, metric categories, environment and datasets, loop types, human models, baselines. It has 12 rows and exactly one GAP row, shaded and first, showing three loop-type pills and the categories Change in user actions and Object movement prediction, and it stays first after sorting by year, name, metric categories, and loop type.
13. The realism plot's axes are setting (x) and people (y), with no robot axis. GAP's dot sits at Simulator and Adaptive simulated user, fully opaque, in its action-space-complexity color in both themes (gray with a dashed edge while not assessed), with its ring. The legend lists Low, Medium, High, Very high, and Not assessed. Hovering GAP's dot shows a card with a working Paper link and an action space complexity row with GAP's level or "Not assessed". ProAct, with no stated setting, has no dot, and the note under the plot counts it.
14. With a fixture tangential paper, its graph node renders in its category's color at 60% opacity, and unchecking "Show tangential works" removes it and its edges.
15. The protocols table shows category labels, one chip per category in category order, and no metric names. The metrics list has no tabs, and every category box is visible at once, in category order. The Task performance box shows "Goal precision, recall, and F1 ↑ fraction" as one row, with links to Watch-And-Help and NOPA and no hover card. Clicking a paper link opens the drawer. Clicking the row sets `metric=goal_prf` and filters the table to those two papers. Clicking a category chip in the table sets `category=`, filters the table, and scrolls to and highlights its box. `metric=speedup` marks its row and filters the table. PredictiveGraphs has no row and no realism dot but stays on the graph and the Subproblems page. ProAct has no closed-loop pill.
16. A bare `#/evaluations` URL has no active filter chip, shows all 12 protocol rows, and dims no metric row. Bare `#/methods` and `#/subproblems` URLs also start with nothing selected or dimmed. Category headers show their ΔV and ΔC tags, collapsing a box hides its rows, and no "↕" appears on the page.

**CI** (`.github/workflows/ci.yml`) runs on pull requests and pushes: `npm ci`, validate, typecheck, unit tests, build, end-to-end tests.

**Deploy** (`.github/workflows/deploy.yml`) runs on pushes to `main`: build, then `actions/upload-pages-artifact` and `actions/deploy-pages`. Maithili sets Settings → Pages → Source to "GitHub Actions" once.

## 14. Milestones

Work on `main`. Commit at the end of each milestone and push to `origin main` right away; do not use feature branches. Each milestone ends with passing tests and a short note on what was built and what is blocked.

| | Milestone | Done when |
|---|---|---|
| M1 | Data foundation: taxonomy, schemas, validator, `build-data`, `new-paper` | `npm run validate` passes on an empty `papers/` folder, and each §5.4 rule has a failing fixture |
| M2 | Seed data from `spec/SEED.md` | Every SEED entry has a file. Links come only from confirmed landing pages. `data/SEED_REPORT.md` lists missing links and every difference between the GAP paper reference list and the landing page. Baselines are recorded per SEED rule 7. `data/citations.json` exists. Validate passes. |
| M3 | Shell: routing, header, URL state, search, drawer, compare tray, theme toggle | E2E tests 3 and 9 pass |
| M4 | Methods page | E2E tests 2, 4, 11, and 14 pass. Graph readable with seed data and with the 330-node synthetic fixture from §7.2. |
| M5 | Evaluations page | E2E tests 5, 6, 12, and 13 pass |
| M6 | Subproblems page | E2E tests 7 and 8 pass |
| M7 | Contribution flow, CI, deploy, README | CI green on `main`. README links the live site and CONTRIBUTING.md. |
| M8 | Polish: keyboard and ARIA pass, responsive pass, empty states | All E2E tests pass, including test 10 |

M2 can run alongside M3.

## 15. Decisions taken by default

Maithili can reverse any of these.

1. **Citation source.** Semantic Scholar, matched by DOI, arXiv id, or exact title. OpenAlex is the fallback if coverage turns out poor.
2. **Subproblem dependencies** come from the Table I inputs and outputs. A2 → P2 assumes the anticipated goals g_{t:t+Δt} include the current goal g_t.
3. **Direct vs adjacent.** A work is direct for a subproblem if Table I or §III-B lists it there, and adjacent if only Appendix II-A does.
4. **Hosting.** GitHub Pages from this repo, with hash URLs.
5. **Contributions.** GitHub issues and pull requests, with no backend.
6. **Results.** Only the Table II comparison appears as a chart.

## 16. Open items for Maithili

Placements decided by Maithili (Oct 21, 2026): SGM, FlowMaps, EvolvingNav, Dorbala (TAP), and Mullen (HomeEmergency) are tangential works of type `search`. Dhakal 2026 and both Talukder papers are L2 with no family, between the clusters like GAP. Din 2025 is L2 in the semi-tangential Implicit Cues family. COIN appears only as a tangential dataset, with no node anywhere. GLOBE joins Temporal Imitation as proposed earlier (no objection raised).

Confirmed by Maithili (Oct 22, 2026): the Koch van den Broek review sits under "User perceptions of proactivity". Purple is only for GAP, and papers that fit no category are gray. Every relevant paper appears on the Subproblems page, including the object search papers. Courteous Anticipation gets no "benchmarks against" line to Talukder 2025; its "Selfish A.P." baseline stays text in `other_baselines`.

The three anticipatory planning papers (Anticipatory TAMP, Talukder 2025, Courteous Anticipation) are open loop, per Maithili: their task streams are fixed and never respond to the robot. Their entries use `offline_replay`, with the human side at `recorded`.

Realism plot axes, per Maithili (Oct 22, 2026): x is environment and y is human. Robot realism leaves the plot because every evaluation uses a task-specific policy; it stays in the data and the hover card. Environment no longer sets opacity. Color shows action space complexity, as a way to show policy complexity. Maithili's definition: "Action space combinatorial complexity is the number of options the policy has at a given point in time." Under 50 fixed options (such as activity labels) is low, up to 100 (such as 10 objects on any of 10 locations) is medium, more is high, and a generative, unbounded set is very high. This replaced an earlier three-level task complexity scale. Every placed paper currently sits in the Simulator column.

Subproblems page, per Maithili (Oct 22, 2026): a subproblem lists only works that solve it, even toward a goal other than proactivity, and never works that assume it away or do not actually solve it. The page applies this as a display rule (§9). A tag counts only when it is `addresses` and names an approach from the taxonomy, so the "Other" group is gone. The seed mapped "partly", "implicitly", and "indirectly" to `addresses`, and those tags name no approach. The paper data is unchanged. The rule takes ten papers off the page: GAP (it names no approach on any subproblem), the five object search papers (SGM, FlowMaps, EvolvingNav, TAP, Mullen 2025), Din 2025, and the three anticipatory planning papers. This supersedes the Oct 22 note above that the object search papers appear on the page. In the same change, the relation tags became a full moon for direct and a half moon for adjacent.


1. **Realism levels** in `realism` (§5.1) adapt the levels from that figure to proactive assistance. Maithili reviews them.
2. **Action space complexity.** Levels set on Oct 22, 2026. STOT, STREAK, SLaTe-PRO, GAP and NOPA are high, derived from counts the papers state (HOMER's 108 objects; HOMER+'s 59 dynamic objects × 93 entities; NOPA uses Watch-And-Help's action space of 167 actions per step on average). Watch-And-Help's help and user-study entries are high from that stated count. Maithili tagged the rest: GLOBE low, ProAct low, the Watch-And-Help watch stage medium, and Talukder 2025, Anticipatory TAMP and Courteous Anticipation high. Din 2025 and the SLaTe-PRO query setting stay null.
3. **Credit link.** Set `realism.source_url` to the paper this organization comes from once it is public. Until then the plot shows no credit line.
4. **Tangential works.** Maithili lists them. Candidates from the GAP paper references that fit the two tangent types: Peng et al. 2019 [16] (a CHI design and evaluation of service-robot proactivity), and the works that ask questions [17] and [18]. Both left the database earlier. ADAPT [19] stays on the Subproblems page only and is not tangential, per Maithili.
