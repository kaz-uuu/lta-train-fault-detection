import { fmtNum, fmtSeconds, fmtTime } from "../../lib/format";
import type { DoorCycle, DoorView } from "../api";
import { LineChart, type Series } from "../charts";
import w from "../workbench.module.css";
import { Verdict } from "./Verdict";

function reason(cycle: DoorCycle, window: number[]): string {
  const part = `${window[0]}–${window[1]}% of the ${cycle.operation === "Open" ? "opening" : "closing"}`;
  if (!cycle.prediction) return "No model output for this movement.";
  if (cycle.windowCurrent == null || cycle.threshold == null) {
    return (
      `Labelled ${cycle.prediction} by the model, which reads the motor current over ${part} ` +
      "(shaded below), where resistance shows most clearly."
    );
  }
  const cmp = cycle.windowCurrent > cycle.threshold ? "above" : "at or below";
  return (
    `Over ${part}, the motor drew ${fmtNum(cycle.windowCurrent)} mA on average, ${cmp} the ` +
    `${fmtNum(cycle.threshold)} mA threshold learned from labelled training movements.`
  );
}

export function CycleDetail({ cycle, view }: { cycle: DoorCycle; view: DoorView }) {
  const window = view.windows[cycle.operation] ?? [0, 0];
  const refs = view.references.filter((r) => r.operation === cycle.operation);
  const normal = refs.find((r) => r.status === "Normal");
  const abnormal = refs.find((r) => r.status === "Abnormal resistance");

  const profileSeries: Series[] = [
    ...(normal ? [{ key: "normal", label: "Typical normal", values: normal.profile, stroke: "var(--ink-normal)" }] : []),
    ...(abnormal
      ? [{ key: "abnormal", label: "Typical abnormal", values: abnormal.profile, stroke: "var(--p1-ink)" }]
      : []),
    { key: "this", label: "This movement", values: cycle.profile, stroke: "var(--text)", width: 2 },
  ];
  const seconds = cycle.current.map((_, i) => (i * view.samplePeriodMs) / 1000);
  const marks =
    cycle.windowCurrent != null && cycle.threshold != null
      ? [
          { y: cycle.threshold, label: "threshold", stroke: "var(--text-3)" },
          { y: cycle.windowCurrent, label: "this movement", stroke: "var(--text)" },
        ]
      : [];

  return (
    <div className={w.detail}>
      <div className={w.detailHead}>
        <Verdict cycle={cycle} />
        <span className="mono dim">
          {cycle.operation === "Open" ? "Opening" : "Closing"} · {fmtTime(cycle.start)}–{fmtTime(cycle.end)} ·{" "}
          {fmtSeconds(cycle.durationS)}
        </span>
      </div>
      <p className={w.reason}>{reason(cycle, window)}</p>

      <LineChart
        series={profileSeries}
        height={220}
        x={cycle.profile.map((_, i) => i)}
        xLabel="% of movement"
        yLabel="Motor current, mA"
        formatX={(v) => `${Math.round(v)}%`}
        band={{ from: window[0], to: window[1] - 1, label: "model window" }}
        marks={marks}
      />

      <div className={w.detailPair}>
        <LineChart
          series={[{ key: "current", label: "Motor current", values: cycle.current, stroke: "var(--chart-line)" }]}
          height={140}
          x={seconds}
          xLabel="s"
          yLabel="Current, mA"
          formatX={(v) => v.toFixed(1)}
          showLegend
        />
        <LineChart
          series={[{ key: "position", label: "Door leaf position", values: cycle.position, stroke: "var(--chart-line)" }]}
          height={140}
          x={seconds}
          xLabel="s"
          yLabel="Door position"
          formatX={(v) => v.toFixed(1)}
          showLegend
        />
      </div>
      <p className="faint">
        Exported to door_predictions.csv as start_time <span className="mono">{cycle.startNative}</span>, end_time{" "}
        <span className="mono">{cycle.endNative}</span>.
      </p>
    </div>
  );
}
