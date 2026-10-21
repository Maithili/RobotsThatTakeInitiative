# Metric mapping review

Written Oct 21, 2026, for Maithili to review before anything goes live. It covers the 80 metrics added to `data/taxonomy.yaml` from the librarian's answers of the same day, plus the three RTI metrics they sit beside.

Every metric now has a definition taken from its paper, a direction, and a unit. The terms, kind, and `mapping_note` are proposals. Each row says which papers use the metric, so a change here can be checked against them. Terms use the RTI symbols ΔV (value gained), ΔC↓ (human cost saved), ΔC↑ (human cost added), and C_r (robot cost).

## How the proposals were made

- **direct** means the metric counts a term in a closed loop. Only ProAct's rollout version of saved steps qualifies, alongside the two RTI metrics.
- **proxy** means the metric points at a term without measuring it. Most proxies score a prediction offline and assume the robot would act on it, or measure robot effort as a stand-in for C_r.
- **unrelated** means the metric scores a component, such as perception, goal inference, a predicted distribution, or computing time, and maps to no term. Of the 80 new metrics, 42 are unrelated, 37 are proxies, and 1 is direct.

## Mappings that are a stretch

1. **Search success as ΔC↓.** Search success rate, success at K, the EvolvingNav success variants, and the objects found ratio all map to ΔC↓ on the reasoning that finding the item spares the user a search. None of these papers has a user who asked for the item, and none measures user cost. Marking them unrelated would be just as defensible.
2. **Robot effort as C_r.** Path length, steps to find, inspections, excess distance, task time, robot actions, and the distance on absent queries map to C_r. The RTI definition of C_r is wear and charge. These metrics drive both but measure neither.
3. **Anticipatory planning reports only robot cost.** Anticipatory TAMP, Talukder 2025, and Courteous Anticipation evaluate with average cost per task and its percent reduction, which map only to C_r. These are L2 methods on the Evaluations page with no metric that touches a human term, since no user is in their loop. Their plan cost is time-like, so a reading as user waiting time is possible, but the papers do not frame it that way.
4. **Correct abort rate as C_r.** A correct abort ends wasted robot travel. A wrong abort or a false "found" costs the user, which is not measured.
5. **Task success rate as ΔV.** In Watch-And-Help the user alone finishes about 95% of goals on test-2, so most successes are goals the user would have finished anyway. The metric comes close to ΔV only at the margin.
6. **Rated helpfulness as ΔV, ΔC↓, and ΔC↑.** The scale runs from hurting to very helpful, so it spans every human term, but it is a perception.
7. **Emergency detection.** Mullen 2025's false negatives map to ΔV (a missed emergency leaves the user without help) and false positives to ΔC↑ (a false alarm). Both fit the terms in spirit, but emergencies are far from the household chores the RTI formalism describes.
8. **Din 2025's subgoal accuracies as ΔC↓ and ΔC↑.** Annotators following written instructions define the needed help, and the predictions are never executed.
9. **Object F1 and mean F1 for GLOBE.** Object F1 maps like relocation F1. Mean F1 also mixes in activity prediction, which maps to no term on its own.
10. **Used objects missed and unused objects correct.** Used objects missed measures the shortfall in ΔC↓, not an added cost. Unused objects correct is the complement of unused objects wrong, so it maps to ΔC↑ with higher as better.
11. **Saved steps (rollout) as direct.** ProAct's simulator enforces task-graph feasibility, so wrong robot actions cannot happen and ΔC↑ is never measured. The metric is direct for ΔC↓ only.

## Merges and splits to confirm

Merged because two papers define the metric the same way.

