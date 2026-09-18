import io
import zipfile

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from tfd.ps3 import door, rail, submission

HAS_DOOR = (door.door_dir() / "Train.csv").exists() and (door.door_dir() / "Test.csv").exists()


@pytest.fixture()
def client():
    return TestClient(create_app())


def new_run(client, subsystem):
    res = client.post("/api/ps3/runs", json={"subsystem": subsystem})
    assert res.status_code == 201
    return res.json()["id"]


def upload(client, run_id, name, content: bytes):
    res = client.post(f"/api/ps3/runs/{run_id}/files", files={"file": (name, content)})
    assert res.status_code == 200
    return res.json()


def rail_csv(seconds_of_pulses: int = 900) -> bytes:
    rng = np.random.default_rng(0)
    pulses = (np.arange(rail.SAMPLE_RATE) // (rail.SAMPLE_RATE // seconds_of_pulses)) % 2
    columns = {rail.SPEED: pulses}
    for car in range(1, 9):
        for position in range(1, 9):
            columns[f"Vibration of bearing in position {position} of car {car}"] = rng.normal(0, 0.4, rail.SAMPLE_RATE)
            columns[f"Shock of bearing in position {position} of car {car}"] = rng.normal(0, 1.0, rail.SAMPLE_RATE)
    return pd.DataFrame(columns).to_csv(index=False).encode()


def test_catalogue_lists_the_four_subsystems(client):
    items = client.get("/api/ps3/subsystems").json()
    assert [i["id"] for i in items] == list(submission.SUBSYSTEMS)
    assert {i["outputFile"] for i in items} == {name for name, _ in submission.OUTPUTS.values()}
    assert all(i["status"] in ("ready", "pending") for i in items)


def test_rail_file_is_checked_and_previewed_without_a_model(client):
    run_id = new_run(client, "rail")
    result = upload(client, run_id, "Test1.csv", rail_csv())
    assert result["ok"] and result["prediction"] is None
    assert result["view"]["kind"] == "rail"
    assert len(result["view"]["channels"]) == 64
    assert result["view"]["speedKmh"] == pytest.approx(900 / 2 / 90 * np.pi * 0.85 * 3.6, rel=0.01)
    run = client.get(f"/api/ps3/runs/{run_id}").json()
    assert run["status"] == "pending" and run["csvUrl"] is None
    assert client.get(f"/api/ps3/runs/{run_id}/rail_predictions.csv").status_code == 400


def test_shm_file_without_header_is_read_as_data(client):
    values = np.sin(np.linspace(0, 50, 1000))
    body = "\n".join(f"{v:.6f}" for v in values).encode()
    result = upload(client, new_run(client, "shm"), "test01.csv", body)
    assert result["ok"]
    assert result["view"]["samples"] == 1000
    assert {c["label"]: c["state"] for c in result["checks"]}["Segment length"] == "warn"


def test_file_for_another_subsystem_is_rejected_with_a_pointer(client):
    result = upload(client, new_run(client, "shm"), "Test1.csv", rail_csv())
    assert not result["ok"]
    assert result["looksLike"] == "rail"
    assert any(c["label"] == "Subsystem" and c["state"] == "fail" for c in result["checks"])


def test_unreadable_file_reports_a_failed_check(client):
    result = upload(client, new_run(client, "rail"), "Test1.csv", b"not,a\nrail,file\n")
    assert not result["ok"]
    assert any(c["state"] == "fail" for c in result["checks"])


def test_submission_is_empty_until_a_model_produces_rows(client):
    sub = client.get("/api/ps3/submission").json()
    assert sub["zipName"] == "predictions.zip"
    assert sub["ready"] == 0 and sub["zipUrl"] is None
    assert client.get("/api/ps3/submission/predictions.zip").status_code == 400


def test_unknown_run_is_404(client):
    assert client.get("/api/ps3/runs/missing").status_code == 404


def test_csv_and_zip_follow_the_brief_schema():
    text = submission.to_csv("rail", [{"file_id": "Test1.csv", "prediction": "Side I", "extra": 1}])
    assert text == "file_id,prediction\nTest1.csv,Side I\n"
    archive = zipfile.ZipFile(io.BytesIO(submission.to_zip({"rail": text, "shm": "file_id,prediction\n"})))
    assert archive.namelist() == ["rail_predictions.csv", "shm_predictions.csv"]


@pytest.mark.skipif(not HAS_DOOR, reason="PS3 Door data not present")
def test_door_test_stream_produces_downloadable_predictions(client):
    run_id = new_run(client, "door")
    result = upload(client, run_id, "Test.csv", (door.door_dir() / "Test.csv").read_bytes())
    assert result["ok"]
    cycles = result["view"]["cycles"]
    assert len(cycles) == result["rows"] == 38
    assert {c["prediction"] for c in cycles} <= set(door.LABELS)

    run = client.get(f"/api/ps3/runs/{run_id}").json()
    assert run["status"] == "ready"
    csv = client.get(run["csvUrl"])
    assert csv.headers["content-type"].startswith("text/csv")
    lines = csv.text.strip().split("\n")
    assert lines[0] == "start_time,end_time,prediction"
    assert len(lines) == 39
    assert lines[1].split(",")[0] == cycles[0]["startNative"]

    # a later bad upload does not displace the run that has predictions
    upload(client, new_run(client, "door"), "Test1.csv", rail_csv())
    sub = client.get("/api/ps3/submission").json()
    assert sub["ready"] == 1
    archive = zipfile.ZipFile(io.BytesIO(client.get(sub["zipUrl"]).content))
    assert archive.namelist() == ["door_predictions.csv"]
    assert archive.read("door_predictions.csv").decode() == csv.text


@pytest.mark.skipif(not HAS_DOOR, reason="PS3 Door data not present")
def test_door_baseline_recovers_the_train_labels():
    from tfd.ps3.door_model import DoorBaseline

    stream = door.load_stream(door.door_dir() / "Train.csv")
    segments = door.load_segments(door.door_dir() / "Train_Segments_Answer.csv")
    model = DoorBaseline.fit(stream, segments)
    predicted = model.predict(stream)
    assert (predicted["prediction"].to_numpy() == segments["status"].to_numpy()).all()
    assert model.margins["Open"] > 0 and model.margins["Close"] > 0
    assert model.loo_accuracy == 1.0
