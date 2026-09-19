import { useState } from "react";
import { Empty, Panel } from "../components/primitives";
import { fmtBytes } from "../lib/format";
import type { FileResult, Run, SubsystemInfo } from "./api";
import { Note } from "./charts";
import { CheckList, checkCounts } from "./parts";
import { AcvPreview } from "./previews/AcvPreview";
import { RailPreview } from "./previews/RailPreview";
import { ShmPreview } from "./previews/ShmPreview";
import w from "./workbench.module.css";

function Preview({ result }: { result: FileResult }) {
  switch (result.view?.kind) {
    case "acv":
      return <AcvPreview view={result.view} />;
    case "rail":
      return <RailPreview view={result.view} />;
    case "shm":
      return <ShmPreview view={result.view} />;
    default:
      return <Empty>No preview is available for this file.</Empty>;
  }
}

function ResultCell({ result, ready }: { result: FileResult; ready: boolean }) {
  if (!result.ok) return <span className={w.bad}>Excluded</span>;
  if (result.prediction) return <span className="mono">{result.prediction}</span>;
  return <span className="faint">{ready ? "—" : "No model"}</span>;
}

/** Batch view for file-per-prediction subsystems: one row per file, then the selected file in detail. */
export function FileResults({ run, info }: { run: Run; info: SubsystemInfo }) {
  const [picked, setPicked] = useState<string | null>(null);
  const results = run.results;
  const selected =
    results.find((r) => r.fileName === picked) ?? results.find((r) => r.ok) ?? results[results.length - 1];
  const ready = info.status === "ready";

  return (
    <div className={w.stack}>
      {!ready && (
        <Note>
          Files are validated and previewed, but no {info.name} model is deployed, so this batch has no predictions
          and is not included in predictions.zip.
        </Note>
      )}
      <div className={w.batchGrid}>
        <Panel title={`Files · ${results.length}`} bodyClass={w.flush}>
          <div className={`${w.tableWrap} ${w.tableTall}`}>
            <table className={w.table}>
              <thead>
                <tr>
                  <th>File</th>
                  <th className={w.num}>Size</th>
                  <th>Checks</th>
                  <th>Prediction</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr
                    key={r.fileName}
                    className={`${w.row} ${r.fileName === selected?.fileName ? w.rowOn : ""}`}
                    onClick={() => setPicked(r.fileName)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setPicked(r.fileName)}
                    tabIndex={0}
                    aria-selected={r.fileName === selected?.fileName}
                  >
                    <td className="mono">{r.fileName}</td>
                    <td className={`mono faint ${w.num}`}>{fmtBytes(r.sizeBytes)}</td>
                    <td className={r.ok ? "dim" : w.bad}>{checkCounts(r.checks)}</td>
                    <td>
                      <ResultCell result={r} ready={ready} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        {selected && (
          <Panel title={<span className="mono">{selected.fileName}</span>} focal>
            <div className={w.stack}>
              <CheckList checks={selected.checks} />
              {selected.ok ? (
                <Preview result={selected} />
              ) : (
                <Empty>This file failed validation and is excluded from the predictions.</Empty>
              )}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