- **F1 (`f1`).** SLaTe-PRO's precision and recall over predicted relocations give the RTI F1 under offline replay, so SLaTe-PRO reuses `f1`. SLaTe-PRO also defines precision and recall, but its text reports only F1, so those two were not added.
- **Used and unused objects.** STREAK reuses STOT's five relocation metrics with the same definitions.
- **Speedup.** NOPA and Watch-And-Help define it the same way.
- **Search success rate.** SGM's iGridson success, EvolvingNav's SR, PredictiveGraphs' SR, and Mullen 2025's AudioGoal SR differ in their thresholds (distance, visibility, oracle stopping in Mullen 2025) but count the same thing. SGM and Mullen 2025 report fractions while the unit says %.
- **SPL.** EvolvingNav gives the standard formula and PredictiveGraphs gives none. Mullen 2025's printed formula inverts the ratio, but its text says inefficient paths are penalized, so it reads as standard SPL. Worth checking in the PDF.
- **Path length.** SGM's path length, FlowMaps' Path, and EvolvingNav's Dist. SGM's unit is not stated (it is a gridworld), while the others are in meters.
- **Steps to find.** SGM's number of actions, FlowMaps' Steps, and TAP's time to find.
- **Task time.** EvolvingNav's Time (s) and Anticipatory TAMP's real-robot execution time.
- **Average cost per task and cost reduction.** Shared by the three anticipatory planning papers. Courteous Anticipation does not say whether its planner cost is per task or per sequence.
- **Training time.** STREAK reports minutes and GLOBE seconds.

Kept apart because the definitions differ.

- Success at K (FlowMaps) and search success rate.
- EvolvingNav's Search SR (found at any point) and its SR (success at the stop). The paper reports both.
- ProAct's micro and macro detection metrics, and Din 2025's binary object-of-interest metrics.
- Watch-And-Help's goal precision and recall, and NOPA's goal F1.
- ProAct's two "SS" metrics, the one-step fraction and the rollout step count.

## Metrics not added

- SLaTe-PRO's precision, recall, and query rate. The text reports only F1, and the query rate is a usage figure with no stated direction.
- PredictiveGraphs' prediction time and memory footprint, which are outside the main results.
- ProAct's hallucination rates, trigger false-positive and false-negative rates, and latency. The settings behind them are not stated or sit in the appendix.
- EvolvingNav's Brier score (no results shown) and the metrics of its external benchmarks (FindingDory and GOAT-Bench), which have no entry.
- Talukder 2025's share of tasks that cost less after preparation (about 80%), a single figure in the text.
- Watch-And-Help's step counts for people working alone, a setting with no robot.

## For the site

The Evaluations page lists every taxonomy metric. 31 of the 83 metrics are used only by tangential papers, which the page leaves out, so those rows would show "used in 0". The list could hide metrics that no paper in scope uses. E2E test 5 also expects exactly three metrics under ΔC↑, and there are now 13.

## The metrics

The RTI paper's three metrics are unchanged. They gained only direction and unit, from SPEC §5.1.

### RTI paper metrics

| Metric | Papers | Definition | Direction, unit | Terms | Kind | Why |
|---|---|---|---|---|---|---|
| **Net actions saved** `net_actions_saved` | GAP | Skipped user actions minus undo actions, as a percentage of baseline user actions. | ↑ higher, % | ΔC↓, ΔC↑ | direct | Unchanged from the RTI paper. |
| **Perturbed actions** `perturbed_actions` | GAP | User actions corrected because of a wrong robot action, as a percentage of baseline user actions. | ↓ lower, % | ΔC↑ | direct | Unchanged from the RTI paper. |
| **F1** `f1` | GAP, SLaTe-PRO | Skipped actions as true positives, undo and corrected as false positives, done as-is as false negatives. | ↑ higher, fraction | ΔC↓, ΔC↑ | proxy | Unchanged from the RTI paper. |

### Object relocation prediction, offline (STOT, STREAK)

