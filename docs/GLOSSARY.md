# Glossary

Every term used across the project docs, in plain language. Grouped by where it sits in the pipeline, not alphabetically.

---

## 1. Physical — what's actually on the train

| Term | Plain meaning |
|---|---|
| **Bogie** | The wheeled truck under a train car. Holds wheels, axles, suspension, motor, gearbox. |
| **Axle box** | Housing at the end of an axle containing the bearing that lets the wheel spin. Common failure point. |
| **Traction motor** | The electric motor that drives the wheels. |
| **Gearbox** | Reduces motor speed to wheel speed. BJTU's has a 16-tooth driving gear and 107-tooth driven gear. |
| **APU** (Air Production Unit) | The compressor system making compressed air for brakes and doors. MetroPT monitors one. |
| **Trainset / consist** | A complete train — typically 6–8 cars coupled together. |
| **Revenue service** | The train is carrying passengers, not on a test track. Data from revenue service is messier and more valuable. |
| **Depot** | Where trains are maintained. Also where onboard data typically gets uploaded. |
| **Track possession** | A booked window where maintenance crews take control of a section of track. A scheduling resource. |
| **Wheel flat** | A flat spot worn onto a wheel, usually from sliding under braking. Causes a characteristic impact per revolution. |

## 2. Sensors

| Term | Plain meaning |
|---|---|
| **Accelerometer** | Measures vibration, in **g**. Tri-axial = measures in 3 directions at once (so 3 channels). |
| **Flowmeter** | Measures air or fluid flow through a pipe. A leak shows as flow that doesn't stop when it should. MetroPT-3 lacks one — which broke the published autoencoder approach. |
| **Pressure sensor** | Air pressure, in **bar**. MetroPT's TP2, TP3, DV_pressure, Reservoirs. |
| **Motor current** | Amps drawn by the motor. Proxy for effort — a jammed door draws more. |
| **Tachometer** | Rotational speed. Needed to interpret everything else, since fault frequencies scale with speed. |
| **Microphone / sound intensity** | Acoustic, in **Pa**. BJTU has two, next to each axle box. |
| **Analogue channel** | Continuous reading (8.3 bar, 4.2 A). |
| **Digital channel** | On/off state flag (valve open/closed = 1/0). MetroPT has 8. |

## 3. Signal processing

| Term | Plain meaning |
|---|---|
| **Sampling rate** | Measurements per second, in Hz. MetroPT = 1 Hz. BJTU-RAO = 64,000 Hz. |
| **Nyquist limit** | You can only see frequencies up to **half** your sampling rate. 64 kHz → see up to 32 kHz. 1 Hz → see up to 0.5 Hz. The single most important constraint in the dataset plan. |
| **Decimation / downsampling** | Throwing away samples to reduce the rate. BJTU 64 kHz → 16 kHz is a 4× volume cut that keeps all the fault physics. |
| **Window** | A short slice of signal treated as one unit, e.g. 1 second. Models see windows, not whole recordings. |
| **Stride / hop** | How far you slide before cutting the next window. Stride < window length = overlapping windows. |
| **Z-normalization** | Subtract the mean, divide by standard deviation, so signals of different scales become comparable. |
| **Robust z-score** | Same idea but using median and IQR instead of mean and std — less thrown off by spikes. |
| **Fault characteristic frequency** | The rate at which a specific defect produces impacts. Computable from bearing geometry alone. |
| **BPFO / BPFI / BSF / FTF** | Ball Pass Frequency Outer race / Inner race, Ball Spin Frequency, Fundamental Train Frequency (cage). The four bearing fault frequencies. BJTU publishes all of them. |
| **Gear mesh frequency** | Teeth × shaft speed. BJTU at 60 Hz: 16 × 60 = 960 Hz. |
| **Resonance band** | A bearing impact rings the surrounding metal at its natural frequency, typically 2–20 kHz. This is *why* rigs sample at 64 kHz even though the fault frequency is under 1 kHz. |
| **Envelope analysis** | Isolate the high-frequency ringing band, then demodulate it to recover the low-frequency impact rate. The standard physics-based bearing method. |
| **Spectrogram / STFT / CWT** | Turning a 1-D signal into a 2-D time-vs-frequency image, so you can feed it to an image model. |
| **Spectral kurtosis** | A statistic that finds which frequency band carries the most impulsive (impact-like) energy. |
| **Order tracking** | Re-sampling signal against shaft angle instead of time, so varying speed doesn't smear the frequencies. |

