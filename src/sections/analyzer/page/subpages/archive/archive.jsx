import "./archive.css";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

function ArchiveAnalyzer() {
  const navigate = useNavigate();
  const location = useLocation();

  const isOnetime = location.pathname.includes("/archive/onetime") || location.pathname.endsWith("/archive");
  const isRuntime = location.pathname.includes("/archive/runtime");

  return (
    <div className="archiveAnalyzer-div">
      <div className="archive-header">
        <h1>Archive</h1>
        <div className="scan-actions">
          <button onClick={() => navigate("onetime")} disabled={isOnetime}>One-Time</button>
          <button onClick={() => navigate("runtime")} disabled={isRuntime}>Runtime</button>
        </div>
      </div>

      {/* Sottopagine */}
      <Outlet />
    </div>
  );
}

export default ArchiveAnalyzer;
