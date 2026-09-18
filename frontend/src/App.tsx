import { Navigate, Route, Routes } from "react-router-dom";
import { WorkbenchShell } from "./shells/WorkbenchShell";
import { DesignView } from "./views/DesignView";
import { HomeView } from "./workbench/HomeView";
import { SubmissionView } from "./workbench/SubmissionView";
import { WorkspaceView } from "./workbench/WorkspaceView";

export function App() {
  return (
    <Routes>
      <Route element={<WorkbenchShell />}>
        <Route index element={<HomeView />} />
        <Route path="submission" element={<SubmissionView />} />
        <Route path="design" element={<DesignView />} />
        <Route path=":subsystem" element={<WorkspaceView />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
