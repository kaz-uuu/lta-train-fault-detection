import type { State } from "../api/client";
import s from "./StateLabel.module.css";
import { StateMark } from "./StateMark";

const TEXT: Record<string, { long: string; short: string }> = {
  P1: { long: "Train alarm", short: "P1" },
  P2: { long: "Early warning", short: "P2" },
  P3: { long: "Advisory", short: "P3" },
  DQ: { long: "Data quality", short: "DQ" },
  ACT: { long: "Action required", short: "ACT" },
  normal: { long: "Normal", short: "—" },
};

interface Props {
  state: State;
  compact?: boolean;
  withMark?: boolean;
  pulse?: boolean;
  children?: string;
}

/** State name in its label treatment: reverse, boxed, bracketed, dashed or inverse. */
export function StateLabel({ state, compact, withMark, pulse, children }: Props) {
  const key = state ?? "normal";
  const text = children ?? (compact ? TEXT[key].short : TEXT[key].long);
  return (
    <span className={`${s.label} ${s[key]} ${compact ? s.compact : ""} ${pulse ? "pulse" : ""}`}>
      {withMark && state !== "P1" && state !== "ACT" && <StateMark state={state} size={10} />}
      {text}
    </span>
  );
}
