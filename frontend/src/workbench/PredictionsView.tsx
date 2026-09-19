import { Link } from "react-router-dom";
import { CodeChip, Empty, Panel } from "../components/primitives";
import { fmtDateTime, fmtNum } from "../lib/format";
import type { SubsystemId } from "./api";
import { useSubmission, useSubsystems } from "./hooks";
import { RunTag } from "./parts";
import w from "./workbench.module.css";

/** What one row of each subsystem's predictions file stands for. */
const ROW_MEANING: Record<SubsystemId, string> = {
  door: "One row per door movement: when it started and ended, and whether it met abnormal resistance.",
  acv: "One row per workbook: every car in the train, from most to least likely to be leaking refrigerant, separated by |.",
  rail: "One row per recording: Normal, or corrugation on Side I or Side II.",
  shm: "One row per recording: the estimated cumulative fatigue damage.",
};

export function PredictionsView() {
  const { data: sub, error } = useSubmission();
  const { data: subsystems } = useSubsystems();

  if (error) return <Empty>Cannot reach the prediction service. Check that the API is running, then reload.</Empty>;
  if (!sub) return <Empty>Loading…</Empty>;

  const included = sub.items.filter((i) => i.included);

  return (
    <div className={w.page}>
      <header className={w.wsHead}>
        <div className={w.wsHeadMain}>
          <nav className={w.crumbs} aria-label="Breadcrumb">
            <Link to="/">Overview</Link>
            <span className="faint">/</span>
            <span>Predictions</span>
          </nav>
          <h1 className={w.wsTitle}>Predictions</h1>
          <p className={w.wsQuestion}>
            The latest predictions from each subsystem. Download one subsystem's CSV, or all of them together in{" "}
            <span className="mono">{sub.zipName}</span>. Subsystems without predictions are not included in the archive.
          </p>
        </div>
      </header>

      <div className={w.predictionsGrid}>
        <Panel title="Subsystems" bodyClass={w.flush}>
          <div className={w.tableWrap}>
            <table className={w.table}>
              <thead>
                <tr>
                  <th>Subsystem</th>
                  <th>Output file</th>
                  <th>Status</th>
                  <th className={w.num} title="Files that passed validation, of files uploaded">
                    Files
                  </th>
                  <th className={w.num}>Rows</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sub.items.map((item) => (
                  <tr key={item.subsystem}>
                    <td>
                      <Link to={`/${item.subsystem}`} className={w.link}>
                        {item.name}
                      </Link>
                      <div className="faint">{item.note}</div>
                    </td>
                    <td className="mono">{item.outputFile}</td>
                    <td>
                      <RunTag status={item.status} />
                    </td>
                    <td className={`mono ${w.num}`}>
                      {item.run ? `${item.run.validFiles}/${item.run.files}` : "—"}
                    </td>
                    <td className={`mono ${w.num}`}>{item.run ? fmtNum(item.run.rows) : "—"}</td>
                    <td className="mono dim">{item.run ? fmtDateTime(item.run.createdAt) : "—"}</td>
                    <td className={w.num}>
                      {item.run?.csvUrl ? (
                        <a className="btn" href={item.run.csvUrl} download={item.run.csvName}>
                          Download CSV
                        </a>
                      ) : (
                        <Link to={`/${item.subsystem}`} className="btn">
                          Upload data
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Archive" focal>
          <div className={w.stack}>
            <div className={w.zipFigure}>
              <span className="mono">{sub.zipName}</span>
              <span className={w.zipCount}>
                {sub.ready} of {sub.items.length}
              </span>
              <span className="dim">subsystems included</span>
            </div>
            {included.length > 0 ? (
              <ul className={w.zipList}>
                {included.map((i) => (
                  <li key={i.subsystem} className="mono">
                    {i.outputFile}
                    <span className="faint"> · {fmtNum(i.run?.rows)} rows</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dim">No predictions yet. Open a subsystem and upload data to generate them.</p>
            )}
            {sub.zipUrl ? (
              <a className="btn btn--primary" href={sub.zipUrl} download={sub.zipName}>
                Download {sub.zipName}
              </a>
            ) : (
              <button className="btn btn--primary" disabled>
                Download {sub.zipName}
              </button>
            )}
          </div>
        </Panel>
      </div>

      {subsystems && (
        <section className={w.section} aria-labelledby="formats">
          <div className={w.sectionHead}>
            <h2 id="formats" className={w.sectionTitle}>
              File formats
            </h2>
            <span className="dim">UTF-8 CSV with a header row, one file per subsystem</span>
          </div>
          <ul className={w.formats}>
            {subsystems.map((info) => (
              <li key={info.id}>
                <span className="mono">{info.outputFile}</span>
                <span className={w.chips}>
                  {info.outputColumns.map((c) => (
                    <CodeChip key={c}>{c}</CodeChip>
                  ))}
                </span>
                <span className="dim">{ROW_MEANING[info.id]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
