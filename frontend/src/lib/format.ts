/** Formatting per docs/DESIGN.md §9. Replay timestamps are naive (data time). */

const pad = (n: number) => String(n).padStart(2, "0");

function parts(iso: string) {
  const d = new Date(iso);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    hm: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** `2020-04-02 15:03:00` */
export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? `${parts(iso).date} ${parts(iso).time}` : "—";

/** `15:03:00` */
export const fmtTime = (iso: string | null | undefined) => (iso ? parts(iso).time : "—");

/** `1.2 MB`, `845 KB`, `12 B` */
export function fmtBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB`;
  return `${n} B`;
}

/** Grouped thousands, fixed decimals: `18,036`, `248.9` */
export const fmtNum = (x: number | null | undefined, digits = 0) =>
  x == null || Number.isNaN(x)
    ? "—"
    : x.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** `3.76 s`, `47.5 s`, `12m 04s` */
export function fmtSeconds(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
  const m = Math.floor(seconds / 60);
  return `${m}m ${String(Math.round(seconds - m * 60)).padStart(2, "0")}s`;
}
