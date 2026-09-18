# Datasets — Ranked

**Version:** 2.0 · **Date:** 2026-07-26
Ranked by value to NEBULA X PS3. Assumes released data is **low-rate telemetry** (1–10 Hz), the likely case — rail ships summaries, not raw waveforms. Branch logic in §3.

---

## 1. Ranked list

| # | Dataset | Pros | Cons |
|---|---|---|---|
| 1 | **MetroPT-3** | Real revenue service (Metro do Porto APU). Real imbalance and drift. 1.5M rows, 15 sensors (7 analogue + 8 digital), 1 Hz — matches likely release rate. Open on UCI, CC BY 4.0. | **Unlabeled at row level** — only 4 air-leak failure windows documented separately (Apr–Jul 2020); you build labels by timestamp intersection. Too few events for supervised classification — T1 unsupervised only, scored event-level with lead time. Auxiliary subsystem, not bogie or door. |
| 2 | **DR-Train** | Real in-service light rail. Tri-axial accelerometer on wheel truck. Maintenance logs = real weak labels. GPS + weather. Open on Zenodo. | Labels are maintenance *actions*, not fault classes. Only 2 vehicles. |
| 3 | **MIMII DUE / DG** | Slide-rail class ≈ door actuator — closest public door proxy. Explicit domain shifts rehearse the exact 18 Sep transfer. | Acoustic, not motor current. Some versions non-commercial — check license. |
| 4 | **Paderborn (PU)** | Natural **and** artificial damage — best honest domain-shift bearing set. 32 units. Vibration + current. | 64 kHz. Useless if release is low-rate. |
| 5 | **Synthetic door generator** | You control it. Unblocks door pipeline before any real door data exists. Zero access friction. | Synthetic — must be disclosed. Proves pipeline, not performance. |
| 6 | **BJTU-RAO** | Only public labelled subway-bogie set. 51 fault states, 24 channels, 9 operating conditions. Strong narrative for rail judges. | 1:2 scale rig. Seeded faults. 64 kHz. Gated access. Published transfer wins are cross-condition, not cross-machine. |
| 7 | **SEU** | Bearings **and** gears — bogies have gearboxes. 8ch + torque. | Test rig. 12 kHz. |
| 8 | **PHM NA 2023** | Ordinal severity labels (healthy + 6 levels) — rare and useful. Varied operating conditions. | Gearbox only. Challenge-format access. |
| 9 | **XJTU-SY** | Run-to-failure trajectories for RUL. Clean degradation curves. | 25.6 kHz. Small unit count. |
| 10 | **MaFaulDa** | Multi-modal (accel + mic + tacho). Good class diversity. 50 kHz. | Lab simulator, not real machinery. |
| 11 | **UCR Anomaly Archive** | The *trustworthy* TSAD benchmark — built to fix the flaws in §2. Standardized scorer. DAMP/MADRID validate here. | Not rail. Use to validate method, not domain. |
| 12 | **FEMTO-ST / NASA IMS** | Long run-to-failure records, RUL benchmarks. | Bearings only. Older, small. |
| 13 | **CWRU** | Universal comparability. Literal DAMP worked example — run discords here as repro check. | Near-saturated, leakage-prone. Never a headline result. |
| 14 | **NASA C-MAPSS** | Canonical RUL benchmark, clean, not implicated in the benchmark critique. | Turbofan. Method rehearsal only. |

**Also exists, low priority:** KAIST (secondary bearings), Ottawa (variable speed — useful for speed-confound stratification), RSDDs + NEU (visual — only if imagery is released), DCASE Task 2 (borrow the protocol, not the data), ToyADMOS (cheap ablations).

---

## 2. Avoid as evidence

**SWaT, WADI, SMAP, MSL, PSM, NAB, Yahoo, SKAB, Exathlon, MGAB, MITDB**

Documented broken — trivial anomalies, mislabeled ground truth, unrealistic density, inflated scoring. SWaT: ~70% of "anomalies" are sensor fault codes a null check finds. PSM: 27.76% of the data labelled anomalous. Yahoo: identical points labelled inconsistently, confirmed with the authors.

Sanity checks only. Never a headline number, never paired with PA-F1.

Sources: [Wu & Keogh, IEEE TKDE 2023](https://arxiv.org/abs/2009.13807) · [dataset teardown](https://www.dropbox.com/scl/fi/cwduv5idkwx9ci328nfpy/Problems-with-Time-Series-Anomaly-Detection.pdf?rlkey=d9mnqw4tuayyjsplu0u1t7ugg&dl=0)

---

## 3. Plan

### Now → 18 Sep
1. Request **BJTU-RAO** access — gated, longest lead time. Do today.
2. Download + checksum: **MetroPT-3, DR-Train, Paderborn, SEU, CWRU, XJTU-SY, MIMII DUE/DG**.
3. Log license + commercial-use flag per dataset in `data/registry.yaml`.
4. Build the **synthetic door generator**.
5. Write the Signal Contract adapter per dataset (BRIEF §3.1).
6. Run **discords (DAMP/MADRID)** on MetroPT + CWRU — zero training, gives you a working detector and a repro check before the event starts.
7. Run **SSL pretraining** on whatever's downloaded. Arrive with a pretrained encoder.

### 18 Sep, hour 0 — branch on what drops
| Released data | Corpus | Drop |
|---|---|---|
| Low-rate telemetry (1–10 Hz) | MetroPT + DR-Train | All kHz bearing sets |
| High-rate vibration (kHz) | BJTU-RAO + Paderborn + SEU + XJTU-SY | MetroPT (rate mismatch) |
| Door-specific | MIMII slide rail + synthetic generator | Bogie sets |
| Imagery | RSDDs + NEU | Everything else |

### Rule
Discords run on anything, at any rate, with zero labels — so they work regardless of which branch fires. Build that first, every time.
