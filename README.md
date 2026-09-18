# Train Condition Monitoring

NEBULA X 2026, **Problem Statement 3 — Train Condition Monitoring**, LTA-mentored · 18–20 Sep 2026.

Four independent subsystems, each with its own data and its own task:

| Subsystem | Task | Scored by |
|---|---|---|
| **Door** | Find every open/close movement in a continuous controller log and label it Normal or Abnormal resistance | IoU-weighted F1 |
| **ACV** | Rank the cars of a train from most to least likely to be leaking refrigerant | Linear rank-decay |
| **Rail corrugation** | Label each one-second axle-box recording Normal, Side I or Side II | Macro F1 |
| **SHM** | Estimate cumulative fatigue damage for each stress recording | max(0, 1 − MAPE) |

The deliverables are a demo video, `predictions.zip` and one app a non-technical user can work
with, so the app is the spine of this repo: pick a subsystem, upload data, review, download.

## Branches

`main` carries the setup and the written docs. Work lives on its own branch and merges here when
it is ready.

| Branch | Holds |
|---|---|
| `main` | Environment, packaging, `docs/` |
| `backend` | Subsystem loaders and models (`src/tfd/ps3/`), the workbench API (`backend/`), tests |
| `frontend` | The React app (`frontend/`) and the design language (`docs/DESIGN.md`) |
| `eda` | Exploratory notebooks (`notebooks/`) |

## Setup

The conda environment lives inside the repo, in `train-fault-detection/` (ignored by git).

```bash
conda env create -f environment.yml -p ./train-fault-detection
```

```bash
conda activate ./train-fault-detection
```

```bash
pip install -e . --no-deps --no-build-isolation
```

Without conda: `pip install -r requirements.txt && pip install -e .`, plus Node 20.19 or newer for
the `frontend` branch.

## Data

The problem statement pack is not committed. Put it at `problem-statement/PS3/`, or point
`TFD_PS3_DIR` at its `02_Datasets` folder.

```
problem-statement/PS3/02_Datasets/{Door,ACV,Rail_Corrugation,SHM}
```

## Docs

| Doc | What's in it |
|---|---|
| [PLAN.md](docs/PLAN.md) | Build order and the 48-hour schedule |
| [BRIEF.md](docs/BRIEF.md) | Technical plan — framing, model bake-off, transfer ladder, MLflow, risk register |
| [DESIGN.md](docs/DESIGN.md) | Design language — the look, and what each colour is allowed to mean (on `frontend`) |
| [SPEC.md](docs/SPEC.md) | Flat feature index — name and function |
| [DATASETS.md](docs/DATASETS.md) | Ranked datasets with pros and cons, avoid-list, acquisition plan |
| [EXPERIMENTS.md](docs/EXPERIMENTS.md) | Experiment matrix, factors and levels, MLflow tag schema |
| [FEATURES.md](docs/FEATURES.md) | Scoped review of the scheduler endpoint and the decision engine |
| [GLOSSARY.md](docs/GLOSSARY.md) | Every term, in plain language |

BRIEF, DATASETS, EXPERIMENTS, FEATURES and PLAN were written before the problem statement was
released and still describe that earlier plan.
