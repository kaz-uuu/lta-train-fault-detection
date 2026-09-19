"""ACV subsystem: one refrigerant-leak case per .xlsx, all cars of a train logged every 30 s.

Per-car columns are named `Car NN - <parameter>`; the parameter set differs between files.
"""

from __future__ import annotations

import re
from pathlib import Path

import pandas as pd

from . import data_dir

TIME = "Time"
CAR_COLUMN = re.compile(r"^Car (\d{2}) - (.+)$")
INDOOR = "Indoor Average Temperature"
OUTDOOR = "Outdoor Average Temperature"
SETPOINT = "ACV Control Temperature (Cooling)"
RUNNING_MODE = "ACV Running Mode"
COOLING = "Automatic Cooling"


def acv_dir() -> Path:
    return data_dir() / "ACV"


def load_case(path: str | Path) -> pd.DataFrame:
    """Read the first sheet of a case file."""
    return pd.read_excel(path, sheet_name=0)


def car_parameters(case: pd.DataFrame) -> dict[str, list[str]]:
    """Car identifier (as written in the headers) to its parameter names, in column order."""
    cars: dict[str, list[str]] = {}
    for column in case.columns:
        match = CAR_COLUMN.match(str(column))
        if match:
            cars.setdefault(match.group(1), []).append(match.group(2))
    return dict(sorted(cars.items()))


def car_frame(case: pd.DataFrame, car: str) -> pd.DataFrame:
    """One car's parameters as plain column names, indexed by time."""
    prefix = f"Car {car} - "
    columns = [c for c in case.columns if str(c).startswith(prefix)]
    frame = case[columns].rename(columns=lambda c: c[len(prefix):])
    return frame.set_index(case[TIME]) if TIME in case else frame


def cooling_summary(case: pd.DataFrame) -> pd.DataFrame:
    """Per car: share of samples in automatic cooling, and indoor temperature above the cooling
    setpoint while cooling. Values are NaN where a file lacks the needed parameters."""
    rows = {}
    for car in car_parameters(case):
        frame = car_frame(case, car)
        row = {"cooling_share": float("nan"), "indoor_mean": float("nan"), "gap_while_cooling": float("nan")}
        if INDOOR in frame:
            row["indoor_mean"] = float(frame[INDOOR].mean())
        if RUNNING_MODE in frame:
            cooling = frame[RUNNING_MODE].eq(COOLING)
            row["cooling_share"] = float(cooling.mean())
            if INDOOR in frame and SETPOINT in frame and cooling.any():
                row["gap_while_cooling"] = float((frame[INDOOR] - frame[SETPOINT])[cooling].mean())
        rows[car] = row
    return pd.DataFrame.from_dict(rows, orient="index").rename_axis("car")
