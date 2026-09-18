"""Global configuration / hyperparameters."""

FS = 10000                 # sampling frequency (Hz)
WHEEL_DIAMETER = 0.85       # meters
N_TEETH = 90                # toothed wheel teeth count
N_CARS = 8
N_POS_PER_CAR = 8
N_INSTANCES_PER_SIDE = N_CARS * 4          # 8 cars * 4 positions = 32 axle boxes

SIDE1_POSITIONS = [1, 3, 5, 7]
SIDE2_POSITIONS = [2, 4, 6, 8]

# --- Angular (spatial) resampling ---
DS = 0.005                  # spatial sampling interval (m) = 5 mm  (resolves wavelengths >= 10mm)
MAX_DIST = 20.0              # meters, max distance covered per 1s window we resample onto
SPATIAL_LEN = int(MAX_DIST / DS)   # 4000 points

# --- Raw time-domain branch (decimated) ---
RAW_DECIMATE = 5
RAW_LEN = FS // RAW_DECIMATE      # 2000 points

# --- Model ---
EMBED_DIM = 64
ATTN_DIM = 64

# --- Training ---
BATCH_SIZE = 8
EPOCHS = 150
LR = 1e-3
VAL_SPLIT = 0.15
SEED = 42

# --- Label mapping ---
LABEL_NORMAL = "Normal"
LABEL_SIDE1 = "Side I"
LABEL_SIDE2 = "Side II"

# --- Inference ---
DEFAULT_THRESHOLD = 0.5
preprocessing.py
python
"""
Speed estimation, order-tracking (distance) resampling, and per-file
feature-tensor construction for the rail corrugation detection model.
"""

import numpy as np
import pandas as pd
import config as C


# ----------------------------------------------------------------------
# Speed / distance estimation
# ----------------------------------------------------------------------
def estimate_speed_mps(speed_col, fs=C.FS, wheel_diameter=C.WHEEL_DIAMETER,
                        teeth=C.N_TEETH, fallback_speed=20.0):
    """
    Estimate instantaneous speed (m/s) at every sample.

    Handles two possible encodings of column 1:
      (a) raw 0/1 toothed-wheel toggle signal -> derive speed from pulse timing
      (b) already-computed speed value (assumed km/h) -> convert to m/s

    Returns
    -------
    speeds : np.ndarray, shape (N,)
    """
    speed_col = np.asarray(speed_col, dtype=np.float64)
    unique_vals = np.unique(np.round(speed_col, 3))

    is_binary = len(unique_vals) <= 3 and set(np.round(unique_vals).tolist()) <= {0.0, 1.0}

    n = len(speed_col)
    if is_binary:
        diff = np.diff(speed_col.astype(int))
        rising_idx = np.where(diff == 1)[0] + 1
        circumference = np.pi * wheel_diameter
        dist_per_tooth = circumference / teeth

        speeds = np.full(n, fallback_speed, dtype=np.float64)
        if len(rising_idx) >= 2:
            for i in range(len(rising_idx) - 1):
                idx0, idx1 = rising_idx[i], rising_idx[i + 1]
                dt = (idx1 - idx0) / fs
                v = dist_per_tooth / dt if dt > 0 else fallback_speed
                speeds[idx0:idx1] = v
            speeds[:rising_idx[0]] = speeds[rising_idx[0]]
            speeds[rising_idx[-1]:] = speeds[rising_idx[-2]]
        return speeds
    else:
        # Assume column already holds speed in km/h -> convert to m/s.
        # If your data is already m/s, remove the /3.6 conversion.
        speeds = speed_col / 3.6
        speeds = np.clip(speeds, 0.1, None)  # avoid zero/negative
        return speeds


def speed_to_distance(speeds, fs=C.FS):
    """Cumulative distance traveled (m) via simple rectangle integration."""
    return np.cumsum(speeds) / fs


def resample_to_distance(signal, distance, ds=C.DS, max_dist=C.MAX_DIST):
    """
    Resample a time-uniform signal onto a uniform *distance* grid
    (order tracking). Beyond the distance actually traveled, the
    signal is zero-padded (natural handling of variable speed/length).
    """
    n_points = int(max_dist / ds)
    grid = np.arange(n_points) * ds
    resampled = np.interp(grid, distance, signal, left=0.0, right=0.0)
    return resampled.astype(np.float32)


def normalize(x, eps=1e-6):
    """Per-channel z-score normalization along time axis (axis=0)."""
    mean = x.mean(axis=0, keepdims=True)
    std = x.std(axis=0, keepdims=True)
    return (x - mean) / (std + eps)


# ----------------------------------------------------------------------
# Column indexing
# ----------------------------------------------------------------------
def get_axlebox_columns(car, pos):
    """car: 1-8, pos: 1-8 -> (vib_idx, shock_idx) into the 128-col data block."""
    base = (car - 1) * 16 + (pos - 1) * 2
    return base, base + 1


def build_side_instances(data, positions, cars=range(1, C.N_CARS + 1)):
    """Return list of (vib, shock) 1-D arrays for every (car, position) on one side."""
    instances = []
    for c in cars:
        for p in positions:
            vib_idx, shock_idx = get_axlebox_columns(c, p)
            instances.append((data[:, vib_idx], data[:, shock_idx]))
    return instances


# ----------------------------------------------------------------------
# Full file -> tensors
# ----------------------------------------------------------------------
def load_raw_file(filepath):
    """Load csv, return (speed_col, data[128 cols])."""
    df = pd.read_csv(filepath, header=None)
    arr = df.values.astype(np.float32)
    speed_col = arr[:, 0]
    data = arr[:, 1:129]
    return speed_col, data


def process_side_instances(inst_list, distance,
                            raw_decimate=C.RAW_DECIMATE,
                            ds=C.DS, max_dist=C.MAX_DIST):
    """
    Convert list of (vib, shock) pairs into:
      raw_stack : (n_instances, RAW_LEN, 2)
      ang_stack : (n_instances, SPATIAL_LEN, 2)
    """
    raw_list, ang_list = [], []
    for vib, shock in inst_list:
        raw_vib = vib[::raw_decimate]
        raw_shock = shock[::raw_decimate]
        raw_stack = np.stack([raw_vib, raw_shock], axis=-1)
        raw_stack = normalize(raw_stack)

        ang_vib = resample_to_distance(vib, distance, ds, max_dist)
        ang_shock = resample_to_distance(shock, distance, ds, max_dist)
        ang_stack = np.stack([ang_vib, ang_shock], axis=-1)
        ang_stack = normalize(ang_stack)

        raw_list.append(raw_stack)
        ang_list.append(ang_stack)

    return np.stack(raw_list).astype(np.float32), np.stack(ang_list).astype(np.float32)


def preprocess_file(filepath):
    """
    Full pipeline for one CSV file.

    Returns
    -------
    raw1, ang1, raw2, ang2 : np.ndarray tensors ready to feed the model
        raw*: (N_INSTANCES_PER_SIDE, RAW_LEN, 2)
        ang*: (N_INSTANCES_PER_SIDE, SPATIAL_LEN, 2)
    """
    speed_col, data = load_raw_file(filepath)
    speeds = estimate_speed_mps(speed_col)
    distance = speed_to_distance(speeds)

    side1_inst = build_side_instances(data, C.SIDE1_POSITIONS)
    side2_inst = build_side_instances(data, C.SIDE2_POSITIONS)

    raw1, ang1 = process_side_instances(side1_inst, distance)
    raw2, ang2 = process_side_instances(side2_inst, distance)

    return raw1, ang1, raw2, ang2