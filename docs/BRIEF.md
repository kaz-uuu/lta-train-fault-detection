# Train Fault Detection — Hackathon Brief & Technical Plan

**Version:** 1.0 · **Date:** 2026-07-26
**Scope:** Multi-subsystem fault detection for rolling stock (doors, bogies, general rotating machinery), built on transfer learning from public data, tracked in MLflow, deployed as containerized per-car inference.

---

## 1. Executive summary

The plan is a **three-stage transfer-learning ladder**:

1. **Pretrain** a signal encoder on a large, heterogeneous corpus of *public* machine-condition data (bearings, gearboxes, compressors, in-service rail vibration) using self-supervised masked reconstruction.
2. **Adapt** it on labelled proxy faults (subway bogie test-rig data, bearing benchmarks) so the encoder learns a fault-discriminative space before your real data exists.
3. **Fine-tune parameter-efficiently** (LoRA / adapters / linear probe) the moment the hackathon releases manually-verified fault data for doors and bogies — which will be small and severely imbalanced.

Architectures are compared in a disciplined bake-off — classical baselines, 1D CNNs, CNN-LSTM hybrids, patch transformers, and time-series foundation models — all logged to MLflow under one signal contract so the comparison is actually apples-to-apples.

**On deployment, the brief recommends changing the plan.** "One model container per train car" is the right *mental model* and the wrong *physical architecture*. It costs an estimated 50–100× more than necessary, degrades accuracy (each car re-learns shared physics from 1/N of the data), and creates a fleet-wide patching liability. The recommended substitute — **one shared base model + per-car LoRA adapters + per-car state in a feature store** — delivers identical per-car behaviour at O(1) model cost. Section 6 has the full argument, the arithmetic, and the conditions under which per-car containers *are* justified.

**The single highest-value deliverable** is a *few-shot performance curve*: accuracy vs. number of labelled fault examples, for pretrained-vs-scratch models. It directly answers the question every rail operator actually has — "how much labelled failure data do I need before this works?" — and it is the chart that wins the judging.

---

## 2. Problem framing

### 2.1 Subsystems in scope

| Subsystem | Signal modality | Failure modes | Data reality |
|---|---|---|---|
| **Passenger doors** | Motor current, position encoder, cycle timing, obstruction events, acoustics | Increased friction/resistance, obstruction, belt/screw wear, lock faults, misalignment | Door faults reportedly account for a large share of rolling-stock failures; events are sporadic and heavily outnumbered by normal cycles |
| **Bogie / running gear** | Tri-axial vibration, motor current, rotational speed, temperature, acoustic | Wheel flats, bearing spalling, gearbox pitting, suspension degradation, wheel-out-of-round | High sampling rates (kHz), continuous, cheap to collect, expensive to label |
| **Auxiliary (APU/HVAC/brakes)** | Pressure, current, oil temperature, digital valve states | Air leaks, compressor degradation, valve faults | Best-covered by public data (MetroPT) |

### 2.2 Task formulations — pick deliberately, don't blend them

You will get better results by declaring which of these you're solving:

- **T1 — Unsupervised anomaly detection.** Train on normal only, score deviation. *Robust to zero fault labels. Start here.*
- **T2 — Supervised fault classification.** Requires labelled fault classes. *This is what the hackathon fault data unlocks.*
- **T3 — Fault prognosis / RUL.** Requires run-to-failure trajectories. *Hardest, most impressive, most likely to be unsupported by the released data.*
- **T4 — Event forecasting.** "Will this door fail in the next N cycles?" *Highest operational value; reframes T1 residuals into a decision.*

**Recommendation:** build T1 as the backbone (it works with no labels and degrades gracefully), add T2 as a head on the same encoder, and present T4 as the operational framing. Treat T3 as stretch.

### 2.3 The metric trap — read this before writing any evaluation code

The widely-used **point-adjusted F1 (PA-F1) is broken**: random anomaly scores achieve PA-F1 near 1.0 on common benchmarks (SMD/MSL/SMAP are near-saturated at >0.97). If you report PA-F1 you will either look naive to a knowledgeable judge or fool yourself into shipping a bad model.

**Use instead:**
- **VUS-PR** or **AUPRC** as the headline scalar (imbalance-robust, threshold-free).
- **Affiliation-based** or **range-based** precision/recall for event-level scoring.
- **Detection lead time** (how many cycles/km before the failure you flagged it) — the operationally meaningful metric.
- **Cost curve**: false-alarm cost × FP + missed-failure cost × FN, swept over threshold. Pick the threshold from this curve, not from max-F1.

A related finding worth quoting in your writeup: in forecasting-residual anomaly detection, **detector choice matters far less than forecast quality** — swapping detectors moved F1 ~10%, while degrading the forecaster (LSTM → Holt-Winters) dropped it ~50%. Spend your effort on the encoder, not on exotic scoring.

### 2.4 The dataset trap — half of the standard TSAD benchmark canon is separately broken

Independent of the scoring-function problem in §2.3, many of the field's most-cited anomaly-detection *datasets* are themselves compromised — mislabeled, trivially solvable, or built with unrealistic anomaly density. This is not a fringe opinion: it is the subject of a peer-reviewed teardown by the inventors of the Matrix Profile, [Wu & Keogh, "Current Time Series Anomaly Detection Benchmarks are Flawed and are Creating the Illusion of Progress," IEEE TKDE 35(3), 2023](https://arxiv.org/abs/2009.13807), with a public dataset-by-dataset breakdown.

