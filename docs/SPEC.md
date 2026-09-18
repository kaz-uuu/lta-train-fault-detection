# Project Feature Spec — Single Source of Truth

**Version:** 1.0 · **Date:** 2026-07-26
**Scope:** All features across data, modeling, MLOps, deployment, and the two PS3 add-ons. Detail/rationale lives in [BRIEF.md](BRIEF.md) and [FEATURES.md](FEATURES.md) — this document is the flat index: name + function only.

---

## 1. Data Pipeline

| Feature | Function |
|---|---|
| Signal Contract | Canonical window/tensor spec (sampling rate, window/hop, normalization, channel-independent encoding) that all dataset sources conform to. |
| Dataset Adapters | Per-source loader conforming raw data to the Signal Contract. One per: MetroPT, DR-Train, BJTU-RAO, Paderborn, CWRU, XJTU-SY, FEMTO-ST, NASA IMS, SEU, MaFaulDa, PHM2023, MIMII/MIMII DUE/MIMII DG, RSDDs, NEU, synthetic door generator. |
| Synthetic Door Generator | Simulates door motor-current cycles (nominal + friction ramp + obstruction spike + belt-slip) to bootstrap the door pipeline before real door data exists. |
| Group-Aware Splitter | Splits by asset ID and time, never by random window. Produces a frozen holdout touched once. |
| Dataset Registry | Tracks name, URL, license, checksum, and commercial-use flag per dataset. |

## 2. Models to Test (bake-off)

| Feature | Function |
|---|---|
| Time Series Discords (DAMP / MADRID) | Zero/one-parameter distance-based anomaly detector (matrix-profile family). No training data required, deterministic, concept-drift invariant, effectively-online to ~300kHz. Primary T1 candidate; build before anything else. |
| Classical Baseline | tsfresh/catch22 feature extraction + gradient-boosted trees; envelope analysis (BPFO/BPFI/BSF) for bearing-frequency features. Mandatory reference point for every subsystem. |
| WDCNN | Wide-first-kernel 1D CNN; standard raw-vibration baseline. |
| InceptionTime / ResNet-1D | General-purpose 1D time-series classifiers. |
| 2D CNN on Spectrogram | STFT/CWT/log-mel image representation feeding an ImageNet-pretrained 2D backbone. |
| CNN-LSTM Hybrid | CNN feature extractor + LSTM/GRU sequence head; targets door-cycle drift and RUL trajectories. |
| PatchTST | Primary transformer: patch tokenization + channel independence. |
| TimesNet | 2D periodicity-based transformer; secondary transformer candidate. |
| Anomaly Transformer / DCdetector | Association-discrepancy anomaly detectors; challenger models. |
| MOMENT | Primary foundation model; masked-encoder, used for anomaly detection and classification. |
| Chronos / Chronos-Bolt | Foundation model used via forecast-residual anomaly scoring. |
| MOIRAI / TimesFM / Time-MoE / TSPulse | Challenger foundation models for cross-frequency forecasting and efficiency comparison. |

## 3. Transfer-Learning Pipeline

| Feature | Function |
|---|---|
| Stage 0 — SSL Pretraining | Masked-patch reconstruction over the full public corpus; produces the base encoder checkpoint. |
| Stage 1 — Supervised Proxy Pretraining | Multi-task head (fault type, severity, machine-ID w/ gradient reversal) trained on BJTU-RAO + Paderborn + SEU. |
| Stage 2 — Domain Adaptation | BatchNorm recalibration, then CORAL/MMD, then DANN, applied to target-domain unlabelled data. |
| Stage 3 — PEFT Fine-Tuning | Ladder: linear probe → BitFit → LoRA → last-block FT → full FT, applied to hackathon fault data. Produces per-car adapters. |
| Stage 4 — Calibration | Temperature scaling / isotonic calibration; operating threshold selected from the cost curve. |

## 4. Evaluation

