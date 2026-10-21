# Seed report

Written while seeding `data/` from `spec/SEED.md` (milestone M2), updated on the second pass and on the HOMER-lineage pass (both Oct 21, 2026, see the last two sections). Section and reference numbers point into the RTI paper unless a section names another paper.

## Open questions for Maithili (from SEED.md §9)

1. **Watch-And-Help [29] and G2.** Open. §III-B says the goal inference family assumes action-goal association is given. Table I and Appendix II-A list [29] under G2. Seeded as G2 addresses, per Table I.
2. **Loop type for [29] and [20].** Answered by reading the papers. STOT ([20]) scores relocations offline against ground truth (STOT §6.2), so `offline_replay` holds. Watch-And-Help scores goal inference offline (WAH §5.3), but its help stage is closed loop with a planner that replans each step (WAH §3–5), and it reports two experiments with real people (WAH §6). The data now has three Watch-And-Help entries for these.
3. **Benchmarks.** Open. Watch-And-Help [29] and ProAct [30] present benchmarks. Should they get `evaluation_setup` entries? ProAct's is ProAct-75 (5,383 real videos, ProAct §4.1).
4. **GAP's family.** Resolved. GAP has no family and sits between the clusters.
5. **Temporal family G1 and P1.** Open. Seeded as `assumes`, from §III-B's reading that these methods use a goal space at the action level and assume uniform cost.
6. **Reference list.** [20] prints CoRL 2023, and Maithili confirms CoRL 2022. [41] prints 2024. [16] prints no year. [63] prints no venue or year. Every other difference found is listed below.
7. **To fill.** `core_strength` for all L2 methods and `builds_on` edges beyond the three Maithili gave. HOMER+ goal annotations are now filled from SLaTe-PRO App. A.3 (activity labels per step).

## Decisions the builder made

Maithili approved these on Oct 21, 2026.

- **Families.** SEED §2.1 and §2.2 group papers by family but do not list `family` in the extra fields. The builder set the temporal family (now `temporal_imitation`, "Temporal Imitation") on the four §2.1 papers and `family: goal_inference` on the three §2.2 papers, following the SPEC §5.2 example for `slate-pro`.
- **Year convention.** Where the landing page year differs from the printed year, the landing page year is used (SEED rule 2). For CoRL papers in PMLR this now means the conference year, since Maithili gave STOT as CoRL 2022 (Oct 21, 2026). SayCan and Reciprocal MIND MELD (CoRL 2022, PMLR 205) carry 2022, and Play-LMP (CoRL 2019, PMLR 100) carries 2019.
- **Ids renamed** so `firstauthor-year` matches the landing page (the SEED ids were proposals):

  | SEED id | New id | Why |
  |---|---|---|
  | `koppula-2015-anticipating` | `koppula-2016-anticipating` | TPAMI issue is 2016 |
  | `peng-service-robot-proactivity` | `peng-2019-service-robot-proactivity` | CHI 2019 |
  | `levy-2017-hierarchies` | `levy-2019-hierarchies` | ICLR 2019 |
  | `zhu-2021-skill-discovery` | `zhu-2022-skill-discovery` | RA-L 2022 |
  | `zhou-2023-language-action-survey` | `yao-2023-language-action-survey` | Xiangtong Yao is now first author |
  | `nikolaidis-2014-joint-action` | `nikolaidis-2015-joint-action` | HRI 2015 |
  | `lynch-2019-play` | `lynch-2019-play` | Briefly `lynch-2020-play` (PMLR 100 date), back to the conference year |
  | `patel-2023-spatiotemporal` | `stot` | The paper's method name, per Maithili |
  | `schrum-2023-mind-meld` | `schrum-2022-mind-meld` | CoRL 2022 conference year |
  | `pereira-2019-landmark` | `pereira-2020-landmark` | AIJ vol. 279, 2020 |
  | `zhao-contribution-preferences` | `zhao-2023-contribution-preferences` | CoRL 2023 |