Named, documented failures directly relevant to the "generic PdM" datasets in §3's Tier 4:
- **SWaT** (1,000+ citations): ~70% of labelled "anomalies" are sensor fault codes (`0,0,0,0…`, `-9999,-9999…`) — trivially detectable with a null check, not anomaly detection. Scoring counts one 35,800-point contiguous event as near-independent successes, producing "0.997 accuracy" claims out of what is actually a single event. Independently corroborated as unreliable for multivariate AD evaluation by two other research groups (TimeSeAD, TMLR 2023; Sehili & Wagner, Bosch AI).
- **NASA SMAP / MSL**: specific widely-used files are near-degenerate (one SMAP series has 4,751 positive labels and a single negative); a 2025 top-venue paper cherry-picked "particularly challenging" MSL subsets after the fact.
- **PSM** (eBay pooled server metrics): 27.76% of the entire dataset is labelled "anomalous" — internally inconsistent with the definition of anomaly as rare deviation. Several flagged anomalies are multi-order-of-magnitude spikes visible in a single raw column.
- **NAB, Yahoo**: both small enough (lengths in the thousands) that runtime/scalability claims built on them are meaningless, and Yahoo's own ground truth contains internally inconsistent labels — two visually identical points, one marked anomalous and one not, confirmed with the original authors.
- **SKAB, Exathlon, MGAB, MITDB**: solvable outright with a one-line threshold or an untuned Matrix Profile — useful as a pipeline sanity check, not as evidence a model is good.

**Action for this project:** treat every Tier-4 generic dataset in §3 as a pipeline smoke test, never as headline evidence. Any claim built on SWaT/SMAP/MSL/PSM/NAB/Yahoo should be labelled as such in the writeup, and cross-checked against at least one Tier 0/1 real-rail or real-mechanical dataset before it goes in a slide.

---

## 3. Public dataset catalogue

Tiered by how close each is to your target domain. Verify licences before any commercial claim — several are non-commercial.

### Tier 0 — Real rail, real operations (highest value; use for fine-tuning rehearsal and domain realism)

**MetroPT-3 / MetroPT** — *the single best public analogue to your problem.*
- Air Production Unit (compressor) of a Metro do Porto train, in revenue service, Feb–Aug 2020.
- 15 sensors: 7 analogue (pressure, motor current, oil temperature, air-intake), 8 digital valve/state signals, 1 Hz, ~1.5 M records, with real failure reports (air leaks, compressor faults).
- Why it matters: real class imbalance, real sensor drift, real operational context — everything a test rig lacks.
- UCI ML Repository dataset #791; described in *Scientific Data* (Nature). Also MetroPT-1/2 variants on Zenodo.

**DR-Train** — *closest public proxy to bogie-mounted sensing on in-service vehicles.*
- Two in-service light rail vehicles (LRV4306, LRV4313) on a 42.2 km network in Pittsburgh; long-term open-access.
- Tri-axial accelerometer on the wheel truck + uni-axial accelerometers in-car (5 channels on LRV4306), GPS position, environmental conditions (temperature, wind, precipitation), **and track maintenance logs** — i.e. weak labels grounded in real maintenance actions.
- Zenodo record 1432702; *Scientific Data* 2019.

**BJTU-RAO Bogie Dataset** — *the highest-value labelled bogie dataset in existence.*
- Subway train bogie transmission test rig at Beijing Jiaotong University; released at the 2024 Global PHM Conference.
- **51 conditions: 1 healthy + 50 fault states.** 24 channels: three-axis vibration, three-phase current, rotational speed, sound intensity. **64 kHz** sampling.
- In-depth tutorial published in IEEE Transactions on Industrial Informatics (DOI 10.1109/TII.2025.3553042).
- ⚠️ **Action item, day one:** access may require a request to the authors or the conference portal. Email immediately — a two-day turnaround kills you otherwise.

### Tier 1 — Rotating machinery (bogie proxy; the bulk of your pretraining corpus)

| Dataset | Component | Signals | Rate | Notes |
|---|---|---|---|---|
| **Paderborn (PU)** | Ball/roller bearings, 32 units | Vibration + motor current | 64 kHz | **Best for domain-shift work** — has both artificially induced *and* naturally worn damage. Use natural-damage subset as your "realistic" target. |
| **CWRU** | Motor bearings | Vibration (drive-end, fan-end) | 12 / 48 kHz | The universal benchmark. Also the most leakage-prone and near-saturated — use for sanity checks and comparability, **never** as your headline result. |
| **XJTU-SY** | Bearings, run-to-failure | Vibration (H/V) | 25.6 kHz | RUL trajectories. |
| **FEMTO-ST / PRONOSTIA** (IEEE PHM 2012) | Bearings, run-to-failure | Vibration + temperature | 25.6 kHz | The RUL benchmark. |
| **NASA IMS** | Bearings, run-to-failure | Vibration | 20 kHz | Long degradation runs. |
| **SEU** | **Bearings *and* gears** | Vibration (8 ch) + torque | 12 kHz | Bogies have gearboxes — include this. |
| **MaFaulDa** (UFRJ) | Rotating machine fault sim | 8 ch (accel, mic, tacho) | 50 kHz | Imbalance, misalignment, bearing faults — good class diversity. |
| **PHM North America 2023 Challenge** | Gearbox, progressive pitting | Tri-axial vibration | — | Healthy + 6 fault severities across varied operating conditions. Severity levels = ordinal labels, rare and useful. |

Consolidated index: the `awesome-bearing-dataset` GitHub collection and `hustcxl/PHM_datasets` both track access URLs and licences.

### Tier 2 — Door / actuator proxies (no good public train-door dataset exists — this is the gap)

**MIMII / MIMII DUE / MIMII DG** — industrial machine sound: valve, pump, fan, **slide rail**, gearbox, with anomalies including *rail damage*, contamination, leakage, rotating unbalance.
- The **slide rail** class is a linear actuator — mechanically the closest public analogue to a sliding door mechanism.
- **MIMII DUE** adds domain shifts from changed operational/environmental conditions; **MIMII DG** is purpose-built for domain generalization with 3 shift scenarios per machine type.
- **This is your dress rehearsal for the whole plan**: pretrain on source domain, fine-tune on shifted target domain with few samples. It simulates exactly what happens when the hackathon data drops.
- Zenodo (MIMII DUE: record 4740355). ⚠️ Check licence per version — some are non-commercial.

**DCASE Task 2 (Unsupervised Anomalous Sound Detection)** — 2020 onward. Steal the *evaluation protocol* and the *first-shot / domain-generalization framing*, not just the data. Public baselines give you a free credibility benchmark.

