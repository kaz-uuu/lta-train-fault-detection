"""API shapes. camelCase on the wire; these also generate the OpenAPI spec
that the frontend types are built from."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, serialize_by_alias=True)


class Health(ApiModel):
    status: Literal["ok"] = "ok"


# --- PS3 workbench: upload, review, download -----------------------------------

SubsystemId = Literal["door", "acv", "rail", "shm"]
RunStatus = Literal["empty", "ready", "pending", "invalid"]
CheckState = Literal["pass", "warn", "fail"]


class ModelCard(ApiModel):
    name: str
    version: str
    method: str
    trained_on: str
    validation: str
    parameters: dict[str, float]


class RunSummary(ApiModel):
    id: str
    subsystem: SubsystemId
    created_at: datetime
    status: RunStatus
    files: int
    valid_files: int
    rows: int
    summary: str
    csv_name: str
    csv_url: str | None


class SubsystemInfo(ApiModel):
    id: SubsystemId
    name: str
    question: str
    task: str
    input_hint: str
    accepts: list[str]
    multiple: bool
    output_file: str
    output_columns: list[str]
    labels: list[str]
    metric: str
    status: Literal["ready", "pending"]
    status_note: str
    model: ModelCard | None
    latest_run: RunSummary | None


class Check(ApiModel):
    label: str
    state: CheckState
    detail: str | None = None


class DoorCycle(ApiModel):
    index: int
    start: datetime
    end: datetime
    start_native: str
    end_native: str
    duration_s: float
    operation: Literal["Open", "Close"]
    prediction: Literal["Normal", "Abnormal resistance"] | None
    window_current: float | None
    threshold: float | None
    current: list[float]
    position: list[float]
    profile: list[float]


class DoorReference(ApiModel):
    operation: Literal["Open", "Close"]
    status: Literal["Normal", "Abnormal resistance"]
    profile: list[float]


class DoorView(ApiModel):
    kind: Literal["door"]
    rows: int
    start: datetime
    end: datetime
    sample_period_ms: int
    cycles: list[DoorCycle]
    windows: dict[str, list[int]]
    references: list[DoorReference]


class AcvCar(ApiModel):
    car: str
    parameters: int
    cooling_share: float | None
    indoor_mean: float | None
    gap_while_cooling: float | None
    indoor: list[float | None]
    setpoint: list[float | None]


class AcvView(ApiModel):
    kind: Literal["acv"]
    rows: int
    start: datetime | None
    end: datetime | None
    sample_period_s: float | None
    train_number: str | None
    time: list[datetime]
    cars: list[AcvCar]
    ranked_cars: list[str] | None


class RailChannel(ApiModel):
    car: int
    position: int
    side: Literal["Side I", "Side II"]
    vibration: float
    shock: float


class RailView(ApiModel):
    kind: Literal["rail"]
    rows: int
    duration_s: float
    speed_kmh: float
    channels: list[RailChannel]
    side_vibration: dict[str, float]
    side_shock: dict[str, float]


class ShmView(ApiModel):
    kind: Literal["shm"]
    samples: int
    minimum: float
    maximum: float
    mean: float
    std: float
    envelope_min: list[float]
    envelope_max: list[float]


FileView = Annotated[DoorView | AcvView | RailView | ShmView, Field(discriminator="kind")]


class FileResult(ApiModel):
    file_name: str
    size_bytes: int
    ok: bool
    looks_like: SubsystemId | None
    checks: list[Check]
    prediction: str | None
    rows: int
    view: FileView | None


class Run(RunSummary):
    results: list[FileResult]


class NewRun(ApiModel):
    subsystem: SubsystemId


class SubmissionItem(ApiModel):
    subsystem: SubsystemId
    name: str
    output_file: str
    status: RunStatus | Literal["none"]
    run: RunSummary | None
    included: bool
    note: str


class Submission(ApiModel):
    zip_name: str
    ready: int
    items: list[SubmissionItem]
    zip_url: str | None
