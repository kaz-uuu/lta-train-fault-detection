# Model serving

The FastAPI workbench serves the same four model packages that were selected and registered by
the training notebooks. It does not train substitute models at application startup.

## Request path

1. `backend/workbench.py` validates the uploaded native file.
2. `src/tfd/ps3/model_inputs.py` reproduces the selected model's preprocessing contract.
3. `backend/model_registry.py` resolves `models:/<registered-name>@champion` through DagsHub.
4. The MLflow pyfunc package validates its schema and returns predictions.
5. The workbench exposes the result and writes the exact competition CSV schema.

Models load only on their first request and remain cached in the API process. A registry or model
failure becomes a failed file check instead of terminating the service.

## Configuration

Run `dagshub login` for local development. In deployment, supply credentials through the hosting
platform's secret manager; never store a token in `.env` or Git. `.env.example` contains only
non-secret repository settings and optional immutable model URI overrides.

The default aliases are:

| Subsystem | URI |
|---|---|
| Door | `models:/door_resistance_classifier@champion` |
| ACV | `models:/acv_car_ranker@champion` |
| Rail | `models:/rc_corrugation_classifier@champion` |
| SHM | `models:/shm_damage_regressor@champion` |

For a reproducible release, set `TFD_MODEL_URI_DOOR`, `TFD_MODEL_URI_ACV`,
`TFD_MODEL_URI_RAIL`, and `TFD_MODEL_URI_SHM` to numeric registered versions.

## Verification

```bash
python -m pytest -q
python scripts/export_openapi.py frontend/openapi.json
cd frontend && npm run build
```

The feature tests validate the serving schemas. During implementation, Rail and SHM serving
features were also compared column-for-column with their saved preprocessing tables, and all four
live DagsHub champions were exercised on the official Test files.
