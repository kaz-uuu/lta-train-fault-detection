"""Door subsystem: the continuous controller stream and its labelled open/close cycles.

Inside a cycle the controller logs a row every 20 ms. Between cycles nothing is logged,
so consecutive rows more than one period apart belong to different cycles.
"""

from pathlib import Path

import numpy as np
import pandas as pd

from . import data_dir

TIME = "Datetime"
CURRENT = "Motor current(mA)"
VOLTAGE = "Motor Voltage(10mV)"
BACK_EMF = "Motor electrodynamic force"
OPEN_TIME = "Door opening time(.1s)"
CLOSE_TIME = "Door closing time(.1s)"
POSITION = "Door leaf position"

ANALOGUE = [CURRENT, VOLTAGE, BACK_EMF, POSITION]
TIMING = [OPEN_TIME, CLOSE_TIME]
COMMANDS = ["Open command", "Close command"]
SWITCHES = ["DCSR", "DCSL", "DLSR", "DLSL"]
FLAGS = ["Door Opened", "Door Locked", "Door is opening", "Door is closing"]

COLUMNS = [TIME, CURRENT, VOLTAGE, BACK_EMF, OPEN_TIME, CLOSE_TIME, *COMMANDS, *SWITCHES, *FLAGS, POSITION]

SAMPLE_PERIOD = pd.Timedelta("20ms")
LABELS = ("Normal", "Abnormal resistance")


def door_dir() -> Path:
    return data_dir() / "Door"


def parse_time(values: pd.Series) -> pd.Series:
    """Parse the native `2023-7-5-0-0-3-760` format (unpadded fields, milliseconds last)."""
    parts = values.str.split("-", expand=True).astype(int)
    parts.columns = ["year", "month", "day", "hour", "minute", "second", "ms"]
    whole = pd.to_datetime(parts[["year", "month", "day", "hour", "minute", "second"]])
    return (whole + pd.to_timedelta(parts["ms"], unit="ms")).rename("time")


def format_time(time: pd.Series) -> pd.Series:
    """Format datetimes in the native style, the inverse of `parse_time`."""
    t = time.dt
    fields = [t.year, t.month, t.day, t.hour, t.minute, t.second, t.microsecond // 1000]
    return pd.concat([f.astype(str) for f in fields], axis=1).agg("-".join, axis=1)


def load_stream(path: str | Path) -> pd.DataFrame:
    """Read Train.csv or Test.csv and prepend a parsed `time` column."""
    df = pd.read_csv(path)
    df.insert(0, "time", parse_time(df[TIME]))
    return df


def load_segments(path: str | Path) -> pd.DataFrame:
    """Read Train_Segments_Answer.csv with parsed `start` and `end` columns."""
    seg = pd.read_csv(path)
    seg["start"] = parse_time(seg["start_time"])
    seg["end"] = parse_time(seg["end_time"])
    return seg


def split_cycles(time: pd.Series, period: pd.Timedelta = SAMPLE_PERIOD) -> pd.Series:
    """Number runs of contiguous samples; a new run starts wherever the step exceeds `period`."""
    return (time.diff() > period).cumsum().rename("cycle")


def cycle_table(stream: pd.DataFrame) -> pd.DataFrame:
    """One row per gap-delimited run: first and last timestamp and the number of rows."""
    runs = stream.groupby(split_cycles(stream["time"]))["time"]
    return runs.agg(start="first", end="last", n_rows="size")


def operation_of(stream: pd.DataFrame) -> pd.Series:
    """Per run: Open when the open command is ever active, otherwise Close."""
    runs = stream.groupby(split_cycles(stream["time"]))["Open command"].max()
    return runs.map({1: "Open", 0: "Close"}).rename("operation")


def cycles(stream: pd.DataFrame) -> pd.DataFrame:
    """Gap-delimited runs with their bounds, row count and operation."""
    return cycle_table(stream).join(operation_of(stream))


def current_profiles(stream: pd.DataFrame, n: int = 100) -> pd.DataFrame:
    """Each run's motor current resampled to `n` points across its length; one row per run."""
    grid = np.linspace(0, 1, n)
    runs = stream.groupby(split_cycles(stream["time"]))[CURRENT]
    rows = {c: np.interp(grid, np.linspace(0, 1, len(s)), s.to_numpy(float)) for c, s in runs}
    return pd.DataFrame.from_dict(rows, orient="index").rename_axis("cycle")
