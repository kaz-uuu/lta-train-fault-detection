# Plan

**Event:** NEBULA X, PS3 · Fri 18 Sep 17:00 → Sun 20 Sep 17:00 · 48 hours · team of 3–4
**Today:** Fri 4 Sep · **13 working days before the event**
**Supersedes:** BRIEF.md §7

---

## Thesis

Data is unknown until hour 0. So the thing to build beforehand is **not a model — it's the machine that eats any dataset**. Win condition is speed from unknown-CSV to credible demo, then spending what's left on what judges actually score.

## Framing for the submission

> **"Beat the alarm the train already has, by N hours."**

MetroPT's published work anchors on **LPS** — a low-pressure signal already wired into the driver's panel. Real rolling stock is full of equivalents: fault codes, threshold trips, alarm flags.

Why this framing wins:
- **Self-labeling** — the existing alarm is your ground truth, no manual labelling needed
- **Objective** — a hardware trip has an exact timestamp, unlike a human-written failure report
- **Demoable in one line** — *"their alarm fired at 11:26. Ours fired at 08:43."*
- **Credible to rail judges** — it's the actual value proposition, not a metric

---

## Build before the event

| # | Deliverable | Why | Owner |
|---|---|---|---|
| 1 | **Signal Contract + adapter template** | Turns day-1 integration from a day into an hour | Data |
| 2 | **Auto-profiler** — point at any CSV → rate, channels, gaps, periodicity, **existing alarm columns** | First thing you run at hour 0 | Data |
| 3 | **Eval harness** — lead time, false alarms/week, event-level scoring, cost curve | Fiddly, and you *will* need it. Data-agnostic. | Story |
| 4 | **Discords (DAMP/MADRID)** running end-to-end | Works on any data, any rate, zero labels. Guaranteed number on the board. | Models |
| 5 | **MLflow on DagsHub** + tagging schema | Shared tracking, zero ops burden | Platform |
| 6 | **Foundation models zero-shot** (MOMENT / Chronos / TimesFM) | Transfer learning someone else already did, at a scale you can't match. Robust to unknown schema. | Models |
| 7 | **Two SSL checkpoints** — low-rate + high-rate, channel-independent | Only pays off if the release matches a regime. Lower certainty than 1–6. | Models |
| 8 | **Demo scaffold + slide skeleton** | The thing every team leaves until hour 45 | Story |

Order matters. **1–5 are near-certain value. 6 is high value. 7 is a bet.** Don't invert that.

---

## Two-week schedule

### Week 1 — Sep 5–11: the pipeline that eats anything
- Signal Contract, adapter template, auto-profiler
- Eval harness (lead time, false alarms/week, cost curve)
- Discords end-to-end on MetroPT + CWRU
- MLflow on DagsHub live
- BJTU-RAO: unzip, decimate, write adapter (channel map is in the official PDF, Table 4)

**Done means:** you can point the pipeline at MetroPT and get a lead-time number without touching code.

### Week 2 — Sep 12–17: transfer assets + rehearsal
- Foundation models zero-shot on MetroPT, LPS-anchored protocol
- Phase A model selection: MetroPT + MIMII DUE, 6 candidates, 3 seeds
- SSL pretraining: low-rate checkpoint (MetroPT + DR-Train), high-rate checkpoint (BJTU-RAO + Paderborn + SEU)
- Phase B: measure the transfer drop across source→target pairs
- Demo scaffold, slide skeleton

**Sep 16–17 — dry run.** Take a dataset nobody has touched. Pretend it's the release. Time yourselves from CSV to working detector.

**Target: under 2 hours. That number is the leg up.**

---

## The 48 hours

| Hours | Do | Exit criterion |
|---|---|---|
| 0–2 | Profile the data. **Find the existing alarm.** Write the adapter. | Data flows through the Signal Contract |
| 2–4 | Discords running | **A number on the board.** Never be without one. |
| 4–12 | Foundation models zero-shot. Load a checkpoint if the regime matches. | Second detector, independent failure modes |
| 12–24 | Few-shot curve + PEFT ladder — **only if labels exist** | Headline chart, or skip |
| 24–36 | Scoped add-ons: fault-event endpoint, rule-based triage | Both demoable standalone |
| 36–40 | Ablations, tidy | **Feature freeze at hour 40** |
| 40–48 | Demo rehearsal ×3 | Timed, offline-capable, no new code |

---

## Cut list

| Cut | Why |
|---|---|
| **CNN-LSTM** | Weakest cell. Slower than PatchTST, worse on long windows, needs labels you probably won't have. |
| **Transformer sweep** (Autoformer, FEDformer, TimesNet, Anomaly Transformer, DCdetector) | Keep PatchTST only. Foundation models already are transformers — the story holds. |
| **Fleet container simulation** | It's a *slide*, not a build. Don't containerize 200 of anything. |
| **Benchmark datasets** (SWaT, SMAP, MSL, PSM, NAB, Yahoo) | Documented broken. See DATASETS.md §2. |

---

## Risk

**Key assumption:** the release contains an existing alarm/flag to anchor on.

**If it doesn't:** fall back to discords + unsupervised scoring, evaluated on lead time to the reported failure window. Already covered — no re-plan needed at hour 0.

**Standing rule:** if the core pipeline is behind at hour 30, cut the add-ons before cutting a model ablation. Never be in a state with no working detector.
