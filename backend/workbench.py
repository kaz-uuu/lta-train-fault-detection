"""PS3 workbench API: choose a subsystem, upload files, review the result, download predictions.

Runs live in memory. The newest run of each subsystem that produced predictions goes into
predictions.zip, which is how the submission files are generated through the app.
"""

from __future__ import annotations

import logging
import math
import os
import shutil
import tempfile
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import Response

from backend import schemas as S
from backend.model_registry import DagsHubChampions, Predictor, SPECS
from tfd.ps3 import acv, door, rail, shm, submission
from tfd.ps3.model_inputs import acv_features, rail_features, shm_features
from tfd.ps3.door_model import WINDOWS

log = logging.getLogger("tfd.workbench")

CATALOG: dict[str, dict] = {
    "door": dict(
        name="Doors",
        question="Is a saloon door meeting abnormal resistance when it opens or closes?",
        task="Finds every opening and closing in a continuous door-controller log and labels each one "
        "Normal or Abnormal resistance.",
        input_hint="One continuous door-controller log in CSV format, such as Test.csv.",
        accepts=[".csv"],
        multiple=False,
        labels=list(door.LABELS),
        metric="IoU-weighted F1",
    ),
    "acv": dict(
        name="Air-conditioning",
        question="Which car in the train has a refrigerant leak?",
        task="Ranks every car from most to least likely to be leaking refrigerant.",
        input_hint="One Excel workbook per case with telemetry for every car, such as acv_test_case.xlsx.",
        accepts=[".xlsx"],
        multiple=True,
        labels=[],
        metric="Linear rank-decay score",
    ),
    "rail": dict(
        name="Rail corrugation",
        question="Is the rail under the train corrugated, and on which side?",
        task="Labels each one-second axle-box recording Normal, Side I or Side II.",
        input_hint="One or more one-second axle-box recordings in CSV format, such as Test1.csv to Test68.csv.",
        accepts=[".csv"],
        multiple=True,
        labels=list(rail.LABELS),
        metric="Macro F1",
    ),
    "shm": dict(
        name="Structural health",
        question="How much fatigue damage has the structure accumulated?",
        task="Estimates the cumulative fatigue damage of each dynamic-stress recording.",
        input_hint="One or more stress recordings in CSV format, such as test01.csv to test16.csv.",
        accepts=[".csv"],
        multiple=True,
        labels=[],
        metric="1 − mean absolute percentage error",
    ),
}

PENDING_NOTE = (
    "The model for this subsystem is not ready yet. Files can be uploaded and checked now; "
    "predictions appear here once the model is added."
)


def _finite(x) -> float | None:
    return None if x is None or (isinstance(x, float) and not math.isfinite(x)) else float(x)


def _check(label: str, passed: bool, detail: str | None = None, warn: bool = False) -> S.Check:
    return S.Check(label=label, state="pass" if passed else ("warn" if warn else "fail"), detail=detail)


@dataclass
class RunState:
    id: str
    subsystem: str
    created_at: datetime
    results: dict[str, S.FileResult] = field(default_factory=dict)
    rows: dict[str, list[dict]] = field(default_factory=dict)