## 4. Data concepts

| Term | Plain meaning |
|---|---|
| **Labeled / unlabeled** | Whether each row is tagged with what was happening. MetroPT-3 is **unlabeled** — you get 4 failure date ranges separately and build labels yourself. |
| **Weak labels** | Approximate or indirect labels. DR-Train's maintenance logs — you know work happened, not exactly what failed when. |
| **Ground truth** | The "correct answer" you score against. Often less trustworthy than assumed — see PA-F1. |
| **Class imbalance** | Far more normal data than fault data. Metro door faults reportedly ~7.3:1. MetroPT is far worse. |
| **Failure window** | A start–end time range where a failure occurred. Not a per-row label. |
| **Run-to-failure** | A recording that runs from healthy until the component actually breaks. Needed for RUL. |
| **Seeded / artificial fault** | A defect deliberately induced on a rig. Signature differs from naturally-worn damage. BJTU is all seeded. |
| **Natural damage** | Faults that developed through real use. Paderborn has both — which is why it's the best domain-shift set. |
| **Domain gap / domain shift** | Train and test data differ systematically — different machine, speed, sensor placement, or scale. |
| **Concept drift** | The data's normal behaviour changes over time. Discords are immune; trained models go stale. |
| **Leakage** | Test information sneaking into training, inflating results. Randomly splitting overlapping windows is the classic version. |
| **Group-aware split** | Splitting by asset/machine/recording, never by individual window. |
| **Temporal split** | Train on the earlier period, test on the later. Mimics reality. |
| **Frozen holdout** | Data you touch exactly once, at the end. |
| **Working condition** | A fixed combination of speed and load. BJTU has 9 (3 speeds × 3 lateral loads). |
| **Compositional label** | A label built from parts. BJTU's `M1_G0_LA1_RA0` = motor short circuit + gearbox normal + left axle inner race fault + right axle normal. |

## 5. Project-specific terms

| Term | Plain meaning |
|---|---|
| **Signal Contract** | Our canonical data format — fixed rate, window length, normalization, channel-independent. Everything conforms to it, so the rest of the pipeline never changes. |
| **Adapter** | Small per-dataset loader that converts raw files into the Signal Contract. The only thing rewritten on hackathon day. |
| **Auto-profiler** | Script that points at any CSV and reports rate, channels, gaps, periodicity, and existing alarm columns. |
| **Channel independence** | Encoder processes one channel at a time rather than all together. Makes a checkpoint work on any channel count — the decision that makes pretraining portable. |
| **Golden Batch** | A curated reference recording of all known-good behaviour. Used by Golden DAMP instead of history. |

## 6. Model architecture

| Term | Plain meaning |
|---|---|
| **Encoder** | The big reusable stack of layers that turns a raw window into a compact vector. Learns "what machine signals look like." |
| **Head** | Small task-specific layers on top of the encoder. Disposable — you throw it away when moving to new data. |
| **Embedding** | The encoder's output. A compact vector, e.g. 128 numbers, summarizing a window. |
| **Layer** | One transformation step inside a network. An encoder is a stack of them. |
| **Backbone** | Another word for encoder — the main body of the model. |
| **Conv block** | Convolution layer group. Slides a filter over the signal to detect local patterns. |
| **Transformer block** | Attention-based layer group. Relates every part of a window to every other part. |
| **Patching** | Chopping a window into small chunks and treating each chunk as a token. What PatchTST does. |
| **Attention** | Mechanism letting a model weigh which parts of the input matter for each output. |
| **Autoencoder** | Network trained to reconstruct its own input. Feed it something unusual, reconstruction fails, error spikes = anomaly. |
| **Reconstruction error** | How badly the autoencoder rebuilt the input. Used as the anomaly score. |
| **Deep SVDD / one-class** | Trained on normal data only; learns a boundary around "normal" and flags anything outside. |
| **Multi-task heads** | Several small heads on one shared encoder. BJTU gets four — motor, gearbox, left axle, right axle. |

