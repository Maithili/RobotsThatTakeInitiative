# Seed data from the GAP paper

This file lists the initial entries for `data/`. Every tag below comes from what the GAP paper (https://arxiv.org/abs/2609.28910) says about the cited work. Section and reference numbers point into the GAP paper.

## Rules for the builder

1. Create one file per entry. Fill only the fields this file gives, plus title, authors, venue, year, and links.
2. Citations below are copied as printed in the GAP paper reference list. Check each one against the paper's landing page. If the landing page differs (title, venue, year, authors), use the landing page value and record the difference in `data/SEED_REPORT.md`.
3. `links.paper` must be a landing page: DOI, publisher or proceedings page, arXiv abstract page, or OpenReview forum. Never a `.pdf` URL. If you cannot confirm the right page, leave it null and list it in the report.
4. `short_name`: use the name the paper gives its method or system, taken from its landing page or abstract. Otherwise use "FirstAuthor Year". The names below that come from the GAP paper are final.
5. Use the provenance given for each group.
6. Add nothing else. No levels, modalities, metrics, lineage, or core strengths beyond what is written here. Leave the rest empty. Rules 7 and 8 are the only exceptions.
7. **Baselines.** For each paper with a `method` block, read its experiments section if the full text is openly available (arXiv, OpenReview, open-access proceedings). Put every compared method that is in the database into `baselines` of that paper's evaluation entry (never the paper's own ablations), with the section in its `provenance`. Use the entry this file gives, or create `<id>-original` with `loop: null`. If the full text is not open, list the paper in the report. List compared methods that are not in the database under "Candidate additions" in the report.
8. **Citations.** Fill `ids.doi` and `ids.arxiv` from the landing pages, then run `npm run fetch-citations` and commit `data/citations.json`. List unresolved papers in the report.

Lineage (`builds_on`) comes from Maithili. The three edges she has given appear in the tables below. Append "Lineage from MP, Oct 2026" to the provenance of those papers.

Statuses: `addresses`, `assumes`, `skips`. Relations: `direct`, `adjacent`.

---

## 1. GAP (the GAP paper)

Write this file as given.

```yaml
id: gap
short_name: GAP
title: "Robots That Take Initiative: A Framework for Building and Evaluating Proactive Robots"
authors: [Maithili Patel, Sonia Chernova]
venue: arXiv
year: 2026
links:
  paper: https://arxiv.org/abs/2609.28910
  code: https://github.com/Maithili/GAP
provenance: GAP paper §V–VI
method:
  knowns: {goal: unknown, human_policy: unknown}
  action_types: [act]
  inputs: [object_relocations]
  core_strength: null
  builds_on: []
themes: [continual_learning]
subproblems:
  G1: {status: addresses, relation: direct, note: An LLM curates an open-vocabulary goal set from raw activity logs}
  G2: {status: addresses, relation: direct, note: An LLM tags each day's observed actions with goals from the vocabulary}
  A1: {status: addresses, relation: direct, note: Learns a directed task graph per goal}
  A2: {status: addresses, relation: direct, note: A particle filter over task graphs infers current goals online}
  A3: {status: addresses, relation: direct, note: A causal transformer predicts the next goal and its start time}
  P1: {status: addresses, relation: direct, note: Heuristic utility over preconditions, timing, and learned user acceptance. Assumes uniform action cost.}
  P2: {status: addresses, relation: direct, note: A planner proposes and selects candidate object placements}
evaluations:
  - id: gap-offline
    datasets: [homer-plus]
    loop: offline_replay
    human_model: Recorded HOMER+ behavior
    metrics: [f1]
    baselines: [slate-pro, streak]
    captures: {state_drift: no, goal_adaptation: no}
    provenance: GAP paper Table II
    realism: {robot: task_specific, human: recorded, environment: simulator}
    results:
      - {method: slate-pro, metric: f1, value: 0.634}
      - {method: streak, metric: f1, value: 0.677}
  - id: gap-closed-llm
    environment: virtualhome
    datasets: [homer-plus]
    loop: closed_adaptive
    human_model: LLM (gpt-4o-mini)
    metrics: [net_actions_saved, perturbed_actions, f1]
    baselines: [slate-pro, streak]
    other_baselines: [Plain LLM, Oracle]
    captures: {state_drift: yes, goal_adaptation: partial}
    realism: {robot: task_specific, human: adaptive_sim, environment: simulator}
    provenance: GAP paper §IV-A, Table II, App. I-C
    results:
      - {method: slate-pro, metric: f1, value: 0.216}
      - {method: streak, metric: f1, value: 0.002}
  - id: gap-closed-scripted
    environment: virtualhome
    datasets: [homer-plus]
    loop: closed_scripted
    human_model: Scripted
    metrics: [net_actions_saved, perturbed_actions, f1]
    baselines: [slate-pro, streak]
    other_baselines: [Plain LLM, Oracle]
    captures: {state_drift: yes, goal_adaptation: no}
    realism: {robot: task_specific, human: scripted, environment: simulator}
    provenance: GAP paper §IV-A, Table II
    results:
      - {method: slate-pro, metric: f1, value: 0.264}
      - {method: streak, metric: f1, value: 0.296}
```