**ToyADMOS / ToyADMOS2** — miniature machine anomalies with deliberate domain shift. Useful for cheap ablations.

**Synthetic door supplement (recommended):** simulate door motor-current curves — nominal open/close profiles plus injected friction ramps, obstruction spikes, and belt-slip signatures. Cheap, fully controllable, and lets you build and validate the entire door pipeline *before* real door data exists. Label it clearly as synthetic in the writeup; judges respect honest synthetic bootstrapping and punish undisclosed synthetic results.

### Tier 3 — Visual inspection (only if the released fault data includes imagery)

- **RSDDs** (Rail Surface Defect Datasets) — Type-I: 67 images @ 160×1000 from express rail; Type-II: 128 images @ 55×1250 from heavy-haul. Professionally annotated, complex backgrounds, high noise. IEEE DataPort.
- **NEU Surface Defect Database** — 1,800 steel-surface images, 6 defect classes. Standard transfer-learning source for metal defect vision.
- Kaggle railway-track fault-detection sets — variable quality, verify before use.

### Tier 4 — Generic PdM (method rehearsal only — read §2.4 before using any of these for a real claim)

- **NASA C-MAPSS** turbofan — the canonical RUL benchmark and a standard transfer-learning testbed. Not implicated in the §2.4 critique; safe to use.
- **SKAB**, **SWaT/WADI**, **SMD/SMAP/MSL**, **PSM**, **NAB**, **Yahoo** — multivariate/univariate anomaly detection benchmarks. **Named and documented as compromised in §2.4** (trivial anomalies, mislabeled ground truth, unrealistic density, or inflated scoring). Use only to confirm a pipeline runs end-to-end; never as headline evidence, and never alongside a PA-F1 number.

### 3.1 Pretraining corpus design — the signal contract

Heterogeneous sources only fuse if you impose one tensor spec. Define it on hour one and never change it:

```
canonical_window:
  vibration:   resample -> 25_600 Hz, window 1.0 s, hop 0.5 s
  low_rate:    resample -> 1 Hz,      window 600 s,  hop 60 s   # MetroPT-style
  normalize:   per-window robust z-score (median / IQR), per channel
  channels:    variable count -> channel-independent encoding (PatchTST-style)
  covariates:  rpm, load, sensor_position, machine_id, ambient_temp  (nullable)
  label:       {task, class_id | anomaly_flag | rul}, provenance, split_key
```

Channel-independence is the key trick: it lets a 24-channel bogie rig, a 5-channel light-rail vehicle, and a 1-channel bearing rig all train the same encoder without padding hacks.

---

## 4. Modelling plan

### 4.1 The bake-off matrix

Run every family through the same contract, same splits, same metrics, logged to the same MLflow experiment.

**A0. Time series discords (DAMP / MADRID) — build this first, before anything else.**
A twenty-year-old distance-based primitive — the subsequence of a time series maximally far from its nearest neighbor — that recent large-scale evidence puts at or above state-of-the-art for anomaly detection, with properties no deep model matches: zero-to-one parameters (a deep model needs 10+), no training data required, deterministic, concept-drift invariant (newly ingested data is instantly part of the model — there is no retraining pipeline), and effectively-online at up to 300,000 Hz on commodity hardware. **DAMP** (Discord Aware Matrix Profile — Lu, Wu, Mueen, Zuluaga, Keogh, expanded SIGKDD 2022 paper) computes exact streaming discords at that throughput; **MADRID** (Lu, Srinivas, Nakamura, Imamura, Keogh, ICDM 2023) removes the one remaining parameter — subsequence length — by searching all lengths simultaneously as a "hyper-anytime" algorithm that converges to within 10% of the final answer using under 10% of the compute.

This is not a fringe suggestion — it is directly evidenced on your exact problem class. DAMP's own worked example is a 2 hp Reliance Electric motor **fan-end bearing** at 12,000 Hz (the same equipment family as CWRU), where it localizes a brief, visually-invisible load anomaly the paper argues no other published method could process in real time. Unrelated third parties have applied discords to a **city bus fleet's air-pressure system**, finding the discords correspond to physically meaningful events ("drainage of the wet tank") — a close precedent for MetroPT-style APU pressure data. In MADRID's own head-to-head evaluation, OmniAnomaly correctly ranks only 2 of 40 reported anomalies (0 of its own top-3 by confidence) on a benchmark where MADRID finds the true anomaly at every tested window length; Telemanom does better but takes an order of magnitude longer per run.

Practical implications for this project:
- Implement DAMP/MADRID in week zero, on raw data, with **zero labels and zero training**. This is the strongest possible version of the Phase-1 "always have a number on the board" fallback (§7.2) — it can run before a single model has been trained.
- Variants map directly onto requirements this project already has: **X-Lag-Amnesic DAMP** (bounded lookback) handles concept drift across wear-in periods; **Golden DAMP** (score against a curated reference of known-good behavior instead of history) is the cleanest way to encode "normal" for a subsystem with almost no labelled data.
- It is a genuine competitor to, not just a baseline for, the deep-learning bake-off on **T1 unsupervised anomaly detection**. If a transformer or foundation model can't beat it, report that honestly — it costs approximately zero engineering time to try, so there's no excuse not to.
- Reference implementations: Keogh's group publishes code and 100+ third-party application reports directly ([matrixprofile.org materials](https://www.cs.ucr.edu/~eamonn/MatrixProfile.html)); the open-source **STUMPY** Python library (`pip install stumpy`) implements the underlying Matrix Profile primitives and is the fastest path to a working version.

**A1. Classical baselines — mandatory, non-negotiable.**
Feature extraction (`tsfresh`, `catch22`, spectral kurtosis, envelope analysis, order tracking) + gradient-boosted trees; plus a simple forecast-residual z-score. These frequently beat deep models on small tabular-ish fault data, they run in milliseconds, and — critically — they are your credibility anchor. A team that shows "the transformer beat a *properly tuned* baseline" is believed. A team that skips baselines is not.