| Metric | Papers | Definition | Direction, unit | Terms | Kind | Why |
|---|---|---|---|---|---|---|
| **Used objects, correct** `used_correct` | STOT, STREAK | Objects the user moved in the window whose predicted move goes to the right place, as a share of used objects. | ↑ higher, % | ΔC↓ | proxy | A correct move would spare the user that relocation, but it is scored offline and assumes the robot acts. |
| **Used objects, wrong** `used_wrong` | STOT, STREAK | Objects the user moved in the window that are predicted to move to the wrong place, as a share of used objects. | ↓ lower, % | ΔC↑ | proxy | A wrong move would make the user fetch the object back. Scored offline, so later drift is not counted. |
| **Used objects, missed** `used_missed` | STOT, STREAK | Objects the user moved in the window that are predicted to stay put, as a share of used objects. | ↓ lower, % | ΔC↓ | proxy | Counts savings the robot forgoes, the shortfall in ΔC↓. A miss adds no cost. |
| **Unused objects, correct** `unused_correct` | STOT, STREAK | Objects the user did not use in the window that are predicted to stay put, as a share of unused objects. | ↑ higher, % | ΔC↑ | proxy | Leaving unneeded objects alone avoids added cost. It is the complement of unused objects moved. |
| **Unused objects, wrong** `unused_wrong` | STOT, STREAK | Objects the user did not use in the window that are predicted to move, as a share of unused objects. | ↓ lower, % | ΔC↑ | proxy | Moving an object nobody needs may make the user put it back. Scored offline. |

### Activity and object prediction, offline (GLOBE)

| Metric | Papers | Definition | Direction, unit | Terms | Kind | Why |
|---|---|---|---|---|---|---|
| **Activity F1** `activity_f1` | GLOBE | F1 of the predicted activity against the true activity at each time step. | ↑ higher, fraction | none | unrelated | Scores an anticipated activity, an intermediate step that triggers no robot action. |
| **Object F1** `object_f1` | GLOBE | F1 of the predicted object against the true object at each time step. | ↑ higher, fraction | ΔC↓, ΔC↑ | proxy | A right object could be brought to spare the user and a wrong one adds cost. Scored offline. |
| **Mean F1 (activity-object)** `joint_mean_f1` | GLOBE | F1 averaged across all joint activity-object labels. | ↑ higher, fraction | ΔC↓, ΔC↑ | proxy | Carries object F1's link to cost but mixes in activity prediction, which maps to no term. |

### Computing cost (STREAK, GLOBE, Anticipatory TAMP)

| Metric | Papers | Definition | Direction, unit | Terms | Kind | Why |
|---|---|---|---|---|---|---|
| **Training time** `training_time` | GLOBE, STREAK | Wall-clock time to train the model, per learning session or in total. | ↓ lower, min or s | none | unrelated | Computing cost of building the model, not a cost to the user or to the robot's body. |
| **Training samples kept** `training_samples` | STREAK | Number of training samples stored per learning session and in total. | ↓ lower, samples | none | unrelated | Memory cost of continual learning. Maps to no term. |
| **Inference time** `inference_time` | GLOBE | Wall-clock time to produce predictions. What it is summed over is not stated. | ↓ lower, s | none | unrelated | Computing cost. Slow inference could delay help, but no delay is measured. |
| **Planning time** `planning_time` | Anticipatory TAMP | Time the planner takes per task or for a given number of plan samples. | ↓ lower, s | none | unrelated | Computing cost of choosing a plan, not a cost to the user or to the robot's body. |

### Goal inference and helping (NOPA, Watch-And-Help)