| Feature | Function |
|---|---|
| Metric Suite | VUS-PR / AUPRC (headline), affiliation/range-based F1, detection lead time, cost curve. PA-F1 excluded by design. |
| Few-Shot Curve | Accuracy vs. N labelled faults, scratch vs. pretrained. Headline result. |
| Cross-Machine Ablation | Train/test split by held-out machine, not held-out window. |
| Sensor-Dropout Ablation | Accuracy under 1–3 simulated dead channels. |
| Efficiency Pareto | Accuracy vs. parameter count vs. latency on target hardware. |
| Pretraining-Corpus Ablation | Measures effect of adding real in-service data (MetroPT/DR-Train) to the test-rig-only corpus. |

## 5. MLflow

| Feature | Function |
|---|---|
| Tracking Server | SQLite/local for solo runs; Postgres + S3/MinIO backend when 2+ people log concurrently. |
| Experiment Structure | One experiment per task: `fault-clf`, `anomaly-det`, `rul`, `door`, `bogie`. |
| Run Tagging Schema | Every run tagged: `backbone`, `pretrain_stage`, `source_dataset`, `target_dataset`, `n_shot`, `adaptation`, `peft`, `seed`, `git_sha`. |
| Dataset Lineage | `mlflow.log_input()` on every run for data-version traceability. |
| Model Registry | Per-subsystem aliased models (`models:/bogie-detector@champion`); deployment code references the alias. |
| System Metrics Logging | Latency/memory/GPU utilization logged alongside accuracy for the Efficiency Pareto. |

## 6. Deployment

| Feature | Function |
|---|---|
| ONNX Export | Portable inference artifact attached to every registered MLflow model. |
| Shared Base + Per-Car Conditioning | One model; car identity enters as a learned embedding/FiLM vector plus per-car normalization stats. |
| Per-Car LoRA Adapters | KB-scale per-car weight delta on top of the frozen shared base. |
| Per-Car State Store | Feature-store row keyed by `car_id` holding thresholds, drift stats, health history. |
| Fleet Simulation Benchmark | Measures memory/latency/cost of shared-base+adapters vs. one-container-per-car at simulated fleet scale. |
| Serving Runtime | ONNX Runtime by default (CPU/ARM/GPU portability); Triton if dynamic batching/ensembles are needed; TensorRT only where GPUs are fixed. |

## 7. Feature — Maintenance-Scheduler Integration Endpoint

| Feature | Function |
|---|---|
| Fault Event Schema | Event object (asset ID, fault code, severity, confidence, root cause, ETTF, recommended action) grounded in ISO 13374/13379-1/13381-1/14224. |
| Candidate-Request Fields | `proposedWindow`, `estimatedDuration`, `resourceHint` — reshapes the event into an object a maintenance-scheduling consumer can place directly. |
| `POST /fault-events` Endpoint | Emits real detector output; HMAC-signed, idempotency key, versioned schema. |
| OpenAPI Spec | Published, versioned contract — the primary artifact judges/consumers read. |
| Mock Consumer Dashboard | Self-built receiver that logs/displays incoming events; makes the integration demoable with zero external dependency. |

## 8. Feature — Modular Decision Engine

| Feature | Function |
|---|---|
| Fixed Hierarchy Model | Static Chief Controller → Train/Station/Depot Control template. Never reshaped at runtime. |
| Rule Table (DMN/Zen Engine) | JSON decision table mapping `{faultType, severity, confidence, subsystem, timeOfDay}` → response/escalation action. 10–20 rules. |
| Escalation Router | Activates/routes to hierarchy nodes per rule match; does not alter hierarchy shape. |
| Audit Trace | Logs which rule fired, on what input, at what confidence, per recommendation. |
| Autonomy Badge (GoA-R) | Tags every engine output "recommend only — human executes," with the fired rule ID visible. |
| Integration Trigger | Rule condition that, when met, fires the Maintenance-Scheduler Integration Endpoint (§7). |
