"""Transform raw PS3 uploads into the registered champions' input contracts."""

from __future__ import annotations

import re
import numpy as np
import pandas as pd
import rainflow
from scipy import signal, stats
from . import rail

ACV_ALIASES = {
    "indoor": ["Indoor Average Temperature", "Passenger Cabin Temperature Detected Value"],
    "mode": ["ACV Running Mode"],
    "valid": ["ACV Information Valid"],
    "setting": ["ACV Setting Mode", "ACV Control Mode"],
}
COOLING_MODES = {"Automatic Cooling", "Full Cooling", "Half Cooling"}


def acv_features(case: pd.DataFrame, file_id: str) -> pd.DataFrame:
    """Reproduce the two per-car features used by the ACV champion."""
    pattern, mapped = re.compile(r"^Car (\d{2}) - (.+)$"), {}
    for column in case.columns:
        match = pattern.match(str(column))
        if not match:
            continue
        car, parameter = match.groups()
        for field, aliases in ACV_ALIASES.items():
            if parameter in aliases:
                mapped.setdefault(car, {})[field] = str(column)
    parts = []
    for car in sorted(mapped):
        fields = mapped[car]
        block = pd.DataFrame({"time": pd.to_datetime(case["Time"], errors="coerce"), "car": car})
        for field in ACV_ALIASES:
            block[field] = case[fields[field]] if field in fields else np.nan
        block["indoor"] = pd.to_numeric(block["indoor"], errors="coerce")
        invalid = block["valid"].eq("Invalid") | block["mode"].eq("Invalid") | block["setting"].eq("Invalid")
        block.loc[invalid | block["indoor"].le(0), "indoor"] = np.nan
        block["minute"] = block["time"].dt.floor("1min")
        parts.append(block)
    if len(parts) < 2:
        raise ValueError("ACV inference needs at least two recognised cars.")
    long = pd.concat(parts, ignore_index=True)
    keys = ["car", "minute"]
    indoor = long.groupby(keys, dropna=False)["indoor"].median()
    counts = long.dropna(subset=["mode"]).groupby(keys + ["mode"]).size().rename("n").reset_index()
    mode = (counts.sort_values(keys + ["n", "mode"], ascending=[True, True, False, True])
            .drop_duplicates(keys).set_index(keys)["mode"])
    grid = indoor.to_frame().join(mode).reset_index()
    wide = grid.pivot_table(index="minute", columns="car", values="indoor")
    peers = []
    for car in wide.columns:
        others = wide.drop(columns=car)
        peers.append(pd.DataFrame({"minute": wide.index, "car": car, "peer_median": others.median(axis=1), "peers": others.notna().sum(axis=1)}))
    grid = grid.merge(pd.concat(peers, ignore_index=True), on=["minute", "car"], how="left")
    grid["peer_delta"] = (grid["indoor"] - grid["peer_median"]).where(grid["peers"] >= 3)
    grid["cooling"] = grid["mode"].isin(COOLING_MODES)
    return pd.DataFrame([{
        "file_id": file_id,
        "car": car,
        "minutes_with_indoor": float((block := grid[grid["car"].eq(car)])["indoor"].notna().sum()),
        "peer_delta_cooling_mean": float(block.loc[block["cooling"], "peer_delta"].mean()),
    } for car in sorted(mapped)])


RAIL_FS, NPERSEG, NOVERLAP = 10_000, 1024, 512
FREQS = np.fft.rfftfreq(NPERSEG, 1 / RAIL_FS)
DF = FREQS[1]
FREQ_BANDS = {"f0_100": (0, 100), "f100_500": (100, 500), "f500_1500": (500, 1500), "f1500_5000": (1500, 5001)}
WAVE_BANDS = {"w10_20mm": (.01, .02), "w20_40mm": (.02, .04), "w40_80mm": (.04, .08), "w80_160mm": (.08, .16), "w160_320mm": (.16, .32), "w320_640mm": (.32, .64)}


def _rail_channels(accel: np.ndarray, speed_ms: float) -> pd.DataFrame:
    x = accel - accel.mean(axis=0)
    rms, peak = np.sqrt(np.mean(x ** 2, axis=0)), np.abs(x).max(axis=0)
    psd = signal.welch(x, fs=RAIL_FS, nperseg=NPERSEG, noverlap=NOVERLAP, window="hann", detrend="constant", axis=0)[1]
    total, nan = psd.sum(axis=0), np.full(x.shape[1], np.nan)
    values = {
        "ac_rms": rms, "peak": peak,
        "crest": np.divide(peak, rms, out=nan.copy(), where=rms > 0),
        "kurtosis": stats.kurtosis(x, axis=0), "skewness": stats.skew(x, axis=0),
        "spectral_centroid": np.divide((FREQS[:, None] * psd).sum(axis=0), total, out=nan.copy(), where=total > 0),
    }
    for name, (lo, hi) in FREQ_BANDS.items():
        inside = (FREQS >= lo) & (FREQS < hi)
        values[f"{name}_share"] = np.divide(psd[inside].sum(axis=0), total, out=nan.copy(), where=total > 0)
    for name, (lo, hi) in WAVE_BANDS.items():
        inside = ((FREQS > speed_ms / hi) & (FREQS <= speed_ms / lo)) if speed_ms > 0 else np.zeros(len(FREQS), bool)
        power = psd[inside].sum(axis=0) * DF if inside.sum() >= 2 else nan.copy()
        values[f"{name}_logpow"] = np.log10(np.where(power > 0, power, np.nan))
    return pd.DataFrame(values)


