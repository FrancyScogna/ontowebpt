import "./runtimeScan.css";
import analyzerReactController from "../../../analyzerController";
import { useEffect, useMemo, useState, useCallback } from "react";

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

export default function RuntimeScanAnalyzer(){
  const [status, setStatus] = useState({ runtimeActive: false, totalScans: 0, pagesCount: 0, startedAt: 0, active: false });
  const [liveLastUrl, setLiveLastUrl] = useState(null);
  const [stopping, setStopping] = useState(false);

  const [lastRun, setLastRun] = useState(null); // { key, run }
  const [loading, setLoading] = useState(true);

  const refreshStatus = useCallback(async () => {
    const s = await analyzerReactController.getScanStatus();
    setStatus(s || { runtimeActive: false, totalScans: 0, pagesCount: 0, startedAt: 0, active: false });
  }, []);

  const loadLastRun = useCallback(async () => {
    setLoading(true);
    try {
      const res = await analyzerReactController.getLastRuntimeResults();
      setLastRun(res?.run ? res : { key: null, run: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    loadLastRun();

    const off = analyzerReactController.onMessage({
      onRuntimeScanUpdate: (url, totals) => {
        setLiveLastUrl(url || null);
        if (totals) {
          setStatus((s) => ({
            ...s,
            runtimeActive: true,
            active: true,
            totalScans: totals.totalScans ?? s.totalScans,
            pagesCount: totals.pagesCount ?? s.pagesCount,
            startedAt: totals.startedAt ?? s.startedAt
          }));
        }
      },
      onRuntimeScanComplete: (payload) => {
        setStopping(false);
        setStatus((s) => ({ ...s, runtimeActive: false, active: false }));
        if (payload?.run) setLastRun({ key: payload.key, run: payload.run });
        else loadLastRun();
      }
    });
    return () => off();
  }, [refreshStatus, loadLastRun]);

  const handleStart = async () => {
    await analyzerReactController.sendStartRuntimeScan();
    setLiveLastUrl(null);
    refreshStatus();
  };
  const handleStop = async () => {
    setStopping(true);
    await analyzerReactController.sendStopRuntimeScan();
  };

  const run = lastRun?.run || null;
  const urls = useMemo(() => (run ? Object.keys(run.dataset || {}).sort() : []), [run]);

  return (
    <div className="scanAnalyzer-div">
      <h1>Runtime Scan</h1>

      <div className="scan-actions">
        <button onClick={handleStart} disabled={status.runtimeActive || status.active}>Start runtime</button>
        <button onClick={handleStop} disabled={(!status.runtimeActive && !status.active) || stopping}>
          {stopping ? "Sto fermando…" : "Stop & salva"}
        </button>
        <button onClick={loadLastRun} disabled={status.runtimeActive || status.active}>Ricarica ultimo salvataggio</button>
      </div>

      <SectionGrid>
        <KeyVal k="Stato" v={(status.runtimeActive || status.active) ? "IN CORSO" : "FERMO"} />
        <KeyVal k="Avviato" v={status.startedAt ? new Date(status.startedAt).toLocaleString() : "—"} />
        <KeyVal k="Pagine uniche (live)" v={status.pagesCount ?? 0} />
        <KeyVal k="Scans totali (live)" v={status.totalScans ?? 0} />
        <KeyVal k="Ultima URL acquisita" v={liveLastUrl || "—"} />
      </SectionGrid>

      <Accordion title="Ultimo runtime salvato" defaultOpen>
        {loading ? (
          <p className="loading">Carico…</p>
        ) : !run ? (
          <EmptyNote text="Nessun runtime salvato trovato." />
        ) : (
          <>
            <SectionGrid>
              <KeyVal k="Inizio" v={new Date(run.startedAt).toLocaleString()} />
              <KeyVal k="Fine" v={new Date(run.stoppedAt).toLocaleString()} />
              <KeyVal k="Pagine uniche (run)" v={run.pagesCount} />
              <KeyVal k="Scans totali (run)" v={run.totalScans} />
              <KeyVal k="Storage key" v={lastRun.key} />
            </SectionGrid>

            <Accordion title={`Pagine (${urls.length})`}>
              {urls.length === 0 ? (
                <EmptyNote />
              ) : (
                urls.map((url) => {
                  const visits = run.dataset[url] || [];
                  return (
                    <Accordion key={url} title={`${url}  —  visite: ${visits.length}`}>
                      {visits.map((snap, idx) => {
                        const { meta, results } = snap || {};
                        return (
                          <Accordion key={idx} title={`Visita #${idx + 1} — ${new Date(meta?.timestamp || 0).toLocaleString()}`}>
                            <MetaGrid meta={meta} />
                            <StatPills results={results} />
                            <h4>JSON completo (visita)</h4>
                            <MonoBlock>{JSON.stringify({ meta, results }, null, 2)}</MonoBlock>
                          </Accordion>
                        );
                      })}
                    </Accordion>
                  );
                })
              )}
            </Accordion>

            <Accordion title="JSON completo (runtime intero)">
              <MonoBlock>{JSON.stringify(run, null, 2)}</MonoBlock>
            </Accordion>
          </>
        )}
      </Accordion>
    </div>
  );
}