## 7. Transfer learning

| Term | Plain meaning |
|---|---|
| **Transfer learning** | Reuse what a model learned on one dataset to help on another. In practice: keep the encoder, replace the head. |
| **Source / target domain** | Source = what you pretrain on. Target = what you actually care about. |
| **Pretraining** | Initial training on a large general dataset before the real task. |
| **Fine-tuning** | Further training on your specific data. |
| **Self-supervised learning (SSL)** | Training without labels by inventing a task from the data itself — e.g. mask part of the signal, predict what was hidden. |
| **Masked reconstruction / MAE** | The specific SSL trick above. How MOMENT was trained. |
| **Foundation model** | A very large model pretrained on enormous general data, meant to be reused. TimesFM saw ~10¹¹ time points. |
| **Zero-shot** | Using a pretrained model with **no** training on your data at all. |
| **Few-shot / N-shot** | Fine-tuning with very few labelled examples. N=5, 20, 100. |
| **Linear probe** | Freeze the encoder solid, train only a tiny new head. Needs the fewest labels. |
| **PEFT** | Parameter-Efficient Fine-Tuning — update only a small fraction of weights. |
| **LoRA** | Inject tiny trainable adapters between frozen layers. KB-scale per adapter, so you can have thousands. |
| **BitFit** | Even lighter — train only the bias terms. |
| **Domain adaptation** | Explicitly reducing the gap between source and target distributions. |
| **BatchNorm recalibration** | Recompute normalization statistics on target data. Cheapest domain-adaptation win, often the biggest. |
| **CORAL / MMD** | Methods that align source and target feature distributions. |
| **DANN** | Adversarial domain adaptation — a discriminator tries to tell source from target, the encoder learns to fool it. |
| **Gradient reversal** | Trick used in DANN to make an encoder *unlearn* machine-specific quirks. |

## 8. Evaluation