## 2. L2 methods

All have `knowns: {goal: unknown, human_policy: unknown}`.

### 2.1 Temporal Imitation family

Provenance: GAP paper §II, §III-A3, §III-B, Table I, §IV.

Apply these family tags to all four papers in this group (from §III-B).

```yaml
A1: {status: skips, relation: direct, note: Skips human-policy learning}
A2: {status: skips, relation: direct, note: Skips explicit goal inference}
G1: {status: assumes, relation: direct, note: Goal space coincides with the action space}
P1: {status: assumes, relation: direct, note: Assumes uniform cost across actions}
```

| id | Citation as printed | Extra fields |
|---|---|---|
| `slate-pro` | [9] M. Patel, A. G. Prakash, S. Chernova, "Predicting Routine Object Usage for Proactive Robot Assistance," CoRL 2023. | short_name SLaTe-PRO. builds_on [stot]. action_types [act]. inputs [scene_graph]. A3: addresses, direct, temporal_sequence, "Extracts habitual patterns from a history of observed actions". Evaluation `slate-pro-original`: loop offline_replay, provenance "GAP paper §I, §IV". |
| `streak` | [10] E. Bartoli, F. I. Doğan, I. Leite, "Streak: Streaming network for continual learning of object relocations under household context drifts," IEEE RO-MAN 2025. | short_name STREAK. builds_on [stot]. inputs [scene_graph]. themes [continual_learning]. A3 as for slate-pro. Evaluation `streak-original`: loop offline_replay, provenance "GAP paper §I, §IV". |
| `stot` | [20] M. Patel, S. Chernova, "Proactive Robot Assistance via Spatio-Temporal Object Modeling," CoRL 2023. The correct year is 2022 (CoRL 2022), per Maithili. | short_name STOT. venue CoRL. year 2022. action_types [act]. inputs [scene_graph]. A3 as for slate-pro. Evaluation `stot-original`: loop offline_replay, provenance "GAP paper §IV". |
| proposed `saavedra-2026-scene-graphs` | [42] M. Saavedra-Ruiz, C. Gauthier, K. Gupta, S. Shahfar, K. Ellis, S. Parkison, L. Paull, "Predictive spatio-temporal scene graphs for semi-static scenes," arXiv:2605.00121, 2026. | A3: addresses, direct, probabilistic_filtering, "Filters over how long items persist in and return to locations". No evaluation. |

### 2.2 Goal inference family

Provenance: GAP paper §III-B, Table I, Appendix II-A.

Apply these family tags to all three papers in this group (from §III-B).

```yaml
G1: {status: assumes, relation: direct, note: Assumes the goal space is given}
A1: {status: assumes, relation: direct, note: Assumes the human policy is given}
A3: {status: skips, relation: direct, note: Does not predict future goals}
```

