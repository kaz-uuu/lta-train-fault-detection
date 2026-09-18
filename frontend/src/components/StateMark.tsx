import type { State } from "../api/client";

const NAMES: Record<string, string> = {
  P1: "Train alarm",
  P2: "Early warning",
  P3: "Advisory",
  DQ: "Data quality",
  ACT: "Action required",
  normal: "Normal",
};

interface Props {
  state: State;
  size?: number;
  pulse?: boolean;
  /** Draw nothing at all for normal instead of the quiet dash. */
  hideNormal?: boolean;
}

/**
 * The only way state colour enters the UI. Each state has its own shape so it
 * reads without colour (docs/DESIGN.md §4). Every filled shape also carries an
 * outline in its ink colour, which is what keeps it visible on the light ground.
 */
export function StateMark({ state, size = 12, pulse, hideNormal }: Props) {
  if (state === null && hideNormal) return null;
  const s = size;
  const label = NAMES[state ?? "normal"];
  const common = {
    width: s,
    height: s,
    viewBox: "0 0 12 12",
    role: "img" as const,
    "aria-label": label,
    className: pulse ? "pulse" : undefined,
    style: { flex: "none", display: "block", overflow: "visible" },
  };

  switch (state) {
    case "P1":
      return (
        <svg {...common}>
          <rect x="1" y="1" width="10" height="10" style={{ fill: "var(--p1-fill)", stroke: "var(--p1-ink)" }} />
        </svg>
      );
    case "P2":
      return (
        <svg {...common}>
          <path
            d="M6 0.8 L11.4 10.6 L0.6 10.6 Z"
            style={{ fill: "var(--p2-fill)", stroke: "var(--p2-ink)", strokeLinejoin: "miter" }}
          />
        </svg>
      );
    case "P3":
      return (
        <svg {...common}>
          <path
            d="M1.2 1.6 L10.8 1.6 L6 10.4 Z"
            style={{ fill: "none", stroke: "var(--p3-ink)", strokeWidth: 1.6, strokeLinejoin: "miter" }}
          />
        </svg>
      );
    case "DQ":
      return (
        <svg {...common}>
          <path
            d="M6 0.8 L11.2 6 L6 11.2 L0.8 6 Z"
            style={{ fill: "none", stroke: "var(--dq-ink)", strokeWidth: 1.2, strokeDasharray: "2 1.4" }}
          />
          <circle cx="6" cy="6" r="1.1" style={{ fill: "var(--dq-ink)" }} />
        </svg>
      );
    case "ACT":
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="5" style={{ fill: "var(--act-fill)", stroke: "var(--text)" }} />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <line x1="3.5" y1="6" x2="8.5" y2="6" style={{ stroke: "var(--ink-normal)", strokeWidth: 1.2 }} />
        </svg>
      );
  }
}
