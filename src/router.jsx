import { Route, Routes, Navigate } from "react-router-dom";
import App from "./app";
import Analyzer from "./sections/analyzer/page/analyzer";
import ArchiveAnalyzer from "./sections/analyzer/page/subpages/archive/archive";
import OneTimeScanAnalyzer from "./sections/analyzer/page/subpages/oneTimeScan/scan";
import RuntimeScanAnalyzer from "./sections/analyzer/page/subpages/runtimeScan/scan";

function Router() {
  return (
    <Routes>
      <Route path="/" element={<App />}>
        {/* appena apri "/" vai a /analyzer */}
        <Route index element={<Navigate to="analyzer" replace />} /> 

        <Route path="analyzer" element={<Analyzer />}>
          <Route index element={<OneTimeScanAnalyzer />} /> 
          <Route path="runtime" element={<RuntimeScanAnalyzer />} />
          <Route path="archive" element={<ArchiveAnalyzer />} /> 
        </Route>
      </Route>
    </Routes>
  );
}

export default Router;
