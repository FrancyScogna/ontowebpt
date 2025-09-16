(function () {
  const api = typeof browser !== "undefined" ? browser : chrome;

  (async () => {
    try {
      const html = document.documentElement.outerHTML;

      const response = await api.runtime.sendMessage({
        type: "analyzer_scanResult",
        data: { html }
      });

      console.log("[Injected] ACK dal background:", response);
    } catch (err) {
      console.error("[Injected] Errore nell'invio HTML:", err);
    }
  })();
})();