| id | Citation as printed | Extra fields |
|---|---|---|
| `nopa` | [21] X. Puig, T. Shu, J. B. Tenenbaum, A. Torralba, "NOPA: Neurally-guided Online Probabilistic Assistance for Building Socially Intelligent Home Assistants," IEEE ICRA 2023. | short_name NOPA. builds_on [watch-and-help]. action_types [act] (§IV-A, object relocation action space). G2: assumes, direct, "Assumes ground-truth action-goal association". A2: addresses, direct, symbolic, "Belief over goals with actions as likelihoods. Infers goals only for tasks already begun". |
| `watch-and-help` | [29] X. Puig, T. Shu, S. Li, Z. Wang, Y.-H. Liao, J. B. Tenenbaum, S. Fidler, A. Torralba, "Watch-And-Help: A Challenge for Social Perception and Human-AI Collaboration," 2021. | short_name Watch-And-Help. G2: addresses, direct, symbolic, "Predicts goals from observed actions with symbolic models" (Table I, see report item 1). A2: addresses, direct, "Online goal inference followed by goal-conditioned planning". Evaluation `watch-and-help-original`: loop offline_replay, provenance "GAP paper §IV" (see report item 2). |
| `proact` | [30] X. Zhu, F. Zhu, W. Zhou, Y. Tian, Z. Hu, Y. Huang, Y. Guo, X. Wu, Z. Zhang, F. Lin, et al., "Proact: A benchmark and multimodal framework for structure-aware proactive response," arXiv 2026. | short_name ProAct. G2: assumes, direct, "Assumes ground-truth action-goal association". A2: addresses, direct, learned, "Belief over goals with actions as likelihoods. Infers goals only for tasks already begun". |

## 3. L1 methods

All have `knowns: {goal: known, human_policy: unknown}`. Provenance: GAP paper §II, §II-B. Use the text in the last column as `core_strength`.

| id (proposed) | Citation as printed | action_types | core_strength |
|---|---|---|---|
| `zhao-2022-strategy-matching` | [26] M. Zhao, R. Simmons, H. Admoni, "Coordination with humans via strategy matching," IEEE/RSJ IROS 2022. | | Learns preferred strategies from collaborative data |
| `huang-2016-anticipatory` | [12] C.-M. Huang, B. Mutlu, "Anticipatory robot control for efficient human-robot collaboration," ACM/IEEE HRI 2016. | [timing] | Learns preferred strategies from passive observation |
| `nemlekar-2023-transfer` | [13] H. Nemlekar, N. Dhanaraj, A. Guan, S. K. Gupta, S. Nikolaidis, "Transfer Learning of Human Preferences for Proactive Robot Assistance in Assembly Tasks," ACM/IEEE HRI 2023. | [timing] | Learns preferred strategies from passive observation |
| `hoiabot` | [11] E. V. Mascaro, D. Lee, "Hoiabot: Human-object interaction anticipation for proactive bot," IEEE RO-MAN 2023. | [timing] | Learns the timing of actions for fluid interaction |
| `koppula-2015-anticipating` | [27] H. S. Koppula, A. Saxena, "Anticipating human activities using object affordances for reactive robotic response," IEEE TPAMI 2015. | | Learns the timing of actions for fluid interaction |
| `huang-2025-intention-tracking` | [28] Z. Huang, Y.-J. Mun, F. C. Pouria, K. Driggs-Campbell, "Hierarchical intention tracking with switching trees for real-time adaptation to dynamic human intentions during collaboration," arXiv 2025. | | Adds mode switching that returns brief control to the human for failure recovery |

## 4. ADAPT

The Methods page shows only works with a level. The GAP paper assigns no level to the §II works [14]–[19], so they get no method block. Per Maithili, [14]–[18] are out of the database. ADAPT stays for its P2 tag.

| id | Citation as printed | Fields |
|---|---|---|
| `adapt` | [19] M. Patel, X. Puig, R. Desai, R. Mottaghi, S. Chernova, J. Truong, A. Rai, "ADAPT: Actively discovering and adapting to preferences for any task," COLM 2025. | No method block. P2: addresses, adjacent, proactive_communication, "Proactive communication" (Appendix II-A). |

## 5. Subproblem works

These papers have no `method` block, only `subproblems`. Provenance: "GAP paper Table I, App. II-A" for direct works, "GAP paper App. II-A" for adjacent works. All statuses are `addresses`.

