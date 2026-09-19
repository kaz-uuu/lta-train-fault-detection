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

## Models

Each subsystem has a training notebook that compares several architectures, selects one, and
registers it in the team's DagsHub MLflow Model Registry under the alias `champion`. All four
champions are version 1.

| Subsystem | Registered model | Selected method | Held-out validation | Input the app sends |
|---|---|---|---|---|
| Door | `door_resistance_classifier` | Window-current rule: mean motor current over 20–40% of an opening or 35–65% of a closing, against a threshold fitted on Train | IoU-weighted F1 1.000 on the Train folds | Raw controller stream; the model finds the movements itself |
| ACV | `acv_car_ranker` | Peer-temperature rule: how far each car's indoor temperature sits above the median of the other cars, averaged over cooling minutes | Rank-decay 0.979, leave-one-case-out over six cases | Two per-car features |
| Rail | `rc_corrugation_classifier` | LightGBM classifier | Macro F1 0.784, pooled grouped CV | 101 features: speed plus amplitude, spectral, wavelength-band and side-contrast statistics |
| SHM | `shm_damage_regressor` | Elastic Net on log damage | Score 0.977 (MAPE 2.3%), pooled four-fold CV | 39 rainflow, damage-sum and signal features |

The notebooks' conclusion sections give the full comparison and the limits of each result.

## Architecture

The React workbench uploads native PS3 files to a FastAPI backend. The backend checks each file,
rebuilds the exact features the champion was trained on (`src/tfd/ps3/model_inputs.py`), runs the
champion through MLflow, and writes prediction CSVs in the brief's schema. Models load on first use
and stay cached in the API process. See [MODEL_SERVING.md](docs/MODEL_SERVING.md).

For judging, one Google Cloud Run service hosts the whole system: the production React build, the
API, the feature pipelines and immutable copies of the four champions (committed under
`.model_artifacts/`). The browser and API share one origin, and inference needs no DagsHub access.
See [GOOGLE_CLOUD.md](docs/GOOGLE_CLOUD.md).

## Repository layout

```
backend/            FastAPI app: workbench routes, model loading, assistant
src/tfd/ps3/        PS3 loaders, serving feature pipelines, door rule, submission files
src/tfd/            shm_wrangling.py (SHM training-table checks), viz.py (notebook plot style)
frontend/           React + Vite workbench
notebooks/          Door EDA, then preprocessing and training for each subsystem
models/RailCorrugation/   Standalone Keras rail network (see its ReadMe)
.model_artifacts/   Downloaded copies of the four registered champions, baked into the image
scripts/            Champion download, OpenAPI export, colour-contrast check
tests/              pytest suite
docs/               The documents listed below
```

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

## Run locally

Start the API (port 8000) and the frontend dev server (port 5173) in separate terminals, then open
http://localhost:5173. The dev server proxies `/api` to the API.

```bash
uvicorn backend.app:app --reload
```

```bash
cd frontend && npm install && npm run dev
```

By default the API loads each champion from DagsHub, which needs a one-time login (the token is
stored outside the repository):

```bash
dagshub login
```

To run without DagsHub, point the API at the committed champion copies instead:

```bash
export TFD_MODEL_URI_DOOR=.model_artifacts/door TFD_MODEL_URI_ACV=.model_artifacts/acv TFD_MODEL_URI_RAIL=.model_artifacts/rail TFD_MODEL_URI_SHM=.model_artifacts/shm
```

The API also serves a production build of the frontend from `frontend/dist` if one exists
(`cd frontend && npm run build`), so the whole app runs at http://localhost:8000. The container
image does the same; see [GOOGLE_CLOUD.md](docs/GOOGLE_CLOUD.md) to build and run it.

## Notebooks

Each subsystem runs `*_preprocessing.ipynb` then `*_training.ipynb` (`rail_corrugation_*` for Rail);
Door also has `door_eda.ipynb`. Preprocessing writes feature tables to `data/processed/<subsystem>/`,
which is git-ignored (Rail's tables are the exception and are committed). Training reads them, logs
every run to MLflow and registers the selected model.

| Variable | Effect |
|---|---|
| `TFD_PS3_DIR` | Location of the PS3 datasets (the `PS3` folder or its `02_Datasets` folder) |
| `TFD_PROCESSED_DIR` | Location of the processed tables, instead of `data/processed` |
| `TFD_MLFLOW=local` | Log to `mlflow.db` and `mlartifacts/` in the repo instead of DagsHub |

## Tests

```bash
python -m pytest -q
```

The suite uses a stub model, so it needs neither DagsHub nor the champion artifacts. Tests that
read the PS3 data skip when it is absent.

## Maintenance assistant

An **Assistant** button opens a chat and investigation panel that retrieves evidence about an
uploaded prediction run and records an engineer's approval or rejection. It only ever recommends.
By default it runs offline without any AI model; Gemini on Vertex AI is optional. See
[AGENTIC_ASSISTANT.md](docs/AGENTIC_ASSISTANT.md).

## Data

The problem statement pack is not committed. Put it at `problem-statement/PS3/`, or point
`TFD_PS3_DIR` at its `02_Datasets` folder.

```
problem-statement/PS3/02_Datasets/{Door,ACV,Rail_Corrugation,SHM}
```

## Docs

| Doc | What's in it |
|---|---|
| [MODEL_SERVING.md](docs/MODEL_SERVING.md) | How the API loads champions, the feature contracts, routes, configuration and checks |
| [GOOGLE_CLOUD.md](docs/GOOGLE_CLOUD.md) | Cloud Run architecture, deployment and judging proof |
| [AGENTIC_ASSISTANT.md](docs/AGENTIC_ASSISTANT.md) | The maintenance assistant: workflows, Vertex AI configuration, limits |
| [DESIGN.md](docs/DESIGN.md) | Design language: the look, what each colour may mean, the app's screens |
| [GLOSSARY.md](docs/GLOSSARY.md) | Terms used in the app, notebooks and docs, in plain language |
