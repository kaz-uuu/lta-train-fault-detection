import { Navigate, Route, Routes } from "react-router-dom";
import { WorkbenchShell } from "./shells/WorkbenchShell";
import { DesignView } from "./views/DesignView";
import { HomeView } from "./workbench/HomeView";
import { PredictionsView } from "./workbench/PredictionsView";
import { WorkspaceView } from "./workbench/WorkspaceView";

export function App() {
  return (
    <Routes>
      <Route element={<WorkbenchShell />}>
        <Route index element={<HomeView />} />
        <Route path="predictions" element={<PredictionsView />} />
        <Route path="design" element={<DesignView />} />
        <Route path=":subsystem" element={<WorkspaceView />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