| Sub | id (proposed) | Citation as printed | relation | approach | note |
|---|---|---|---|---|---|
| G1 | `levy-2017-hierarchies` | [46] A. Levy, G. D. Konidaris, R. W. Platt, K. Saenko, "Learning multi-level hierarchies with hindsight," ICLR 2017. | adjacent | hierarchical | Captures goals at multiple granularities |
| G1 | `zhu-2021-skill-discovery` | [47] Y. Zhu, P. Stone, Y. Zhu, "Bottom-up skill discovery from unsegmented demonstrations for long-horizon robot manipulation," IEEE RA-L 2021. | adjacent | hierarchical | Captures goals at multiple granularities |
| G1 | `saycan` | [3] A. Brohan, Y. Chebotar, C. Finn, K. Hausman, A. Herzog, D. Ho, J. Ibarz, A. Irpan, E. Jang, R. Julian, et al., "Do as i can, not as i say: Grounding language in robotic affordances," CoRL 2023. | adjacent | open_set_language | Open-set goals grounded in natural language |
| G1 | `zhou-2023-language-action-survey` | [48] H. Zhou, X. Yao, O. Mees, Y. Meng, T. Xiao, Y. Bisk, J. Oh, E. Johns, M. Shridhar, D. Shah, J. Thomason, K. Huang, J. Chai, Z. Bing, A. C. Knoll, "Bridging language and action: A survey of language-conditioned robot manipulation," 2023. | adjacent | open_set_language | Open-set goals grounded in natural language |
| G2 | `watch-and-help` | see §2.2 | | | |
| G2 | `baker-2009-inverse-planning` | [33] C. L. Baker, R. Saxe, J. Tenenbaum, "Action understanding as inverse planning," Cognition 2009. | direct | symbolic | Predicts goals from observed actions with symbolic models |
| G2 | `nakahashi-2015-subgoal` | [31] R. Nakahashi, C. L. Baker, J. B. Tenenbaum, "Modeling human understanding of complex intentional action with a bayesian nonparametric subgoal model," arXiv 2015. | direct | learned | Predicts goals from observed actions with learned models |
| G2 | `zhi-xuan-2020-goal-inference` | [32] T. Zhi-Xuan, J. L. Mann, T. Silver, J. B. Tenenbaum, V. K. Mansinghka, "Online bayesian goal inference for boundedly-rational planning agents," arXiv 2020. | direct | learned | Predicts goals from observed actions with learned models |
| G2 | `hindsight-experience-replay` | [49] M. Andrychowicz, D. Crow, A. Ray, J. Schneider, R. Fong, P. Welinder, B. McGrew, J. Tobin, P. Abbeel, W. Zaremba, "Hindsight experience replay," NeurIPS 2017. | adjacent | hindsight_relabeling | Relabels past trajectories with goals. Not designed for open, unlabeled goal spaces |
| G2 | `actionable-models` | [50] Y. Chebotar, K. Hausman, Y. Lu, T. Xiao, D. Kalashnikov, J. Varley, A. Irpan, B. Eysenbach, R. C. Julian, C. Finn, S. Levine, "Actionable models: Unsupervised offline reinforcement learning of robotic skills," ICML 2021. | adjacent | hindsight_relabeling | Relabels past trajectories with goals. Not designed for open, unlabeled goal spaces |
| A1 | `nikolaidis-2014-joint-action` | [34] S. Nikolaidis, R. Ramakrishnan, K. Gu, J. A. Shah, "Efficient model learning from joint-action demonstrations for human-robot collaborative tasks," ACM/IEEE HRI 2014. | direct | clustering_mixture | Addresses data sparsity by clustering users or fitting mixtures. Relies on explicit demonstrations |
| A1 | `jayanthi-2022-strategy-discovery` | [35] S. Jayanthi, L. Chen, M. C. Gombolay, "Strategy discovery and mixture in lifelong learning from heterogeneous demonstration," arXiv:2202.07014, 2022. | direct | clustering_mixture | Addresses data sparsity by clustering users or fitting mixtures. Relies on explicit demonstrations |
| A1 | `ravichandar-2020-lfd-review` | [51] H. Ravichandar, A. S. Polydoros, S. Chernova, A. Billard, "Recent advances in robot learning from demonstration," Annual Review of Control, Robotics, and Autonomous Systems 2020. | adjacent | lfd | Learning from demonstration |
| A1 | `xiong-2021-learning-by-watching` | [52] H. Xiong, Q. Li, Y.-C. Chen, H. Bharadhwaj, S. Sinha, A. Garg, "Learning by watching: Physical imitation of manipulation skills from human videos," IEEE/RSJ IROS 2021. | adjacent | lfo | Learns from observation alone |
| A1 | `torabi-2018-bco` | [53] F. Torabi, G. Warnell, P. Stone, "Behavioral cloning from observation," IJCAI 2018. | adjacent | lfo | Learns from observation alone |
| A1 | `sakr-2025-everyday-users` | [54] M. Sakr, Z. Zhang, B. Li, H. Zhang, H. F. M. V. der Loos, D. Kulić, E. A. Croft, "How can everyday users efficiently teach robots by demonstration?," ACM THRI 2025. | adjacent | guided_demonstration | Guides users toward more effective demonstrations |
| A1 | `schrum-2023-mind-meld` | [55] M. L. Schrum, E. Hedlund-Botti, M. Gombolay, "Reciprocal mind meld: Improving learning from demonstration via personalized, reciprocal teaching," CoRL 2023. | adjacent | guided_demonstration | Guides users toward more effective demonstrations |
| A2 | `ramirez-2010-plan-recognition` | [36] M. Ramírez, H. Geffner, "Probabilistic plan recognition using off-the-shelf classical planners," AAAI 2010. | direct | symbolic | Belief over goals with actions as likelihoods. Infers goals only for tasks already begun |
| A2 | `nopa` | see §2.2 | | | |
| A2 | `lynch-2019-play` | [37] C. Lynch, M. Khansari, T. Xiao, V. Kumar, J. Tompson, S. Levine, P. Sermanet, "Learning latent plans from play," CoRL 2019. | direct | hybrid | Belief over goals with actions as likelihoods. Infers goals only for tasks already begun |
| A2 | `proact` | see §2.2 | | | |
| A2 | `pereira-2019-landmark` | [56] R. Pereira, N. Oren, F. Meneguzzi, "Landmark-based approaches for goal recognition as planning," Artificial Intelligence 2019. | adjacent | symbolic | Belief over goals with actions as likelihoods. Infers goals only for tasks already begun |
| A2 | `amado-2018-lstm` | [57] L. Amado, J. P. Aires, R. Pereira, M. Magnaguagno, R. Granada, F. Meneguzzi, "Lstm-based goal recognition in latent space," arXiv 2018. | adjacent | learned | Belief over goals with actions as likelihoods. Infers goals only for tasks already begun |
| A2 | `amado-2018-latent` | [58] L. Amado, R. Pereira, J. P. Aires, M. Magnaguagno, R. Granada, F. Meneguzzi, "Goal recognition in latent space," IJCNN 2018. | adjacent | hybrid | Belief over goals with actions as likelihoods. Infers goals only for tasks already begun |
| A3 | `anticipate-and-act` | [59] R. Arora, S. Singh, K. Swaminathan, A. Datta, S. Banerjee, B. Bhowmick, K. M. Jatavallabhula, M. Sridharan, M. Krishna, "Anticipate & Act: Integrating LLMs and Classical Planning for Efficient Task Execution in Household Environments," IEEE ICRA 2024. | adjacent | language_model | Predicts future subgoals with language models. Limited to subgoals of tasks already begun |
| A3 | `zeng-2020-semantic-linking` | [60] Z. Zeng, A. Röfer, O. C. Jenkins, "Semantic linking maps for active visual object search," IEEE ICRA 2020. | adjacent | probabilistic_filtering | Filters over how long items persist in and return to locations |
| P1 | `malik-2019-task-allocation` | [23] A. A. Malik, A. Bilberg, "Complexity-based task allocation in human-robot collaborative assembly," Industrial Robot 2019. | adjacent | task_complexity | Models action cost through task complexity for allocation |
| P1 | `smith-2020-dynamic-cost` | [24] T. Smith, P. Benardos, D. Branson, "Assessing worker performance using dynamic cost functions in human robot collaborative tasks," Journal of Mechanical Engineering Science 2020. | direct | fatigue | Models effort and user fatigue for task allocation |
| P1 | `patel-2025-personalization` | [38] M. Patel, S. Chernova, "Robot behavior personalization from sparse user feedback," IEEE RA-L 2025. | direct | preference_feedback | Learns assistive preferences from verbal feedback, with hand-designed features |
| P1 | `grace` | [39] F. I. Dogan, U. Ozyurt, G. Cinar, H. Gunes, "GRACE: Generating Socially Appropriate Robot Actions Leveraging LLMs and Human Explanations," 2025. | direct | preference_feedback | Learns assistive preferences from feedback, with scene captions |
| P1 | `banerjee-2018-interruptibility` | [40] S. Banerjee, A. Silva, S. Chernova, "Robot classification of human interruptibility and a study of its effects," ACM THRI 2018. | direct | interruptibility | Estimates interruptibility |
| P1 | `fogarty-2005-interruptibility` | [61] J. Fogarty, S. E. Hudson, C. G. Atkeson, D. Avrahami, J. Forlizzi, S. Kiesler, J. C. Lee, J. Yang, "Predicting human interruptibility with sensors," ACM TOCHI 2005. | adjacent | interruptibility | Estimates interruptibility |
| P2 | `cirl` | [41] D. Hadfield-Menell, A. Dragan, P. Abbeel, S. Russell, "Cooperative Inverse Reinforcement Learning," 2024 (as printed). | direct | cirl | Optimizes a collaborative policy against a learned human. Confined to simulated domains with known rewards |
| P2 | `assistancezero` | [62] C. Laidlaw, E. Bronstein, T. Guo, D. Feng, L. Berglund, J. Svegliato, S. Russell, A. Dragan, "Assistancezero: Scalably solving assistance games," arXiv:2504.07091, 2025. | adjacent | cirl | Optimizes a collaborative policy against a learned human |
| P2 | `zhao-contribution-preferences` | [63] M. Zhao, R. Simmons, H. Admoni, "Learning Human Contribution Preferences in Collaborative Human-Robot Tasks" (no venue or year printed). | adjacent | cirl | Optimizes a collaborative policy against a learned human |
| P2 | `adapt` | see §4 | | | |
| P2 | `ju-2008-implicit-interactions` | [64] W. Ju, L. Leifer, "The Design of Implicit Interactions: Making Interactive Systems Less Obnoxious," Design Issues 2008. | adjacent | hedging | Hedging under uncertainty |

