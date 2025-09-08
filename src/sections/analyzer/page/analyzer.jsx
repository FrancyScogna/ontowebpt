import { Outlet, useNavigate } from "react-router-dom";
import "./analyzer.css";

function Analyzer() {

  const navigate = useNavigate();

  return (
      <div className="analyzer-div">
        <h1>Analyzer Section</h1>
        <div className="navigation-div">
          <button onClick={() => navigate("/analyzer")}>Scan</button>
          <button onClick={() => navigate("/analyzer/archive")}>Archive</button>
        </div>
        <Outlet />
      </div>
  );
}

export default Analyzer;
