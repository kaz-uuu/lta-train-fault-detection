"""Download immutable copies of all DagsHub champions for the Cloud Run image."""

from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

import dagshub
import mlflow
from mlflow import MlflowClient

MODELS = {
    "door": "door_resistance_classifier",
    "acv": "acv_car_ranker",
    "rail": "rc_corrugation_classifier",
    "shm": "shm_damage_regressor",
}


def main() -> None:
    repo = Path(__file__).resolve().parents[1]
    destination = (repo / ".model_artifacts").resolve()
    if destination.parent != repo.resolve():
        raise RuntimeError("Model destination escaped the repository.")
    dagshub.init(
        repo_owner=os.getenv("DAGSHUB_REPO_OWNER", "kaz-uuu"),
        repo_name=os.getenv("DAGSHUB_REPO_NAME", "lta-train-fault-detection"),
        mlflow=True,
    )
    client = MlflowClient()
    destination.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="tfd-models-") as temporary:
        for subsystem, registered_name in MODELS.items():
            version = client.get_model_version_by_alias(registered_name, "champion")
            downloaded = Path(mlflow.artifacts.download_artifacts(
                artifact_uri=f"models:/{registered_name}/{version.version}", dst_path=temporary
            ))
            target = destination / subsystem
            if target.exists():
                shutil.rmtree(target)
            shutil.copytree(downloaded, target)
            print(f"{subsystem}: {registered_name} v{version.version} -> {target.relative_to(repo)}")


if __name__ == "__main__":
    main()
