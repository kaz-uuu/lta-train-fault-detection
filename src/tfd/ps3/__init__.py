"""NEBULA X Problem Statement 3 datasets: paths shared by the subsystem loaders."""

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def data_dir() -> Path:
    """Root of the PS3 datasets. `TFD_PS3_DIR` overrides the in-repo copy."""
    default = REPO_ROOT / "problem-statement" / "PS3" / "02_Datasets"
    return Path(os.environ.get("TFD_PS3_DIR", default))
