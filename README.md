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

## Architecture

The React workbench uploads native PS3 files to FastAPI. The backend reproduces the exact
training-time feature transformations and invokes the four `champion` artifacts in the team's
DagsHub MLflow Model Registry. Models are loaded lazily and cached by the API process.

For judging, one Google Cloud Run service hosts the complete system: the production React build,
FastAPI routes, feature pipelines, and immutable copies of all four MLflow champion artifacts.
Keeping the browser and API on one origin removes CORS failure modes, while bundling the models
makes inference independent of external registry availability during the live demo.

| Subsystem | Registered champion | Production input |
|---|---|---|
| Door | `door_resistance_classifier` | Raw controller stream |
| ACV | `acv_car_ranker` | Per-car peer-temperature features |
| Rail | `rc_corrugation_classifier` | 101 amplitude, spectral and side-contrast features |
| SHM | `shm_damage_regressor` | 39 rainflow and signal features |

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
the frontend.

Authenticate once without putting a token in this repository:

```bash
dagshub login
```

Start the API and frontend in separate terminals:

```bash
uvicorn backend.app:app --reload
cd frontend && npm install && npm run dev
```

See [MODEL_SERVING.md](docs/MODEL_SERVING.md) for model contracts, configuration and verification.

## Google Cloud deployment

The `agentic-ai` branch adds a maintenance assistant with general chat, tool-based
evidence retrieval and engineer review. See [AGENTIC_ASSISTANT.md](docs/AGENTIC_ASSISTANT.md)
for the offline demo, Vertex AI configuration and explicit prototype limitations.

Download the current MLflow champions, build the same image used locally, and deploy it to Cloud
Run through Artifact Registry:

```bash
python scripts/download_champions.py
docker build -t tfd-gcp:local .
docker run --rm -p 8080:8080 tfd-gcp:local
```

No DagsHub credential is placed in the production image: model aliases were resolved during model
release and only the reviewed immutable model artifacts are copied. See [GOOGLE_CLOUD.md](docs/GOOGLE_CLOUD.md)
for the complete deployment and verification procedure.

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
| [MODEL_SERVING.md](docs/MODEL_SERVING.md) | DagsHub champion loading, feature contracts and smoke testing |
| [GOOGLE_CLOUD.md](docs/GOOGLE_CLOUD.md) | Cloud Run architecture, deployment, rollback and judging proof |

BRIEF, DATASETS, EXPERIMENTS, FEATURES and PLAN were written before the problem statement was
released and still describe that earlier plan.