class Workbench:
    def __init__(self, models: Predictor | None = None) -> None:
        self.runs: dict[str, RunState] = {}
        self.latest: dict[str, str] = {}
        self.models = models or DagsHubChampions()

    # -- models ---------------------------------------------------------------

    def model_card(self, subsystem: str) -> S.ModelCard | None:
        spec = SPECS[subsystem]
        version = self.models.version(subsystem) if hasattr(self.models, "version") else "champion"
        return S.ModelCard(name=spec.registered_name, version=str(version), method=spec.method,
                           trained_on="PS3 labelled Train data; served by DagsHub MLflow Model Registry.",
                           validation=spec.validation, parameters={})

    def ready(self, subsystem: str) -> bool:
        return self.models.configured(subsystem) if hasattr(self.models, "configured") else subsystem in SPECS

    # -- catalogue --------------------------------------------------------------

    def info(self, subsystem: str) -> S.SubsystemInfo:
        spec = CATALOG[subsystem]
        output_file, columns = submission.OUTPUTS[subsystem]
        ready = self.ready(subsystem)
        latest = self.runs.get(self.latest.get(subsystem, ""))
        if ready:
            note = "DagsHub MLflow champion connected; loaded on the first prediction."
        else:
            note = PENDING_NOTE
        return S.SubsystemInfo(
            id=subsystem,
            output_file=output_file,
            output_columns=columns,
            status="ready" if ready else "pending",
            status_note=note,
            model=self.model_card(subsystem),
            latest_run=self.summary(latest) if latest else None,
            **spec,
        )

    # -- runs -----------------------------------------------------------------

    def create_run(self, subsystem: str) -> RunState:
        run = RunState(id=uuid.uuid4().hex[:12], subsystem=subsystem, created_at=datetime.now(timezone.utc))
        self.runs[run.id] = run
        return run

    def submitted_run(self, subsystem: str) -> RunState | None:
        """The newest run with predictions, else the newest run with files."""
        runs = [r for r in reversed(self.runs.values()) if r.subsystem == subsystem and r.results]
        return next((r for r in runs if self.summary(r).status == "ready"), runs[0] if runs else None)

    def get_run(self, run_id: str) -> RunState:
        if run_id not in self.runs:
            raise KeyError(run_id)
        return self.runs[run_id]

    def add_file(self, run: RunState, name: str, path: Path, size: int) -> S.FileResult:
        spec = CATALOG[run.subsystem]
        looks_like = submission.sniff(path)
        type_ok = Path(name).suffix.lower() in spec["accepts"]
        checks = [_check(
            "File type",
            type_ok,
            None if type_ok else f"Expected {' or '.join(spec['accepts'])}, got '{Path(name).suffix or 'no extension'}'.",
        )]
        if looks_like and looks_like != run.subsystem:
            checks.append(_check(
                "Subsystem",
                False,
                f"This file looks like {CATALOG[looks_like]['name']} data. Open that subsystem to use it.",
            ))
        view, rows, prediction = None, [], None
        if all(c.state != "fail" for c in checks):
            inspect = {"door": self._door_file, "acv": self._acv_file, "rail": self._rail_file, "shm": self._shm_file}
            try:
                more, view, rows, prediction = inspect[run.subsystem](path, name)
                checks += more
            except Exception as exc:  # malformed input or unavailable model: report, don't crash
                log.warning("could not process %s: %s", name, exc)
                checks.append(_check("File processed", False, f"The file or model could not be processed: {exc}"))
        result = S.FileResult(
            file_name=name,
            size_bytes=size,
            ok=all(c.state != "fail" for c in checks),
            looks_like=looks_like,
            checks=checks,
            prediction=prediction,
            rows=len(rows),
            view=view,
        )
        if not spec["multiple"]:
            run.results.clear()
            run.rows.clear()
        run.results.pop(name, None)
        run.results[name] = result
        run.rows[name] = rows if result.ok else []
        self.latest[run.subsystem] = run.id
        return result

    def summary(self, run: RunState) -> S.RunSummary:
        results = list(run.results.values())
        valid = [r for r in results if r.ok]
        n_rows = sum(len(v) for v in run.rows.values())
        if not results:
            status = "empty"
        elif not valid:
            status = "invalid"
        elif n_rows and self.ready(run.subsystem):
            status = "ready"
        else:
            status = "pending"
        csv_name = submission.OUTPUTS[run.subsystem][0]
        return S.RunSummary(
            id=run.id,
            subsystem=run.subsystem,
            created_at=run.created_at,
            status=status,
            files=len(results),
            valid_files=len(valid),
            rows=n_rows,
            summary=self._describe(run, status, results),
            csv_name=csv_name,
            csv_url=f"/api/ps3/runs/{run.id}/{csv_name}" if status == "ready" else None,
        )

    def _describe(self, run: RunState, status: str, results: list[S.FileResult]) -> str:
        if status == "empty":
            return "No file uploaded yet."
        if status == "invalid":
            return f"{len(results)} file{'s' * (len(results) != 1)} uploaded, none passed the checks."
        valid = [r for r in results if r.ok]
        if run.subsystem == "door":
            cycles = [c for r in valid if isinstance(r.view, S.DoorView) for c in r.view.cycles]
            abnormal = sum(c.prediction == "Abnormal resistance" for c in cycles)
            if status == "ready":
                return f"{len(cycles)} door movements found, {abnormal} with abnormal resistance."
            return f"{len(cycles)} door movements found. Labels need the model."
        noun = "case" if run.subsystem == "acv" else "recording"
        text = f"{len(valid)} {noun}{'s' * (len(valid) != 1)} checked"
        return text + (" and predicted." if status == "ready" else ". Predictions need the model.")

    def full(self, run: RunState) -> S.Run:
        return S.Run(**self.summary(run).model_dump(), results=list(run.results.values()))

    def csv(self, run: RunState) -> str:
        if self.summary(run).status != "ready":
            raise ValueError("this run has no predictions to download")
        return submission.to_csv(run.subsystem, [row for rows in run.rows.values() for row in rows])

    # -- submission -------------------------------------------------------------

    def submission(self) -> S.Submission:
        items = []
        for subsystem in submission.SUBSYSTEMS:
            run = self.submitted_run(subsystem)
            summary = self.summary(run) if run else None
            status = summary.status if summary else "none"
            included = status == "ready"
            note = {
                "none": "No file uploaded yet.",
                "empty": "No file uploaded yet.",
                "invalid": "The uploaded files did not pass the checks.",
                "pending": "Files checked; the model is not ready, so this subsystem is left out.",
                "ready": "Included.",
            }[status]
            items.append(S.SubmissionItem(
                subsystem=subsystem,
                name=CATALOG[subsystem]["name"],
                output_file=submission.OUTPUTS[subsystem][0],
                status=status,
                run=summary,
                included=included,
                note=note,
            ))
        ready = sum(i.included for i in items)
        return S.Submission(
            zip_name=submission.ZIP_NAME,
            ready=ready,
            items=items,
            zip_url=f"/api/ps3/submission/{submission.ZIP_NAME}" if ready else None,
        )

    def zip(self) -> bytes:
        csvs = {
            i.subsystem: self.csv(self.runs[i.run.id])
            for i in self.submission().items
            if i.included and i.run
        }
        if not csvs:
            raise ValueError("no subsystem has predictions yet")
        return submission.to_zip(csvs)

    # -- per-subsystem file handling ------------------------------------------------

    def _door_file(self, path: Path, name: str):
        frame = pd.read_csv(path)
        missing = [c for c in door.COLUMNS if c not in frame.columns]
        checks = [_check(
            "Door controller columns",
            not missing,
            f"Missing: {', '.join(missing)}." if missing else f"All {len(door.COLUMNS)} columns present.",
        )]
        if missing:
            return checks, None, [], None
        frame.insert(0, "time", door.parse_time(frame[door.TIME]))
        ordered = bool(frame["time"].is_monotonic_increasing)
        checks.append(_check("Timestamps in order", ordered, None if ordered else "Rows must be in time order."))
        steps = frame["time"].diff().dropna()
        within = steps[steps <= pd.Timedelta("1s")]
        regular = bool((within == door.SAMPLE_PERIOD).all())
        checks.append(_check("20 ms sampling inside movements", regular,
                             "Every step inside a movement is 20 ms." if regular else "Some steps inside movements are not 20 ms.",
                             warn=True))
        table = door.cycles(frame)
        found = f"{len(table)}, each {table['n_rows'].min()}–{table['n_rows'].max()} rows long." if len(table) else "None."
        checks.append(_check("Door movements found", len(table) > 0, found))

        output = self.models.predict("door", frame[door.COLUMNS])
        if len(output) != len(table):
            raise ValueError(f"Door champion returned {len(output)} movements for {len(table)} detected movements.")
        predicted = table.copy()
        predicted["prediction"] = output["prediction"].to_numpy()
        starts, ends = output["start_time"].astype(str), output["end_time"].astype(str)
        profiles = door.current_profiles(frame)
        by_cycle = frame.groupby(door.split_cycles(frame["time"]))
        cycles = []
        for c, row in predicted.iterrows():
            block = by_cycle.get_group(c)
            cycles.append(S.DoorCycle(
                index=int(c),
                start=row["start"].to_pydatetime(),
                end=row["end"].to_pydatetime(),
                start_native=starts[c],
                end_native=ends[c],
                duration_s=(row["end"] - row["start"]).total_seconds(),
                operation=row["operation"],
                prediction=row["prediction"],
                window_current=None,
                threshold=None,
                current=block[door.CURRENT].astype(float).tolist(),
                position=block[door.POSITION].astype(float).tolist(),
                profile=profiles.loc[c].round(1).tolist(),
            ))
        references = []
        view = S.DoorView(
            kind="door",
            rows=len(frame),
            start=frame["time"].iloc[0].to_pydatetime(),
            end=frame["time"].iloc[-1].to_pydatetime(),
            sample_period_ms=int(door.SAMPLE_PERIOD / pd.Timedelta("1ms")),
            cycles=cycles,
            windows={op: list(w) for op, w in WINDOWS.items()},
            references=references,
        )
        rows = [
            {"start_time": starts[c], "end_time": ends[c], "prediction": p}
            for c, p in predicted["prediction"].items()
        ]
        return checks, view, rows, None

    def _acv_file(self, path: Path, name: str):
        case = acv.load_case(path)
        cars = acv.car_parameters(case)
        checks = [
            _check("Time column", acv.TIME in case.columns, None if acv.TIME in case.columns else "A 'Time' column is required."),
            _check("Cars found", len(cars) >= 2, f"{len(cars)} cars: {', '.join(cars)}." if cars else "No 'Car NN - …' columns."),
        ]
        if any(c.state == "fail" for c in checks):
            return checks, None, [], None
        time = pd.to_datetime(case[acv.TIME], errors="coerce")
        period = time.diff().dt.total_seconds().median()
        checks.append(_check("30 s sampling", period == 30, f"Median step {period:g} s.", warn=True))
        has_indoor = all(acv.INDOOR in params for params in cars.values())
        checks.append(_check("Indoor temperature per car", has_indoor,
                             None if has_indoor else "This file uses a different parameter set; the preview is limited.",
                             warn=True))
        stride = max(1, math.ceil(len(case) / 480))
        summary = acv.cooling_summary(case)
        view_cars = []
        for car, params in cars.items():
            frame = acv.car_frame(case, car)
            series = lambda col: [_finite(v) for v in frame[col].iloc[::stride].astype(float)] if col in frame else []
            stats = summary.loc[car]
            view_cars.append(S.AcvCar(
                car=car,
                parameters=len(params),
                cooling_share=_finite(stats["cooling_share"]),
                indoor_mean=_finite(stats["indoor_mean"]),
                gap_while_cooling=_finite(stats["gap_while_cooling"]),
                indoor=series(acv.INDOOR),
                setpoint=series(acv.SETPOINT),
            ))
        train = case["Train number"].dropna() if "Train number" in case else pd.Series(dtype=object)
        view = S.AcvView(
            kind="acv",
            rows=len(case),
            start=_py(time.min()),
            end=_py(time.max()),
            sample_period_s=_finite(period),
            train_number=str(train.iloc[0]) if len(train) else None,
            time=[t.to_pydatetime() for t in time.iloc[::stride] if not pd.isna(t)],
            cars=view_cars,
            ranked_cars=(ranked := self.models.predict("acv", acv_features(case, name)).sort_values("rank")["car"].astype(str).tolist()),
        )
        checks.append(_check("DagsHub MLflow champion", True, f"Ranked {len(ranked)} cars."))
        return checks, view, [{"file_id": name, "ranked_cars": "|".join(ranked)}], ranked[0] if ranked else None

    def _rail_file(self, path: Path, name: str):
        frame = rail.load_file(path)
        channels = rail.channel_table(frame)
        checks = [
            _check("129 columns", frame.shape[1] == rail.N_COLUMNS, f"Found {frame.shape[1]}."),
            _check("Speed column first", str(frame.columns[0]) == rail.SPEED, f"First column is '{frame.columns[0]}'."),
            _check("64 axle-box positions", len(channels) == 128, f"{len(channels)} vibration and shock channels recognised."),
        ]
        if any(c.state == "fail" for c in checks):
            return checks, None, [], None
        checks.append(_check("One second at 10 kHz", len(frame) == rail.SAMPLE_RATE, f"{len(frame):,} rows.", warn=True))
        wide = channels.pivot_table(index=["car", "position", "side"], columns="kind", values="std").reset_index()
        side = channels.groupby(["kind", "side"])["std"].mean()
        view = S.RailView(
            kind="rail",
            rows=len(frame),
            duration_s=len(frame) / rail.SAMPLE_RATE,
            speed_kmh=round(rail.speed_kmh(frame[rail.SPEED]), 1),
            channels=[
                S.RailChannel(car=int(r.car), position=int(r.position), side=r.side,
                              vibration=round(r.vibration, 4), shock=round(r.shock, 4))
                for r in wide.itertuples()
            ],
            side_vibration={k: round(v, 4) for k, v in side["vibration"].items()},
            side_shock={k: round(v, 4) for k, v in side["shock"].items()},
        )
        output = self.models.predict("rail", rail_features(frame, name)).iloc[0]
        prediction = str(output["prediction"])
        checks.append(_check("DagsHub MLflow champion", True, f"Predicted {prediction}."))
        return checks, view, [{"file_id": name, "prediction": prediction}], prediction

    def _shm_file(self, path: Path, name: str):
        values = shm.load_file(path)
        checks = [
            _check("One numeric column", True, "No header row, as expected."),
            _check("No missing values", not values.isna().any(), None if not values.isna().any() else f"{int(values.isna().sum())} values are missing."),
            _check("Segment length", len(values) == shm.N_SAMPLES, f"{len(values):,} samples (expected {shm.N_SAMPLES:,}).", warn=True),
        ]
        low, high = shm.envelope(values)
        view = S.ShmView(
            kind="shm",
            samples=len(values),
            minimum=float(values.min()),
            maximum=float(values.max()),
            mean=float(values.mean()),
            std=float(values.std()),
            envelope_min=np.round(low, 3).tolist(),
            envelope_max=np.round(high, 3).tolist(),
        )
        output = self.models.predict("shm", shm_features(values, name)).iloc[0]
        prediction = float(output["prediction"])
        checks.append(_check("DagsHub MLflow champion", True, f"Predicted cumulative damage {prediction:.6g}."))
        return checks, view, [{"file_id": name, "prediction": prediction}], f"{prediction:.6g}"


