import "./oneTimeScan.css";
import analyzerReactController from "../../../analyzerController";
import browser from "webextension-polyfill";
import { useEffect, useMemo, useState } from "react";

/* ---------- Helpers UI semplici ---------- */

function Accordion({ title, children, defaultOpen = false }) {
  return (
    <details className="acc" open={defaultOpen}>
      <summary className="acc-summary">{title}</summary>
      <div className="acc-panel">{children}</div>
    </details>
  );
}

function KeyVal({ k, v }) {
  return (
    <div className="kv">
      <div className="kv-k">{k}</div>
      <div className="kv-v">{v ?? "—"}</div>
    </div>
  );
}

function Pill({ children }) {
  return <span className="pill">{children}</span>;
}

function SectionGrid({ children }) {
  return <div className="grid">{children}</div>;
}

function MonoBlock({ children, maxHeight = 280 }) {
  return (
    <pre className="mono" style={{ maxHeight }}>
      {children}
    </pre>
  );
}

function EmptyNote({ text = "Nessun dato trovato" }) {
  return <div className="empty-note">{text}</div>;
}

/* Tag counter compatto */
function TagCount({ tagCount }) {
  if (!tagCount || typeof tagCount !== "object") return <EmptyNote />;
  const entries = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 25);
  return (
    <div className="tagcount">
      {entries.map(([tag, n]) => (
        <span key={tag} className="tagcount-item">
          <code>{tag}</code> <span className="tagcount-dot">•</span> {n}
        </span>
      ))}
    </div>
  );
}