| Term | Plain meaning |
|---|---|
| **Lead time** | How long before the failure (or before the train's existing alarm) your detector fired. **The headline number.** |
| **False alarm rate** | How often you fire during normal running. Express as alarms/week. The counterweight to lead time. |
| **Event-level scoring** | Score per failure event: caught or missed, out of N. The only honest option with 4 events. |
| **Point-wise scoring** | Score per data row. With a failure lasting hours at 1 Hz, one event becomes ~50,000 "successes." Meaningless. |
| **PA-F1** (point-adjusted F1) | The standard-but-broken TSAD metric. Random scores achieve near 1.0. **Banned in this project.** |
| **AUPRC** | Area under the precision-recall curve. Threshold-free, imbalance-robust. |
| **VUS-PR** | Volume-under-surface PR. Range-based variant, degrades more gracefully on few events. |
| **Affiliation / range-based P&R** | Precision and recall computed over time ranges rather than individual points. |
| **Cost curve** | Sweep the threshold, plot false-alarm cost vs missed-failure cost. Pick the operating point from here, not from max-F1. |
| **Operating point** | The threshold you actually ship. |
| **Slop / tolerance window** | Allowance around a label boundary, since nobody knows exactly when an anomaly began. |
| **Prequential evaluation** | Streaming protocol: predict on each new sample, then use it to update the model. Test-then-train. |
| **Calibration** | Making predicted scores match real probabilities. Temperature scaling, isotonic regression. |
| **Seed** | Random-number starting point. Report ≥3 seeds or the result isn't evidence. |

## 9. Tasks

| Term | Plain meaning |
|---|---|
| **Anomaly detection** | Flag "this is unusual" without knowing what fault it is. Needs no fault labels. |
| **Fault classification / diagnosis** | Identify *which* fault. Needs labelled examples of each. |
| **RUL** (Remaining Useful Life) | Predict how long until failure. Needs run-to-failure data. |
| **Prognostics** | Forecasting future health. RUL is one form. |
| **PdM** (Predictive Maintenance) | Fixing things just before they break, based on data. |
| **PHM** (Prognostics and Health Management) | The engineering field covering all of this. |
| **CBM** (Condition-Based Maintenance) | Maintaining based on measured condition rather than fixed schedule. |

## 10. Rail operations & standards

| Term | Plain meaning |
|---|---|
| **LPS** (Low Pressure Signal) | MetroPT's built-in alarm — fires below 7 bar, lights the driver's panel. The evaluation anchor: beat it by ≥2 hours. |
| **OCC** (Operations Control Centre) | Where controllers monitor and direct the network. SMRT's is at Kim Chuan Depot. |
| **GoA 0–4** (Grades of Automation) | IEC 62267 / UITP scale of how much authority automation holds, from manual (GoA0) to fully unattended (GoA4). Borrowed here as a pattern: label every recommendation with its authority level. |
| **EN 50155** | Standard for onboard railway electronics — temperature, shock, vibration, EMC. Governs what hardware can run on a train. |
| **IEC 62278 / EN 50126** | RAMS — Reliability, Availability, Maintainability, Safety lifecycle for rail. |
| **IEC 61508 / SIL** | Functional safety standard; Safety Integrity Levels 1–4. Anything that could be followed into an unsafe action risks falling into this scope. |
| **ICS** (Incident Command System) | FEMA's emergency command structure. Fixed org template, modular *activation* — the model for the decision engine. |
| **Short-turn / withdraw / shuttle / suspend** | Standard OCC recovery actions: reverse a train early, take it out of service, run replacement buses, close part of the line. |

## 11. Data-exchange standards

| Term | Plain meaning |
|---|---|
| **ISO 13374 / OSA-CBM** | The reference architecture for condition monitoring: Data Acquisition → Manipulation → State Detection → Health Assessment → Prognostics → Advisory Generation. |
| **ISO 13379** | Diagnostics — defines a diagnostic report format and severity/confidence ratings. |
| **ISO 13381** | Prognostics — defines confidence level, root cause, estimated time to failure. |
| **ISO 14224** | Equipment taxonomy and failure-mode codes for reliability data. |
| **MIMOSA** | The organization behind OSA-CBM/OSA-EAI interoperability specs. |
| **EN 15341** | Maintenance KPIs. |
| **CMMS / EAM** | Computerized Maintenance Management System / Enterprise Asset Management. The software that holds work orders — IBM Maximo, SAP PM, Fiix, Infor EAM. |
| **DMN** | Decision Model and Notation — OMG standard for human-editable decision tables. |

## 12. Discords (the DAMP/MADRID family)

| Term | Plain meaning |
|---|---|
| **Time series discord** | The subsequence most different from its nearest neighbour anywhere else in the series. The simplest useful anomaly definition. |
| **Matrix Profile** | For every window, the distance to its most similar other window. The highest value is the discord. |
| **Left Matrix Profile** | Same, but only looking *backwards* in time. Required for streaming, and immune to the twin-freak problem. |
| **Twin-freak problem** | If an anomaly happens twice, each becomes the other's nearest neighbour, so neither looks anomalous. Left-MP fixes this by flagging the first occurrence. |
| **DAMP** | Discord Aware Matrix Profile. Streaming discords at up to 300,000 Hz. |
| **MADRID** | Searches every window length at once, removing the last parameter. |
| **BSF** (Best-So-Far) | Highest discord score seen yet. Used to prune work. |
| **MASS** | Fast subsequence-search algorithm using FFT. The inner loop of DAMP. |
| **Lookahead** | How far forward DAMP peeks to prune future windows. Zero = true online. |
| **Amnesic / X-Lag-Amnesic** | Only look back X samples, forgetting older data. Handles concept drift, bounds compute. |
| **Anytime / hyper-anytime algorithm** | Produces a usable answer early and refines it. Hyper-anytime = within 10% of final using <10% of compute. |
| **STUMPY** | Open-source Python library implementing Matrix Profile. `pip install stumpy`. |

## 13. Named models

| Model | Type | One line |
|---|---|---|
| **DAMP / MADRID** | Discord | Zero training, zero labels, works on anything. Build first. |
| **MOMENT** | Foundation, encoder | Masked encoder. Emits embeddings. Best foundation pick for anomaly detection. |
| **Chronos / Chronos-Bolt** | Foundation, forecaster | Turns numbers into tokens, forecasts like a language model. |
| **TimesFM** | Foundation, forecaster | Google, decoder-only, ~10¹¹ pretraining points. |
| **MOIRAI** | Foundation, forecaster | Handles multiple channels natively. |
| **Time-MoE / TSPulse** | Foundation | Efficiency-oriented variants. |
| **PatchTST** | Transformer | Patching + channel independence. Best cost/benefit if you train your own. |
| **TimesNet** | Transformer | Models periodicity in 2-D. |
| **Anomaly Transformer / DCdetector** | Transformer | Association-discrepancy anomaly detectors. Inconsistent across benchmarks. |
| **Autoformer / FEDformer** | Transformer | Decomposition-based forecasters. Cut from this project. |
| **WDCNN** | CNN | Wide first kernel acts as a learned band-pass. Standard raw-vibration baseline. |
| **InceptionTime / ResNet-1D** | CNN | General 1-D time series classifiers. |
| **CNN-LSTM** | Hybrid | CNN for local shape, LSTM for slow trend. Cut — needs labels you likely won't have. |
| **Zen Engine / GoRules JDM** | Rules engine | MIT-licensed DMN implementation. For the decision layer, not a model. |

## 14. Named datasets

| Dataset | One line |
|---|---|
| **MetroPT-1/2/3** | Metro do Porto APU compressor. **-3** is ours: 1.5M rows, 15 sensors, 1 Hz, unlabeled, 4 failure windows, no flowmeter. |
| **DR-Train** | Two in-service Pittsburgh light rail vehicles. Accelerometers, GPS, weather, maintenance logs. |
| **BJTU-RAO** | 1:2 scale subway bogie rig. 51 health states, 24 channels, 64 kHz, 9 working conditions, 10 s per sample. |
| **Paderborn (PU)** | 32 bearings, artificial **and** natural damage. Best domain-shift set. |
| **CWRU** | The universal bearing benchmark. Near-saturated. Also the DAMP paper's worked example. |
| **XJTU-SY / FEMTO-ST / NASA IMS** | Run-to-failure bearing datasets for RUL. |
| **SEU** | Bearings *and* gears. Bogies have gearboxes. |
| **MaFaulDa** | Multi-modal rotating machinery faults, 50 kHz. |
| **PHM NA 2023** | Gearbox with 6 ordinal severity levels. |
| **MIMII / DUE / DG** | Industrial machine sound. The **slide rail** class is the closest public door-actuator proxy. |
| **UCR Anomaly Archive** | The trustworthy TSAD benchmark, built to fix the flaws below. |
| **NASA C-MAPSS** | Turbofan RUL benchmark. Clean, not implicated in the critique. |
| **SWaT / WADI / SMAP / MSL / PSM / NAB / Yahoo / SKAB / Exathlon** | Widely cited, **documented broken**. See DATASETS.md §2. |

## 15. Infrastructure

| Term | Plain meaning |
|---|---|
| **MLflow** | Experiment tracking. Logs parameters, metrics, artifacts per run. |
| **Run / experiment / tag** | A run is one training job; an experiment groups runs; tags label them so you can query. |
| **Model registry** | Versioned store of trained models, with aliases like `@champion`. |
| **DagsHub** | Free hosted MLflow, auto-provisioned per repo, connects to GitHub. |
| **ONNX** | Portable model format. **ONNX Runtime** runs it on CPU/ARM/GPU. |
| **Triton** | NVIDIA's serving system. Dynamic batching, many models per process. |
| **TensorRT** | NVIDIA-only optimizer. Fastest, least portable. |
| **Quantization / INT8** | Shrinking weights from 32-bit to 8-bit for speed and size. |
| **K3s** | Lightweight Kubernetes for edge devices. Runs in 512 MB. |
| **Feature store** | Database of per-asset state — thresholds, drift stats, health history. Keyed by car ID. |
| **Edge inference** | Running the model on the train instead of in the cloud. |
