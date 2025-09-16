import * as cheerio from "cheerio";
import browser from "webextension-polyfill";

class AnalyzerEngine {
  constructor() {
    this.resultCallback = null;

    // ---- Stato RUNTIME ----
    this._runtimeActive = false;
    this._runtimeStartedAt = 0;
    this._runtimeDataset = {};
    this._runtimeTotalScans = 0;
    this._runtimeCallbacks = { onUpdate: null, onComplete: null };
    this._onTabsUpdatedRef = null;

    this.initListener();
  }

  initListener() {
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // ONE-TIME
      if (message.type === "analyzer_scanResult" && message.data?.html) {
        const results = this.processHtml(message.data.html);

        const timestamp = Date.now();
        const meta = {
          timestamp,
          tabId: sender?.tab?.id ?? null,
          url: sender?.tab?.url ?? null,
        };

        const key = `analyzerResults_${timestamp}`;
        browser.storage.local.set({ [key]: { meta, results } }).catch(() => {});

        this._setSessionValue("analyzer_lastResult", { meta, results });
        if (meta.tabId != null) {
          this._updateSessionMap("analyzer_lastByTab", (map) => {
            map[meta.tabId] = { meta, results };
            return map;
          });
        }

        if (this.resultCallback) {
          const cb = this.resultCallback;
          this.resultCallback = null;
          try { cb(results); } catch {}
        }

        sendResponse?.({ status: "ok", received: true });
        return true;
      }

      // RUNTIME
      if (message.type === "analyzer_runtimeScanResult" && message.data?.html) {
        if (!this._runtimeActive) return;

        try {
          const html = message.data.html;
          const tabId = sender?.tab?.id ?? null;
          const url = message.data.url || sender?.tab?.url || null;
          const title = message.data.title || sender?.tab?.title || null;
          const timestamp = message.data.timestamp || Date.now();

          const results = this.processHtml(html);
          const meta = { tabId, url, title: results?.head?.title || title || null, timestamp };

          const key = meta.url || "(url_sconosciuto)";
          if (!this._runtimeDataset[key]) this._runtimeDataset[key] = [];
          this._runtimeDataset[key].push({ meta, results });
          this._runtimeTotalScans += 1;

          this._runtimeCallbacks.onUpdate?.(key, {
            totalScans: this._runtimeTotalScans,
            pagesCount: Object.keys(this._runtimeDataset).length,
            startedAt: this._runtimeStartedAt
          });
        } catch {}
      }
    });
  }

  // ---------- Helpers storage.session ----------
  async _setSessionValue(key, value) {
    try {
      if (browser.storage?.session?.set) {
        await browser.storage.session.set({ [key]: value });
      }
    } catch {}
  }
  async _updateSessionMap(key, mutator) {
    try {
      if (browser.storage?.session?.get && browser.storage?.session?.set) {
        const obj = await browser.storage.session.get(key);
        const map = obj?.[key] ?? {};
        const next = mutator({ ...map });
        await browser.storage.session.set({ [key]: next });
      }
    } catch {}
  }

  // ---------- ONE-TIME ----------
  _isInjectableUrl(url = "") {
    // consenti solo http/https; blocca edge://, chrome://, about:, chrome-extension://, ecc.
    return /^https?:\/\//i.test(url);
  }

  async runOneTimeScan(tabId, callback) {
    // ritorna una Promise che si risolve con i risultati o si rifiuta con un errore
    const tab = await browser.tabs.get(tabId).catch(() => null);
    const url = tab?.url || "";

    if (!this._isInjectableUrl(url)) {
      throw new Error("Questa pagina non consente l'iniezione del content script (protocollo non supportato).");
    }

    return new Promise(async (resolve, reject) => {
      let settled = false;
      const finish = (err, data) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.resultCallback = null;
        if (err) reject(err); else resolve(data);
      };

      // Wrappa il callback utente per risolvere la Promise quando arrivano i risultati
      const userCb = callback;
      this.resultCallback = (data) => {
        try { userCb?.(data); } catch {}
        finish(null, data);
      };

      // Prova l'injection
      try {
        if (browser.scripting) {
          await browser.scripting.executeScript({
            target: { tabId },
            files: ["content_script/analyzer/analyzer_injected.js"]
          });
        } else {
          await browser.tabs.executeScript(tabId, { file: "content_script/analyzer/analyzer_injected.js" });
        }
      } catch (e) {
        return finish(new Error("Iniezione non riuscita su questa pagina."));
      }

      // Timeout se lo script non risponde (es. CSP/errore runtime)
      const timer = setTimeout(() => {
        finish(new Error("Timeout: la pagina non ha risposto alla scansione."));
      }, 8000);
    });
  }

  async getLocalScanResults() {
    const all = await browser.storage.local.get(null);
    return Object.entries(all)
      .filter(([key]) => key.startsWith("analyzerResults_"))
      .map(([key, value]) => ({ key, results: value }));
  }

  // ---------- RUNTIME (public API) ----------
  async startRuntimeScan({ onUpdate, onComplete } = {}) {
    if (this._runtimeActive) return;

    this._runtimeActive = true;
    this._runtimeStartedAt = Date.now();
    this._runtimeDataset = {};
    this._runtimeTotalScans = 0;
    this._runtimeCallbacks = { onUpdate: onUpdate || null, onComplete: onComplete || null };

    this._onTabsUpdatedRef = async (tabId, changeInfo, tab) => {
      if (!this._runtimeActive) return;
      if (changeInfo.status === "complete" && tab?.url && /^https?:/i.test(tab.url)) {
        await this._injectRuntimeScript(tabId);
      }
    };
    try { browser.tabs.onUpdated.addListener(this._onTabsUpdatedRef); } catch {}

    try {
      const tabs = await browser.tabs.query({});
      for (const t of tabs) {
        if (t?.id && t?.url && /^https?:/i.test(t.url)) {
          await this._injectRuntimeScript(t.id);
        }
      }
    } catch {}

    this._runtimeCallbacks.onUpdate?.(null, {
      totalScans: 0,
      pagesCount: 0,
      startedAt: this._runtimeStartedAt
    });
  }

  async stopRuntimeScan() {
    if (!this._runtimeActive) return { ok: false, error: "Runtime non attivo" };

    const stoppedAt = Date.now();
    const run = {
      startedAt: this._runtimeStartedAt,
      stoppedAt,
      totalScans: this._runtimeTotalScans,
      pagesCount: Object.keys(this._runtimeDataset).length,
      dataset: this._runtimeDataset
    };

    const key = `analyzerRuntime_${stoppedAt}`;
    await browser.storage.local.set({ [key]: run, analyzerRuntime_lastKey: key }).catch(() => {});

    this._runtimeActive = false;
    try { this._onTabsUpdatedRef && browser.tabs.onUpdated.removeListener(this._onTabsUpdatedRef); } catch {}
    this._onTabsUpdatedRef = null;

    this._runtimeCallbacks.onComplete?.({ ok: true, key, run });

    return { ok: true, key, run };
  }

  getRuntimeStatus() {
    return {
      runtimeActive: this._runtimeActive,
      startedAt: this._runtimeStartedAt,
      totalScans: this._runtimeTotalScans,
      pagesCount: Object.keys(this._runtimeDataset).length
    };
  }

  async getLastRuntimeResults() {
    const all = await browser.storage.local.get(null);
    let key = all.analyzerRuntime_lastKey || null;
    if (!key) {
      const keys = Object.keys(all).filter(k => k.startsWith("analyzerRuntime_"));
      if (keys.length) {
        keys.sort((a, b) => Number(b.split("_")[1]) - Number(a.split("_")[1]));
        key = keys[0];
      }
    }
    return key ? { key, run: all[key] } : { key: null, run: null };
  }

  async getAllRuntimeResults() {
    const all = await browser.storage.local.get(null);
    const items = Object.entries(all)
      .filter(([key]) => {
        if (!key.startsWith("analyzerRuntime_")) return false;
        const suffix = key.split("_")[1];
        return /^\d+$/.test(suffix);
      })
      .map(([key, run]) => ({ key, run }));

    items.sort((a, b) => Number(b.key.split("_")[1]) - Number(a.key.split("_")[1]));
    return items;
  }

  async _injectRuntimeScript(tabId) {
    try {
      if (browser.scripting) {
        await browser.scripting.executeScript({
          target: { tabId },
          files: ["content_script/analyzer/analyzer_runtime_injected.js"]
        });
      } else {
        await browser.tabs.executeScript(tabId, { file: "content_script/analyzer/analyzer_runtime_injected.js" });
      }
    } catch {}
  }

  // ---------- Parser HTML ----------
  processHtml(html) {
    const $ = cheerio.load(html);

    function getDepth(node, depth = 0) {
      const children = $(node).children();
      if (children.length === 0) return depth;
      return Math.max(...children.map((_, child) => getDepth(child, depth + 1)).get());
    }

    return {
      head: {
        title: $("title").text(),
        meta: $("meta").map((i, el) => ({
          name: $(el).attr("name") || $(el).attr("property"),
          content: $(el).attr("content")
        })).get(),
        links: $("head link").map((i, el) => ({
          rel: $(el).attr("rel"),
          href: $(el).attr("href")
        })).get(),
        scripts: $("head script").map((i, el) => ({
          src: $(el).attr("src") || null,
          inline: $(el).html()?.trim().slice(0, 50) || null
        })).get()
      },

      body: {
        headings: {
          h1: $("h1").map((i, el) => $(el).text().trim()).get(),
          h2: $("h2").map((i, el) => $(el).text().trim()).get(),
          h3: $("h3").map((i, el) => $(el).text().trim()).get(),
          h4: $("h4").map((i, el) => $(el).text().trim()).get(),
          h5: $("h5").map((i, el) => $(el).text().trim()).get(),
          h6: $("h6").map((i, el) => $(el).text().trim()).get(),
        },
        links: $("a").map((i, el) => ({
          href: $(el).attr("href"),
          text: $(el).text().trim()
        })).get(),
        forms: $("form").map((i, form) => ({
          action: $(form).attr("action") || null,
          method: $(form).attr("method") || "GET",
          inputs: $(form).find("input, select, textarea, button").map((j, el) => ({
            tag: el.tagName,
            name: $(el).attr("name") || null,
            type: $(el).attr("type") || el.tagName.toLowerCase(),
            value: $(el).attr("value") || null,
            placeholder: $(el).attr("placeholder") || null
          })).get()
        })).get(),
        images: $("img").map((i, el) => ({
          src: $(el).attr("src"),
          alt: $(el).attr("alt") || ""
        })).get(),
        videos: $("video").map((i, el) => ({
          src: $(el).attr("src") || null,
          controls: $(el).attr("controls") !== undefined
        })).get(),
        audios: $("audio").map((i, el) => ({
          src: $(el).attr("src") || null,
          controls: $(el).attr("controls") !== undefined
        })).get(),
        iframes: $("iframe").map((i, el) => ({
          src: $(el).attr("src") || null,
          title: $(el).attr("title") || null
        })).get(),
        lists: $("ul, ol").map((i, el) => ({
          type: el.tagName,
          items: $(el).find("li").map((j, li) => $(li).text().trim()).get()
        })).get(),
        tables: $("table").map((i, el) => ({
          rows: $(el).find("tr").map((j, row) => (
            $(row).find("th, td").map((k, cell) => $(cell).text().trim()).get()
          )).get()
        })).get()
      },

      stats: {
        totalElements: $("*").length,
        depth: getDepth("html", 0),
        tagCount: $("*").map((i, el) => el.tagName).get().reduce((acc, tag) => {
          acc[tag] = (acc[tag] || 0) + 1;
          return acc;
        }, {})
      }
    };
  }
}

export default AnalyzerEngine;
