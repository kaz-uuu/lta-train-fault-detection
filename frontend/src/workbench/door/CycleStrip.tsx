import { useState } from "react";
import { fmtNum, fmtSeconds, fmtTime } from "../../lib/format";
import { useSize } from "../../lib/useSize";
import type { DoorCycle } from "../api";
import w from "../workbench.module.css";

const CELL_H = 28;

/** One cell per movement, in log order. Only abnormal cells carry state colour. */
export function CycleStrip({
  cycles,
  selected,
  onSelect,
}: {
  cycles: DoorCycle[];
  selected: number | null;
  onSelect: (index: number) => void;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = cycles.length;
  const gap = 2;
  const cell = n ? Math.max(4, (width - gap * (n - 1)) / n) : 0;
  const tip = cycles.find((c) => c.index === hover);

  return (
    <div className={w.strip}>
      <div ref={ref} className={w.stripCells} onMouseLeave={() => setHover(null)}>
        {width > 0 &&
          cycles.map((c, i) => {
            const abnormal = c.prediction === "Abnormal resistance";
            return (
              <button
                key={c.index}
                className={`${w.stripCell} ${abnormal ? w.stripBad : ""} ${c.index === selected ? w.stripOn : ""}`}
                style={{ left: i * (cell + gap), width: cell, height: CELL_H }}
                onClick={() => onSelect(c.index)}
                onMouseEnter={() => setHover(c.index)}
                onFocus={() => setHover(c.index)}
                aria-label={`Movement ${c.index + 1}, ${c.operation === "Open" ? "opening" : "closing"}, ${c.prediction ?? "not labelled"}`}
                aria-pressed={c.index === selected}
              />
            );
          })}
        {width > 0 &&
          cycles.map((c, i) => (
            <span key={`op-${c.index}`} className={w.stripOp} style={{ left: i * (cell + gap), width: cell }} aria-hidden>
              {cell >= 12 ? (c.operation === "Open" ? "O" : "C") : ""}
            </span>
          ))}
      </div>
      <div className={w.stripFoot}>
        <span className="faint">
          O opening · C closing ·{" "}
          <span className={w.stripKeyBad} aria-hidden /> abnormal resistance ·{" "}
          <span className={w.stripKeyOk} aria-hidden /> normal
        </span>
        <span className={`mono ${tip ? "" : "faint"}`}>
          {tip
            ? [
                `#${tip.index + 1}`,
                fmtTime(tip.start),
                tip.operation === "Open" ? "opening" : "closing",
                fmtSeconds(tip.durationS),
                ...(tip.windowCurrent != null && tip.threshold != null
                  ? [`${fmtNum(tip.windowCurrent)} mA vs ${fmtNum(tip.threshold)} mA`]
                  : []),
                tip.prediction ?? "not labelled",
              ].join(" · ")
            : "Hover over a movement for details"}
        </span>
      </div>
    </div>
  );
}
