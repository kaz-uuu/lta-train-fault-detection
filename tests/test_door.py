import pandas as pd
import pytest

from tfd.ps3 import door


def test_parse_time_reads_unpadded_fields_and_milliseconds():
    t = door.parse_time(pd.Series(["2023-7-5-0-0-3-760", "2023-12-31-23-59-59-5"]))
    assert t[0] == pd.Timestamp("2023-07-05 00:00:03.760")
    assert t[1] == pd.Timestamp("2023-12-31 23:59:59.005")


def test_split_cycles_starts_a_run_at_each_gap():
    time = pd.Series(pd.to_datetime(["2023-01-01 00:00:00.00", "2023-01-01 00:00:00.02",
                                     "2023-01-01 00:00:30.00", "2023-01-01 00:00:30.02"]))
    assert door.split_cycles(time).tolist() == [0, 0, 1, 1]


def test_cycle_table_reports_bounds_and_row_counts():
    stream = pd.DataFrame({"time": pd.to_datetime(["2023-01-01 00:00:00.00", "2023-01-01 00:00:00.02",
                                                   "2023-01-01 00:00:09.00"])})
    runs = door.cycle_table(stream)
    assert runs["n_rows"].tolist() == [2, 1]
    assert runs.loc[0, "end"] == pd.Timestamp("2023-01-01 00:00:00.02")


@pytest.mark.skipif(not (door.door_dir() / "Train.csv").exists(), reason="PS3 Door data not present")
def test_gap_runs_reproduce_the_train_answers():
    runs = door.cycle_table(door.load_stream(door.door_dir() / "Train.csv"))
    seg = door.load_segments(door.door_dir() / "Train_Segments_Answer.csv")
    assert len(runs) == len(seg)
    assert (runs["start"].values == seg["start"].values).all()
    assert (runs["end"].values == seg["end"].values).all()
    assert (runs["n_rows"].values == seg["n_rows"].values).all()
