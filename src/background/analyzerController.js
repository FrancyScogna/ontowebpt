import browser from "webextension-polyfill";
import AnalyzerEngine from "./analyzer/analyzerEngine.js";

class AnalyzerBackgroundController {
  constructor() {
    this.engine = new AnalyzerEngine();
    this.initListener();
  }

  initListener() {
    console.log("Init controller background");
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        /* ---------- ONE-TIME ---------- */
        case "analyzer_startOneTimeScan": {
          this.engine
            .runOneTimeScan(message.tabId, (data) => {
              this.sendMessageToReact({ type: "analyzer_scanComplete", data });
            })
            .catch((error) => {
              this.sendMessageToReact({
                type: "analyzer_scanError",
                message:
                  error?.message ||
                  "Impossibile eseguire la scansione su questa pagina.",
              });
            });
          break;
        }

        /* ---------- RUNTIME START ---------- */
        case "analyzer_startRuntimeScan": {
          this.engine.startRuntimeScan({
            onUpdate: (url, totals) => {
              this.sendMessageToReact({ type: "analyzer_runtimeScanUpdate", url, totals });
            },
            onComplete: (payload) => {
              this.sendMessageToReact({ type: "analyzer_runtimeScanComplete", ...payload });
            }
          });
          break;
        }

        /* ---------- RUNTIME STOP ---------- */
        case "analyzer_stopRuntimeScan": {
          this.engine.stopRuntimeScan().then((payload) => {
            this.sendMessageToReact({ type: "analyzer_runtimeScanComplete", ...payload });
          });
          break;
        }

        /* ---------- STATUS ---------- */
        case "analyzer_getScanStatus": {
          const s = this.engine.getRuntimeStatus();
          sendResponse({ active: s.runtimeActive, ...s });
          return true;
        }

        /* ---------- ARCHIVIO ONE-TIME ---------- */
        case "analyzer_getLocalScanResults": {
          this.engine.getLocalScanResults().then(localResults => sendResponse({ localResults }));
          return true;
        }

        /* ---------- ULTIMO RUNTIME SALVATO ---------- */
        case "analyzer_getLastRuntimeResults": {
          this.engine.getLastRuntimeResults().then(res => sendResponse(res));
          return true;
        }

        /* ✅ TUTTI I RUNTIME SALVATI */
        case "analyzer_getAllRuntimeResults": {
          this.engine.getAllRuntimeResults().then(runs => sendResponse({ runs }));
          return true;
        }

        default:
          console.warn("[Background] Unknown type:", message.type);
      }
    });
  }

  sendMessageToReact(msg) {
    browser.runtime.sendMessage(msg).catch(err => {
      console.error("[Background] Failed to send message to React:", err);
    });
  }
}

export default AnalyzerBackgroundController;
