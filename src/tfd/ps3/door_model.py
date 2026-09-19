"""Door baseline: split the stream at logging gaps, then label each cycle by its mean motor
current over the part of the stroke where abnormal resistance shows.

The windows come from notebooks/door_eda.ipynb (Sections 9.3 and 11.6): opening resistance
raises current just after the start-up peak, closing resistance raises it mid-stroke. Whole-cycle
means are avoided because the Test stream differs from Train at the start and end of cycles.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .door import LABELS, current_profiles, cycle_table, cycles, operation_of

NORMAL, ABNORMAL = LABELS

# percent of cycle progress, [start, end)
WINDOWS = {"Open": (20, 40), "Close": (35, 65)}


def window_current(profiles: pd.DataFrame, operations: pd.Series) -> pd.Series:
    """Mean of each resampled current profile over its operation's window."""
    return pd.Series(
        {c: profiles.loc[c, WINDOWS[op][0] : WINDOWS[op][1] - 1].mean() for c, op in operations.items()},
        name="window_current",
    )


def _threshold(values: pd.Series, status: pd.Series) -> float:
    """Midpoint of the gap between classes; midpoint of the class medians if they overlap."""
    normal, abnormal = values[status == NORMAL], values[status == ABNORMAL]
    if abnormal.min() > normal.max():
        return float((normal.max() + abnormal.min()) / 2)
    return float((normal.median() + abnormal.median()) / 2)


@dataclass
class DoorBaseline:
    thresholds: dict[str, float] = field(default_factory=dict)
    margins: dict[str, float] = field(default_factory=dict)
    references: dict[tuple[str, str], list[float]] = field(default_factory=dict)
    n_train: int = 0
    loo_accuracy: float = float("nan")

    name = "Door baseline"
    version = "1.0"

    @classmethod
    def fit(cls, stream: pd.DataFrame, segments: pd.DataFrame) -> DoorBaseline:
        """Fit per-operation thresholds on a labelled stream and its segment answers."""
        runs = cycle_table(stream)
        if len(runs) != len(segments) or not (runs["start"].to_numpy() == segments["start"].to_numpy()).all():
            raise ValueError("segment answers do not line up with the stream's gap-delimited cycles")

        operations = operation_of(stream)
        status = pd.Series(segments["status"].to_numpy(), index=runs.index)
        profiles = current_profiles(stream)
        feature = window_current(profiles, operations)

        model = cls(n_train=len(runs))
        for op in WINDOWS:
            mask = operations == op
            model.thresholds[op] = _threshold(feature[mask], status[mask])
            normal, abnormal = feature[mask & (status == NORMAL)], feature[mask & (status == ABNORMAL)]
            model.margins[op] = float(abnormal.min() - normal.max())
        for (op, label), block in profiles.groupby([operations, status]):
            model.references[(op, label)] = block.median().round(1).tolist()

        hits = 0
        for c in runs.index:
            keep = (operations == operations[c]) & (runs.index != c)
            threshold = _threshold(feature[keep], status[keep])
            hits += (ABNORMAL if feature[c] > threshold else NORMAL) == status[c]
        model.loo_accuracy = hits / len(runs)
        return model

    def predict(self, stream: pd.DataFrame) -> pd.DataFrame:
        """One row per detected cycle: bounds, operation, window current, threshold and label."""
        table = cycles(stream)
        feature = window_current(current_profiles(stream), table["operation"])
        threshold = table["operation"].map(self.thresholds)
        label = np.where(feature > threshold, ABNORMAL, NORMAL)
        return table.assign(window_current=feature, threshold=threshold, prediction=label)
