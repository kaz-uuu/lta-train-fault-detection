"""Rail corrugation subsystem: 1 s files at 10 kHz, a speed-pulse column then vibration and
shock for 8 axle-box positions on each of 8 cars.

Odd positions run on the Side I rail and even positions on the Side II rail.
"""

from __future__ import annotations

import math
import re
from pathlib import Path

import pandas as pd

from . import data_dir

SAMPLE_RATE = 10_000
N_COLUMNS = 129
SPEED = "Rotating speed"
TEETH = 90
WHEEL_DIAMETER_M = 0.85
LABELS = ("Normal", "Side I", "Side II")
CHANNEL = re.compile(r"^(Vibration|Shock) of bearing in position (\d) of car (\d)$")


def rail_dir() -> Path:
    return data_dir() / "Rail_Corrugation"


def load_file(path: str | Path) -> pd.DataFrame:
    return pd.read_csv(path)


def side_of(position: int) -> str:
    return "Side I" if position % 2 else "Side II"


def speed_kmh(pulses: pd.Series, rate: int = SAMPLE_RATE) -> float:
    """Train speed from the toothed-wheel signal: two level changes per tooth."""
    changes = int(pulses.diff().abs().gt(0).sum())
    revolutions_per_s = changes / 2 / TEETH / (len(pulses) / rate)
    return revolutions_per_s * math.pi * WHEEL_DIAMETER_M * 3.6


def channel_table(frame: pd.DataFrame) -> pd.DataFrame:
    """One row per sensor channel: kind, car, position, side and standard deviation (m/s²)."""
    rows = []
    for column in frame.columns:
        match = CHANNEL.match(str(column))
        if match:
            kind, position, car = match.group(1).lower(), int(match.group(2)), int(match.group(3))
            rows.append({"kind": kind, "car": car, "position": position, "side": side_of(position),
                         "std": float(frame[column].std())})
    return pd.DataFrame(rows)
