import { Link } from "react-router-dom";
import { Empty, Field } from "../components/primitives";
import type { SubsystemInfo } from "./api";
import { useSubmission, useSubsystems } from "./hooks";
import { ModelTag, RunTag } from "./parts";
import w from "./workbench.module.css";

const STEPS = [
  ["01", "Choose a subsystem", "Each model answers one question about the condition of the train."],
  ["02", "Upload recorded data", "Files are validated for format, columns and sampling before any model runs."],
  ["03", "Review and export", "Inspect each prediction against its signals, then download the results as CSV."],
] as const;

function SubsystemCard({ info }: { info: SubsystemInfo }) {
  const run = info.latestRun;
  return (
    <Link to={`/${info.id}`} className={w.card}>
      <div className={w.cardHead}>
        <h2 className={w.cardTitle}>{info.name}</h2>
        <ModelTag status={info.status} />
      </div>
      <p className={w.cardQuestion}>{info.question}</p>
      <div className={w.cardFields}>
        <Field label="Input">
          <span className="dim">{info.inputHint}</span>
        </Field>
        <Field label="Output" mono>
          {info.outputFile}
        </Field>
      </div>
      <div className={w.cardFoot}>
        <div className={w.cardRun}>
          <RunTag status={run?.status ?? "none"} />
          {run && run.status !== "empty" && <span className="dim">{run.summary}</span>}
        </div>
        <span className={w.cardOpen} aria-hidden>
          Open →
        </span>
      </div>
    </Link>
  );
}

export function HomeView() {
  const { data: subsystems, error } = useSubsystems();
  const { data: predictions } = useSubmission();

  return (
    <div className={w.page}>
      <header className={w.hero}>
        <span className="micro">Train condition monitoring</span>
        <h1 className={w.heroTitle}>Convoy</h1>
        <p className={w.heroLede}>
          Fault-detection models for four train subsystems: saloon doors, air-conditioning, rail and structure.
          Upload recorded data, review what each model finds, and export the predictions.
        </p>
      </header>

      <ol className={w.steps}>
        {STEPS.map(([n, title, text]) => (
          <li key={n} className={w.step}>
            <span className={`mono ${w.stepNum}`}>{n}</span>
            <span className={w.stepTitle}>{title}</span>
            <span className="dim">{text}</span>
          </li>
        ))}
      </ol>

      {error && <Empty>Cannot reach the prediction service. Check that the API is running, then reload.</Empty>}
      <section className={w.cards} aria-label="Subsystems">
        {subsystems?.map((info) => <SubsystemCard key={info.id} info={info} />)}
      </section>

      {predictions && (
        <section className={w.predictionsStrip}>
          <div className={w.predictionsText}>
            <span className="micro">Predictions</span>
            <span className={w.predictionsTitle}>
              <span className="mono">{predictions.zipName}</span> · {predictions.ready} of {predictions.items.length}{" "}
              subsystems ready
            </span>
            <span className="dim">The latest predictions from every subsystem, in a single archive.</span>
          </div>
          <Link to="/predictions" className="btn">
            View predictions
          </Link>
        </section>
      )}
    </div>
  );
}