Also add these A3 tags to the temporal family (§2.1): `slate-pro`, `streak`, and `stot` use approach temporal_sequence. `saavedra-2026-scene-graphs` uses probabilistic_filtering.

## 6. Surveys

| id (proposed) | Citation as printed | Fields |
|---|---|---|
| `koch-2024-proactive-hri-review` | [22] M. Koch van den Broek, T. B. Moeslund, "What is proactive human-robot interaction? a review of a progressive field and its definitions," ACM/IEEE HRI 2024. | `type: survey`, `tangent: hri`, provenance "GAP paper §II". No other blocks. Per Maithili, it sits with the HRI tangential works in the literature graph. |

## 7. Evaluation methodology

| id | Citation as printed | Fields |
|---|---|---|
| `zhang-2023-llm-human-models` | [44] B. Zhang, H. Soh, "Large language models as zero-shot human models for human-robot interaction," IROS 2023. | provenance "GAP paper §VII". No blocks. Referenced from `loop_types.closed_adaptive.refs`. |

## 8. Datasets, evaluation setups, and simulators

```yaml
# data/datasets/homer-plus.yaml
id: homer-plus
name: HOMER+
kind: dataset
introduced_in: slate-pro
links: {home: null}
sim_or_real: sim
span: Several weeks
households_or_users: 3
observations: [object_relocations]
goal_annotations: null
executable: yes
environment: virtualhome
notes: Routine behavior sampled from crowdsourced patterns, executable in VirtualHome
provenance: GAP paper §IV-A1
```

