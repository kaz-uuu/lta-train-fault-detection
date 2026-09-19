"""SHM subsystem: one dynamic-stress segment per file, a single unlabelled column of values.

The files have no header row, so the first line is data.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from . import data_dir

N_SAMPLES = 581_120


def shm_dir() -> Path:
    return data_dir() / "SHM"


def load_file(path: str | Path) -> pd.Series:
    """Read a stress file as floats; raises if it holds more than one column."""
    frame = pd.read_csv(path, header=None)
    if frame.shape[1] != 1:
        raise ValueError(f"expected one column of stress values, found {frame.shape[1]}")
    return pd.to_numeric(frame[0], errors="raise").astype(float)


def envelope(values: pd.Series, buckets: int = 600) -> tuple[np.ndarray, np.ndarray]:
    """Minimum and maximum of each of `buckets` equal slices, for drawing a long trace."""
    chunks = np.array_split(values.to_numpy(), buckets)
    return np.array([c.min() for c in chunks]), np.array([c.max() for c in chunks])
