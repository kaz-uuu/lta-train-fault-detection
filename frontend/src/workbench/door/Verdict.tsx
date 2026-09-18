import { StateMark } from "../../components/StateMark";
import type { DoorCycle } from "../api";
import w from "../workbench.module.css";

export const ABNORMAL = "Abnormal resistance";

export function Verdict({ cycle }: { cycle: DoorCycle }) {
  if (!cycle.prediction) return <span className="faint">Not labelled</span>;
  if (cycle.prediction === ABNORMAL) {
    return (
      <span className={w.verdict}>
        <StateMark state="P1" size={10} />
        Abnormal resistance
      </span>
    );
  }
  return <span className="dim">Normal</span>;
}
