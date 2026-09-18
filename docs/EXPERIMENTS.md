# Experiment Design — Single Source of Truth

**Version:** 1.0 · **Date:** 2026-07-26
**Scope:** Every experiment to run, the variables each one sweeps, and the datasets behind them. Companion to [SPEC.md](SPEC.md) (feature list) and [BRIEF.md](BRIEF.md) (rationale). MLflow tag names match factor names 1:1.

---

## 1. Datasets

| Dataset | Role | Subsystem proxy | Signal | Labels |
|---|---|---|---|---|
| Paderborn (PU) | SSL pretrain + supervised proxy | Bogie/bearing | Vibration, motor current, 64kHz | Induced + natural damage classes |
| CWRU | SSL pretrain + sanity check only | Bogie/bearing | Vibration, 12/48kHz | Fault classes (near-saturated, never headline) |
| XJTU-SY | SSL pretrain | Bogie/bearing | Vibration, 25.6kHz | RUL trajectories |
| FEMTO-ST | SSL pretrain | Bogie/bearing | Vibration + temp, 25.6kHz | RUL trajectories |
| NASA IMS | SSL pretrain | Bogie/bearing | Vibration, 20kHz | RUL trajectories |
| SEU | SSL pretrain + supervised proxy | Bogie/gearbox | Vibration (8ch) + torque, 12kHz | Bearing + gear fault classes |
| MaFaulDa | SSL pretrain + supervised proxy | Rotating machinery | 8ch accel/mic/tacho, 50kHz | Imbalance/misalignment/bearing classes |
| PHM NA 2023 | Supervised proxy | Gearbox | Tri-axial vibration | Healthy + 6 severity levels |
| BJTU-RAO | Supervised proxy (primary) | Bogie transmission | 24ch vibration/current/speed/sound, 64kHz | 51 classes (1 healthy + 50 fault) |
| MetroPT-3 | Domain adaptation target + pretrain-corpus ablation | APU/compressor | 15 sensors, 1Hz | Real failure reports |
| DR-Train | Domain adaptation target + pretrain-corpus ablation | Bogie (in-service) | Tri-axial + uni-axial accel, GPS, weather | Maintenance-log weak labels |
| MIMII / MIMII DUE / MIMII DG | Door proxy + domain-shift rehearsal | Door (slide rail) | Acoustic | Normal/anomalous, explicit domain shifts |
| Synthetic door generator | Door proxy | Door | Simulated motor current | Injected fault labels (synthetic, disclosed) |
| RSDDs / NEU | Conditional — visual only | Rail surface / steel surface | Image | Defect annotations |
| Hackathon fault data (door/bogie) | Fine-tune target + frozen holdout | Door, bogie | TBD on release | Manually verified faults |

---

## 2. Factors & Levels

| Factor | MLflow tag | Levels |
|---|---|---|
| Backbone | `backbone` | discord_damp, discord_madrid, classical_baseline, wdcnn, inceptiontime, resnet1d, cnn2d_spectrogram, cnn_lstm, patchtst, timesnet, anomaly_transformer, dcdetector, moment, chronos, moirai, timesfm |
| Pretrain stage | `pretrain_stage` | scratch, ssl (Stage 0), supervised_proxy (Stage 1) |
| Domain adaptation | `adaptation` | none, bn_recal, coral, mmd, dann |
| PEFT method | `peft` | none/full_ft, linear_probe, bitfit, lora_r4, lora_r16, last_block_ft |
| N-shot | `n_shot` | 0, 5, 20, 100, all |
| Task | `task` | T1_unsupervised_ad, T2_classification, T3_rul, T4_event_forecast |
| Subsystem | `subsystem` | door, bogie, apu_aux |
| Sensor dropout | `sensor_dropout` | 0, 1, 2, 3 channels removed |
| Split type | `split_type` | group_asset_time (default; random banned) |
| Seed | `seed` | 0, 1, 2 (minimum 3 per reported result) |

---

## 3. Experiment Matrix

