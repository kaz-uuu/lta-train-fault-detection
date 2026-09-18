import { useEffect, useRef, useState, type ReactNode } from "react";
import { StateLabel } from "../components/StateLabel";
import { StateMark } from "../components/StateMark";
import { fmtBytes } from "../lib/format";
import type { Check, RunStatus } from "./api";
import type { QueueItem } from "./hooks";
import w from "./workbench.module.css";

export function ModelTag({ status }: { status: "ready" | "pending" }) {
  return status === "ready" ? (
    <span className={`${w.tag} ${w.tagSolid}`}>Model ready</span>
  ) : (
    <span className={`${w.tag} ${w.tagDashed}`}>Model pending</span>
  );
}

export function RunTag({ status }: { status: RunStatus | "none" }) {
  switch (status) {
    case "ready":
      return <span className={`${w.tag} ${w.tagSolid}`}>Predictions ready</span>;
    case "pending":
      return <span className={`${w.tag} ${w.tagDashed}`}>Checked · model pending</span>;
    case "invalid":
      return <StateLabel state="ACT">Check failed</StateLabel>;
    default:
      return <span className={`${w.tag} ${w.tagFaint}`}>No file yet</span>;
  }
}

function CheckMark({ state }: { state: Check["state"] }) {
  if (state === "warn") return <StateMark state="DQ" size={12} />;
  if (state === "fail") return <StateMark state="ACT" size={12} />;
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" role="img" aria-label="Passed" style={{ flex: "none" }}>
      <path d="M2 6.5 L5 9.2 L10 3" fill="none" stroke="var(--text-2)" strokeWidth="1.4" />
    </svg>
  );
}

const STATE_WORD = { pass: "Passed", warn: "Warning", fail: "Failed" } as const;

export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className={w.checks}>
      {checks.map((c) => (
        <li key={c.label} className={w.check}>
          <CheckMark state={c.state} />
          <span className={w.checkLabel}>
            {c.label}
            <span className="sr-only"> — {STATE_WORD[c.state]}</span>
          </span>
          {c.detail && <span className={w.checkDetail}>{c.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Pass, warning and failure counts in one line: `5 passed · 1 warning`. */
export function checkCounts(checks: Check[]): string {
  const n = (state: Check["state"]) => checks.filter((c) => c.state === state).length;
  const parts = [`${n("pass")} passed`];
  if (n("warn")) parts.push(`${n("warn")} warning${n("warn") > 1 ? "s" : ""}`);
  if (n("fail")) parts.push(`${n("fail")} failed`);
  return parts.join(" · ");
}

export function Tiles({ items }: { items: { label: string; value: ReactNode; note?: ReactNode }[] }) {
  return (
    <div className={w.tiles}>
      {items.map((it) => (
        <div key={it.label} className={w.tile}>
          <span className="micro">{it.label}</span>
          <span className={w.tileValue}>{it.value}</span>
          {it.note && <span className={w.tileNote}>{it.note}</span>}
        </div>
      ))}
    </div>
  );
}

function UploadGlyph() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden className={w.dropGlyph}>
      <rect x="0.5" y="0.5" width="27" height="27" fill="none" stroke="currentColor" />
      <path d="M14 20 V8 M9 13 L14 8 L19 13" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

interface DropzoneProps {
  accepts: string[];
  multiple: boolean;
  hint: string;
  onFiles: (files: File[]) => void;
}

/** Drag and drop or browse. Files of the wrong type are still sent, so the checks can say why. */
export function Dropzone({ accepts, multiple, hint, onFiles }: DropzoneProps) {
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);

  useEffect(() => {
    folder.current?.setAttribute("webkitdirectory", "");
  }, [multiple]);

  const take = (list: FileList | null, onlyAccepted = false) => {
    if (!list) return;
    let files = Array.from(list).filter((f) => !f.name.startsWith("."));
    if (onlyAccepted) files = files.filter((f) => accepts.some((ext) => f.name.toLowerCase().endsWith(ext)));
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (!multiple) files = files.slice(0, 1);
    if (files.length) onFiles(files);
  };

  return (
    <div
      className={`${w.drop} ${over ? w.dropOver : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
    >
      <UploadGlyph />
      <p className={w.dropTitle}>{multiple ? "Drop files here" : "Drop the file here"}</p>
      <p className={w.dropHint}>{hint}</p>
      <div className={w.dropActions}>
        <button className="btn btn--primary" onClick={() => picker.current?.click()}>
          {multiple ? "Choose files" : "Choose a file"}
        </button>
        {multiple && (
          <button className="btn" onClick={() => folder.current?.click()}>
            Choose a folder
          </button>
        )}
      </div>
      <span className="micro">Accepted: {accepts.join(", ")}</span>
      <input
        ref={picker}
        type="file"
        hidden
        multiple={multiple}
        accept={accepts.join(",")}
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
      {multiple && (
        <input
          ref={folder}
          type="file"
          hidden
          onChange={(e) => {
            take(e.target.files, true);
            e.target.value = "";
          }}
        />
      )}
    </div>
  );
}

const QUEUE_WORD: Record<QueueItem["state"], string> = {
  waiting: "Waiting",
  uploading: "Checking…",
  done: "Done",
  error: "Upload failed",
};

export function UploadQueue({ queue }: { queue: QueueItem[] }) {
  if (!queue.length) return null;
  const done = queue.filter((q) => q.state === "done" || q.state === "error").length;
  const visible = queue.slice(-6).reverse();
  return (
    <div className={w.queue} aria-live="polite">
      <div className={w.queueHead}>
        <span className="micro">Uploads</span>
        <span className="mono dim">
          {done} of {queue.length}
        </span>
      </div>
      <div className={w.queueBar} aria-hidden>
        <div className={w.queueFill} style={{ width: `${(done / queue.length) * 100}%` }} />
      </div>
      <ul className={w.queueList}>
        {visible.map((q) => {
          const failed = q.state === "error" || (q.state === "done" && q.result && !q.result.ok);
          return (
            <li key={q.key} className={w.queueItem}>
              <span className={`mono ${w.queueName}`} title={q.name}>
                {q.name}
              </span>
              <span className="faint mono">{fmtBytes(q.size)}</span>
              <span className={failed ? w.queueBad : "dim"}>
                {q.state === "done" && q.result ? (q.result.ok ? "Checked" : "Check failed") : QUEUE_WORD[q.state]}
              </span>
              {q.error && <span className={w.queueError}>{q.error}</span>}
            </li>
          );
        })}
      </ul>
      {queue.length > visible.length && <span className="faint">Showing the latest {visible.length}.</span>}
    </div>
  );
}
