import browser from "webextension-polyfill";

class AnalyzerReactController {
  constructor() {
    this.subscribers = new Set(); // ogni subscriber è un oggetto { onScanComplete, onRuntimeScanUpdate, ... }
    this._initMessageListenerOnce();
  }

  _initMessageListenerOnce() {
    if (this._listenerInitialized) return;
    this._listenerInitialized = true;

    browser.runtime.onMessage.addListener((message) => {
      for (const sub of this.subscribers) {
        switch (message.type) {
          case "analyzer_scanComplete":
            sub.onScanComplete?.(message.data);
            break;
          case "analyzer_runtimeScanUpdate":
            sub.onRuntimeScanUpdate?.(message.url, message.data);
            break;
          case "analyzer_runtimeScanComplete":
            sub.onRuntimeScanComplete?.(message.allResults);
            break;
          case "analyzer_scanError":
            sub.onScanError?.(message.message);
            break;
          default:
            // ignora
            break;
        }
      }
    });
  }

  /*
   * Registra i callback e restituisce una funzione di unsubscribe.
   * Esempio:
   *   const off = controller.onMessage({ onScanComplete: data => {...} })
   *   // ...poi
   *   off();
  */
  onMessage(callbacks) {
    this.subscribers.add(callbacks);
    return () => this.subscribers.delete(callbacks);
  }

  sendStartOneTimeScan(tabId) {
    browser.runtime.sendMessage({ type: "analyzer_startOneTimeScan", tabId });
  }

  sendStartRuntimeScan() {
    browser.runtime.sendMessage({ type: "analyzer_startRuntimeScan" });
  }

  sendStopRuntimeScan() {
    browser.runtime.sendMessage({ type: "analyzer_stopRuntimeScan" });
  }

  async getScanStatus() {
    return browser.runtime.sendMessage({ type: "analyzer_getScanStatus" });
  }

  // --- Persistente (Archive)
  async getLocalScanResults() {
    const response = await browser.runtime.sendMessage({
      type: "analyzer_getLocalScanResults"
    });
    return response.localResults;
  }

  // --- Sessione corrente (volatile)
  async getSessionLastResult() {
    const { analyzer_lastResult } = await browser.storage.session.get("analyzer_lastResult");
    return analyzer_lastResult ?? null;
  }

  async getSessionLastResultForTab(tabId) {
    const { analyzer_lastByTab } = await browser.storage.session.get("analyzer_lastByTab");
    console.log("tab", analyzer_lastByTab)
    if (!analyzer_lastByTab || tabId == null) return null;
    return analyzer_lastByTab[tabId] ?? null;
  }

  async getCurrentTabId() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab?.id ?? null;
  }

  async getSessionByTabMap() {
    const { analyzer_lastByTab } = await browser.storage.session.get("analyzer_lastByTab");
    return analyzer_lastByTab ?? {};
  }
}

// ✅ esportiamo un'unica istanza (singleton)
const analyzerReactController = new AnalyzerReactController();
export default analyzerReactController;
