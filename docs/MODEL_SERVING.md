# Model serving

The FastAPI workbench serves the four models that the training notebooks selected and registered.
It never trains a model itself.

## Request path

1. `backend/workbench.py` checks the uploaded file: type, subsystem, columns, sampling.
2. `src/tfd/ps3/model_inputs.py` rebuilds the features the champion was trained on. Door is the
   exception: its champion takes the raw controller stream and finds the movements itself.
3. `backend/model_registry.py` loads the champion with `mlflow.pyfunc.load_model`, on the
   subsystem's first request, and keeps it cached in the API process.
4. The champion's MLflow package validates its input schema and returns predictions.
5. The workbench shows the result and writes the prediction CSV in the brief's exact schema.

If a file cannot be read or a model cannot be loaded, that file gets a failed check with the reason;
the service keeps running.

## Where the models come from

Each subsystem's model URI is `TFD_MODEL_URI_<SUBSYSTEM>` if set, otherwise its `@champion` alias:

| Subsystem | Default URI | Committed copy |
|---|---|---|
| Door | `models:/door_resistance_classifier@champion` | `.model_artifacts/door` |
| ACV | `models:/acv_car_ranker@champion` | `.model_artifacts/acv` |
| Rail | `models:/rc_corrugation_classifier@champion` | `.model_artifacts/rail` |
| SHM | `models:/shm_damage_regressor@champion` | `.model_artifacts/shm` |

- A `models:/`, `runs:/` or `mlflow-artifacts:/` URI is resolved through DagsHub (`dagshub.init`,
  using the login from `dagshub login`), unless `MLFLOW_TRACKING_URI` points somewhere else.
- A local path, such as the committed copies, is loaded directly and needs no credentials or
  network. The container image sets all four variables to its copies.
- A pinned registry version works too, for example `models:/acv_car_ranker/1`.

The model card in the app shows the numeric version when an alias was resolved, and the URI
otherwise.

`scripts/download_champions.py` resolves the current `@champion` of each model on DagsHub and
replaces `.model_artifacts/<subsystem>` with that version. All four copies are version 1.

## Feature contracts

| Subsystem | Built by | What the champion receives | Returns |
|---|---|---|---|
| Door | — | The 17 native columns of the controller log | `start_time`, `end_time`, `prediction`, `score` per movement |
| ACV | `acv_features` | `file_id`, `car`, `minutes_with_indoor`, `peer_delta_cooling_mean` per car | a rank per car |
| Rail | `rail_features` | `file_id` plus 101 features: speed and per-side amplitude, spectral, wavelength-band and side-contrast statistics | `prediction` |
| SHM | `shm_features` | `file_id` plus 39 features: signal statistics, rainflow range percentiles and cycle counts, and damage sums and equivalent ranges for exponents 1–12 | `prediction` |

For Rail and SHM, the serving features match the preprocessing notebooks' saved feature tables
column for column. `tests/test_model_inputs.py` checks each builder's output columns.

**Known gap (Door).** The Door champion's `score` is the movement's window current minus the
threshold, but the API keeps only the bounds and label. The movement detail therefore has no
window current, threshold or typical Normal and Abnormal profiles to show, and cannot explain a
label with the number behind it.

## Routes

OpenAPI docs are at `/docs` on a running API.

| Route | Purpose |
|---|---|
| `GET /api/health` | Returns `{"status":"ok"}` |
| `GET /api/ps3/subsystems`, `GET /api/ps3/subsystems/{id}` | Task, accepted files, output schema, model card and latest run per subsystem |
| `POST /api/ps3/runs` | Start a run for one subsystem |
| `POST /api/ps3/runs/{run_id}/files` | Upload one file: check it, predict, add it to the run |
| `GET /api/ps3/runs/{run_id}` | The run and every file's checks, preview and prediction |
| `GET /api/ps3/runs/{run_id}/{csv_name}` | The run's prediction CSV, e.g. `door_predictions.csv` |
| `GET /api/ps3/submission` | What `predictions.zip` would contain |
| `GET /api/ps3/submission/predictions.zip` | The newest run with predictions from each subsystem, zipped |
| `/api/assistant/...` | The maintenance assistant; see [AGENTIC_ASSISTANT.md](AGENTIC_ASSISTANT.md) |

Door takes one log per run, so a new upload replaces the previous one; the other subsystems
accumulate files. Runs live in the API's memory and are lost on restart.

When `frontend/dist` exists (or `TFD_STATIC_DIR` names another build), the API also serves the
React app on every other path.

## Configuration

Nothing loads `.env` automatically: export the variables in the shell or pass them to the container.
`.env.example` lists them.

| Variable | Default | Effect |
|---|---|---|
| `TFD_MODEL_URI_DOOR`, `_ACV`, `_RAIL`, `_SHM` | the `@champion` alias | Model to load for that subsystem |
| `DAGSHUB_REPO_OWNER`, `DAGSHUB_REPO_NAME` | `kaz-uuu`, `lta-train-fault-detection` | DagsHub repository holding the registry |
| `MLFLOW_TRACKING_URI` | unset | If set, used instead of DagsHub for registry URIs |
| `TFD_STATIC_DIR` | `frontend/dist` | Frontend build to serve |
| `TFD_ASSISTANT_PROVIDER`, `GOOGLE_CLOUD_*`, `TFD_GEMINI_MODEL` | offline | Assistant; see [AGENTIC_ASSISTANT.md](AGENTIC_ASSISTANT.md) |

Never put a DagsHub token in `.env` or Git. In deployment, use the committed model copies (as the
container does) or supply credentials through the platform's secret manager.

## Dependencies

`requirements-serving.txt` is what the container installs. Its pins match the environment the
Door, ACV and Rail champions were logged with, except TensorFlow and Keras, which none of the
champions needs at prediction time. SHM was logged with numpy 2.3.4, scikit-learn 1.5.2 and MLflow
3.16.1; MLflow prints a version-mismatch warning when it loads it, but its predictions are
unaffected (see below). The conda environment is not pinned, so it prints similar warnings.

## Verification

```bash
python -m pytest -q
```

```bash
python scripts/export_openapi.py frontend/openapi.json
```

```bash
cd frontend && npm run build
```

The test suite uses a stub in place of the champions. To exercise the real models, run the API
with the committed copies (see the README) and upload the official Test files. Run that way,
without TensorFlow or DagsHub available, the API reproduces each training notebook's Test
predictions exactly: 38 door movements (8 abnormal), the ACV ranking `01|03|04|07|08|06|02|05`, and
all 68 Rail and 16 SHM recordings.
