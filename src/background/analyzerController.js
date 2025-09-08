import browser from "webextension-polyfill";
import AnalyzerEngine from "./analyzer/analyzerEngine.js";

class AnalyzerBackgroundController {
  constructor() {
    this.runtimeScanActive = false;
    this.engine = new AnalyzerEngine();
    this.initListener();
  }

  initListener() {
    console.log("Init controller background");
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case "analyzer_startOneTimeScan":
          console.log("[Background] Received: startOneTimeScan");
          this.engine.runOneTimeScan(message.tabId, (data) => {
            console.log("[Background] One-time scan completed, sending result to React");
            this.sendMessageToReact({
              type: "analyzer_scanComplete",
              data
            });
          });
          break;

        case "analyzer_startRuntimeScan":
          console.log("[Background] Received: startRuntimeScan");
          this.runtimeScanActive = true;
          this.sendMessageToReact({ type: "analyzer_runtimeScanUpdate", url: "https://esempio.com", data: "Runtime scan iniziata (mock)" });
          break;

        case "analyzer_stopRuntimeScan":
          console.log("[Background] Received: stopRuntimeScan");
          this.runtimeScanActive = false;
          this.sendMessageToReact({ type: "analyzer_runtimeScanComplete", allResults: ["Pagina 1", "Pagina 2"] });
          break;

        case "analyzer_getScanStatus":
          console.log("[Background] Received: getScanStatus");
          sendResponse({ active: this.runtimeScanActive });
          return true;

        case "analyzer_getLocalScanResults":
          console.log("[Background] Received: getLocalScanResults");
          this.engine.getLocalScanResults().then(localResults => {
            sendResponse({ localResults });
          });
          return true;

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