Add `based_on: [{id: homer, relation: extends}]` to HOMER+ once the SLaTe-PRO paper confirms that HOMER+ extends HOMER. Record what it says in the report.

```yaml
# data/datasets/homer.yaml
id: homer
name: HOMER
kind: dataset
introduced_in: stot        # confirm from the STOT paper
sim_or_real: sim
environment: virtualhome    # confirm from the STOT paper
provenance: Maithili, Oct 2026. Fill the other fields from the STOT paper.
```

```yaml
# data/datasets/homer-llm-closed-loop.yaml
id: homer-llm-closed-loop
name: HOMER + LLM closed-loop setup
kind: evaluation_setup
introduced_in: gap
links: {home: https://github.com/Maithili/GAP}
sim_or_real: sim
environment: virtualhome
based_on: [{id: homer-plus, relation: uses}]
executable: yes
human_models: [LLM (gpt-4o-mini), Scripted]
loops: [closed_adaptive, closed_scripted]
provenance: GAP paper §IV-A
```

Add `homer-llm-closed-loop` to the `datasets` of `gap-closed-llm` and `gap-closed-scripted`.

```yaml
# data/datasets/virtualhome.yaml
# [43] X. Puig, K. Ra, M. Boben, J. Li, T. Wang, S. Fidler, A. Torralba,
# "Virtualhome: Simulating household activities via programs," IEEE CVPR 2018.
id: virtualhome
name: VirtualHome
kind: simulator
introduced_in: null
links: {home: null}        # landing page of the CVPR paper or the project site
sim_or_real: sim
provenance: GAP paper §IV-A1
```

