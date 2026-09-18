import { useCallback } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { CodeChip, Empty, Field, Panel } from "../components/primitives";
import { fmtNum } from "../lib/format";
import { isSubsystem, type Run, type SubsystemId, type SubsystemInfo } from "./api";
import { DoorResults } from "./door/DoorResults";
import { FileResults } from "./FileResults";
import { useRun, useSubsystem, useUploader } from "./hooks";
import { Dropzone, ModelTag, RunTag, UploadQueue } from "./parts";
import w from "./workbench.module.css";

export function WorkspaceView() {
  const { subsystem } = useParams();
  if (!isSubsystem(subsystem)) return <Navigate to="/" replace />;
  return <Workspace key={subsystem} id={subsystem} />;
}

const PARAMETER_LABELS: Record<string, string> = {
  openThresholdMa: "Opening threshold",
  closeThresholdMa: "Closing threshold",
  openMarginMa: "Opening margin on Train",
  closeMarginMa: "Closing margin on Train",
};

function About({ info }: { info: SubsystemInfo }) {
  const model = info.model;
  return (
    <div className={w.about}>
      <p>{info.task}</p>
      {model ? (
        <>
          <Field label={`${model.name} · v${model.version}`}>
            <span className="dim">{model.method}</span>
          </Field>
          <div className={w.aboutGrid}>
            <Field label="Trained on">{model.trainedOn}</Field>
            <Field label="Validation">{model.validation}</Field>
            {Object.entries(model.parameters).map(([k, v]) => (
              <Field key={k} label={PARAMETER_LABELS[k] ?? k} mono unit="mA">
                {fmtNum(v, 1)}
              </Field>
            ))}
          </div>
        </>
      ) : (
        <p className={w.pendingNote}>{info.statusNote}</p>
      )}
      <div className={w.aboutGrid}>
        <Field label="Output file" mono>
          {info.outputFile}
        </Field>
        <Field label="Scored by">{info.metric}</Field>
        <div className={w.aboutWide}>
          <Field label="Columns">
            <span className={w.chips}>
              {info.outputColumns.map((c) => (
                <CodeChip key={c}>{c}</CodeChip>
              ))}
            </span>
          </Field>
        </div>
      </div>
    </div>
  );
}

export function DownloadButton({ run, csvName }: { run: Run | undefined; csvName: string }) {
  if (run?.csvUrl) {
    return (
      <a className="btn btn--primary" href={run.csvUrl} download={run.csvName}>
        Download {run.csvName}
      </a>
    );
  }
  const why = !run || run.files === 0 ? "Upload data first." : "Predictions need a ready model and a file that passed the checks.";
  return (
    <button className="btn btn--primary" disabled title={why}>
      Download {csvName}
    </button>
  );
}

function Workspace({ id }: { id: SubsystemId }) {
  const { data: info, error } = useSubsystem(id);
  const [params, setParams] = useSearchParams();
  const runParam = params.get("run");
  const runId = runParam === "new" ? undefined : (runParam ?? info?.latestRun?.id ?? undefined);
  const setRun = useCallback((rid: string) => setParams({ run: rid }, { replace: true }), [setParams]);
  const { data: run, error: runError } = useRun(runId);
  // a run id the server no longer knows (for example after a restart) must not receive uploads
  const stale = runError instanceof ApiError && runError.status === 404;
  const uploads = useUploader(id, stale ? undefined : runId, setRun);

  if (error) return <Empty>The workbench service is not reachable. Start the API and reload.</Empty>;
  if (!info) return <Empty>Loading…</Empty>;

  const startOver = () => {
    uploads.clear();
    setParams({ run: "new" }, { replace: true });
  };
  const hasFiles = Boolean(run && run.files > 0);

  return (
    <div className={w.page}>
      <header className={w.wsHead}>
        <div className={w.wsHeadMain}>
          <nav className={w.crumbs} aria-label="Breadcrumb">
            <Link to="/">Overview</Link>
            <span className="faint">/</span>
            <span>{info.name}</span>
          </nav>
          <h1 className={w.wsTitle}>{info.name}</h1>
          <p className={w.wsQuestion}>{info.question}</p>
          <div className={w.wsTags}>
            <ModelTag status={info.status} />
            <RunTag status={hasFiles ? run!.status : "none"} />
            {hasFiles && <span className="dim">{run!.summary}</span>}
          </div>
        </div>
        <div className={w.wsActions}>
          {hasFiles && (
            <button className="btn" onClick={startOver} disabled={uploads.busy}>
              Start over
            </button>
          )}
          <DownloadButton run={run} csvName={info.outputFile} />
        </div>
      </header>

      <div className={w.wsTop}>
        <Panel title={info.multiple ? "1 · Upload files" : "1 · Upload the file"} focal>
          <div className={w.uploadBody}>
            <Dropzone accepts={info.accepts} multiple={info.multiple} hint={info.inputHint} onFiles={uploads.add} />
            <UploadQueue queue={uploads.queue} />
            {!info.multiple && hasFiles && (
              <p className="faint">Uploading another file replaces the current one.</p>
            )}
            {info.multiple && hasFiles && (
              <p className="faint">New files are added to this batch. A file with the same name replaces the earlier one.</p>
            )}
          </div>
        </Panel>
        <Panel title="How it works">
          <About info={info} />
        </Panel>
      </div>

      <section className={w.section} aria-labelledby="results">
        <div className={w.sectionHead}>
          <h2 id="results" className={w.sectionTitle}>
            2 · Results
          </h2>
          {hasFiles && (
            <span className="dim">
              {run!.validFiles} of {run!.files} file{run!.files === 1 ? "" : "s"} passed the checks
            </span>
          )}
        </div>
        {runError ? (
          <Empty>This batch is no longer on the server. Upload the data again.</Empty>
        ) : !hasFiles ? (
          <Empty>
            {uploads.busy ? "Checking the upload…" : `Upload ${info.multiple ? "files" : "a file"} to see the results here.`}
          </Empty>
        ) : id === "door" ? (
          <DoorResults run={run!} />
        ) : (
          <FileResults run={run!} info={info} />
        )}
      </section>

      <section className={w.downloadBar} aria-labelledby="download">
        <div className={w.downloadText}>
          <h2 id="download" className={w.sectionTitle}>
            3 · Download
          </h2>
          <span className="dim">
            {run?.csvUrl
              ? `${fmtNum(run.rows)} prediction rows in the brief's format. The same file goes into predictions.zip.`
              : info.status === "ready"
                ? "The predictions file appears once a file passes the checks."
                : "Nothing to download until this subsystem's model is ready."}
          </span>
        </div>
        <div className={w.wsActions}>
          <Link to="/submission" className="btn">
            Go to submission
          </Link>
          <DownloadButton run={run} csvName={info.outputFile} />
        </div>
      </section>
    </div>
  );
}
