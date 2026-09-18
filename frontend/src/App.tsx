import { Navigate, Route, Routes } from "react-router-dom";
import { WorkbenchShell } from "./shells/WorkbenchShell";
import { HomeView } from "./workbench/HomeView";
import { SubmissionView } from "./workbench/SubmissionView";
import { WorkspaceView } from "./workbench/WorkspaceView";

export function App() {
  return (
    <Routes>
      <Route element={<WorkbenchShell />}>
        <Route index element={<HomeView />} />
        <Route path="submission" element={<SubmissionView />} />
        <Route path=":subsystem" element={<WorkspaceView />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