| Metric | Papers | Definition | Direction, unit | Terms | Kind | Why |
|---|---|---|---|---|---|---|
| **Speedup** `speedup` | NOPA, Watch-And-Help | Episode length with the user alone divided by episode length with the helper, minus 1. | ↑ higher, ratio | ΔC↓, ΔC↑ | proxy | Net change in the time to finish the user's goal. Savings and interference are not separated. |
| **Task success rate** `task_success_rate` | Watch-And-Help | Share of episodes where every predicate of the user's goal holds before the step limit. | ↑ higher, fraction | ΔV | proxy | Goals finished in time come close to ΔV, but the user alone also finishes most goals. |
| **Cumulative reward** `cumulative_reward` | Watch-And-Help | Per-step reward summed over the episode, from −1 (failure) to 1 (goal reached in zero steps). | ↑ higher, score | ΔV, ΔC↓ | proxy | Rewards finishing and finishing sooner, so it mixes completion with time saved. |
| **Goal F1** `goal_predicate_f1` | NOPA | F1 of the predicted goal predicates against the user's true goal. | ↑ higher, fraction | none | unrelated | Scores goal inference, an intermediate step. No robot action is counted. |
| **Goal precision** `goal_predicate_precision` | Watch-And-Help | Precision of the predicted goal predicates against the user's true goal. | ↑ higher, fraction | none | unrelated | Scores goal recognition from a demonstration. No robot action is counted. |
| **Goal recall** `goal_predicate_recall` | Watch-And-Help | Recall of the predicted goal predicates against the user's true goal. | ↑ higher, fraction | none | unrelated | Scores goal recognition from a demonstration. No robot action is counted. |
| **Rated goal knowledge** `rated_goal_knowledge` | Watch-And-Help | User rating from 1 to 7 of how much the agent knew about the true goal. | ↑ higher, 1–7 rating | none | unrelated | Perceived goal understanding. Maps to no term. |
| **Rated helpfulness** `rated_helpfulness` | Watch-And-Help | User rating from 1 to 7 of how helpful the agent was (1 hurting, 4 neutral, 7 very helpful). | ↑ higher, 1–7 rating | ΔV, ΔC↓, ΔC↑ | proxy | Users judge net help, which spans every human term, but only as a perception. |
| **Rated trust** `rated_trust` | Watch-And-Help | User rating from 1 to 7 of whether they would trust the agent to do its job. | ↑ higher, 1–7 rating | none | unrelated | Trust maps to no term. |

### Video perception and task-graph rollouts (ProAct)

| Metric | Papers | Definition | Direction, unit | Terms | Kind | Why |
|---|---|---|---|---|---|---|
| **Detection accuracy** `detection_accuracy` | ProAct | Micro-averaged accuracy of trigger, task, and step detection on video. | ↑ higher, % | none | unrelated | Scores perception of when and what to help with. No robot action is counted. |
| **Detection F1** `detection_f1` | ProAct | Micro-averaged F1 of trigger, task, and step detection on video. | ↑ higher, % | none | unrelated | Scores perception of when and what to help with. No robot action is counted. |
| **Detection mAcc** `detection_macro_accuracy` | ProAct | Accuracy averaged over classes (macro) for trigger, task, and step detection. | ↑ higher, % | none | unrelated | Same as detection accuracy, weighted toward rare classes. No robot action is counted. |
| **Detection mF1** `detection_macro_f1` | ProAct | F1 averaged over classes (macro) for trigger, task, and step detection. | ↑ higher, % | none | unrelated | Same as detection F1, weighted toward rare classes. No robot action is counted. |
| **Future action edit distance** `future_action_edit_distance` | ProAct | Edit distance between the predicted and true sequences of future user actions. | ↓ lower, not stated | none | unrelated | Scores anticipation of the user's next actions. No robot action is counted. |
| **Saved steps (one step)** `saved_steps_rate` | ProAct | Share of decision points where the robot's action is one of the user's true upcoming steps (Terminate excluded). | ↑ higher, fraction | ΔC↓ | proxy | A matching action could take over a user step, but it is scored offline, one decision at a time. |
| **Saved steps (rollout)** `saved_steps` | ProAct | Steps in the annotated user trajectory minus the steps the user still executes alongside the robot, averaged over videos. | ↑ higher, steps | ΔC↓ | direct | Counts user steps the robot takes over in closed loop. The task graph blocks wrong actions, so ΔC↑ goes unmeasured. |
| **Parallel actions** `parallel_actions` | ProAct | Share of effective robot actions on a different thread from the user's previous action. | ↑ higher, % | none | unrelated | Measures how often robot and user work apart. It may relate to interference but counts no cost. |
| **Thread mixing entropy** `thread_mixing_entropy` | ProAct | Entropy of how user and robot actions mix across task threads, WAIT excluded. | ↓ lower, unitless | none | unrelated | Describes how work is split. Maps to no term. |
| **Robot thread entropy** `robot_thread_entropy` | ProAct | Entropy of the robot's actions across task threads, WAIT excluded. | ↓ lower, unitless | none | unrelated | Describes how the robot's work is spread. Maps to no term. |

### Object search in changing homes (SGM, FlowMaps, EvolvingNav, PredictiveGraphs, TAP, Mullen 2025)

