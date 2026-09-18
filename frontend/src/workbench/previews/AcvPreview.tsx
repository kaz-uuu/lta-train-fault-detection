import { Field } from "../../components/primitives";
import { fmtDateTime, fmtNum } from "../../lib/format";
import type { AcvView } from "../api";
import { LineChart, Note } from "../charts";
import w from "../workbench.module.css";

const pct = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)}%`);

/** Per-car temperatures as recorded. Descriptive only: it ranks nothing. */
export function AcvPreview({ view }: { view: AcvView }) {
  const temps = view.cars.flatMap((c) => [...c.indoor, ...c.setpoint]).filter((v): v is number => v != null);
  const domain: [number, number] = temps.length ? [Math.min(...temps), Math.max(...temps)] : [0, 1];
  const hasIndoor = view.cars.some((c) => c.indoor.length > 0);

  return (
    <div className={w.stack}>
      <Note>This is a preview of the uploaded telemetry, not a prediction. The ranking of cars appears here once the model is added.</Note>
      <div className={w.fieldRow}>
        <Field label="Train">{view.trainNumber ?? "—"}</Field>
        <Field label="From" mono>
          {fmtDateTime(view.start)}
        </Field>
        <Field label="To" mono>
          {fmtDateTime(view.end)}
        </Field>
        <Field label="Rows" mono>
          {fmtNum(view.rows)}
        </Field>
        <Field label="Step" mono unit="s">
          {fmtNum(view.samplePeriodS)}
        </Field>
      </div>

      <div className={w.tableWrap}>
        <table className={w.table}>
          <thead>
            <tr>
              <th>Car</th>
              <th className={w.num}>Parameters</th>
              <th className={w.num}>Time cooling</th>
              <th className={w.num}>Mean indoor</th>
              <th className={w.num} title="Mean of indoor temperature minus the cooling setpoint, while in automatic cooling">
                Above setpoint when cooling
              </th>
            </tr>
          </thead>
          <tbody>
            {view.cars.map((c) => (
              <tr key={c.car}>
                <td className="mono">{c.car}</td>
                <td className={`mono ${w.num}`}>{c.parameters}</td>
                <td className={`mono ${w.num}`}>{pct(c.coolingShare)}</td>
                <td className={`mono ${w.num}`}>{c.indoorMean == null ? "—" : `${fmtNum(c.indoorMean, 1)} °C`}</td>
                <td className={`mono ${w.num}`}>
                  {c.gapWhileCooling == null ? "—" : `${c.gapWhileCooling > 0 ? "+" : ""}${fmtNum(c.gapWhileCooling, 2)} °C`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasIndoor ? (
        <div className={w.multiples}>
          {view.cars.map((c) => (
            <div key={c.car} className={w.multiple}>
              <span className="micro">Car {c.car}</span>
              <LineChart
                series={[
                  { key: "setpoint", label: "Cooling setpoint", values: c.setpoint, stroke: "var(--ink-normal)" },
                  { key: "indoor", label: "Indoor", values: c.indoor, stroke: "var(--chart-line)" },
                ]}
                height={120}
                xLabel="sample"
                yLabel="°C"
                formatX={() => ""}
                formatY={(v) => v.toFixed(0)}
                yDomain={domain}
                showLegend={false}
              />
            </div>
          ))}
          <span className={`faint ${w.multiplesKey}`}>
            <span className={w.legendKey} style={{ background: "var(--chart-line)" }} /> indoor average temperature ·{" "}
            <span className={w.legendKey} style={{ background: "var(--ink-normal)" }} /> cooling setpoint · same
            scale in every car, {fmtDateTime(view.start)} to {fmtDateTime(view.end)}
          </span>
        </div>
      ) : (
        <Note>This file uses a different parameter set without an indoor average temperature, so there is no chart.</Note>
      )}
    </div>
  );
}
