import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { useState, type ReactNode } from "react";
import { useSize } from "../lib/useSize";
import w from "./workbench.module.css";

export interface Series {
  key: string;
  label: string;
  values: (number | null)[];
  stroke: string;
  width?: number;
}

interface LineChartProps {
  series: Series[];
  height?: number;
  /** x value of each index; defaults to the index itself */
  x?: number[];
  xLabel: string;
  yLabel: string;
  formatX?: (v: number) => string;
  formatY?: (v: number) => string;
  /** shaded x range, e.g. the model's window */
  band?: { from: number; to: number; label: string };
  /** short horizontal marks inside the band */
  marks?: { y: number; label: string; stroke: string }[];
  /** fixed y domain; otherwise fitted to the data */
  yDomain?: [number, number];
  showLegend?: boolean;
}

const PAD = { top: 10, right: 12, bottom: 28, left: 52 };

/** Neutral line chart with a hover crosshair that reads out every series at the pointer. */
export function LineChart({
  series,
  height = 200,
  x,
  xLabel,
  yLabel,
  formatX = (v) => String(Math.round(v)),
  formatY = (v) => String(Math.round(v)),
  band,
  marks = [],
  yDomain,
  showLegend = true,
}: LineChartProps) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = Math.max(0, ...series.map((s) => s.values.length));
  const xs = x ?? Array.from({ length: n }, (_, i) => i);
  const all = series.flatMap((s) => s.values).filter((v): v is number => v != null);
  all.push(...marks.map((m) => m.y));
  const lo = yDomain?.[0] ?? Math.min(...all);
  const hi = yDomain?.[1] ?? Math.max(...all);
  const pad = yDomain ? 0 : (hi - lo) * 0.06 || 1;
  const W = Math.max(width, 10);
  const sx = scaleLinear().domain([xs[0] ?? 0, xs[n - 1] ?? 1]).range([PAD.left, W - PAD.right]);
  const sy = scaleLinear().domain([lo - pad, hi + pad]).range([height - PAD.bottom, PAD.top]).nice();
  const path = (values: (number | null)[]) =>
    line<number>()
      .defined((i) => values[i] != null)
      .x((i) => sx(xs[i]))
      .y((i) => sy(values[i]!))(values.map((_, i) => i)) ?? "";

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const xv = sx.invert(e.clientX - box.left);
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(xs[i] - xv) < Math.abs(xs[best] - xv)) best = i;
    setHover(n ? best : null);
  };

  return (
    <div className={w.chart}>
      {showLegend && (
        <div className={w.legend}>
          <span className="micro">{yLabel}</span>
          {series.map((s) => (
            <span key={s.key} className={w.legendItem}>
              <span className={w.legendKey} style={{ background: s.stroke }} />
              {s.label}
              {hover != null && s.values[hover] != null && (
                <span className="mono">{formatY(s.values[hover]!)}</span>
              )}
            </span>
          ))}
          {hover != null && (
            <span className={`mono faint ${w.legendAt}`}>
              {xLabel} {formatX(xs[hover])}
            </span>
          )}
        </div>
      )}
      <div ref={ref} style={{ height }}>
        {width > 0 && n > 0 && (
          <svg
            width={W}
            height={height}
            role="img"
            aria-label={`${yLabel} against ${xLabel}`}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
            style={{ display: "block" }}
          >
            {band && (
              <g>
                <rect
                  x={sx(band.from)}
                  y={PAD.top}
                  width={Math.max(0, sx(band.to) - sx(band.from))}
                  height={height - PAD.top - PAD.bottom}
                  fill="var(--chart-band)"
                />
                <text x={sx(band.from) + 4} y={PAD.top + 11} className={w.axisText}>
                  {band.label}
                </text>
              </g>
            )}
            {sy.ticks(4).map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={sy(t)} y2={sy(t)} stroke="var(--chart-grid)" />
                <text x={PAD.left - 6} y={sy(t) + 3} textAnchor="end" className={w.axisText}>
                  {formatY(t)}
                </text>
              </g>
            ))}
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={height - PAD.bottom}
              y2={height - PAD.bottom}
              stroke="var(--line-strong)"
            />
            {sx.ticks(6).map((t) => (
              <text key={t} x={sx(t)} y={height - PAD.bottom + 14} textAnchor="middle" className={w.axisText}>
                {formatX(t)}
              </text>
            ))}
            <text x={W - PAD.right} y={height - 2} textAnchor="end" className={w.axisText}>
              {xLabel}
            </text>
            {series.map((s) => (
              <path
                key={s.key}
                d={path(s.values)}
                fill="none"
                stroke={s.stroke}
                strokeWidth={s.width ?? 1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {band &&
              marks.map((m) => (
                <g key={m.label}>
                  <line x1={sx(band.from)} x2={sx(band.to)} y1={sy(m.y)} y2={sy(m.y)} stroke={m.stroke} strokeWidth={2} />
                  <text x={sx(band.to) + 4} y={sy(m.y) + 3} className={w.axisText}>
                    {m.label}
                  </text>
                </g>
              ))}
            {hover != null && (
              <line
                x1={sx(xs[hover])}
                x2={sx(xs[hover])}
                y1={PAD.top}
                y2={height - PAD.bottom}
                stroke="var(--text-3)"
              />
            )}
          </svg>
        )}
      </div>
    </div>
  );
}

/** Min–max envelope of a long trace. */
export function EnvelopeChart({
  low,
  high,
  height = 180,
  xLabel,
  yLabel,
}: {
  low: number[];
  high: number[];
  height?: number;
  xLabel: string;
  yLabel: string;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = low.length;
  const W = Math.max(width, 10);
  const sx = scaleLinear().domain([0, n - 1]).range([PAD.left, W - PAD.right]);
  const sy = scaleLinear()
    .domain([Math.min(...low), Math.max(...high)])
    .range([height - PAD.bottom, PAD.top])
    .nice();
  const d =
    area<number>()
      .x((i) => sx(i))
      .y0((i) => sy(low[i]))
      .y1((i) => sy(high[i]))(low.map((_, i) => i)) ?? "";
  return (
    <div className={w.chart}>
      <div className={w.legend}>
        <span className="micro">{yLabel}</span>
        <span className={w.legendItem}>
          <span className={w.legendKey} style={{ background: "var(--chart-line)" }} />
          Range of values in each slice
        </span>
        {hover != null && (
          <span className={`mono faint ${w.legendAt}`}>
            {Math.round((hover / (n - 1)) * 100)}% · {low[hover].toFixed(2)} to {high[hover].toFixed(2)}
          </span>
        )}
      </div>
      <div ref={ref} style={{ height }}>
        {width > 0 && n > 1 && (
          <svg
            width={W}
            height={height}
            role="img"
            aria-label={`${yLabel} envelope`}
            style={{ display: "block" }}
            onMouseMove={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              setHover(Math.max(0, Math.min(n - 1, Math.round(sx.invert(e.clientX - box.left)))));
            }}
            onMouseLeave={() => setHover(null)}
          >
            {sy.ticks(4).map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={sy(t)} y2={sy(t)} stroke="var(--chart-grid)" />
                <text x={PAD.left - 6} y={sy(t) + 3} textAnchor="end" className={w.axisText}>
                  {t}
                </text>
              </g>
            ))}
            <path d={d} fill="var(--chart-band)" stroke="var(--chart-line)" strokeWidth={1} />
            <line x1={PAD.left} x2={W - PAD.right} y1={height - PAD.bottom} y2={height - PAD.bottom} stroke="var(--line-strong)" />
            {[0, 25, 50, 75, 100].map((p) => (
              <text key={p} x={sx(((n - 1) * p) / 100)} y={height - PAD.bottom + 14} textAnchor="middle" className={w.axisText}>
                {p}%
              </text>
            ))}
            <text x={W - PAD.right} y={height - 2} textAnchor="end" className={w.axisText}>
              {xLabel}
            </text>
            {hover != null && (
              <line x1={sx(hover)} x2={sx(hover)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--text-3)" />
            )}
          </svg>
        )}
      </div>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className={w.note}>{children}</p>;
}
