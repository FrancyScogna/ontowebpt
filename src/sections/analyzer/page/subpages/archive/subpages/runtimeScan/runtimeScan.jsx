import "../../archive.css";
import "./runtimeScan.css";
import analyzerReactController from "../../../../../analyzerController";
import { useEffect, useState, useCallback } from "react";

/* Helpers UI */
function Accordion({ title, children, defaultOpen = false }) {
  return (
    <details className="acc" open={defaultOpen}>
      <summary className="acc-summary">{title}</summary>
      <div className="acc-panel">{children}</div>
    </details>
  );
}
function SectionGrid({ children }) { return <div className="grid">{children}</div>; }
function KeyVal({ k, v }) { return (<div className="kv"><div className="kv-k">{k}</div><div className="kv-v">{v ?? "—"}</div></div>); }
function Pill({ children }) { return <span className="pill">{children}</span>; }
function EmptyNote({ text = "Nessun dato disponibile." }) { return <div className="empty-note">{text}</div>; }
function MonoBlock({ children, maxHeight = 360 }) { return <pre className="mono" style={{ maxHeight }}>{children}</pre>; }

function StatPills({ results }) {
  if (!results) return null;
  const stats = results?.stats || {};
  const body = results?.body || {};
  const h = body?.headings || {};
  const pills = [];
  if (stats.totalElements != null) pills.push(`Elements ${stats.totalElements}`);
  if (stats.depth != null) pills.push(`Depth ${stats.depth}`);
  ["h1","h2","h3","h4","h5","h6"].forEach((t) => pills.push(`${t} ${h?.[t]?.length || 0}`));
  pills.push(`Links ${Array.isArray(body.links) ? body.links.length : 0}`);
  pills.push(`Forms ${Array.isArray(body.forms) ? body.forms.length : 0}`);
  pills.push(`Images ${Array.isArray(body.images) ? body.images.length : 0}`);
  return <div className="pill-row">{pills.map((p,i) => <Pill key={i}>{p}</Pill>)}</div>;
}
function MetaGrid({ meta }) {
  if (!meta) return null;
  return (
    <SectionGrid>
      <KeyVal k="URL" v={meta.url || "—"} />
      <KeyVal k="Timestamp" v={new Date(meta.timestamp || Date.now()).toLocaleString()} />
      <KeyVal k="Tab ID" v={meta.tabId != null ? String(meta.tabId) : "—"} />
      <KeyVal k="Title" v={meta.title || "—"} />
    </SectionGrid>
  );
}

function RuntimeScanArchiveAnalyzer() {
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState([]); // Array<{ key, run }>

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await analyzerReactController.getAllRuntimeResults();
      setRuns(Array.isArray(list) ? list : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const off = analyzerReactController.onMessage({
      onRuntimeScanComplete: () => load()
    });
    return () => off();
  }, [load]);

  return (
    <div>
      <div className="archive-header" style={{ marginTop: 4 }}>
        <h2>Runtime scans</h2>
        <button className="archive-refresh" onClick={load} disabled={loading}>
          {loading ? "Aggiorno…" : "Aggiorna"}
        </button>
      </div>

      {runs.length === 0 ? (
        <EmptyNote text="Nessun runtime salvato." />
      ) : (
        runs.map(({ key, run }, idx) => {
          const runIndex = runs.length - idx;
          const title = `${runIndex}. ${new Date(run.startedAt).toLocaleString()} → ${new Date(run.stoppedAt).toLocaleString()} • pages: ${run.pagesCount ?? 0} • scans: ${run.totalScans ?? 0}`;

          // ❌ NIENTE hook qui dentro — semplice calcolo
          const urls = run?.dataset ? Object.keys(run.dataset).sort() : [];

          return (
            <Accordion key={key} title={title}>
              <SectionGrid>
                <KeyVal k="Storage key" v={key} />
                <KeyVal k="Inizio" v={new Date(run.startedAt).toLocaleString()} />
                <KeyVal k="Fine" v={new Date(run.stoppedAt).toLocaleString()} />
                <KeyVal k="Pagine uniche" v={run.pagesCount ?? 0} />
                <KeyVal k="Scans totali" v={run.totalScans ?? 0} />
              </SectionGrid>

              <Accordion title={`Pagine (${urls.length})`}>
                {urls.length === 0 ? (
                  <EmptyNote />
                ) : (
                  urls.map((url) => {
                    const visits = run.dataset[url] || [];
                    return (
                      <Accordion key={url} title={`${url} — visite: ${visits.length}`}>
                        {visits.map((snap, i) => {
                          const { meta, results } = snap || {};
                          return (
                            <Accordion key={i} title={`Visita #${i + 1} — ${new Date(meta?.timestamp || 0).toLocaleString()}`}>
                              <MetaGrid meta={meta} />
                              <StatPills results={results} />
                              <h4>JSON completo (visita)</h4>
                              <MonoBlock maxHeight={320}>{JSON.stringify({ meta, results }, null, 2)}</MonoBlock>
                            </Accordion>
                          );
                        })}
                      </Accordion>
                    );
                  })
                )}
              </Accordion>

              <Accordion title="JSON completo (run)">
                <MonoBlock maxHeight={360}>{JSON.stringify(run, null, 2)}</MonoBlock>
              </Accordion>
            </Accordion>
          );
        })
      )}
    </div>
  );
}

export default RuntimeScanArchiveAnalyzer;
