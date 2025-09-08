import { Route, Routes, Navigate } from "react-router-dom";
import App from "./app";
import Analyzer from "./sections/analyzer/page/analyzer";
import ScanAnalyzer from "./sections/analyzer/page/subpages/scan/scan";
import ArchiveAnalyzer from "./sections/analyzer/page/subpages/archive/archive";

function Router() {
  return (
    <Routes>
      <Route path="/" element={<App />}>
        {/* appena apri "/" vai a /analyzer */}
        <Route index element={<Navigate to="analyzer" replace />} /> 

        <Route path="analyzer" element={<Analyzer />}>
          <Route index element={<ScanAnalyzer />} /> 
          <Route path="archive" element={<ArchiveAnalyzer />} /> 
        </Route>
      </Route>
    </Routes>
  );
}

export default Router;