def _py(value) -> datetime | None:
    return None if pd.isna(value) else value.to_pydatetime()


def create_router(bench: Workbench) -> APIRouter:
    api = APIRouter(prefix="/api/ps3", tags=["workbench"])

    @api.get("/subsystems", response_model=list[S.SubsystemInfo])
    def subsystems():
        return [bench.info(s) for s in submission.SUBSYSTEMS]

    @api.get("/subsystems/{subsystem}", response_model=S.SubsystemInfo)
    def subsystem(subsystem: S.SubsystemId):
        return bench.info(subsystem)

    @api.post("/runs", response_model=S.Run, status_code=201)
    def create_run(body: S.NewRun):
        return bench.full(bench.create_run(body.subsystem))

    @api.get("/runs/{run_id}", response_model=S.Run)
    def get_run(run_id: str):
        return bench.full(bench.get_run(run_id))

    @api.post("/runs/{run_id}/files", response_model=S.FileResult)
    def upload(run_id: str, file: UploadFile):
        """Check one uploaded file, run the subsystem's model on it, and add it to the run."""
        run = bench.get_run(run_id)
        name = Path(file.filename or "upload").name
        with tempfile.NamedTemporaryFile(suffix=Path(name).suffix, delete=False) as tmp:
            shutil.copyfileobj(file.file, tmp)
            size = tmp.tell()
        try:
            return bench.add_file(run, name, Path(tmp.name), size)
        finally:
            os.unlink(tmp.name)

    @api.get("/runs/{run_id}/{csv_name}", response_class=Response,
             responses={200: {"content": {"text/csv": {}}}})
    def download_csv(run_id: str, csv_name: str):
        run = bench.get_run(run_id)
        expected = submission.OUTPUTS[run.subsystem][0]
        if csv_name != expected:
            raise HTTPException(status_code=404, detail=f"this run's file is {expected}")
        return Response(
            content=bench.csv(run),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{expected}"'},
        )

    @api.get("/submission", response_model=S.Submission)
    def get_submission():
        return bench.submission()

    @api.get(f"/submission/{submission.ZIP_NAME}", response_class=Response,
             responses={200: {"content": {"application/zip": {}}}})
    def download_zip():
        return Response(
            content=bench.zip(),
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{submission.ZIP_NAME}"'},
        )

    return api
