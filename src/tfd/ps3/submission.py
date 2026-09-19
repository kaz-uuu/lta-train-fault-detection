"""Prediction files in the exact schema of the PS3 brief (Section 4.1, item 2)."""

from __future__ import annotations

import csv
import io
import zipfile
from pathlib import Path

SUBSYSTEMS = ("door", "acv", "rail", "shm")

OUTPUTS: dict[str, tuple[str, list[str]]] = {
    "door": ("door_predictions.csv", ["start_time", "end_time", "prediction"]),
    "acv": ("acv_predictions.csv", ["file_id", "ranked_cars"]),
    "rail": ("rail_predictions.csv", ["file_id", "prediction"]),
    "shm": ("shm_predictions.csv", ["file_id", "prediction"]),
}

ZIP_NAME = "predictions.zip"


def to_csv(subsystem: str, rows: list[dict]) -> str:
    """Render prediction rows with the subsystem's columns, in order, and nothing else."""
    _, columns = OUTPUTS[subsystem]
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue()


def to_zip(csvs: dict[str, str]) -> bytes:
    """Zip subsystem CSVs at the top level of the archive, named as the brief requires."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for subsystem, text in csvs.items():
            archive.writestr(OUTPUTS[subsystem][0], text)
    return buffer.getvalue()


def sniff(path: str | Path) -> str | None:
    """Guess which subsystem a data file belongs to from its first bytes."""
    with open(path, "rb") as f:
        head = f.read(4096)
    if head.startswith(b"PK"):
        return "acv"
    first = head.split(b"\n", 1)[0].decode("utf-8", errors="ignore")
    if "Motor current" in first:
        return "door"
    if first.startswith("Rotating speed"):
        return "rail"
    try:
        float(first.strip())
        return "shm"
    except ValueError:
        return None
