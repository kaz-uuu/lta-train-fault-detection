import { Link } from "react-router-dom";
import { Empty, Field } from "../components/primitives";
import type { SubsystemInfo } from "./api";
import { useSubmission, useSubsystems } from "./hooks";
import { ModelTag, RunTag } from "./parts";
import w from "./workbench.module.css";

const STEPS = [
  ["01", "Choose a subsystem", "Each one answers a different question about the train."],
  ["02", "Upload its data", "Drag the file in. The app checks it before using it."],
  ["03", "Review and download", "See the result on screen and save the predictions file."],
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
        <Field label="You upload">
          <span className="dim">{info.inputHint}</span>
        </Field>
        <Field label="You get" mono>
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
  const { data: submission } = useSubmission();

  return (
    <div className={w.page}>
      <header className={w.hero}>
        <span className="micro">NEBULA X · Problem statement 3</span>
        <h1 className={w.heroTitle}>Train condition monitoring</h1>
        <p className={w.heroLede}>
          Choose a subsystem, upload its data, and download the predictions. Every file is checked before it is
          used.
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

      {error && <Empty>The workbench service is not reachable. Start the API and reload.</Empty>}
      <section className={w.cards} aria-label="Subsystems">
        {subsystems?.map((info) => <SubsystemCard key={info.id} info={info} />)}
      </section>

      {submission && (
        <section className={w.submitStrip}>
          <div className={w.submitText}>
            <span className="micro">Submission</span>
            <span className={w.submitTitle}>
              <span className="mono">{submission.zipName}</span> · {submission.ready} of {submission.items.length}{" "}
              subsystems ready
            </span>
            <span className="dim">
              The app packages the newest predictions of each subsystem into one file for hand-in.
            </span>
          </div>
          <Link to="/submission" className="btn">
            Review submission
          </Link>
        </section>
      )}
    </div>
  );
}