### 8.1 Papers and datasets added by Maithili (Oct 21, 2026)

Find each paper's landing page and fill bibliographic fields from it. Read each paper before filling any other field. If you cannot find a paper or its full text, list it in the report and stop there for that paper.

| Paper (as Maithili gave it) | What Maithili said | Dataset entry |
|---|---|---|
| Hashimoto et al. 2026, "Whose Is This?" | Uses HOMER and extends it with object ownership | The paper's dataset, `based_on: [{id: homer, relation: extends}]` |
| Singh et al. 2026, "Realistic Synthetic Household Data" | Checks its generated data against HOMER | The generated dataset, `based_on: [{id: homer, relation: validates_against}]` |
| "Personalized and Robust Proactive Robot Assistance with Uncertainty-Guided LLM Reasoning" (2026) | Introduces HOMER-Noise, an extension with disturbances caused by humans, pets, and toddlers | `homer-noise`, `based_on: [{id: <HOMER or HOMER+, per the paper>, relation: extends}]` |

- Use dataset names, sizes, spans, and observation types as each paper states them. Provenance names the section.
- Add an evaluation entry for each paper from what its experiments section states: datasets, loop type, human model, baselines in the database, and metrics already in the taxonomy. List any other metric in the report with its definition and the net value terms it would measure. Do not add it to the taxonomy.
- Do not add a `method` block yet. In the report, propose one per paper (knowns, family, inputs, action types, subproblem tags with notes), each item citing the section it comes from, for Maithili to confirm.

### 8.2 Realism levels for other papers

For every paper with an evaluation entry, fill `realism` from what its experiments section states: who or what chose the robot's actions, who the human side was, and where the evaluation ran. Cite the section in provenance. Leave a level null when the paper does not say. For the offline evaluations of SLaTe-PRO, STREAK, and STOT, `human: recorded` follows from GAP paper §I and §IV.

## 9. Items for `data/SEED_REPORT.md`

Start the report with these items for Maithili, then add what the builder finds.

1. **Watch-And-Help [29] and G2.** §III-B says the goal inference family assumes action-goal association is given. Table I and Appendix II-A list [29] under G2. Seeded as G2 addresses, per Table I.
2. **Loop type for [29] and [20].** §IV says prior work relied on static datasets and cites [29] and [20]. Seeded as offline_replay.
3. **Benchmarks.** Watch-And-Help [29] and ProAct [30] present benchmarks. Should they get `evaluation_setup` entries?
4. **GAP's family.** Resolved. GAP has no family and sits between the two clusters in the literature graph, per Maithili.
5. **Temporal family G1 and P1.** Seeded as `assumes`, from §III-B's reading that these methods use a goal space at the action level and assume uniform cost.
6. **Reference list.** [20] prints CoRL 2023, and Maithili confirms CoRL 2022. [41] prints 2024. [16] prints no year. [63] prints no venue or year. The builder adds every other difference it finds.
7. **To fill.** `core_strength` for all L2 methods, `builds_on` edges beyond the three given, and HOMER+ goal annotations.
