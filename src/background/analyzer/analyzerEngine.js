import * as cheerio from "cheerio";
import browser from "webextension-polyfill";

class AnalyzerEngine {
  constructor() {
    this.resultCallback = null;
    this.initListener();
  }

  initListener() {
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "analyzer_scanResult" && message.data?.html) {
        console.log("[Engine] Received raw HTML from injected script");

        const results = this.processHtml(message.data.html);

        // ---- metadati utili per archive e sessione
        const timestamp = Date.now();
        const meta = {
          timestamp,
          tabId: sender?.tab?.id ?? null,
          url: sender?.tab?.url ?? null,
        };

        // ---- salvataggio PERSISTENTE (Archive)
        // schema: analyzerResults_<timestamp> = { meta, results }
        const key = `analyzerResults_${timestamp}`;
        browser.storage.local.set({ [key]: { meta, results } })
          .then(() => console.log(`[Engine] Results saved to storage.local with key ${key}`))
          .catch((err) => console.error("[Engine] Failed to save to storage.local:", err));

        // ---- salvataggio di SESSIONE (volatile, solo per la sessione corrente del browser)
        // 1) ultimo globale della sessione
        this._setSessionValue("analyzer_lastResult", { meta, results });

        // 2) ultimo per-tab (mappa tabId -> snapshot)
        if (meta.tabId != null) {
          this._updateSessionMap("analyzer_lastByTab", (map) => {
            map[meta.tabId] = { meta, results };
            return map;
          });
        }

        // callback one-shot verso il background controller
        if (this.resultCallback) {
          this.resultCallback(results);
          this.resultCallback = null;
        }

        sendResponse({ status: "ok", received: true });
        return true;
      }
    });
  }

  // helper: set semplice su storage.session con fallback silenzioso se non disponibile
  async _setSessionValue(key, value) {
    try {
      console.log("set", browser.storage.session.set);
      if (browser.storage?.session?.set) {
        await browser.storage.session.set({ [key]: value });
      } else {
        // opzionale: potresti tenerne copia in memoria se vuoi supportare browser senza storage.session
        // this._sessionFallback = this._sessionFallback || {};
        // this._sessionFallback[key] = value;
      }
    } catch (e) {
      console.warn(`[Engine] storage.session.set failed for ${key}:`, e);
    }
  }

  // helper: get+mutate su oggetto mappa in storage.session
  async _updateSessionMap(key, mutator) {
    try {
      if (browser.storage?.session?.get && browser.storage?.session?.set) {
        const obj = await browser.storage.session.get(key);
        const map = obj?.[key] ?? {};
        const next = mutator({ ...map });
        await browser.storage.session.set({ [key]: next });
      } else {
        // opzionale: fallback in memoria
        // this._sessionFallback = this._sessionFallback || {};
        // const map = this._sessionFallback[key] || {};
        // this._sessionFallback[key] = mutator({ ...map });
      }
    } catch (e) {
      console.warn(`[Engine] storage.session update failed for ${key}:`, e);
    }
  }

  async runOneTimeScan(tabId, callback) {
    console.log("[Engine] Starting one-time scan on tab", tabId);
    this.resultCallback = callback;

    try {
      if (browser.scripting) {
        // Chrome
        await browser.scripting.executeScript({
          target: { tabId },
          files: ["content_script/analyzer/analyzer_injected.js"]
        });
      } else {
        // Firefox (MV2/compat)
        await browser.tabs.executeScript(tabId, {
          file: "content_script/analyzer/analyzer_injected.js"
        });
      }
    } catch (err) {
      console.error("[Engine] Failed to inject script:", err);
      this.resultCallback = null;
    }
  }

  async getLocalScanResults() {
    const all = await browser.storage.local.get(null); // null => tutte le chiavi
    const scans = Object.entries(all)
      .filter(([key]) => key.startsWith("analyzerResults_"))
      // ora value è { meta, results }
      .map(([key, value]) => ({ key, results: value }));
    return scans;
  }

  processHtml(html) {
    const $ = cheerio.load(html);

    function getDepth(node, depth = 0) {
      const children = $(node).children();
      if (children.length === 0) return depth;
      return Math.max(
        ...children.map((_, child) => getDepth(child, depth + 1)).get()
      );
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
