import { Fragment } from "react";
import { fmtNum } from "../../lib/format";
import type { RailView } from "../api";
import { Note } from "../charts";
import { Tiles } from "../parts";
import w from "../workbench.module.css";

const CARS = [1, 2, 3, 4, 5, 6, 7, 8];
const POSITIONS = [1, 3, 5, 7, 2, 4, 6, 8];

function SideBars({ title, values }: { title: string; values: Record<string, number> }) {
  const max = Math.max(...Object.values(values), 1e-9);
  return (
    <div className={w.sideBars}>
      <span className="micro">{title}</span>
      {["Side I", "Side II"].map((side) => (
        <div key={side} className={w.sideBar}>
          <span className={w.sideName}>{side}</span>
          <div className={w.sideTrack}>
            <div className={w.sideFill} style={{ width: `${((values[side] ?? 0) / max) * 100}%` }} />
          </div>
          <span className="mono">{fmtNum(values[side], 3)}</span>
        </div>
      ))}
    </div>
  );
}

/** Vibration level of every axle box, grouped by rail side. Descriptive only. */
export function RailPreview({ view }: { view: RailView }) {
  const byKey = new Map(view.channels.map((c) => [`${c.car}-${c.position}`, c]));
  const values = view.channels.map((c) => c.vibration);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const level = (v: number) => (hi > lo ? (v - lo) / (hi - lo) : 0);

  return (
    <div className={w.stack}>
      <Note>Axle-box vibration across the train for this recording. The predicted label (Normal, Side I or Side II) is listed under Prediction.</Note>
      <Tiles
        items={[
          { label: "Train speed", value: `${fmtNum(view.speedKmh, 1)} km/h`, note: "from the wheel-speed pulses" },
          { label: "Recording", value: `${fmtNum(view.durationS, 1)} s`, note: `${fmtNum(view.rows)} rows at 10 kHz` },
          { label: "Axle boxes", value: fmtNum(view.channels.length), note: "8 cars × 8 positions" },
        ]}
      />
      <div className={w.railGrid} role="table" aria-label="Vibration level by car and axle-box position">
        <span />
        {CARS.map((car) => (
          <span key={car} className={`micro ${w.railHead}`}>
            Car {car}
          </span>
        ))}
        {POSITIONS.map((pos) => (
          <Fragment key={pos}>
            <span className={w.railRowHead}>
              <span className="mono">P{pos}</span>
              <span className="faint">{pos % 2 ? "Side I" : "Side II"}</span>
            </span>
            {CARS.map((car) => {
              const ch = byKey.get(`${car}-${pos}`);
              const v = ch?.vibration ?? 0;
              return (
                <span
                  key={car}
                  className={`${w.railCell} ${pos === 2 ? w.railSplit : ""}`}
                  style={{ background: `color-mix(in srgb, var(--text) ${Math.round(6 + level(v) * 74)}%, transparent)` }}
                  title={`Car ${car}, position ${pos}: vibration ${v.toFixed(3)}, shock ${ch?.shock.toFixed(3) ?? "—"} m/s²`}
                  role="cell"
                />
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className={w.railKey}>
        <span className="faint">Vibration standard deviation, m/s²</span>
        <span className="mono faint">{fmtNum(lo, 2)}</span>
        <span className={w.railRamp} aria-hidden />
        <span className="mono faint">{fmtNum(hi, 2)}</span>
      </div>
      <div className={w.sidePair}>
        <SideBars title="Mean vibration by rail side, m/s²" values={view.sideVibration} />
        <SideBars title="Mean shock by rail side, m/s²" values={view.sideShock} />
      </div>
    </div>
  );
}