Envelope analysis deserves special mention for bogies: bearing fault frequencies (BPFO/BPFI/BSF) are physically derivable from geometry and speed. A physics-informed feature beats a learned one on small data almost every time.

**B. CNN family.**
- **WDCNN** (wide first-layer 1D CNN) — the de-facto standard for raw vibration; wide first kernel acts as a learned band-pass and suppresses high-frequency noise.
- **InceptionTime / ResNet-1D** — strong general time-series classifiers.
- **2D CNN on spectrograms** (log-mel / STFT / CWT scalogram) — unlocks ImageNet-pretrained backbones, which is a legitimate second transfer-learning route and very cheap to try.

**C. CNN-LSTM hybrid** (you asked for this — here's where it genuinely earns its place).
CNN encoder for local waveform morphology → LSTM/GRU for slow degradation trend. Best fit for:
- **Door cycles** — each open/close is a variable-length sequence with meaningful order; the LSTM models cycle-to-cycle drift.
- **RUL** — degradation is inherently sequential.
It is generally *worse* than patch transformers on long windows and it trains slower. Include it, report it fairly, and let the ablation speak.

**D. Transformers.**
- **PatchTST** — patching + channel independence. Best cost/benefit of the specialist transformers and it aligns naturally with your signal contract. **Make this your primary transformer.**
- **TimesNet** — 2D periodicity modelling; strong on some anomaly benchmarks, mid-pack on others.
- **Autoformer / FEDformer** — series decomposition; useful when trend/seasonality is explicit.
- **Anomaly Transformer / DCdetector** — association-discrepancy anomaly detectors. Performance is dataset-dependent and inconsistent across benchmarks; treat as challengers, not defaults.

Benchmark reality check to keep you honest: **no single inductive bias dominates.** Published comparisons show TimesNet winning on one dataset and landing bottom-half on others; Anomaly Transformer strong on some, trailing on others. Expect to need per-subsystem model selection, and say so — that's a finding, not a failure.

**E. Time-series foundation models — your transfer-learning shortcut.**

| Model | Type | Pretraining scale | Best for |
|---|---|---|---|
| **MOMENT** | Masked encoder | "Time-Series Pile" | **Anomaly detection, classification, representation** — start here |
| **Chronos / Chronos-Bolt** | Tokenized, probabilistic | Large public corpora | Forecast-residual anomaly detection |
| **MOIRAI** | Any-variate transformer | LOTSA, >27 B observations | Cross-frequency, variable-channel forecasting |
| **TimesFM** | Decoder-only | ~10¹¹ time points | Strong zero-shot forecasting |
| **Time-MoE / TSPulse** | MoE / lightweight | — | Efficiency-oriented challengers |

Evidence-based selection rule: **decoder-only and encoder-decoder models outperform on forecasting; encoder models suit tasks requiring general time-series understanding such as anomaly detection.** So: **MOMENT for T1/T2, Chronos or TimesFM for forecast-residual framing.**

Caveat to state openly: foundation-model advantage on *industrial vibration at kHz rates* is unproven — most pretraining corpora are low-frequency business/energy/traffic series. Testing this honestly is itself a publishable-grade finding, and it makes a great slide either way.

### 4.2 The transfer-learning ladder

```
Stage 0  Self-supervised pretraining  (no labels needed)
         Masked-patch reconstruction (MAE-style) over the full Tier-1 + Tier-0 corpus.
         Multi-scale masking: zero the vibration amplitude at masked timesteps so the
         model learns intrinsic multi-scale and periodic structure.
         Output: domain-adapted encoder checkpoint.

Stage 1  Supervised proxy pretraining  (public labels)
         BJTU-RAO 51-class head + Paderborn + SEU. Multi-task: fault-type head,
         severity head, machine-ID head (the last as an adversarial/gradient-reversal
         branch to *discourage* machine-specific shortcuts).

Stage 2  Domain adaptation to target conditions
         Cheapest big win first: BatchNorm statistic recalibration on target-domain
         unlabelled data. Then CORAL / MMD alignment. Then DANN if time permits.

Stage 3  Parameter-efficient fine-tune on hackathon fault data
         Ladder, cheapest to most expensive:
           linear probe -> BitFit -> LoRA (r=4..16) -> last-block FT -> full FT
         With <100 labelled faults, LoRA/linear probe usually beats full fine-tuning.
         This also produces the per-car adapters used in the deployment design (§6).

Stage 4  Calibration & thresholding
         Temperature scaling / isotonic calibration, then choose the operating point
         from the cost curve (§2.3), not from max-F1.
```

### 4.3 Ablations that win the judging

1. **Few-shot curve** — performance vs N ∈ {0, 5, 20, 100, all} labelled faults per class, for {scratch, ImageNet-spectrogram, self-supervised-pretrained, foundation-model}. **This is the headline chart.** It converts "we did transfer learning" into "transfer learning saves you 10× the labelling effort."
2. **Cross-machine generalization** — train on source machines, test on a *held-out machine*. Never report same-machine random splits as generalization.
3. **Sensor-dropout robustness** — accuracy when 1–3 channels fail. Sensors *do* fail on trains; showing graceful degradation is an operations-credibility win.
4. **Efficiency Pareto** — accuracy vs parameters vs latency on the actual target hardware. Feeds directly into §6.
5. **Pretraining-corpus ablation** — does adding MetroPT/DR-Train (real, in-service) to a test-rig-only corpus improve target performance? Tests the "real data beats clean data" hypothesis.

### 4.4 Leakage — the failure mode most likely to silently ruin your results

- **Never** random-split overlapping windows. Adjacent windows share samples; random splits inflate everything and the model is memorising, not learning.
- Split by **asset** (machine/vehicle ID) *and* by **time** (train on earlier period, test on later). Group-aware splitting only.
- Keep a **frozen holdout** touched exactly once, at the end. Report it separately from your dev results.
- Beware operating-condition confounds: if all fault data was collected at one speed, your model learns *speed*, not *fault*. Stratify and report per-condition.

---

## 5. MLflow experiment design

### 5.1 Setup

Hackathon-fast (single machine):
```bash
mlflow server --backend-store-uri sqlite:///mlflow.db \
              --artifacts-destination ./mlartifacts \
              --host 0.0.0.0 --port 5000
```

Team-scale: remote tracking server with **PostgreSQL** backend store and **S3/MinIO** artifact store. Do this if more than two people are logging runs — SQLite will lock up under concurrent writes and cost you an hour at the worst moment.

### 5.2 Structure

- **One experiment per task**: `fault-clf`, `anomaly-det`, `rul`, `door`, `bogie`.
- **Tags on every run** (this is what makes the comparison queryable):
  `backbone`, `pretrain_stage` (0–4), `source_dataset`, `target_dataset`, `n_shot`, `adaptation` (none/coral/dann/bn), `peft` (none/lora/bitfit), `seed`, `git_sha`.
- **Nested runs** for sweeps: parent = sweep, children = trials. Keeps the UI readable.
- **`mlflow.log_input()`** with dataset objects — gives you data lineage for free, and "which data version produced this number" is exactly the question a judge asks.
- **Autologging** for PyTorch Lightning; log the **ONNX artifact + model signature + input example** on every registered model so deployment is a single call.
- **`mlflow.system_metrics`** enabled — latency, memory, GPU util land in the same table as accuracy, which makes the efficiency Pareto (§4.3) a query rather than a spreadsheet.
- **Registry aliases** per subsystem: `models:/bogie-detector@champion`, `models:/door-detector@challenger`. Deployment code references the alias, never a hard-coded version.
- **Three seeds minimum** for any headline claim. Report mean ± std. Single-seed deep-learning claims are not evidence.

### 5.3 Reproducibility checklist

Log: git SHA (dirty flag included), full config YAML as an artifact, dataset hash, package versions, random seeds, and hardware. Show the MLflow UI during the demo — visible experiment discipline reads as engineering maturity and costs you nothing.

---

## 6. Deployment architecture — the per-car container question

You proposed: **one model container per train car.** Here is the honest analysis, then the recommendation.

### 6.1 The arithmetic

- Typical metro trainset: 6–8 cars. 100 trainsets = 600–800 cars. A national/regional operator at 500 trainsets = **3,000–4,000 cars**.
- Kubernetes recommends **~110 pods per node** (managed services typically cap at 250). 4,000 pods ≈ **36–40 nodes for pod slots alone**, before a single model weight is loaded.
- **Pod infrastructure overhead is charged whether you use it or not.** Kubernetes reserves memory as a function of pod count — e.g. on an m5.large with 110 pods, roughly `255 MiB + 11 MiB × 110 ≈ 1.5 GiB` reserved just for overhead.
- A Python inference process (interpreter + torch or ONNX Runtime + framework) typically sits at **~150–400 MB RSS** even when the model itself is 5 MB. **The model is ~1–3% of the footprint.** You would be paying roughly 97–99% overhead, 4,000 times over.
- Operationally: 4,000 images to build, scan, patch and roll; 4,000 log streams; 4,000 metric series; a CVE in your base image is a 4,000-unit fleet-wide rollout.

**Rough cost sketch** (estimate, not a quote): per-car containers at a conservative 0.25 vCPU / 512 MB request × 4,000 ≈ **1,000 vCPU + 2 TB RAM** — order-of-magnitude ~50 × m5.2xlarge-class instances, plausibly **$10–20k/month** on-demand. A shared multi-tenant service handling the same fleet runs on 2–4 replicas: **single-digit hundreds of dollars/month.** Call it a **~50–100× delta** and validate with your own instance pricing before presenting.

### 6.2 The prior question: where does the container actually run?

The two answers diverge completely:

**(a) Onboard / edge — container runs on the train.**
Then "one container per car" is close to meaningless as a scaling unit. You don't get one node per car; you get **one EN 50155-certified train computer per trainset** (fanless, wide temperature range, shock- and vibration-rated), possibly one gateway per car. EN 50155 governs onboard electronics — temperature classes, EMC immunity, shock/vibration for continuous motion — and those units are *modest* compute, not cloud nodes.

Onboard you want **fewer processes, not more**: one inference process reading all car channels. If you want Kubernetes semantics per trainset, **K3s** is the right tool (single binary <100 MB, runs in as little as 512 MB RAM, the de-facto edge Kubernetes). But be honest about whether you need it — plain `systemd` + Docker Compose is often sufficient and dramatically more debuggable at 3 a.m. in a depot with no connectivity.

**(b) Cloud / off-board — telemetry streams to a central platform.**
This is the industry pattern (Alstom HealthHub, Siemens Railigent X). Here, per-car containers are strictly dominated by a shared multi-tenant server. There is no isolation benefit that justifies the multiplier.

### 6.3 Recommendation — model-per-car as a *logical* concept, not a *physical* container

Three layers, in order of how much of the problem each solves:

**Layer 1 — Shared base encoder with per-car conditioning.**
One model. Car identity enters as a learned embedding or FiLM conditioning vector, plus per-car normalisation statistics. This is not a compromise — it is **more accurate** than per-car models, because cars share physics. Training 4,000 separate models means each one re-learns the same bearing dynamics from 1/4000th of the data. Conditioning gives per-car behaviour *and* pooled statistical strength.

**Layer 2 — Per-car LoRA adapters, only where a car genuinely deviates.**
Base frozen, adapter is KB-scale. Storage becomes `base + N × adapter` where `adapter ≪ base`. Reported results for multi-tenant adapter serving: **EdgeLoRA** achieves up to **~4× throughput** and serves **orders of magnitude more adapters** concurrently than per-model instances on edge devices; production LoRA serving systems report up to **2× higher throughput, up to 9× lower first-token latency, and ~50% fewer GPUs** under the same SLOs. (These figures come from LLM serving — your time-series models are far smaller, so absolute numbers differ, but the *architectural* conclusion transfers directly and the memory argument gets stronger, not weaker.)

**Layer 3 — Per-car *state*, not per-car model.**
This is the insight that dissolves most of the original requirement. Most of what people want from "a model per car" is actually **per-car state**: running baselines, drift statistics, calibrated thresholds, health history, maintenance context. That is a **row keyed by car ID in a feature store or database** — not a container. It updates in milliseconds, needs no deployment, and survives model upgrades.

**A fourth option, worth naming explicitly: some subsystems may need no model file at all.** If the discord-based detector from §4.1 (A0) matches or beats a learned model for a given subsystem — plausible, given the evidence there — "deployment" for that subsystem is a few hundred lines of streaming code and, at most, a small curated reference window (a Golden Batch), not a trained artifact requiring versioning, a training pipeline, or an MLflow registry lifecycle at all. This is the strongest version of the "don't build 4,000 containers" argument: the cheapest model to deploy per car is the one that was never trained in the first place.

### 6.4 Serving mechanics

- **Export to ONNX.** Run **ONNX Runtime** — portable across CPU / ARM / GPU via execution providers (CUDA, TensorRT, OpenVINO, CoreML, QNN). This is the right default for onboard, where hardware is heterogeneous and ARM is common.
- **Use Triton only if you need what it provides**: dynamic batching, model ensembles, multi-framework serving, GPU concurrency. Note that Triton's model repository **already gives you N models in one process** — which is the multi-tenant pattern implemented properly. If you like the per-car-model concept, Triton's model repository is how you express it *without* N containers.
- **TensorRT** where NVIDIA GPUs are fixed (lower memory footprint, higher throughput than ORT) — but it locks you to NVIDIA, which is a poor fit for mixed rolling-stock fleets.
- **Quantize to INT8** for onboard. Small time-series models run in microseconds to low milliseconds; a single core comfortably handles an entire trainset's channels.
- **Reduce data at the edge.** Process high-rate vibration onboard; transmit features, health scores, event flags and exception reports — not raw waveforms. This mirrors the deployed industry pattern: summarised health scores uploaded during scheduled communication windows (depot arrival, lineside gateway). Streaming raw kHz vibration off a moving train over cellular is not economically viable.

### 6.5 When per-car containers *are* the right call

Be fair to the original idea — there are real cases:
- **Hard blast-radius isolation** is a stated requirement (one car's model crashing must provably not affect others).
- **Regulatory per-asset attestation** — each car's model version must be independently auditable and certifiable.
- **Genuinely heterogeneous model types per car** — different sensor suites or vehicle generations requiring different architectures, not just different weights.

Even then: prefer **per-trainset** containers over per-car. That is 500 containers instead of 4,000, and it matches the physical compute topology.

### 6.6 The demo that makes this land

Build a **fleet-scale simulation**: one shared base model serving 200 simulated car adapters from a single container, benchmarked head-to-head against 200 separate containers. Report memory, p50/p99 latency, cold-start time, and projected monthly cost.

This is a strong hackathon slide precisely because it shows you *engaged with* the naive architecture rather than ignoring it, measured it, and improved on it with numbers.

---

## 7. Execution plan

### 7.1 Pre-hackathon (do now — check the rules first on pre-existing code)

| # | Task | Why it's urgent |
|---|---|---|
| 1 | **Email for BJTU-RAO access** | Highest-value dataset, slowest to obtain. Blocking if delayed. |
| 2 | Download & checksum Tier 0–1 datasets | Bandwidth at the venue is always worse than you expect. |
| 3 | Build the signal-contract loader (§3.1) + one adapter per dataset | The contract is the whole project's spine. |
| 4 | Stand up MLflow, verify logging end-to-end | Debugging tracking at hour 20 is a disaster. |
| 5 | Run Stage-0 self-supervised pretraining | Needs wall-clock GPU hours you won't have during the event. **Arrive with a pretrained encoder.** |
| 6 | Verify licences for every dataset used | A licence problem discovered at judging is fatal. |
| 7 | Build the synthetic door generator | Lets the door pipeline exist before door data does. |

### 7.2 During (48-hour shape — compress proportionally if shorter)

| Phase | Hours | Goal | Exit criterion |
|---|---|---|---|
| **0 · Scaffold** | 0–2 | Repo, MLflow, data contract, CI-lite smoke test | A dummy run appears in MLflow |
| **1 · Baselines** | 2–8 | Classical features + GBM + envelope analysis on every available subsystem | **A number on the board.** Never be in a state with no working model. |
| **2 · Bake-off** | 8–20 | CNN / CNN-LSTM / PatchTST / MOMENT under identical splits | A comparison table with ≥3 seeds per config |
| **3 · Fine-tune** | 20–30 | Hackathon data drops → run the ladder (§4.2), all PEFT rungs | Few-shot curve exists |
| **4 · Deploy** | 30–40 | ONNX export, adapter serving, fleet-scale simulation (§6.6) | Live inference on replayed data |
| **5 · Ablate & build** | 40–46 | Cross-machine, sensor-dropout, efficiency Pareto; demo + slides | Frozen holdout evaluated **once** |
| **6 · Rehearse** | 46–48 | Run the demo three times end-to-end. Fix nothing new. | Timed, working, offline-capable demo |

**Hard rule:** feature freeze at hour 40. Every hackathon loss is a team that was still training a model when the judges walked up.

### 7.3 Roles (4-person team)

- **Data** — loaders, contract compliance, splits, leakage audit, licence tracking.
- **Models** — bake-off, pretraining, PEFT ladder, ablations.
- **Platform** — MLflow, ONNX export, containers, fleet simulation, benchmarks.
- **Story** — evaluation protocol, cost model, slides, demo script, writeup. *Assign this from hour zero; it is not a last-hour job.*

---

## 8. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Hackathon fault data arrives late or with an unexpected schema | High | High | Schema-adapter layer behind the signal contract. MetroPT stands in as the target with an identical loader interface, so nothing downstream changes. |
| Severe class imbalance (reported ratios around 7.3:1 normal:fault for metro doors — often far worse) | High | High | T1 unsupervised framing needs no fault labels at all. Add AUPRC/VUS-PR, cost-weighted loss, focal loss, and stratified group splits. |
| BJTU-RAO access denied or delayed | Medium | Medium | Paderborn (natural damage) + SEU (gearbox) substitute as the bogie proxy corpus. |
| Transformers overfit tiny fine-tuning sets | High | Medium | PEFT over full FT; strong augmentation (time warp, jitter, channel masking, spectrogram mixup); early stopping on a grouped validation split. |
| Foundation models underperform on kHz vibration | Medium | Low | This is a *finding*, not a failure — report it. Baselines and PatchTST are already in the matrix. |
| Data leakage inflates dev metrics | High | **Critical** | Group-by-asset + temporal splits, enforced in the loader (not by convention). Frozen holdout touched once. |
| PA-F1 reported by mistake | Medium | High | Ban it in the eval module. Ship VUS-PR/AUPRC + affiliation-F1 + lead time from hour one. |
| Non-commercial licences (parts of MIMII, others) | Medium | Medium | Licence column in the dataset registry; check before any commercial claim in the pitch. |
| Demo depends on venue network | Medium | High | Everything runs offline. Pre-record a fallback video. |

---

## 9. Deliverables

1. **Architecture diagram** — one page, data flow from onboard sensor to maintenance work order.
2. **Few-shot transfer curve** — the headline result (§4.3.1).
3. **Model comparison table** — every family, identical protocol, mean ± std over seeds.
4. **Cost & scale table** — per-car containers vs shared-base + adapters, measured not asserted (§6.6).
5. **Live demo** — replay a real fault; show detection with lead time and a per-car health view.
6. **MLflow UI walkthrough** — evidence of experimental discipline.
7. **Honest limitations slide** — what you didn't test, where it would fail, what data you'd need next. This wins more points than an extra 2% accuracy.

---

## 10. Repository skeleton

```
train-fault-detection/
├── conf/                  # hydra configs: data, model, train, deploy
├── data/
│   ├── contract.py        # canonical window spec (§3.1) — the spine
│   ├── adapters/          # one per source: metropt, drtrain, bjtu, pu, cwru, mimii...
│   ├── splits.py          # group-by-asset + temporal. leakage guards live here.
│   └── registry.yaml      # name, url, licence, checksum, commercial_ok
├── models/
│   ├── baselines/         # tsfresh+GBM, matrix profile, envelope analysis
│   ├── cnn/               # wdcnn, inceptiontime, resnet1d, spectrogram2d
│   ├── hybrid/            # cnn_lstm
│   ├── transformer/       # patchtst, timesnet, anomaly_transformer
│   ├── foundation/        # moment, chronos, moirai wrappers
│   └── peft/              # lora, bitfit, linear_probe, adapters
├── train/
│   ├── pretrain_ssl.py    # Stage 0 — masked reconstruction
│   ├── pretrain_sup.py    # Stage 1 — proxy fault labels
│   ├── adapt.py           # Stage 2 — bn-recal / coral / dann
│   └── finetune.py        # Stage 3 — PEFT ladder
├── eval/
│   ├── metrics.py         # VUS-PR, AUPRC, affiliation-F1, lead time. NO PA-F1.
│   ├── cost_curve.py      # threshold selection by operating cost
│   └── ablations.py       # few-shot curve, cross-machine, sensor dropout
├── serve/
│   ├── export_onnx.py
│   ├── adapter_router.py  # car_id -> adapter + per-car state
│   ├── fleet_sim.py       # §6.6 benchmark: shared-base vs container-per-car
│   └── docker/
└── mlruns/
```

**Day-one commands**

```bash
mlflow server --backend-store-uri sqlite:///mlflow.db --port 5000
python -m data.fetch --tier 0,1              # download + checksum
python -m train.pretrain_ssl  +experiment=ssl_v1
python -m train.pretrain_sup  +ckpt=ssl_v1 +data=bjtu
python -m train.finetune      +ckpt=sup_v1 +peft=lora +n_shot=20
python -m eval.ablations      +sweep=few_shot_curve
python -m serve.fleet_sim     --cars 200 --mode {shared,per_car}
```

---

## 11. Sources

**Datasets**
- [MetroPT-3 — UCI ML Repository](https://archive.ics.uci.edu/dataset/791/metropt+3+dataset) · [The MetroPT dataset for predictive maintenance — *Scientific Data*](https://www.nature.com/articles/s41597-022-01877-3)
- [DR-Train — Zenodo](https://zenodo.org/records/1432702) · [Dynamic responses, GPS positions and environmental conditions of two light rail vehicles in Pittsburgh — *Scientific Data*](https://www.nature.com/articles/s41597-019-0148-9) · [Using In-Service Train Vibration for Detecting Railway Maintenance Needs](https://arxiv.org/pdf/2405.09560)
- [An In-Depth Tutorial on BJTU-RAO Bogie Datasets for Fault Diagnosis — IEEE Xplore](https://ieeexplore.ieee.org/document/10933494/) · [Introduction to BJTU-RAO Bogie Datasets (PDF)](https://www.researchgate.net/profile/Biao-Wang-27/publication/385618713_Introduction_to_BJTU-RAO_Bogie_Datasets)
- [awesome-bearing-dataset (CWRU, Paderborn, XJTU-SY, FEMTO, IMS, SEU, KAIST)](https://github.com/VictorBauler/awesome-bearing-dataset) · [PHM_datasets](https://github.com/hustcxl/PHM_datasets)
- [PHM North America 2023 Conference Data Challenge](https://data.phmsociety.org/phm2023-conference-data-challenge/)
- [MIMII Dataset](https://arxiv.org/abs/1909.09347) · [MIMII DUE — Zenodo](https://zenodo.org/records/4740355) · [MIMII DG](https://arxiv.org/pdf/2205.13879)
- [RSDDs — IEEE DataPort](https://ieee-dataport.org/documents/rsdds) · [rsdds GitHub](https://github.com/neu-rail-rsdds/rsdds) · [FS-RSDD: Few-Shot Rail Surface Defect Detection](https://pmc.ncbi.nlm.nih.gov/articles/PMC10536558/)
- [Overview of publicly available degradation datasets for PHM](https://arxiv.org/html/2403.13694v2)

**Rail fault detection & doors**
- [Subway door fault prediction employing stacking ensemble learning — *Scientific Reports*](https://www.nature.com/articles/s41598-026-43371-5)
- [Research on Subhealth Diagnosis Method for Resistance of Urban Rail Transit Door System](https://link.springer.com/article/10.1007/s40864-020-00133-4)
- [Fault Diagnosis of High-Speed Train Bogie Based on Synchrony Group Convolutions](https://onlinelibrary.wiley.com/doi/10.1155/2019/7230194)
- [Data-driven fault diagnosis of bogie suspension components — PHM Society](https://papers.phmsociety.org/index.php/phme/article/download/1211/phmec_20_1211)
- [Towards a Universal Vibration Analysis Dataset: A Framework for Transfer Learning](https://arxiv.org/pdf/2504.11581)

**Time series discords**
- [Lu, Wu, Mueen, Zuluaga, Keogh — DAMP: Scaling Time Series Anomaly Detection to Trillions of Datapoints (expanded SIGKDD 2022 paper)](https://www.cs.ucr.edu/~eamonn/DAMP_long_version.pdf)
- [Lu, Srinivas, Nakamura, Imamura, Keogh — MADRID: A Hyper-Anytime and Parameter-Free Algorithm to Find Time Series Anomalies of all Lengths (ICDM 2023)](https://www.dropbox.com/scl/fi/hd9gt0xs8v8mrsx3upwd3/ICDM23_Madrid_023.pdf?rlkey=s5s95y2eeyk159lx69qn1469e&dl=0)
- [Wu & Keogh — Current Time Series Anomaly Detection Benchmarks are Flawed and are Creating the Illusion of Progress, IEEE TKDE 35(3), 2023](https://arxiv.org/abs/2009.13807)
- [Keogh — "Problems with Time Series Anomaly Detection" (dataset-by-dataset teardown)](https://www.dropbox.com/scl/fi/cwduv5idkwx9ci328nfpy/Problems-with-Time-Series-Anomaly-Detection.pdf?rlkey=d9mnqw4tuayyjsplu0u1t7ugg&dl=0)
- [Keogh — Matrix Profile page (reference implementations + 100+ third-party application reports)](https://www.cs.ucr.edu/~eamonn/MatrixProfile.html)

**Models & transfer learning**
- [Challenges and Requirements for Benchmarking Time Series Foundation Models](https://arxiv.org/html/2510.13654v2)
- [Time Series Foundational Models: Their Role in Anomaly Detection and Prediction](https://arxiv.org/pdf/2412.19286)
- [When Foundation Models are One-Liners: Limitations for Time Series Anomaly Detection](https://openreview.net/forum?id=H27kvyG4qf)
- [Benchmarking Inductive Biases for Multivariate Time-Series Anomaly Detection](https://arxiv.org/pdf/2605.28103)
- [A New Perspective on Time Series Anomaly Detection](https://arxiv.org/pdf/2412.05498)
- [A Comprehensive Forecasting-Based Framework for Time Series Anomaly Detection (NAB)](https://arxiv.org/html/2510.11141v1)
- [Masked autoencoders-based fault diagnosis pretraining with meta fine-tuning](https://www.sciencedirect.com/science/article/abs/pii/S0950705126005976)
- [A Novel Multi-Task Self-Supervised Transfer Learning Framework for Cross-Machine Rolling Bearing Fault Diagnosis](https://doi.org/10.3390/electronics13234622)
- [Multi-Modal Self-Supervised Learning for Cross-Domain One-Shot Bearing Fault Diagnosis](https://www.sciencedirect.com/science/article/pii/S2405896324003938)

**MLOps & deployment**
- [MLflow Experiment Tracking](https://mlflow.org/docs/latest/ml/tracking/) · [MLflow Model Registry](https://mlflow.org/docs/latest/ml/model-registry/)
- [EdgeLoRA: An Efficient Multi-Tenant LLM Serving System on Edge Devices](https://arxiv.org/abs/2507.01438)
- [Serving Heterogeneous LoRA Adapters in Distributed LLM Inference Systems](https://arxiv.org/pdf/2511.22880)
- [Efficient and cost-effective multi-tenant LoRA serving](https://aihub.hkuspace.hku.hk/2024/05/21/efficient-and-cost-effective-multi-tenant-lora-serving-with-amazon-sagemaker/)
- [Kubernetes: Resource Management for Pods and Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/) · [Pod Overhead](https://www.kubernetes.io/docs/concepts/scheduling-eviction/pod-overhead/) · [Allocatable memory and CPU in Kubernetes Nodes](https://learnkube.com/allocatable-resources) · [How Many Pods Can Run on a Node?](https://www.plural.sh/blog/how-many-pods-per-node/)
- [How to Configure K3s for Edge Deployment](https://oneuptime.com/blog/post/2026-01-27-k3s-edge-deployment/view) · [Choose a Kubernetes at the Edge Compute Option — Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/operator-guides/aks/choose-kubernetes-edge-compute-option)
- [EN 50155 railway compliance standard](https://www.neousys-tech.com/edge-ai-computing/knowledge/what-is-en50155-railway-compliance-standard.html) · [EN 50155 — Wikipedia](https://en.wikipedia.org/wiki/EN_50155)
- [ONNX Runtime Backend — NVIDIA Triton](https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/onnxruntime_backend/README.html) · [TensorRT vs ONNX Runtime vs Triton](https://whatap.io/en/blog/ai-inference-optimization-tensorrt-onnx-runtime-triton)
- [Alstom digital railway solutions](https://www.alstom.com/solutions/services/digital-railway-solutions-unlock-higher-asset-availability-reliability-and-performance) · [Edge solutions in rail transportation — Red Hat](https://www.redhat.com/en/blog/edge-solutions-rail-transportation-deliver-efficiencies-security-and-flexibility-open-source-solutions) · [Predictive Maintenance for Railways: Edge AI Sensors](https://delphisonic.com/predictive-maintenance-for-railways/)
