import "./archive.css";
import analyzerReactController from "../../../analyzerController";
import { useEffect } from "react";

function ArchiveAnalyzer(){

  useEffect(() => {
    const off = analyzerReactController.onMessage({
      onScanError: (msg) => {
        console.log("error");
      },
    });
    return () => off();
  }, []);

  console.log("archive", analyzerReactController.subscribers)

  return(
      <div className="archiveAnalyzer-div">
          <h1>Archive</h1>
      </div>
  )
}

export default ArchiveAnalyzer;