# Seed report

Written while seeding `data/` from `spec/SEED.md` (milestone M2). Section and reference numbers point into the RTI paper.

## Open questions for Maithili (from SEED.md §9)

1. **Watch-And-Help [29] and G2.** §III-B says the goal inference family assumes action-goal association is given. Table I and Appendix II-A list [29] under G2. Seeded as G2 addresses, per Table I.
2. **Loop type for [29] and [20].** §IV says prior work relied on static datasets and cites [29] and [20]. Seeded as `offline_replay`.
3. **Benchmarks.** Watch-And-Help [29] and ProAct [30] present benchmarks. Should they get dataset entries? (ProAct's benchmark is named ProAct-75 on its landing page.)
4. **GAP's family.** `full_pipeline` is a new label.
5. **Temporal family G1 and P1.** Seeded as `assumes`, from §III-B's reading that these methods use a goal space at the action level and assume uniform cost.
6. **Reference list.** [41] prints 2024. [16] prints no year. [63] prints no venue or year. Every other difference found is listed below.
7. **To fill.** `core_strength` for all L2 methods, `builds_on` edges for all methods, and HOMER+ goal annotations.

## Decisions the builder made

Maithili approved these on Oct 21, 2026.

- **Families.** SEED §2.1 and §2.2 group papers by family but do not list `family` in the extra fields. The builder set `family: temporal_prediction` on the four §2.1 papers and `family: goal_inference` on the three §2.2 papers, following the SPEC §5.2 example for `slate-pro`.
- **Year convention.** Where the landing page year differs from the printed year, the landing page year is used (SEED rule 2). For PMLR CoRL volumes this is the proceedings publication year, not the conference year: CoRL 2022 papers in PMLR 205 carry 2023, and Play-LMP (CoRL 2019, PMLR 100) carries 2020. Say if you prefer conference years.
- **Ids renamed** so `firstauthor-year` matches the landing page (the SEED ids were proposals):

  | SEED id | New id | Why |
  |---|---|---|
  | `koppula-2015-anticipating` | `koppula-2016-anticipating` | TPAMI issue is 2016 |
  | `peng-service-robot-proactivity` | `peng-2019-service-robot-proactivity` | CHI 2019 |
  | `levy-2017-hierarchies` | `levy-2019-hierarchies` | ICLR 2019 |
  | `zhu-2021-skill-discovery` | `zhu-2022-skill-discovery` | RA-L 2022 |
  | `zhou-2023-language-action-survey` | `yao-2023-language-action-survey` | Xiangtong Yao is now first author |
  | `nikolaidis-2014-joint-action` | `nikolaidis-2015-joint-action` | HRI 2015 |
  | `lynch-2019-play` | `lynch-2020-play` | PMLR 100 is dated 2020 |
  | `pereira-2019-landmark` | `pereira-2020-landmark` | AIJ vol. 279, 2020 |
  | `zhao-contribution-preferences` | `zhao-2023-contribution-preferences` | CoRL 2023 |

- **Short names.** Method or system names from the landing page or abstract: PredictiveGraphs, HOI4ABOT, HIT, CLARA, ADAPT, HAC, SayCan, SIPS, HER, Actionable Models, DMSRD, LbW, BCO, Reciprocal MIND MELD, Play-LMP, SLiM, TAACo, GRACE, CIRL, AssistanceZero, Anticipate & Act. The rest use "FirstAuthor Year". The two Amado 2018 papers are "Amado 2018a" (LSTM, arXiv) and "Amado 2018b" (IJCNN) so they can be told apart.
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
- **[3] `saycan`.** Printed with A. Brohan first. PMLR lists **Brian Ichter** first, then Anthony Brohan (arXiv lists Michael Ahn first). Conference was CoRL 2022; PMLR 205 is dated 2023, matching the printed year.
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
- **[37] `lynch-2020-play`.** Printed CoRL 2019. The conference is CoRL 2019; the PMLR 100 page is dated **2020**.
- **[20] `patel-2023-spatiotemporal`.** Printed CoRL 2023. This is the 6th CoRL (held Dec 2022), PMLR 205, published 2023.
- **[55] `schrum-2023-mind-meld`.** Printed CoRL 2023. CoRL 2022 conference, PMLR 205, published 2023.
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

`slate-pro`, `streak`, `nopa`, `zhao-2022-strategy-matching`, `huang-2016-anticipatory`, `nemlekar-2023-transfer`, `garrell-2017-teaching`, `garrell-2013-mobile`, `dogan-2025-disambiguation`, `zhang-2023-llm-human-models`, `virtualhome`, `actionable-models`, `ravichandar-2020-lfd-review`, `xiong-2021-learning-by-watching`, `torabi-2018-bco`, `amado-2018-lstm`, `anticipate-and-act`, `zeng-2020-semantic-linking`, `malik-2019-task-allocation`, `patel-2025-personalization`, `fogarty-2005-interruptibility`, `ju-2008-implicit-interactions`.

## Validator warnings on the seed data

- `koch-2024-proactive-hri-review` has no method, subproblem, or evaluation block and nothing references it. Expected: SEED §6 gives it `type: survey` only. It appears in the surveys strip on the Methods page.