| Metric | Papers | Definition | Direction, unit | Terms | Kind | Why |
|---|---|---|---|---|---|---|
| **Location accuracy** `location_accuracy` | SGM | Share of predictions that pick a furniture node holding an object matching the query. | ↑ higher, fraction | none | unrelated | Scores where an object is. It serves search but measures no cost or value. |
| **NDCG** `ndcg` | SGM | Normalized discounted cumulative gain of the ranked candidate locations. | ↑ higher, score | none | unrelated | Scores the ranking of locations. Maps to no term. |
| **Search success rate** `search_success_rate` | EvolvingNav, Mullen 2025, PredictiveGraphs, SGM | Share of search episodes in which the robot ends near the target and sees it within its budget. | ↑ higher, % | ΔC↓ | proxy | Finding the item would spare the user the search, but no user cost is measured. |
| **SPL** `spl` | EvolvingNav, Mullen 2025, PredictiveGraphs | Success weighted by path length, so success times the shortest path over the longer of the actual and shortest paths. | ↑ higher, % | ΔC↓, C_r | proxy | Mixes finding the item, a stand-in for user cost saved, with path efficiency, a robot cost. |
| **Path length** `path_length` | EvolvingNav, FlowMaps, SGM | Distance the robot travels in an episode. | ↓ lower, m | C_r | proxy | Travel drives wear and charge. It says nothing about the user. |
| **Steps to find** `steps_to_find` | FlowMaps, SGM, TAP | Robot actions or steps taken until it finds the target. In SGM, the budget plus one if it never does. | ↓ lower, steps | C_r | proxy | More steps mean more robot effort. The user's waiting time is not measured. |
| **Task time** `task_time` | Anticipatory TAMP, EvolvingNav | Wall-clock time the robot takes to finish the episode or the task sequence. | ↓ lower, s | C_r | proxy | Robot time and effort. Any user waiting time is not measured as such. |
| **Success at K** `success_at_k` | FlowMaps | Share of episodes where one of the first K ranked candidates brings the robot within reach and view of the target. | ↑ higher, % | ΔC↓ | proxy | Same link as search success, at a candidate budget of K. Reported per K and averaged over K. |
| **SPL at K** `spl_at_k` | FlowMaps | SPL over the first K ranked candidates, reported per K and averaged over K. | ↑ higher, % | ΔC↓, C_r | proxy | Mixes finding the item with path efficiency, as SPL does. |
| **minFDE@K** `min_fde` | FlowMaps | 3D distance from the true box center to the closest of K predicted samples. | ↓ lower, m | none | unrelated | Scores predicted object positions. Maps to no term. |
| **Rec@1** `recall_at_1m` | FlowMaps | Share of queries where the best of K samples lies within 1 m of the true position on the floor plane. | ↑ higher, fraction | none | unrelated | Scores predicted object positions. Maps to no term. |
| **Density** `sample_density` | FlowMaps | Average number of nearest-neighbor balls around true positions that each predicted sample falls in. | ↑ higher, unitless | none | unrelated | Scores the predicted position distribution. Maps to no term. |
| **Coverage** `sample_coverage` | FlowMaps | Share of true positions whose nearest-neighbor ball holds at least one predicted sample. | ↑ higher, fraction | none | unrelated | Scores the predicted position distribution. Maps to no term. |
| **TV** `total_variation` | FlowMaps | Total-variation divergence between predicted and true position histograms on a 0.5 m floor grid. | ↓ lower, unitless | none | unrelated | Scores the predicted position distribution. Maps to no term. |
| **JS** `js_divergence` | FlowMaps | Jensen-Shannon divergence between predicted and true position histograms on a 0.5 m floor grid. | ↓ lower, nats | none | unrelated | Scores the predicted position distribution. Maps to no term. |
| **Search SR** `eventual_search_success` | EvolvingNav | Share of episodes where the target is found at some point within the budget. Not defined further. | ↑ higher, % | ΔC↓ | proxy | Same link as search success, with a looser success test. |
| **First-inspection success** `first_inspection_success` | EvolvingNav | Share of episodes where the first candidate to get enough view coverage holds the target. | ↑ higher, % | ΔC↓ | proxy | Rewards finding the item on the first look. It stands in for user cost saved, as search success does. |
| **Recovery success** `recovery_success` | EvolvingNav | Share of episodes with a failed first inspection in which the target is found later. | ↑ higher, % | ΔC↓ | proxy | Search success after a first miss. Same link as search success. |
| **Dynamic success** `dynamic_success` | EvolvingNav | Search success on episodes where the target is scheduled to move after the query. | ↑ higher, % | ΔC↓ | proxy | Search success on moving targets. Same link as search success. |
| **Online recovery success** `online_recovery_success` | EvolvingNav | Success on episodes whose scheduled move invalidates the target's earlier place. Only finds after the move count. | ↑ higher, % | ΔC↓ | proxy | Search success when the target moves mid-search. Same link as search success. |
| **Excess distance** `excess_distance` | EvolvingNav | Path length minus the oracle shortest path, with a moving oracle for moving targets. | ↓ lower, m | C_r | proxy | Extra robot travel, so robot wear and charge. Says nothing about the user. |
| **Revisit success** `revisit_success` | EvolvingNav | Share of reopened candidate visits that recover the target. | ↑ higher, % | none | unrelated | Checks the belief update after a miss. Maps to no term. |
| **Inspections** `inspections` | EvolvingNav | Number of candidate inspections per episode. Not defined further. | ↓ lower, count | C_r | proxy | Each inspection is robot effort. Says nothing about the user. |
| **Top-1 accuracy** `top1_accuracy` | EvolvingNav | Top-1 accuracy of the predicted current state of the target. No formula given. | ↑ higher, % | none | unrelated | Scores object-state prediction. Maps to no term. |
| **MRR** `mrr` | EvolvingNav | Mean reciprocal rank of the target's true state among the candidates. No formula given. | ↑ higher, unitless | none | unrelated | Scores object-state prediction. Maps to no term. |
| **NLL** `nll` | EvolvingNav | Negative log-likelihood of the target's true state under the predicted belief. No formula given. | ↓ lower, unitless | none | unrelated | Scores object-state prediction. Maps to no term. |
| **True-state rank** `true_state_rank` | EvolvingNav | Rank of the target's true state among the candidates. It captures changes beyond top-1 accuracy. | ↓ lower, rank | none | unrelated | Scores object-state prediction. Maps to no term. |
| **ECE** `ece` | EvolvingNav | Expected calibration error, with predictions grouped by maximum confidence. | ↓ lower, unitless | none | unrelated | Scores how well the belief is calibrated. Maps to no term. |
| **Persistence MAE** `persistence_mae` | PredictiveGraphs | Mean absolute error between the predicted presence belief and the true presence of each object. | ↓ lower, unitless | none | unrelated | Scores the persistence estimator. Maps to no term. |
| **Persistence B-Acc** `persistence_balanced_accuracy` | PredictiveGraphs | Balanced accuracy of presence predictions, with the belief thresholded at 0.5. | ↑ higher, unitless | none | unrelated | Scores the persistence estimator. Maps to no term. |
| **Persistence F1** `persistence_f1` | PredictiveGraphs | F1 of presence predictions, with the belief thresholded at 0.5. | ↑ higher, unitless | none | unrelated | Scores the persistence estimator. Maps to no term. |
| **Correct abort rate** `abort_rate` | PredictiveGraphs | Share of queries for absent objects where the robot correctly gives up. | ↑ higher, % | C_r | proxy | A correct abort ends wasted search. The user's cost of a wrong answer is not measured. |
| **Distance on absent queries** `absent_search_distance` | PredictiveGraphs | Distance the robot travels before stopping on queries for absent objects. | ↓ lower, m | C_r | proxy | Robot travel spent searching for something that is not there. |
| **Objects found ratio** `objects_found_ratio` | TAP | Objects found in an episode over the most an optimal policy could find. | ↑ higher, % | ΔC↓ | proxy | Found objects would spare the user a search, but no user cost is measured. |
| **Trajectory alignment** `trajectory_alignment` | TAP | Largest overlap, in nodes, between the agent's path and a ground-truth optimal path. | ↑ higher, % | none | unrelated | Measures similarity to the optimal path, not distance or effort. Maps to no term. |
| **Relative change in success** `relative_change_in_success` | TAP | Percent change in success or alignment between static and dynamic scenes. Closer to 0 is better. | ↓ lower, % | none | unrelated | Measures robustness to object movement. Maps to no term. |
| **Cumulative success rate** `cumulative_success_rate` | TAP | Success accumulated over episodes in the lab replay. No formula given. | ↑ higher, not stated | ΔC↓ | proxy | Same link as the objects found ratio, accumulated over episodes. |
| **Emergency false negatives** `emergency_false_negative_rate` | Mullen 2025 | Share of episodes with an emergency in which none is reported. | ↓ lower, fraction | ΔV | proxy | A missed emergency leaves the user without help they could not get alone. Far from household chores. |
| **Emergency false positives** `emergency_false_positive_rate` | Mullen 2025 | Share of episodes without an emergency in which one is reported. | ↓ lower, fraction | ΔC↑ | proxy | A false alarm adds cost for the user or responders. That cost is not measured. |

