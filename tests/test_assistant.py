import json
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.assistant import create_assistant_router
from backend.workbench import Workbench
from backend.schemas import FileResult


class FakeAgent:
    def respond(self, history, message, retrieve):
        for name in ("predictions", "sensor_readings", "maintenance_guidelines"):
            retrieve(name)
        return json.dumps(dict(urgency="review_required", suspected_issue="Review model evidence.",
            next_action="Request qualified review.", evidence_ids=["predictions"], limitations=["No verified train identity."]))


@pytest.fixture
def setup(monkeypatch):
    monkeypatch.setenv("TFD_ASSISTANT_PROVIDER", "offline")
    bench = Workbench()
    run = bench.create_run("shm")
    run.results["test.csv"] = FileResult(file_name="test.csv", size_bytes=10, ok=True, looks_like="shm", checks=[], prediction="0.1", rows=1, view=None)
    run.rows["test.csv"] = [{"file_id": "test.csv", "prediction": .1}]
    app = FastAPI()
    app.include_router(create_assistant_router(bench, FakeAgent()))
    client = TestClient(app)
    sid = client.post("/api/assistant/sessions").json()["id"]
    return client, sid, run.id


def test_chat_never_creates_recommendation(setup):
    client, sid, _ = setup
    data = client.post(f"/api/assistant/sessions/{sid}/messages", json={"text": "How do I use this?"}).json()
    assert data["recommendation"] is None
    assert data["provider"] == "offline"


def test_investigation_requires_prediction(setup):
    client, sid, _ = setup
    assert client.post(f"/api/assistant/sessions/{sid}/messages", json={"text": "Investigate", "mode": "investigate"}).status_code == 400


def test_evidence_and_review_are_separate(setup):
    client, sid, run = setup
    data = client.post(f"/api/assistant/sessions/{sid}/messages", json={"text": "Review", "mode": "investigate", "run_id": run}).json()
    assert data["recommendation"]["status"] == "pending"
    assert data["trace"][0]["data"]["confidence"] is None
    assert data["trace"][3]["data"]["available"] is False
    rid = data["recommendation"]["id"]
    path = f"/api/assistant/sessions/{sid}/recommendations/{rid}/review"
    body = {"decision": "approved", "engineer": "Demo engineer", "note": "Reviewed evidence"}
    result = client.post(path, json=body)
    assert result.json()["execution"] == "No operational action taken"
    assert client.post(path, json=body).status_code == 409
    other = client.post("/api/assistant/sessions").json()["id"]
    assert client.post(path.replace(sid, other), json=body).status_code == 404


def test_live_agent_tool_flow(setup, monkeypatch):
    monkeypatch.setenv("TFD_ASSISTANT_PROVIDER", "vertex")
    client, sid, run = setup
    data = client.post(f"/api/assistant/sessions/{sid}/messages", json={"text": "Review", "mode": "investigate", "run_id": run}).json()
    assert data["provider"] == "vertex"
    assert len(data["trace"]) == 3
    assert data["recommendation"]["status"] == "pending"


def test_bad_citations_rejected(monkeypatch):
    class BadAgent:
        def respond(self, history, message, retrieve):
            return FakeAgent().respond(history, message, lambda name: {})
    monkeypatch.setenv("TFD_ASSISTANT_PROVIDER", "vertex")
    bench = Workbench()
    run = bench.create_run("shm")
    run.results["x"] = FileResult(file_name="x", size_bytes=1, ok=True, looks_like="shm", checks=[], prediction="0.1", rows=1, view=None)
    run.rows["x"] = [{"prediction": .1}]
    app = FastAPI(); app.include_router(create_assistant_router(bench, BadAgent()))
    client = TestClient(app)
    sid = client.post("/api/assistant/sessions").json()["id"]
    assert client.post(f"/api/assistant/sessions/{sid}/messages", json={"text": "Review", "mode": "investigate", "run_id": run.id}).status_code == 502


def test_provider_failure_is_not_silent_success(monkeypatch):
    class FailedAgent:
        def respond(self, *args):
            raise TimeoutError("internal provider detail")
    monkeypatch.setenv("TFD_ASSISTANT_PROVIDER", "vertex")
    app = FastAPI(); app.include_router(create_assistant_router(Workbench(), FailedAgent()))
    client = TestClient(app)
    sid = client.post("/api/assistant/sessions").json()["id"]
    response = client.post(f"/api/assistant/sessions/{sid}/messages", json={"text": "Hello"})
    assert response.status_code == 503
    assert "internal provider detail" not in response.text


def test_changed_evidence_blocks_approval(monkeypatch):
    monkeypatch.setenv("TFD_ASSISTANT_PROVIDER", "offline")
    bench = Workbench(); run = bench.create_run("shm")
    run.results["x"] = FileResult(file_name="x", size_bytes=1, ok=True, looks_like="shm", checks=[], prediction="0.1", rows=1, view=None)
    run.rows["x"] = [{"prediction": .1}]
    app = FastAPI(); app.include_router(create_assistant_router(bench))
    client = TestClient(app); sid = client.post("/api/assistant/sessions").json()["id"]
    result = client.post(f"/api/assistant/sessions/{sid}/messages", json={"text": "Review", "mode": "investigate", "run_id": run.id}).json()
    run.rows["x"] = [{"prediction": .9}]
    rid = result["recommendation"]["id"]
    assert client.post(f"/api/assistant/sessions/{sid}/recommendations/{rid}/review", json={"decision": "approved", "engineer": "Test", "note": "Reviewed"}).status_code == 409
