import { useMemo, useState } from "react";
import { Empty, Panel } from "../../components/primitives";
import { StateMark } from "../../components/StateMark";
import { fmtNum, fmtSeconds, fmtTime } from "../../lib/format";
import type { DoorCycle, DoorView, FileResult, Run } from "../api";
import { CheckList, checkCounts, Tiles } from "../parts";
import w from "../workbench.module.css";
import { CycleDetail } from "./CycleDetail";
import { CycleStrip } from "./CycleStrip";
import { ABNORMAL, Verdict } from "./Verdict";

function FileChecks({ result }: { result: FileResult }) {
  return (
    <details className={w.fileChecks} open={!result.ok}>
      <summary>
        <span className="mono">{result.fileName}</span>
        <span className="dim">{checkCounts(result.checks)}</span>
      </summary>
      <CheckList checks={result.checks} />
    </details>
  );
}

function CycleTable({
  cycles,
  selected,
  onSelect,
}: {
  cycles: DoorCycle[];
  selected: number | null;
  onSelect: (index: number) => void;
}) {
  return (
    <div className={w.tableWrap}>
      <table className={w.table}>
        <thead>
          <tr>
            <th>#</th>
            <th>Start</th>
            <th>Length</th>
            <th>Movement</th>
            <th className={w.num} title="Mean motor current where resistance shows, and the threshold it is compared with">
              Current / limit, mA
            </th>
            <th>Label</th>
          </tr>
        </thead>
        <tbody>
          {cycles.map((c) => (
            <tr
              key={c.index}
              className={`${w.row} ${c.index === selected ? w.rowOn : ""}`}
              onClick={() => onSelect(c.index)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(c.index)}
              tabIndex={0}
              aria-selected={c.index === selected}
            >
              <td className="mono">{c.index + 1}</td>
              <td className="mono">{fmtTime(c.start)}</td>
              <td className="mono">{fmtSeconds(c.durationS)}</td>
              <td>{c.operation === "Open" ? "Opening" : "Closing"}</td>
              <td className={`mono ${w.num}`}>
                {fmtNum(c.windowCurrent)}
                <span className="faint"> / {fmtNum(c.threshold)}</span>
              </td>
              <td>
                <Verdict cycle={c} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DoorResults({ run }: { run: Run }) {
  const result = run.results[run.results.length - 1];
  const view = result?.view?.kind === "door" ? (result.view as DoorView) : null;
  const cycles = useMemo(() => view?.cycles ?? [], [view]);
  const [onlyAbnormal, setOnlyAbnormal] = useState(false);
  const firstAbnormal = cycles.find((c) => c.prediction === ABNORMAL)?.index ?? cycles[0]?.index ?? null;
  const [picked, setPicked] = useState<number | null>(null);
  const selected = picked ?? firstAbnormal;

  if (!result) return <Empty>No file in this batch.</Empty>;
  if (!result.ok || !view) {
    return (
      <div className={w.stack}>
        <FileChecks result={result} />
        <Empty>The log failed validation and was not analysed. Correct the file or upload a different log.</Empty>
      </div>
    );
  }

  const abnormal = cycles.filter((c) => c.prediction === ABNORMAL).length;
  const openings = cycles.filter((c) => c.operation === "Open").length;
  const shown = onlyAbnormal ? cycles.filter((c) => c.prediction === ABNORMAL) : cycles;
  const current = cycles.find((c) => c.index === selected) ?? null;

  return (
    <div className={w.stack}>
      <FileChecks result={result} />
      <Tiles
        items={[
          { label: "Door movements found", value: fmtNum(cycles.length), note: `${openings} openings · ${cycles.length - openings} closings` },
          {
            label: "Abnormal resistance",
            value: (
              <span className={w.verdict}>
                {abnormal > 0 && <StateMark state="P1" size={12} />}
                {fmtNum(abnormal)}
              </span>
            ),
            note: cycles.length ? `${Math.round((abnormal / cycles.length) * 100)}% of movements` : undefined,
          },
          { label: "Normal", value: fmtNum(cycles.length - abnormal) },
          {
            label: "Log duration",
            value: fmtSeconds((new Date(view.end).getTime() - new Date(view.start).getTime()) / 1000),
            note: `${fmtNum(view.rows)} rows at ${view.samplePeriodMs} ms intervals`,
          },
        ]}
      />

      <Panel title="Movement timeline" aside={<span className="faint">Select a movement to inspect it</span>}>
        <CycleStrip cycles={cycles} selected={selected} onSelect={setPicked} />
      </Panel>

      <div className={w.doorGrid}>
        <Panel
          title="Movements"
          aside={
            <label className={w.toggle}>
              <input type="checkbox" checked={onlyAbnormal} onChange={(e) => setOnlyAbnormal(e.target.checked)} />
              Abnormal only
            </label>
          }
          bodyClass={w.flush}
        >
          {shown.length ? (
            <CycleTable cycles={shown} selected={selected} onSelect={setPicked} />
          ) : (
            <Empty>No movements with abnormal resistance.</Empty>
          )}
        </Panel>
        <Panel title={current ? `Movement ${current.index + 1}` : "Movement"} focal>
          {current ? <CycleDetail cycle={current} view={view} /> : <Empty>Select a movement.</Empty>}
        </Panel>
      </div>
    </div>
  );
}
