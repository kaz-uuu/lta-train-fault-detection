import numpy as np
import pandas as pd

from tfd.ps3.model_inputs import acv_features, rail_features, shm_features
from tfd.ps3 import rail


def test_acv_features_match_champion_contract():
    times = pd.date_range("2026-01-01", periods=4, freq="30s")
    case = pd.DataFrame({"Time": times})
    for number, offset in enumerate([0.0, 0.2, 1.5, -0.1], 1):
        car = f"{number:02d}"
        case[f"Car {car} - Indoor Average Temperature"] = 22 + offset
        case[f"Car {car} - ACV Running Mode"] = "Automatic Cooling"
    result = acv_features(case, "case.xlsx")
    assert list(result.columns) == ["file_id", "car", "minutes_with_indoor", "peer_delta_cooling_mean"]
    assert result.loc[result["car"].eq("03"), "peer_delta_cooling_mean"].iloc[0] > 1


def test_rail_features_match_champion_contract():
    rng = np.random.default_rng(7)
    pulse = (np.arange(rail.SAMPLE_RATE) // 50) % 2
    columns = {rail.SPEED: pulse}
    for car in range(1, 9):
        for position in range(1, 9):
            columns[f"Vibration of bearing in position {position} of car {car}"] = rng.normal(size=rail.SAMPLE_RATE)
            columns[f"Shock of bearing in position {position} of car {car}"] = rng.normal(size=rail.SAMPLE_RATE)
    result = rail_features(pd.DataFrame(columns), "Test1.csv")
    assert result.shape == (1, 102)
    assert {"speed_kmh", "vibration_contrast_log_rms_median", "shock_I_ac_rms"} <= set(result)


def test_shm_features_match_champion_contract():
    values = pd.Series(np.sin(np.linspace(0, 100, 20_000)))
    result = shm_features(values, "test01.csv")
    assert result.shape == (1, 40)
    assert np.isfinite(result.drop(columns="file_id").to_numpy()).all()
    assert result["log10_dsum_m5"].iloc[0] > result["log10_dsum_m1"].iloc[0]
