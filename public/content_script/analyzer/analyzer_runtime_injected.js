(function () {
  const api = typeof browser !== "undefined" ? browser : chrome;

  try {
    const payload = {
      html: document.documentElement.outerHTML,
      url: location.href,
      title: document.title,
      timestamp: Date.now()
    };
    api.runtime.sendMessage({ type: "analyzer_runtimeScanResult", data: payload }).catch(() => {});
  } catch (err) {
    // ignora: alcune pagine sono protette all'iniezione
  }
})();
