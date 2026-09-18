import { Outlet } from "react-router-dom";
import { WorkbenchBar } from "../workbench/WorkbenchBar";
import s from "./WorkbenchShell.module.css";

/** The PS3 app: choose a subsystem, upload, review, download. */
export function WorkbenchShell() {
  return (
    <div className={s.shell}>
      <WorkbenchBar />
      <main className={s.main}>
        <Outlet />
      </main>
    </div>
  );
}