### Anticipatory planning with no user in the loop (Anticipatory TAMP, Talukder 2025, Courteous Anticipation)

| Metric | Papers | Definition | Direction, unit | Terms | Kind | Why |
|---|---|---|---|---|---|---|
| **Average cost per task** `avg_task_cost` | Anticipatory TAMP, Courteous Anticipation, Talukder 2025 | Robot plan cost per task, averaged over task sequences, from fixed action costs plus distance. | ↓ lower, cost units | C_r | proxy | Time-like robot execution cost. With no user in the loop, no human term applies. |
| **Cost reduction** `cost_reduction` | Anticipatory TAMP, Courteous Anticipation, Talukder 2025 | Percent reduction in task cost relative to a baseline planner, such as a myopic one. | ↑ higher, % | C_r | proxy | Relative form of average cost per task. Robot cost only. |
| **Robot actions** `robot_action_count` | Anticipatory TAMP | Number of actions the robot executes to finish the tasks. | ↓ lower, actions | C_r | proxy | Robot effort. Says nothing about the user. |

### Proactive task prediction from egocentric images, offline (Din 2025)

| Metric | Papers | Definition | Direction, unit | Terms | Kind | Why |
|---|---|---|---|---|---|---|
| **OID precision** `ooi_precision` | Din 2025 | Share of frames flagged as holding an object of interest that do hold one. | ↑ higher, % | none | unrelated | Scores the per-frame trigger to act. No action is executed or costed. |
| **OID recall** `ooi_recall` | Din 2025 | Share of frames holding an object of interest that are flagged. | ↑ higher, % | none | unrelated | Scores the per-frame trigger to act. No action is executed or costed. |
| **OID F1** `ooi_f1` | Din 2025 | Harmonic mean of object-of-interest precision and recall. | ↑ higher, % | none | unrelated | Scores the per-frame trigger to act. No action is executed or costed. |
| **OID accuracy** `ooi_accuracy` | Din 2025 | Share of frames correctly classified as holding an object of interest or not. | ↑ higher, % | none | unrelated | Scores the per-frame trigger to act. No action is executed or costed. |
| **Relation accuracy** `relation_accuracy` | Din 2025 | Accuracy of predicted spatial relations (on, inside, next to) between object pairs. Not formally defined. | ↑ higher, % | none | unrelated | Scores scene perception. Maps to no term. |
| **Exact-match accuracy** `exact_match_accuracy` | Din 2025 | Share of predicted subgoal sequences that exactly match the annotated proactive task. | ↑ higher, % | ΔC↓, ΔC↑ | proxy | A match would do the help annotators chose, and a mismatch may add cost. Scored offline against labels. |
| **Subgoal accuracy** `subgoal_accuracy` | Din 2025 | Share of individual predicted subgoals that match the subgoals in the annotated sequence. | ↑ higher, % | ΔC↓, ΔC↑ | proxy | Same link as exact-match accuracy, credited per subgoal. |