- **Short names.** Method or system names from the landing page or abstract: PredictiveGraphs, HOI4ABOT, HIT, CLARA (since removed), ADAPT, HAC, SayCan, SIPS, HER, Actionable Models, DMSRD, LbW, BCO, Reciprocal MIND MELD, Play-LMP, SLiM, TAACo, GRACE, CIRL, AssistanceZero, Anticipate & Act. The rest use "FirstAuthor Year". The two Amado 2018 papers are "Amado 2018a" (LSTM, arXiv) and "Amado 2018b" (IJCNN) so they can be told apart.
  - ADAPT: the title names the benchmark ADAPT; the trained method is called Reflection-DPO. Seeded as ADAPT.
  - Zhu 2022: the paper body calls its method BUDS, but the abstract does not, so rule 4 gives "Zhu 2022".
  - Anticipate & Act: the abstract gives no separate method name; the title's name is used.
- **Authors** use the full names on the landing page, in landing-page order.
- **VirtualHome `links.home`** is the CVPR 2018 open-access page. The project site (http://virtual-home.org) is listed as the homepage on the official GitHub repo but could not be fetched (403 and a certificate error), so it was not used.
- **Code links** were added only where the landing page or abstract links official code: Watch-And-Help, SIPS, AssistanceZero. Play-LMP gets `links.project` (learning-from-play.github.io) from its landing page.

## Missing links

None. Every entry has a confirmed landing page. Pages behind bot protection (IEEE Xplore, ACM DL, ScienceDirect, Springer, SAGE, Emerald, OpenReview) were confirmed through the DOI's Crossref record or a secondary index rather than by loading the publisher page. Worth a spot check:

- `watch-and-help`: OpenReview forum `w_7JMpGZRh0` (from the ML Anthology ICLR 2021 entry; the arXiv page confirms ICLR 2021).
- `levy-2019-hierarchies`: arXiv abstract used because the OpenReview forum (`ryzECoAcY7`) could not be loaded.

## Differences between the RTI reference list and the landing pages

Capitalization-only differences are not listed.

### Needs your attention

- **[11] `hoiabot`.** Printed as "Hoiabot: Human-object interaction anticipation for proactive bot", IEEE RO-MAN 2023, by E. V. Mascaro and D. Lee. The landing page is "HOI4ABOT: Human-Object Interaction Anticipation for Human Intention Reading Collaborative roBOTs", **CoRL 2023**, with **Daniel Sliwowski** as second author. No RO-MAN 2023 version was found. **Confirmed by Maithili (Oct 21, 2026): the CoRL 2023 paper is the intended one.**
- **[49] `hindsight-experience-replay`.** Printed second author "D. Crow". Both the NeurIPS page and arXiv give **Filip Wolski**.
- **[41] `cirl`.** Printed 2024 with no venue. Landing page: NeurIPS (NIPS) **2016**; "Stuart J. Russell".
- **[22] `koch-2024-proactive-hri-review`.** Printed ACM/IEEE HRI 2024 (conference). Landing page: **ACM Transactions on Human-Robot Interaction** (journal), vol. 13, no. 4, 2024. Title on the landing page: "What is Proactive Human-Robot Interaction? - A Review of a Progressive Field and Its Definitions".
- **[19] `adapt`.** Printed COLM 2025. The builder could not find the COLM page; Maithili supplied it (Oct 21, 2026). `links.paper` is the OpenReview forum https://openreview.net/forum?id=Z8vtD1egtI (the PDF link given was converted to its forum page), venue COLM, year 2025. Resolved.
- **[46] `levy-2019-hierarchies`.** Printed ICLR 2017. The paper is ICLR **2019** (arXiv v1 posted Dec 2017). Printed "G. D. Konidaris"; landing "George Konidaris".
- **[3] `saycan`.** Printed with A. Brohan first. PMLR lists **Brian Ichter** first, then Anthony Brohan (arXiv lists Michael Ahn first). Conference was CoRL **2022**; PMLR 205 is dated 2023, matching the printed year. Seeded with the conference year.
- **[48] `yao-2023-language-action-survey`.** Printed with H. Zhou first. The current arXiv version lists **Xiangtong Yao** first. Now also published in IJRR (2026), DOI 10.1177/02783649261468360 (found through Crossref only). Printed "A. C. Knoll"; landing "Alois Knoll".

### Year and venue

- **[16] `peng-2019-service-robot-proactivity`.** No year printed. ACM CHI **2019**.
- **[63] `zhao-2023-contribution-preferences`.** No venue or year printed. **CoRL 2023** (PMLR 229).
- **[39] `grace`.** No venue printed. **IEEE ICRA 2025**. First author spelled "Doğan" on IEEE (arXiv uses "Dogan").
- **[29] `watch-and-help`.** No venue printed. **ICLR 2021**.
- **[27] `koppula-2016-anticipating`.** Printed 2015. TPAMI issue is January **2016** (vol. 38, no. 1); the DOI is a 2015 early-access id.
- **[18] `clara`.** Printed 2023. RA-L issue is February **2024** (vol. 9, no. 2); the DOI is a 2023 early-access id.
- **[47] `zhu-2022-skill-discovery`.** Printed RA-L 2021. RA-L vol. 7, no. 2, **2022** (arXiv posted Sept 2021).
- **[34] `nikolaidis-2015-joint-action`.** Printed HRI 2014. Published at HRI **2015**; 2014 is the arXiv preprint 1405.6341. Printed "J. A. Shah"; landing "Julie Shah".
- **[56] `pereira-2020-landmark`.** Printed 2019. Artificial Intelligence vol. 279, February **2020** (arXiv 2019). First author is Ramon Fraga Pereira.
- **[37] `lynch-2019-play`.** Printed CoRL 2019. The conference is CoRL 2019; the PMLR 100 page is dated 2020. Seeded as 2019.
- **[20] `stot`.** Printed CoRL 2023. This is the 6th CoRL (held Dec 2022), PMLR 205, published 2023. Maithili confirms **CoRL 2022**. Seeded as STOT, 2022.
- **[55] `schrum-2022-mind-meld`.** Printed CoRL 2023. CoRL **2022** conference, PMLR 205, published 2023. Seeded as 2022.
- **[24] `smith-2020-dynamic-cost`.** Printed "Journal of Mechanical Engineering Science". Full name: Proceedings of the Institution of Mechanical Engineers, Part C: Journal of Mechanical Engineering Science. Online 2019, print issue 2020.
- **[31] `nakahashi-2015-subgoal`.** Printed arXiv 2015. Also published at AAAI 2016 (DOI 10.1609/aaai.v30i1.9889). Seeded with the arXiv page as printed.
- **[32] `zhi-xuan-2020-goal-inference`.** Printed arXiv 2020. Also published at NeurIPS 2020 as "Online Bayesian Goal Inference for Boundedly Rational Planning Agents". Seeded with the arXiv page as printed.
- **[35] `jayanthi-2022-strategy-discovery`.** arXiv comment says accepted at the AAAI-22 Workshop on Interactive Machine Learning. Printed "M. C. Gombolay"; landing "Matthew Gombolay".
- **[62] `assistancezero`.** Printed arXiv 2025. Since published at ICML 2025 (PMLR 267). Seeded with the arXiv page as printed.
- **[42] `saavedra-2026-scene-graphs`.** arXiv v2 says accepted to IEEE RA-L; no RA-L DOI found yet.
- **[30] `proact`.** An ICML 2026 poster page exists, but no proceedings page was found. Seeded with arXiv.

### Authors and titles

- **[30] `proact`.** Printed list ends "et al."; the full list adds Xuantang Xiong (11 authors). Method is named ProAct-Helper; the benchmark ProAct-75.
- **[28] `huang-2025-intention-tracking`.** Printed "F. C. Pouria"; landing "Fatemeh Cheraghi Pouria" (Cheraghi is part of the surname).
- **[58] `amado-2018-latent`.** IEEE lists "Joao Aires" (printed "J. P. Aires").
- **[36] `ramirez-2010-plan-recognition`.** Crossref says "Miguel", other sources "Miquel". The printed "M." fits either; seeded as "Miquel Ramírez".
- **[33] `baker-2009-inverse-planning`.** Printed "J. Tenenbaum"; landing "Joshua B. Tenenbaum".
- **[54] `sakr-2025-everyday-users`.** Printed "H. F. M. V. der Loos"; landing "H. F. Machiel Van der Loos".
- **[40] `banerjee-2018-interruptibility`.** The arXiv paper "Effects of Interruptibility-Aware Robot Behavior" has a different title and adds an author, so it is not this paper. The THRI DOI is used.

### No differences beyond capitalization

`slate-pro`, `streak`, `nopa`, `zhao-2022-strategy-matching`, `huang-2016-anticipatory`, `nemlekar-2023-transfer`, `garrell-2017-teaching` (since removed), `garrell-2013-mobile` (since removed), `dogan-2025-disambiguation` (since removed), `zhang-2023-llm-human-models`, `virtualhome`, `actionable-models`, `ravichandar-2020-lfd-review`, `xiong-2021-learning-by-watching`, `torabi-2018-bco`, `amado-2018-lstm`, `anticipate-and-act`, `zeng-2020-semantic-linking`, `malik-2019-task-allocation`, `patel-2025-personalization`, `fogarty-2005-interruptibility`, `ju-2008-implicit-interactions`.

## Validator warnings on the seed data

None. `koch-2024-proactive-hri-review` used to warn (no block, nothing referencing it). It now carries `tangent: hri` and shows as a tangential work in the literature graph.

## Second pass (Oct 21, 2026)

### Removed and changed

- **Removed** [14]–[18]: `garrell-2017-teaching`, `garrell-2013-mobile`, `peng-2019-service-robot-proactivity`, `dogan-2025-disambiguation`, `clara`. ADAPT [19] lost its method block and stays on the Subproblems page for its action-selection tag.
- **Lineage** from Maithili: SLaTe-PRO and STREAK build on STOT, NOPA builds on Watch-And-Help.
- **Surveys.** Only `koch-2024-proactive-hri-review` keeps `type: survey`. It also carries `tangent: hri`.

### Citations

- **Source.** OpenAlex, run on Oct 21, 2026 (`npm run fetch-citations -- --source openalex`). Semantic Scholar's shared public pool answered almost every request with 429 (5 of 53 papers found in 20 minutes), so the run fell back to OpenAlex per SPEC §15 item 1. `data/citations.json` records the source and date. The `s2_id` field holds OpenAlex work ids for this run.
- **Coverage.** 47 of 53 papers found (DOI, then arXiv id, then exact title with the year within one), 27 citation edges between papers in the database.
- **Rerun later.** OpenAlex's title search stayed rate-limited for `saycan`, `schrum-2022-mind-meld`, `slate-pro`, `stot`, `watch-and-help`, and `zhao-2023-contribution-preferences`, so they are unresolved for now. These have no DOI or arXiv id on their landing pages (PMLR and OpenReview), so only a title search finds them. Rerun `npm run fetch-citations` with a free Semantic Scholar API key in `S2_API_KEY` to fill them in. The alias search that links preprint and published versions was also skipped for 21 papers, so a few edges to preprint versions may be missing.
- **On the graph.** The literature graph draws edges only between its own nodes (L2 papers and tangential works). None of the 27 edges joins two of them yet, mostly because STOT, SLaTe-PRO, and Watch-And-Help are unresolved. All 27 show in the paper drawer under Cites and Cited by.

### Baselines read from experiments sections (SEED rule 7)

Only baselines that are papers in the database go into `baselines`. The rest go into `other_baselines` and, where they look like proactivity work, into the candidate list below.

| Paper | Benchmarks against (in the database) | Source |
|---|---|---|
| STOT | Semantic linking maps (`zeng-2020-semantic-linking`, the "Static Semantic" baseline) | STOT §6.1 |
| SLaTe-PRO | STOT | SLaTe-PRO §6 |
| STREAK | STOT (fine-tuned and jointly trained versions) | STREAK §V |
| PredictiveGraphs | STOT (listed as "HOMER [22]", reference [22] is the STOT paper) | PredictiveGraphs §VI-B |
| NOPA | Watch-And-Help (HPGPN, "the best performing approach in the original Watch-And-Help challenge") | NOPA §V-A |
| GLOBE | SLaTe-PRO, STOT | GLOBE §IV |
| GAP | SLaTe-PRO, STREAK | RTI Table II (seed) |

No baseline in the database: Watch-And-Help (own planner and RL variants, WAH §5.2), ProAct (MLLMs, ProAct §6), MESH (`zhao-2022-strategy-matching`, §V–VI), Nemlekar 2023 (ablations and a reactive condition, §4–7), HOI4ABOT (§4.2–4.3), Koppula 2016 (§8.2–8.3), HIT (§VI-A), COIN (§5.3), Singh et al. (data validation only).

**Not readable.** `huang-2016-anticipatory` (Huang and Mutlu, HRI 2016). No open full text found (the lab page links only the DOI). The abstract mentions a reactive-control baseline and a user experiment, but nothing is filled from it.

**Candidate additions** (compared methods not in the database):

- FreMEn (Krajník et al., "Where's Waldo at time t?"). Baseline in STOT §6.1 and PredictiveGraphs §VI-A.
- Perpetua. Baseline in PredictiveGraphs §VI-A.
- ConceptGraphs, DualMap, FlowMaps. Baselines in PredictiveGraphs §VI-B.
- Carroll et al., "On the Utility of Learning about Humans for Human-AI Coordination" (PPO with a behavior-cloned partner). Baseline in MESH §V–VI.
- KGS (Koppula, Gupta, and Saxena, IJRR 2013). Baseline in Koppula 2016 §8.2.
- ActOwL and NLMap. Baselines in COIN §5.3.
- ST-HOI, QPIC, TUTOR, STTran, ST-Gaze (human-object interaction detection). Baselines in HOI4ABOT §4.2–4.3. Probably out of scope.

### Evaluation entries and realism levels (SEED §8.2)

Rule 7 says a new entry gets `loop: null`. Where the experiments section states the loop type and human side plainly, the builder filled them, and it split a paper into one entry per protocol (for example a simulation and a user study). Each entry cites its section. Judgment calls to check:

- **ProAct.** Robot level left null. Actions come from a heuristic search over task graphs, with an MLLM detecting state (ProAct §6). That is neither a learned task-specific policy nor a general-purpose one. Environment left null, since the data are real recorded videos rather than one of the four settings.
- **COIN.** Human level left null. The paper does not say who answers the robot's questions (COIN §5). Robot set to generalist, since GPT-4o scores owners and writes the questions (§4). With no human level, COIN has no dot on the realism plot. Loop type left null for the same reason.
- **PredictiveGraphs.** Human set to scripted, since objects were moved by hand on a fixed schedule (§VI). Environment set to lab (a three-room laboratory). Loop type left null. The robot navigates in closed loop, but the people's schedule never reacts to it.
- **HIT.** Environment set to lab. The paper describes a shared assembly workspace with a UR5e and never says "lab" (§V-A). Participants' roles are not given, so they count as real participants who are not target users.
- **Nemlekar 2023.** Environment set to lab for the in-person assembly study with graduate students (§5, §7).
- **MESH.** The simulation partner is a behavior-cloned human proxy, set to scripted. The user study ran online in the Overcooked game, set to simulator (§VI).
- **Koppula 2016.** Only the offline CAD-120 evaluation is entered (§8.2–8.3). The PR2 experiment (§8.4) does not say whether live participants took part.
- **HOI4ABOT.** Two entries: offline on VidHOI (environment null, real recorded video) and the Franka bartender experiment with lab members (§4.4, App. B).
- **STREAK.** Environment set to simulator because HOMER is simulated (STOT §5), although STREAK §V describes the data as "recorded from various individuals".
- **GLOBE.** Robot set to task-specific. An n-gram model predicts activities and objects, and GPT-4.1 steps in only when the n-gram confidence is low (GLOBE §III).

### Datasets and lineage

- **HOMER** (new entry, from STOT §5): five simulated households in VirtualHome, 50+ days, 108 objects each, routines from crowdsourced schedules (21 workers) and action scripts (23 participants). STOT does not say whether activity labels are released, so `goal_annotations` is null.
- **HOMER+ extends HOMER.** SLaTe-PRO §6: "We create HOMER+, by modifying the HOMER dataset." HOMER+ has 3 households, 24 activities, and 93 entities, with activity labels per step (App. A.3). SLaTe-PRO names no simulator. VirtualHome comes from RTI §IV-A1.
- **HOMER-Noise extends HOMER+, not HOMER.** GLOBE §I and §III-D: "a noisy extension of HOMER+". An LLM adds person, pet, and toddler disturbances. Size is not stated.
- **RTI closed-loop setup** uses HOMER+ (SEED §8).

### Papers added from Maithili's list (SEED §8.1)

All three were found on arXiv and read in full. None gets a method block yet. Proposals follow for Maithili to confirm.

**1. COIN.** Hashimoto, Taniguchi, Hasegawa, Hagiwara, and Taniguchi, "Whose Is This?: Context-Aware Object Ownership Inference with Uncertainty-Guided Questioning", arXiv 2605.28087 (2026). No venue listed.

- Dataset `coin-ownership` extends HOMER: "we extend the HOMER dataset [25]" (§5.2), where [25] is the STOT paper. It adds manually assigned ownership labels (§5.1). Three users, one simulated home in Gazebo, seven days, 3,425 interaction events over 34 objects, events turned into natural-language descriptions (§5.1–5.2). The paper names no dataset, so the entry is called "HOMER with ownership (COIN)". Gazebo is a new simulator entry.
- Evaluation entry: Gazebo, loop and human side not stated, baselines ActOwL, NLMap + LLM, Last-User, Frequency-Based (§5.3).
- Metrics not in the taxonomy (App. F): Subset Accuracy (predicted owner set exactly matches the true set) and Mean Jaccard (overlap of predicted and true owner sets) measure inference accuracy and map to no net value term. Number of Questions (queries until ownership is settled) would measure ΔC↑, the user effort the robot adds.
- Proposed method block: `knowns: {goal: known, human_policy: unknown}` (L1), since requests like "bring me my cup" give the goal (Introduction). `action_types: [ask]` (§4.4.3). `inputs: [language]` (VLM captions, §4.1.2). No subproblem fits cleanly. Ownership inference is closest to goal inference but infers a user attribute, not a goal. Maithili might prefer `tangent: conversational`, or leaving it as a dataset paper.

**2. Singh et al.** Singh, Idrees, and Dauhajre, "Realistic Synthetic Household Data Generation at Scale", arXiv 2602.07243 (2026). The PDF carries an AAAI copyright line but names no venue, so `venue` is null.

- Dataset `singh-synthetic-households` is validated against HOMER. The paper compares its data to "HOMER (Patel and Chernova 2022) (self-reported activity schedules from 21 participants)" and reports 0.60 cosine similarity (Real-World Alignment Validation). It generates layouts, object inventories, activity schedules, and dialogues, names no simulator, and gives no total size.
- Evaluation entry: a data-validation study with no robot (loop null).
- Metrics not in the taxonomy: cosine similarity, mutual information, and effect sizes between generated and reference data. These measure data realism and map to no net value term.
- Proposed method block: none. The paper proposes no assistance method.

**3. GLOBE.** Gonzalez, Shovo, and Ayub, "Personalized and Robust Proactive Robot Assistance with Uncertainty-Guided LLM Reasoning", arXiv 2606.08458 (2026), code at github.com/PaInt-Lab/GLOBE.

- Dataset `homer-noise`, extends HOMER+ (see above).
- Evaluation entry: offline on HOMER+ and HOMER-Noise, against SLaTe-PRO and STOT (STOT's numbers come from the SLaTe-PRO paper), with n-gram and zero-shot LLM ablations (§IV). The Stretch 3 demo (§IV-G) is a proof of concept with activity labels given externally, so it is not entered.
- Metric not in the taxonomy: mean F1 over joint activity-object labels (§IV). Like F1, it is a proxy that mixes ΔC↓ (correct predictions) and ΔC↑ (wrong ones).
- Proposed method block: `knowns: {goal: unknown, human_policy: unknown}` (L2, no goal given, §III). `family: temporal_imitation`, with a caveat, since it predicts the next activity and then the object from temporal patterns rather than at the action level. `inputs: [object_relocations]` (§IV-A). `action_types: [act]` (§IV-G). `themes: [personalization]` (title, §I). Subproblems: goal anticipation, addresses (predicts the upcoming activity, §III). Action-goal association, addresses in part (objects tied to activities by co-occurrence, §III). Goal-space representation, assumes given (uses the dataset's activity labels, §III-D). Human policy learning, open question (n-gram transition models, §III). Cost modeling and action selection, not addressed (it acts when confident, §III).

## HOMER-lineage pass (Oct 21, 2026)

All new facts in this pass come from the librarian's answers of Oct 21, 2026, which read each paper's full text. Placements follow Maithili's decisions in SPEC §16. Provenance strings cite the librarian's section (such as "A-3 FlowMaps A10") and the paper's own section.

### Papers added

| Id | Short name | Placement |
|---|---|---|
| `sgm` | SGM | Tangential, type search |
| `flowmaps` | FlowMaps | Tangential, type search |
| `evolvingnav` | EvolvingNav | Tangential, type search |
| `tap` | TAP | Tangential, type search (Dorbala et al., Transit-Aware Planning) |
| `mullen-2025-home-emergency` | Mullen 2025 | Tangential, type search (HomeEmergency names the task and dataset, not the method) |
| `anticipatory-tamp` | Anticipatory TAMP | L2, no family (Dhakal et al., RA-L 2026, one paper with arXiv 2407.13694) |
| `talukder-2025-anticipatory-planning` | Talukder 2025 | L2, no family |
| `courteous-anticipation` | Courteous Anticipation | L2, no family (Talukder et al. 2026) |
| `din-2025-proactivity` | Din 2025 | L2, Implicit Cues |

The three anticipatory planning papers have goal and human policy unknown because their preparation step acts before any task is given. Each later task is given one at a time. All three carry `action_types: [act]` and no inputs, since their planners read the full symbolic state, which fits no observation modality. Din 2025 carries `[act]` and `[video]` (egocentric RGB).

### Datasets and simulators added

- **Tangential.** EvoWorld-Bench (evaluation setup, EvolvingNav), Dynamic House Simulator (simulator, SGM), and Dynamic Object Maps (simulator, TAP). COIN's ownership dataset is now tangential too. The Dynamic House Simulator is a generator, not a recorded dataset, so it is a simulator. Dynamic Object Maps is not yet released, but TAP's evaluations need it as their environment.
- **Simulators needed as environments.** ProcTHOR (AI2-THOR), Habitat (HSSD scenes), ThreeDWorld, PyBullet, and Unity.
- **Not created.** FlowMaps' generated data, Talukder 2025's benchmark, Courteous Anticipation's evaluation setting, and Din 2025's image set are unnamed. HomeEmergency is not yet released. Anticipatory TAMP releases no data.
- **EvoWorld-Bench and HOMER+.** HOMER+ is one of six sources and supplies only activity-order and end-state priors. None of `extends`, `uses`, or `validates_against` fits, so the relation is in the notes, not in `based_on`.

### Changes to existing papers

- **GLOBE** joins Temporal Imitation with goal and human policy unknown. Its inputs, action types, and subproblem tags from the earlier proposal are not added, since the librarian's answers do not state them.
- **COIN** keeps its paper file with no method block. Its evaluation entry stays, because a paper with no level shows on no page (SPEC §6.2).
- **PredictiveGraphs** now has four entries, one per setting. STOT and FlowMaps are baselines, per the librarian's corrections. Its navigation settings use an LLM planning agent, so the robot level is now generalist, and the real-lab entry keeps a null loop because the paper does not say whether its queries ran live or on recorded scans.
- **SLaTe-PRO** gains an entry for its interactive-query setting, where a ground-truth oracle answers queries (human level scripted).
- **ProAct** splits into its offline perception setting and its closed-loop task-graph rollout, each with the baselines from its own table.
- **Metrics** are attached to every evaluation entry of STOT, SLaTe-PRO, STREAK, GLOBE, PredictiveGraphs, NOPA, Watch-And-Help, and ProAct.

### Corrections applied

FlowMaps' CEG baseline is cited to Wang et al., and its TAP-LGX baseline is TAP. PredictiveGraphs benchmarks against STOT and FlowMaps. Mullen 2025's baselines are DF, FFO, and PPO. TAP's published baselines are DD-PPO and LGX. SGM's are HMS plus the authors' heuristics. Din 2025's Transformer Predictor is Tang et al. (CVPR 2020). The anticipatory planning papers compare only against myopic planners and their own variants. Courteous Anticipation's Selfish A.P. implements the objective of Dhakal 2023 and Talukder 2025 but is the authors' own code, so it stays in `other_baselines`.

### Citations

`data/citations-manual.yaml` holds 25 citations the librarian confirmed in reference lists, each between two papers in the database. Talukder 2025 cites the arXiv version of Anticipatory TAMP, and Anticipatory TAMP's RA-L version cites Talukder 2025, so that pair has a citation in each direction. `data/citations.json` does not list the nine new papers yet. Rerun `npm run fetch-citations`.

### Metrics

80 metrics are new, and the existing three gained direction and unit. `data/METRIC_MAPPING_REVIEW.md` lists each with its papers and the proposed terms and kind, and flags the mappings that are a stretch.

### Judgment calls

- **Loop type for search.** Where the robot moves or chooses what to observe in a simulator while scripted object moves ignore it, the entry uses `closed_scripted`, and its provenance says the robot never changes object state. Predictions scored against fixed records use `offline_replay`.
- **Realism.** Offline predictors take a task-specific robot and recorded behavior, as STOT's entry does. A scripted object schedule or task stream with no person takes the scripted user level. LLM or VLM controllers take the generalist level (EvolvingNav, PredictiveGraphs' navigation, and TAP, whose TAP-RL variant is task-specific). Mullen 2025's hand-built planner takes the task-specific level. Mullen 2025's four real apartments take users' own homes and EvolvingNav's real indoor and outdoor sites take lab, each as the closest level.
- **Subproblem status.** "Addressed", "partly", "implicitly", and "indirectly" give `addresses`, with the qualifier at the start of the note. "Not addressed" gives `skips`, unless the librarian says the input is given, which gives `assumes`. No approach is set on the new tags. Because tangential works have no level, their `addresses` tags appear on the Subproblems page. These are SGM (human policy, action selection), FlowMaps (human policy, goal anticipation, action selection), EvolvingNav (human policy, goal anticipation, cost model, action selection), TAP (human policy, goal anticipation, action selection), and Mullen 2025 (action selection). Most of the human-policy and goal-anticipation tags are partial, since these papers learn object dynamics, not people.
- **Demos.** Robot demos with no reported numbers are not entered, as before. That covers FlowMaps' TIAGo demo and the demos in STOT, SLaTe-PRO, STREAK, and GLOBE. Anticipatory TAMP's Fetch demo reports time and action counts, so it has an entry. Mullen 2025's real-world entry has no metrics because Table V was unreadable.

### Could not place

- **SGM's link.** SGM prints no landing page, arXiv id, or DOI, so `links.paper` is null. EvolvingNav's reference list prints arXiv 2305.17537 for SGM, which Maithili may want to confirm and use.
- **Din 2025's link.** The thesis prints only a ProQuest number, so `links.paper` is null.
- **TAP's code.** The only code link is an anonymous review link, so it is left out.
- **EvolvingNav's external benchmarks.** FindingDory, GOAT-Bench, and the cross-environment navigation tasks follow their own protocols, and the paper does not define their metrics, so they have no entry.
- **Rudra et al., Dhakal et al. 2023, and Wang et al.** These are cited or used as baselines often but are not in the database.
- **GLOBE's venue.** The librarian read the RO-MAN 2026 (IEEE) version. The file still says arXiv with the arXiv link, since no DOI was given.

### Open questions for Maithili

1. Should the search metrics map to ΔC↓ at all, given that no search paper has a user (`data/METRIC_MAPPING_REVIEW.md`, item 1)?
2. Should Talukder 2025 and Courteous Anticipation take `inputs: [scene_graph]`? Both encode the planner state as a scene graph, but it is not an observed modality.
3. Should Courteous Anticipation list Talukder 2025 in `baselines` for its Selfish A.P. baseline?
4. Should GLOBE's venue become IEEE RO-MAN 2026?
5. Should partial `addresses` tags on the search papers become `skips`, to keep them off the Subproblems page?