| ID | Name | Sweeps | Fixed | Dataset(s) | Metric | Purpose |
|---|---|---|---|---|---|---|
| EXP-0 | Discord baseline (DAMP/MADRID) | subsequence length m (DAMP) / length range+step (MADRID) × subsystem | no pretrain stage; deterministic, no seed sweep needed | All Tier 0/1 vibration + pressure datasets, plus hackathon data as soon as released | AUPRC, VUS-PR, wall-clock throughput | Zero-label, zero-training anomaly floor. Run first — before EXP-1, before any model is trained. Any deep model must justify its cost against this. |
| EXP-1 | Baseline sanity check | subsystem × seed | backbone=classical_baseline, task=T1 | Tier-1 labeled subsets | AUPRC, VUS-PR | Establish the feature-based-ML credibility floor above EXP-0, that every deep model must also beat |
| EXP-2 | Model bake-off | backbone (all 14) × seed | pretrain_stage=scratch, split=group_asset_time | BJTU-RAO, Paderborn, SEU | AUPRC/F1 + params/latency | Head-to-head comparison under one protocol |
| EXP-3 | Few-shot transfer curve | pretrain_stage × n_shot × seed | backbone=best 4 from EXP-2, task=T2 | Hackathon target (MetroPT stand-in pre-release) | AUPRC vs. n_shot | Headline result — labeling-cost reduction from transfer learning |
| EXP-4 | Domain adaptation ablation | adaptation × seed | backbone=best from EXP-2 | source=Paderborn → target=MetroPT/hackathon | AUPRC delta vs. `adaptation=none` | Cheapest-win validation (BN recal first) |
| EXP-5 | PEFT ladder | peft × n_shot × seed | backbone=best from EXP-2, pretrain_stage=ssl | Hackathon target | AUPRC vs. compute/storage cost | Confirms PEFT beats full FT under label scarcity |
| EXP-6 | Cross-machine generalization | held-out machine × seed | backbone=top 3 | Paderborn (32 units), BJTU-RAO, CWRU (multi-load) | AUPRC on unseen machine | Tests generalization, not memorization |
| EXP-7 | Sensor-dropout robustness | sensor_dropout × seed | backbone=top 3 | BJTU-RAO (24ch), DR-Train (5ch), SEU/MaFaulDa (8ch) | AUPRC vs. channels dropped | Operational robustness to real sensor failure |
| EXP-8 | Pretraining-corpus ablation | pretrain_corpus {testrig-only, +real} | backbone=ssl-pretrained best | + MetroPT/DR-Train vs. without | AUPRC on target | Tests "real data beats clean data" |
| EXP-9 | Efficiency Pareto | backbone (all 14) | fixed input size, target hardware | N/A (architecture benchmark) | params, latency (×10 runs), memory | Feeds deployment sizing (§6 SPEC) |
| EXP-10 | Foundation-model kHz viability | backbone {moment, chronos, timesfm} × sampling_rate {native low-rate, resampled kHz} | task=T1 | Paderborn, BJTU-RAO | AUPRC | Tests open question: do TS foundation models transfer to kHz vibration |
| EXP-11 | Door pipeline dry run | backbone=top 3 | dataset=synthetic + MIMII slide-rail | task=T1/T2 | AUPRC | Validates door pipeline before real door data lands |

All experiments except EXP-0 (deterministic, no seed): ≥3 seeds, frozen holdout evaluated once at the end, no experiment touches the holdout before EXP-3/EXP-5 final numbers are locked.

**Note on EXP-0 dataset provenance:** CWRU's fan-end-bearing case is the literal worked example in the DAMP paper (2 hp Reliance Electric motor, 12kHz) — run discords there first as a reproducibility check against the published result before applying to project data. MetroPT's APU pressure signal is analogous to a documented third-party case (a city-bus-fleet wet-tank air-pressure system) where discords found physically meaningful events — a strong prior that EXP-0 should work well on APU data specifically.

---

## 4. Non-ML validation checks

| Check | Function |
|---|---|
| Rule-table coverage test | Every `{faultType × severity}` combination matches exactly one rule in the decision engine — no gaps, no overlaps. |
| Schema contract test | Sample fault events validate against the published OpenAPI schema (§7 SPEC) before demo. |
| Fleet simulation benchmark | EXP-9 output (params/latency/memory) feeds directly into the shared-base-vs-per-car comparison. |