/* Tabelline semplici per liste */
function SimpleTable({ cols = [], rows = [] }) {
  if (!rows?.length) return <EmptyNote />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c}>{r[c] ?? "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Component principale ---------- */

function OneTimeScanAnalyzer() {
  const [oneTimeLoading, setOneTimeLoading] = useState(false);
  const [oneTimeActive, setOneTimeActive] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [loadedHint, setLoadedHint] = useState(null);

  // listener degli eventi dal background
  useEffect(() => {
    const off = analyzerReactController.onMessage({
      onScanComplete: (data) => {
        setResults(data);
        setOneTimeLoading(false);
        setOneTimeActive(false);
        setLoadedHint("Risultati aggiornati (one-time scan appena conclusa)");
      },
      onScanError: (msg) => {
        setError(msg || "Errore durante la scansione.");
        setOneTimeLoading(false);
        setOneTimeActive(false);
      },
    });
    return () => off();
  }, []);

  // all'avvio: session-by-tab -> session-global -> local fallback
  useEffect(() => {
    (async () => {
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        const tabId = tab?.id ?? null;

        if (tabId != null) {
          const perTab = await analyzerReactController.getSessionLastResultForTab(tabId);
          if (perTab?.results) {
            setResults(perTab.results);
            setLoadedHint(`Ultimo risultato della sessione per questa tab (${perTab.meta?.url ?? "URL sconosciuto"})`);
            return;
          }
        }

        const globalSess = await analyzerReactController.getSessionLastResult();
        if (globalSess?.results) {
          setResults(globalSess.results);
          setLoadedHint(`Ultimo risultato globale della sessione (${globalSess.meta?.url ?? "URL sconosciuto"})`);
          return;
        }

        const local = await analyzerReactController.getLocalScanResults();
        if (Array.isArray(local) && local.length) {
          const latest = [...local].sort((a, b) => {
            const ta = a?.results?.meta?.timestamp ?? (Number((a.key || "").replace("analyzerResults_", "")) || 0);
            const tb = b?.results?.meta?.timestamp ?? (Number((b.key || "").replace("analyzerResults_", "")) || 0);
            return tb - ta;
          })[0];

          if (latest?.results?.results) {
            setResults(latest.results.results);
            setLoadedHint(`Caricato dall'archivio persistente (potrebbe essere di una sessione precedente)`);
          } else if (latest?.results) {
            setResults(latest.results);
            setLoadedHint(`Caricato dall'archivio persistente (schema legacy)`);
          }
        }
      } catch {
        // UI vuota se nessun dato disponibile
      }
    })();
  }, []);

  const handleOneTimeScan = async () => {
    try {
      setError(null);
      setResults(null);
      setLoadedHint(null);
      setOneTimeLoading(true);
      setOneTimeActive(true);

      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        throw new Error("Nessun tab attivo trovato.");
      }
      analyzerReactController.sendStartOneTimeScan(tab.id);
    } catch (e) {
      setError(e.message || "Errore imprevisto.");
      setOneTimeLoading(false);
      setOneTimeActive(false);
    }
  };

  const handleRuntimeScan = () => {
    setError("La scansione runtime non è ancora implementata in questa vista. Prima completiamo la one-time.");
  };

  const head = results?.head ?? {};
  const body = results?.body ?? {};
  const stats = results?.stats ?? {};

  const headingsCount = useMemo(() => ({
    h1: body?.headings?.h1?.length || 0,
    h2: body?.headings?.h2?.length || 0,
    h3: body?.headings?.h3?.length || 0,
    h4: body?.headings?.h4?.length || 0,
    h5: body?.headings?.h5?.length || 0,
    h6: body?.headings?.h6?.length || 0,
  }), [body?.headings]);

  return (
    <div className="scanAnalyzer-div">
      <h1>One-Time Scan</h1>

      <div className="scan-actions">
        <button onClick={handleOneTimeScan} disabled={oneTimeLoading}>
          {oneTimeLoading ? "Scanning..." : "Start One-Time Scan"}
        </button>
      </div>

      {loadedHint && !oneTimeLoading && results && (
        <p className="loaded-hint">{loadedHint}</p>
      )}

      {oneTimeLoading && <p className="loading">Loading… la scansione è in corso.</p>}
      {error && <p className="error">Errore: {error}</p>}

      {/* ---------- Risultati organizzati in tendine ---------- */}
      {results && (
        <div className="results">

          {/* OVERVIEW COMPATTA */}
          <SectionGrid>
            <div className="card">
              <strong>Title</strong>
              <div>{head?.title || "—"}</div>
            </div>
            <div className="card">
              <strong>Total Elements</strong>
              <div>{stats?.totalElements ?? "—"}</div>
            </div>
            <div className="card">
              <strong>Depth</strong>
              <div>{stats?.depth ?? "—"}</div>
            </div>
            <div className="card">
              <strong>Headings</strong>
              <div>
                <Pill>h1 {headingsCount.h1}</Pill>{" "}
                <Pill>h2 {headingsCount.h2}</Pill>{" "}
                <Pill>h3 {headingsCount.h3}</Pill>{" "}
                <Pill>h4 {headingsCount.h4}</Pill>{" "}
                <Pill>h5 {headingsCount.h5}</Pill>{" "}
                <Pill>h6 {headingsCount.h6}</Pill>
              </div>
            </div>
            <div className="card">
              <strong>Links</strong>
              <div>{Array.isArray(body?.links) ? body.links.length : 0}</div>
            </div>
            <div className="card">
              <strong>Forms</strong>
              <div>{Array.isArray(body?.forms) ? body.forms.length : 0}</div>
            </div>
            <div className="card">
              <strong>Images</strong>
              <div>{Array.isArray(body?.images) ? body.images.length : 0}</div>
            </div>
          </SectionGrid>

          {/* HEAD */}
          <Accordion title="HEAD" defaultOpen>
            <SectionGrid>
              <div className="card">
                <strong>Title</strong>
                <div>{head?.title || "—"}</div>
              </div>
              <div className="card">
                <strong>Meta</strong>
                {Array.isArray(head?.meta) && head.meta.length ? (
                  <SimpleTable
                    cols={["name", "content"]}
                    rows={head.meta.map(m => ({
                      name: m.name || "—",
                      content: m.content || "—"
                    }))}
                  />
                ) : <EmptyNote />}
              </div>
              <div className="card">
                <strong>Links</strong>
                {Array.isArray(head?.links) && head.links.length ? (
                  <SimpleTable
                    cols={["rel", "href"]}
                    rows={head.links.map(l => ({
                      rel: l.rel || "—",
                      href: l.href || "—"
                    }))}
                  />
                ) : <EmptyNote />}
              </div>
              <div className="card">
                <strong>Scripts</strong>
                {Array.isArray(head?.scripts) && head.scripts.length ? (
                  <SimpleTable
                    cols={["src", "inline"]}
                    rows={head.scripts.map(s => ({
                      src: s.src || "—",
                      inline: s.inline || "—"
                    }))}
                  />
                ) : <EmptyNote />}
              </div>
            </SectionGrid>
          </Accordion>

          {/* BODY */}
          <Accordion title="BODY" defaultOpen>
            {/* Headings annidate */}
            <Accordion title="Headings" defaultOpen>
              <SectionGrid>
                {["h1","h2","h3","h4","h5","h6"].map(level => (
                  <div className="card" key={level}>
                    <strong>{level.toUpperCase()}</strong>
                    {Array.isArray(body?.headings?.[level]) && body.headings[level].length ? (
                      <ul className="list">
                        {body.headings[level].map((t, i) => <li key={i}>{t || "—"}</li>)}
                      </ul>
                    ) : <EmptyNote />}
                  </div>
                ))}
              </SectionGrid>
            </Accordion>

            <Accordion title="Links">
              {Array.isArray(body?.links) && body.links.length ? (
                <SimpleTable
                  cols={["text", "href"]}
                  rows={body.links.map(l => ({
                    text: l.text || "—",
                    href: l.href || "—"
                  }))}
                />
              ) : <EmptyNote />}
            </Accordion>

            <Accordion title="Forms">
              {Array.isArray(body?.forms) && body.forms.length ? (
                <div className="stack">
                  {body.forms.map((f, i) => (
                    <Accordion key={i} title={`Form #${i+1}  (${(f.method||"GET").toUpperCase()} ${f.action||"—"})`}>
                      <SectionGrid>
                        <KeyVal k="Method" v={(f.method || "GET").toUpperCase()} />
                        <KeyVal k="Action" v={f.action || "—"} />
                        <KeyVal k="Inputs" v={Array.isArray(f.inputs) ? f.inputs.length : 0} />
                      </SectionGrid>
                      {Array.isArray(f.inputs) && f.inputs.length ? (
                        <SimpleTable
                          cols={["tag","name","type","value","placeholder"]}
                          rows={f.inputs.map(el => ({
                            tag: el.tag || "—",
                            name: el.name || "—",
                            type: el.type || "—",
                            value: el.value || "—",
                            placeholder: el.placeholder || "—"
                          }))}
                        />
                      ) : <EmptyNote text="Nessun campo" />}
                    </Accordion>
                  ))}
                </div>
              ) : <EmptyNote />}
            </Accordion>

            <Accordion title="Media">
              <SectionGrid>
                <div className="card">
                  <strong>Images</strong>
                  {Array.isArray(body?.images) && body.images.length ? (
                    <SimpleTable
                      cols={["src","alt"]}
                      rows={body.images.map(img => ({ src: img.src || "—", alt: img.alt || "—" }))}
                    />
                  ) : <EmptyNote />}
                </div>
                <div className="card">
                  <strong>Videos</strong>
                  {Array.isArray(body?.videos) && body.videos.length ? (
                    <SimpleTable
                      cols={["src","controls"]}
                      rows={body.videos.map(v => ({ src: v.src || "—", controls: String(!!v.controls) }))}
                    />
                  ) : <EmptyNote />}
                </div>
                <div className="card">
                  <strong>Audios</strong>
                  {Array.isArray(body?.audios) && body.audios.length ? (
                    <SimpleTable
                      cols={["src","controls"]}
                      rows={body.audios.map(a => ({ src: a.src || "—", controls: String(!!a.controls) }))}
                    />
                  ) : <EmptyNote />}
                </div>
                <div className="card">
                  <strong>Iframes</strong>
                  {Array.isArray(body?.iframes) && body.iframes.length ? (
                    <SimpleTable
                      cols={["src","title"]}
                      rows={body.iframes.map(i => ({ src: i.src || "—", title: i.title || "—" }))}
                    />
                  ) : <EmptyNote />}
                </div>
              </SectionGrid>
            </Accordion>

            <Accordion title="Liste">
              {Array.isArray(body?.lists) && body.lists.length ? (
                <div className="stack">
                  {body.lists.map((l, idx) => (
                    <Accordion key={idx} title={`${(l.type || "").toUpperCase()} #${idx+1}`}>
                      {Array.isArray(l.items) && l.items.length ? (
                        <ul className="list">
                          {l.items.map((it, j) => <li key={j}>{it || "—"}</li>)}
                        </ul>
                      ) : <EmptyNote text="Lista vuota" />}
                    </Accordion>
                  ))}
                </div>
              ) : <EmptyNote />}
            </Accordion>

            {/* TABELLE */}
            <Accordion title="Tabelle">
              {Array.isArray(body?.tables) && body.tables.length ? (
                <div className="stack">
                  {body.tables.map((t, idx) => (
                    <Accordion key={idx} title={`Tabella #${idx + 1}`}>
                      {Array.isArray(t.rows) && t.rows.length ? (
                        <div className="table-wrap">
                          <table className="table">
                            <tbody>
                              {t.rows.map((row, ri) => {
                                // ✅ Normalizza: se "row" non è un array, trasformalo in array di 1 elemento
                                const cells = Array.isArray(row) ? row : [row];
                                return (
                                  <tr key={ri}>
                                    {cells.map((cell, ci) => (
                                      <td key={ci}>{cell == null ? "—" : String(cell)}</td>
                                    ))}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <EmptyNote text="Tabella vuota" />
                      )}
                    </Accordion>
                  ))}
                </div>
              ) : (
                <EmptyNote />
              )}
            </Accordion>

          </Accordion>

          {/* STATS */}
          <Accordion title="STATS">
            <SectionGrid>
              <KeyVal k="Total elements" v={stats?.totalElements ?? "—"} />
              <KeyVal k="Depth" v={stats?.depth ?? "—"} />
            </SectionGrid>
            <h4 className="subtle">Tag count (top 25)</h4>
            <TagCount tagCount={stats?.tagCount} />
          </Accordion>

          {/* JSON COMPLETO (contenuto e scrollabile) */}
          <Accordion title="JSON completo">
            <MonoBlock maxHeight={320}>
              {JSON.stringify(results, null, 2)}
            </MonoBlock>
          </Accordion>
        </div>
      )}
    </div>
  );
}

export default OneTimeScanAnalyzer;
