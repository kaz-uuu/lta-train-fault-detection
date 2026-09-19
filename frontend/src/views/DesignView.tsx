import { Link } from "react-router-dom";
import type { State } from "../api/client";
import { Glyph } from "../components/Glyph";
import { CodeChip, Field, Panel } from "../components/primitives";
import { StateLabel } from "../components/StateLabel";
import { StateMark } from "../components/StateMark";
import { useTheme } from "../lib/theme";
import { CheckList, ModelTag, RunTag, Tiles } from "../workbench/parts";
import w from "../workbench/workbench.module.css";
import d from "./DesignView.module.css";

const NEUTRALS = ["--bg", "--surface-1", "--surface-2", "--line", "--line-strong", "--text-3", "--text-2", "--text"];
const STATES = ["--p1-fill", "--p1-ink", "--p2-fill", "--p3-ink", "--dq-ink", "--act-fill"];

const STATE_ROWS: { state: State; means: string; where: string }[] = [
  { state: "P1", means: "Abnormal — the model says this is a fault", where: "Abnormal resistance movements" },
  { state: "P2", means: "Early warning", where: "Reserved for the fleet concept" },
  { state: "P3", means: "Advisory", where: "Reserved" },
  { state: "DQ", means: "Data quality — a check that only warns", where: "File checks" },
  { state: "ACT", means: "Action required — the user must do something", where: "Failed file checks" },
  { state: null, means: "Normal — quiet by design", where: "Everything else" },
];

const TYPE_ROWS = [
  ["--t-readout", "Hero figure", "64px"],
  ["--t-figure", "Tile values, page titles", "40px"],
  ["--t-id", "Card titles", "28px"],
  ["--t-title", "Section titles", "20px"],
  ["--t-body", "Body", "14px"],
  ["--t-dense", "Tables and captions", "13px"],
  ["--t-micro", "Uppercase labels", "11px"],
] as const;

const CHECKS = [
  { label: "File type", state: "pass" as const, detail: null },
  { label: "Segment length", state: "warn" as const, detail: "1,000 samples (expected 581,120)." },
  { label: "Subsystem", state: "fail" as const, detail: "This file looks like Rail corrugation data." },
];

function Section({ n, title, note, children }: { n: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className={d.section}>
      <h2 className={d.h2}>
        <span className="mono faint">{n}</span> {title}
      </h2>
      {note && <p className={d.note}>{note}</p>}
      {children}
    </section>
  );
}

/** The design language, rendered from the live tokens. docs/DESIGN.md is the written spec. */
export function DesignView() {
  const { theme, toggle } = useTheme();
  return (
    <div className={w.page}>
      <header className={w.hero}>
        <span className="micro">Design system</span>
        <h1 className={w.heroTitle}>
          <Glyph size={40} /> Convoy
        </h1>
        <p className={w.heroLede}>
          Near-black ground, white type, hairline rules and square corners; colour only where the data is abnormal,
          with a shape behind every colour. Written up in <span className="mono">docs/DESIGN.md</span>.
        </p>
        <div className={w.wsActions}>
          <button className="btn" onClick={toggle}>
            {theme === "dark" ? "Light theme" : "Dark theme"}
          </button>
          <Link to="/" className="btn">
            Back to overview
          </Link>
        </div>
      </header>

      <Section n="01" title="Neutrals" note="Eight steps carry the whole interface. Light is a separate, explicit theme, not an inversion.">
        <div className={d.swatches}>
          {NEUTRALS.map((token) => (
            <div key={token} className={d.swatch}>
              <span className={d.chipColor} style={{ background: `var(${token})` }} />
              <span className="mono">{token}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section n="02" title="State colours" note="Reserved. A state colour never decorates anything, and every state has its own shape.">
        <div className={d.swatches}>
          {STATES.map((token) => (
            <div key={token} className={d.swatch}>
              <span className={d.chipColor} style={{ background: `var(${token})` }} />
              <span className="mono">{token}</span>
            </div>
          ))}
        </div>
        <div className={d.stateTable}>
          <span className="micro">Mark</span>
          <span className="micro">Label</span>
          <span className="micro">Means</span>
          <span className="micro">Used for</span>
          {STATE_ROWS.map((row) => (
            <div key={String(row.state)} className={d.stateRow}>
              <span>
                <StateMark state={row.state} />
              </span>
              <span>
                <StateLabel state={row.state} />
              </span>
              <span>{row.means}</span>
              <span className="dim">{row.where}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section n="03" title="Type" note="One sans for everything, mono for identifiers and values.">
        <div className={d.typeList}>
          {TYPE_ROWS.map(([token, use, size]) => (
            <div key={token} className={d.typeRow}>
              <span style={{ fontSize: `var(${token})`, letterSpacing: "var(--track-title)", lineHeight: 1.1 }}>
                Abnormal resistance
              </span>
              <span className="dim">
                <span className="mono">{token}</span> · {size} · {use}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section n="04" title="Components" note="The pieces the workbench is built from.">
        <div className={d.row}>
          <Panel title="Tags">
            <div className={w.wsTags}>
              <ModelTag status="ready" />
              <ModelTag status="pending" />
              <RunTag status="ready" />
              <RunTag status="pending" />
              <RunTag status="invalid" />
              <RunTag status="none" />
            </div>
          </Panel>
          <Panel title="Fields and codes">
            <div className={w.fieldRow}>
              <Field label="Output file" mono>
                door_predictions.csv
              </Field>
              <Field label="Validation">IoU-weighted F1 1.000</Field>
              <Field label="Columns">
                <span className={w.chips}>
                  <CodeChip>start_time</CodeChip>
                  <CodeChip>end_time</CodeChip>
                  <CodeChip strong>prediction</CodeChip>
                </span>
              </Field>
            </div>
          </Panel>
        </div>
        <Panel title="File checks">
          <CheckList checks={CHECKS} />
        </Panel>
        <Tiles
          items={[
            { label: "Door movements found", value: "38", note: "18 openings · 20 closings" },
            {
              label: "Abnormal resistance",
              value: (
                <span className={w.verdict}>
                  <StateMark state="P1" size={12} />8
                </span>
              ),
              note: "21% of movements",
            },
            { label: "Normal", value: "30" },
          ]}
        />
      </Section>

      <Section n="05" title="Space and shape" note="A 4 px base, 1 px borders, no radius, no shadows. Nothing moves except an unacknowledged alarm.">
        <div className={d.row}>
          {["--s2", "--s3", "--s4", "--s5", "--s6", "--s7"].map((token) => (
            <div key={token} className={d.swatch}>
              <span style={{ display: "block", height: 12, width: `var(${token})`, background: "var(--text-2)" }} />
              <span className="mono">{token}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
