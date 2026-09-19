"""Lazy access to the four champion models in the team's DagsHub MLflow registry."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from threading import Lock
from typing import Protocol

import pandas as pd

log = logging.getLogger("tfd.models")


@dataclass(frozen=True)
class ModelSpec:
    registered_name: str
    validation: str
    method: str


SPECS: dict[str, ModelSpec] = {
    "door": ModelSpec("door_resistance_classifier", "IoU-weighted F1 1.000 across five held-out folds", "Compares mean motor current over a fixed window of each movement with a threshold learned from labelled movements. Selected over seven alternative architectures."),
    "acv": ModelSpec("acv_car_ranker", "Mean rank-decay score 0.979 under leave-one-case-out validation", "Ranks cars by how much warmer each runs than the other cars in the same train while cooling."),
    "rail": ModelSpec("rc_corrugation_classifier", "Macro F1 0.784 under grouped cross-validation", "LightGBM classifier on amplitude, spectral, wavelength and side-contrast features."),
    "shm": ModelSpec("shm_damage_regressor", "Mean absolute percentage error 0.023 under four-fold cross-validation", "Elastic Net regression on rainflow-cycle, stress-range distribution and signal features."),
}


class Predictor(Protocol):
    def predict(self, subsystem: str, frame: pd.DataFrame) -> pd.DataFrame: ...


class DagsHubChampions:
    """Download each champion once, on its first prediction request."""

    def __init__(self) -> None:
        self._models: dict[str, object] = {}
        self._versions: dict[str, str] = {}
        self._lock = Lock()
        self._tracking_ready = False

    @staticmethod
    def uri(subsystem: str) -> str:
        return os.getenv(f"TFD_MODEL_URI_{subsystem.upper()}") or f"models:/{SPECS[subsystem].registered_name}@champion"

    def configured(self, subsystem: str) -> bool:
        return subsystem in SPECS

    def version(self, subsystem: str) -> str:
        return self._versions.get(subsystem, "champion")

    def _configure_tracking(self) -> None:
        if self._tracking_ready:
            return
        if not os.getenv("MLFLOW_TRACKING_URI"):
            import dagshub
            dagshub.init(repo_owner=os.getenv("DAGSHUB_REPO_OWNER", "kaz-uuu"), repo_name=os.getenv("DAGSHUB_REPO_NAME", "lta-train-fault-detection"), mlflow=True)
        self._tracking_ready = True

    def _load(self, subsystem: str):
        if subsystem in self._models:
            return self._models[subsystem]
        with self._lock:
            if subsystem in self._models:
                return self._models[subsystem]
            import mlflow
            from mlflow import MlflowClient
            uri = self.uri(subsystem)
            # Cloud/container deployments bake immutable champion artifacts into
            # the image. They neither need DagsHub credentials nor its client.
            if uri.startswith("models:/") or uri.startswith("runs:/") or uri.startswith("mlflow-artifacts:/"):
                self._configure_tracking()
            log.info("Loading %s champion from %s", subsystem, uri)
            model = mlflow.pyfunc.load_model(uri)
            self._models[subsystem] = model
            if uri.endswith("@champion"):
                self._versions[subsystem] = MlflowClient().get_model_version_by_alias(SPECS[subsystem].registered_name, "champion").version
            else:
                self._versions[subsystem] = uri
            return model

    def predict(self, subsystem: str, frame: pd.DataFrame) -> pd.DataFrame:
        result = self._load(subsystem).predict(frame)
        return result if isinstance(result, pd.DataFrame) else pd.DataFrame(result)
