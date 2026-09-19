import { Link } from "react-router-dom";
import { Empty, Panel } from "../components/primitives";
import { fmtDateTime, fmtNum } from "../lib/format";
import { useSubmission } from "./hooks";
import { RunTag } from "./parts";
import w from "./workbench.module.css";

const HAND_IN = [
  ["Demo video", "Up to 3 minutes: choose a subsystem, upload a file, view the result and download it."],
  ["predictions.zip", "Placed directly in the team folder, with one CSV per attempted subsystem and no subfolders."],
  ["App", "This app's source, in the team folder's app/ directory."],
  ["Optional", "A short write-up, and the development code and models per subsystem, under Optional_Items/."],
] as const;

export function SubmissionView() {
  const { data: sub, error } = useSubmission();

  if (error) return <Empty>The workbench service is not reachable. Start the API and reload.</Empty>;
  if (!sub) return <Empty>Loading…</Empty>;

  const included = sub.items.filter((i) => i.included);

  return (
    <div className={w.page}>
      <header className={w.wsHead}>
        <div className={w.wsHeadMain}>
          <nav className={w.crumbs} aria-label="Breadcrumb">
            <Link to="/">Overview</Link>
            <span className="faint">/</span>
            <span>Submission</span>
          </nav>
          <h1 className={w.wsTitle}>Submission</h1>
          <p className={w.wsQuestion}>
            The app puts the newest predictions of each subsystem into <span className="mono">{sub.zipName}</span>, one
            CSV per subsystem at the top level, as the brief requires. A subsystem without predictions is left out.
          </p>
        </div>
      </header>

      <div className={w.submitGrid}>
        <Panel title="Subsystems" bodyClass={w.flush}>
          <div className={w.tableWrap}>
            <table className={w.table}>
              <thead>
                <tr>
                  <th>Subsystem</th>
                  <th>Output file</th>
                  <th>Status</th>
                  <th className={w.num}>Files</th>
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
                          Open
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Package" focal>
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
              <p className="dim">No subsystem has predictions yet. Upload data on a subsystem with a ready model.</p>
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

      <section className={w.section} aria-labelledby="hand-in">
        <div className={w.sectionHead}>
          <h2 id="hand-in" className={w.sectionTitle}>
            What the team folder needs
          </h2>
          <span className="dim">From the brief, section 4</span>
        </div>
        <ol className={w.handIn}>
          {HAND_IN.map(([title, text]) => (
            <li key={title}>
              <span className={w.handInTitle}>{title}</span>
              <span className="dim">{text}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