def rail_features(frame: pd.DataFrame, file_id: str) -> pd.DataFrame:
    """Reproduce the 101 recording features used by the Rail champion."""
    rows, columns = [], []
    for column in frame.columns[1:]:
        match = rail.CHANNEL.match(str(column))
        if match:
            kind, position, car = match.groups(); position, car = int(position), int(car)
            columns.append(column)
            rows.append({"kind": kind, "position": position, "car": car, "side": rail.side_of(position), "axle": (position + 1) // 2})
    if len(columns) != 128:
        raise ValueError(f"Expected 128 Rail sensor channels, found {len(columns)}.")
    pulse = frame[rail.SPEED].to_numpy(float)
    rising_edges = int((np.diff(pulse) == 1).sum())
    speed = rising_edges * np.pi * rail.WHEEL_DIAMETER_M * 3.6 / rail.TEETH / ((len(pulse) - 1) / RAIL_FS)
    feats = _rail_channels(frame[columns].to_numpy(float), speed / 3.6)
    channels, feature_cols = pd.concat([pd.DataFrame(rows), feats], axis=1), list(feats.columns)
    tags, flat = {"Side I": "I", "Side II": "II"}, {}
    grouped = channels.groupby(["kind", "side"])
    side = grouped[feature_cols].median().unstack(["kind", "side"])
    flat.update({f"{kind.lower()}_{tags[side_name]}_{feature}": float(value) for (feature, kind, side_name), value in side.items()})
    flat.update({f"{kind.lower()}_{tags[side_name]}_max_rms": float(value) for (kind, side_name), value in grouped["ac_rms"].max().items()})
    keyed = channels.assign(log_rms=np.log(channels["ac_rms"].where(channels["ac_rms"] > 0)))
    contrasted = ["log_rms", "kurtosis"] + [f"{name}_logpow" for name in WAVE_BANDS]
    index = ["kind", "car", "axle"]
    difference = keyed[keyed["position"] % 2 == 1].set_index(index)[contrasted] - keyed[keyed["position"] % 2 == 0].set_index(index)[contrasted]
    for kind, block in difference.groupby(level="kind"):
        for feature in contrasted:
            values, prefix = block[feature], f"{str(kind).lower()}_contrast_{feature}"
            flat[f"{prefix}_median"] = float(values.median())
            flat[f"{prefix}_pos_share"] = float((values > 0).where(values.notna()).mean())
    return pd.DataFrame([{"file_id": file_id, "speed_kmh": float(speed), **flat}])


def _weighted_quantile(ranges: np.ndarray, counts: np.ndarray, q: float) -> float:
    order = np.argsort(ranges); ordered, weights = ranges[order], counts[order]
    return float(ordered[np.searchsorted(np.cumsum(weights) / weights.sum(), q)])


def shm_features(values: pd.Series, file_id: str) -> pd.DataFrame:
    """Reproduce the 39 recording features used by the SHM champion."""
    x = values.to_numpy(float)
    cycles = np.asarray([(rng, count) for rng, _, count, _, _ in rainflow.extract_cycles(x)], dtype=float)
    ranges, counts, centred = cycles[:, 0], cycles[:, 1], x - x.mean()
    total, reversals = counts.sum(), sum(1 for _ in rainflow.reversals(x))
    freqs, power = signal.welch(x, fs=1.0, nperseg=4096)
    row = {
        "file_id": file_id, "mean": float(x.mean()), "std": float(x.std()), "peak_to_peak": float(np.ptp(x)),
        "skewness": float(stats.skew(x)), "kurtosis": float(stats.kurtosis(x)),
        "diff_rms": float(np.sqrt(np.mean(np.diff(x) ** 2))),
        "mean_crossing_rate": float(np.mean(np.diff(np.sign(centred)) != 0)),
        "turning_point_rate": float(reversals / len(x)), "spectral_centroid": float((freqs * power).sum() / power.sum()),
        **{f"range_p{label}": _weighted_quantile(ranges, counts, q) for label, q in [("50", .5), ("90", .9), ("99", .99), ("999", .999)]},
        "cycle_count": float(total), "half_cycles": float(np.sum(counts == .5)),
    }
    for exponent in range(1, 13):
        weighted = float(np.sum(counts * ranges ** exponent))
        row[f"log10_dsum_m{exponent}"] = float(np.log10(weighted))
        row[f"eq_range_m{exponent}"] = float((weighted / total) ** (1 / exponent))
    return pd.DataFrame([row])
