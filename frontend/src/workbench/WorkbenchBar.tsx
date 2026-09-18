import { Link, NavLink } from "react-router-dom";
import { Glyph } from "../components/Glyph";
import { useTheme } from "../lib/theme";
import { SHORT_NAMES, SUBSYSTEM_IDS } from "./api";
import { useSubsystems } from "./hooks";
import s from "./WorkbenchBar.module.css";

export function WorkbenchBar() {
  const { theme, toggle } = useTheme();
  const { data: subsystems } = useSubsystems();
  const ready = new Set(subsystems?.filter((x) => x.latestRun?.status === "ready").map((x) => x.id));
  const tab = ({ isActive }: { isActive: boolean }) => `${s.tab} ${isActive ? s.tabOn : ""}`;

  return (
    <header className={s.bar}>
      <Link to="/" className={s.brand}>
        <Glyph />
        <span className={s.name}>Condition monitoring</span>
      </Link>

      <nav className={s.tabs} aria-label="Workbench">
        <NavLink to="/" end className={tab}>
          Overview
        </NavLink>
        <span className={s.rule} aria-hidden />
        {SUBSYSTEM_IDS.map((id) => (
          <NavLink key={id} to={`/${id}`} className={tab}>
            {SHORT_NAMES[id]}
            {ready.has(id) && <span className={s.readyDot} title="Predictions ready" aria-label="predictions ready" />}
          </NavLink>
        ))}
        <span className={s.rule} aria-hidden />
        <NavLink to="/submission" className={tab}>
          Submission
        </NavLink>
      </nav>

      <div className={s.right}>
        <Link to="/design" className={s.link}>
          Design
        </Link>
        <button
          className="btn btn--icon"
          onClick={toggle}
          aria-label={theme === "dark" ? "Switch to projector theme" : "Switch to console theme"}
          title={theme === "dark" ? "Projector theme" : "Console theme"}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <rect x="0.5" y="0.5" width="11" height="11" fill="none" stroke="currentColor" />
            <rect x="0.5" y="0.5" width="5.5" height="11" fill="currentColor" />
          </svg>
        </button>
      </div>
    </header>
  );
}
