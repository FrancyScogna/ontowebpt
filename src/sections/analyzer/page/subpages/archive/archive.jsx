import "./archive.css";
import analyzerReactController from "../../../analyzerController";
import { useEffect, useMemo, useState, useCallback } from "react";

/* ---------- Helpers UI (coerenti con scan.jsx) ---------- */

function Accordion({ title, children, defaultOpen = false }) {
  return (
    <details className="acc" open={defaultOpen}>
      <summary className="acc-summary">{title}</summary>
      <div className="acc-panel">{children}</div>
    </details>
  );
}

function SectionGrid({ children }) {
  return <div className="grid">{children}</div>;
}

function KeyVal({ k, v }) {
  return (
    <div className="kv">
      <div className="kv-k">{k}</div>
      <div className="kv-v">{v}</div>
    </div>
  );
}

function Pill({ children }) {
  return <span className="pill">{children}</span>;
}

function MonoBlock({ text }) {
  return (
    <pre className="mono">
      {text}
    </pre>
  );
}

function EmptyNote({ text = "Nessun dato disponibile." }) {
  return <div className="empty-note">{text}</div>;
}

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

/* ---------- Utils ---------- */

// Normalizza uno snapshot che può arrivare in due forme:
// A) { meta, results }    (sessione per tab / globale)
// B) { results: { meta, results } }   (persistente via getLocalScanResults)
function normalizeSnapshot(snap) {
  if (!snap) return null;
  if (snap.meta && snap.results) return snap;
  if (snap.results && snap.results.meta && snap.results.results) {
    return { meta: snap.results.meta, results: snap.results.results };
  }
  // fallback: se c'è solo results senza meta
  if (snap.results) return { meta: snap.meta || {}, results: snap.results };
  return null;
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

function StatPills({ results }) {
  if (!results) return null;
  const { stats, body } = results;
  const headings = body?.headings || {};
  const pills = [
    ...(stats?.totalElements != null ? [[`Elements ${stats.totalElements}`]] : []),
    ...(stats?.depth != null ? [[`Depth ${stats.depth}`]] : []),
    [`h1 ${headings.h1?.length || 0}`],
    [`h2 ${headings.h2?.length || 0}`],
    [`h3 ${headings.h3?.length || 0}`],
    [`h4 ${headings.h4?.length || 0}`],
    [`h5 ${headings.h5?.length || 0}`],
    [`h6 ${headings.h6?.length || 0}`],
    [`Links ${Array.isArray(body?.links) ? body.links.length : 0}`],
    [`Forms ${Array.isArray(body?.forms) ? body.forms.length : 0}`],
    [`Images ${Array.isArray(body?.images) ? body.images.length : 0}`],
  ].flat();

  return (
    <div className="pill-row">
      {pills.map((p, i) => <Pill key={i}>{p}</Pill>)}
    </div>
  );
}

function ResultPreview({ snapshot }) {
  if (!snapshot) return <EmptyNote />;
  const { meta, results } = snapshot;
  if (!results) return <EmptyNote />;

  const headLinks = results?.head?.links?.slice(0, 10) || [];
  const linkRows = headLinks.map(l => ({ Rel: l.rel || "—", Href: l.href || "—" }));

  return (
    <>
      <MetaGrid meta={meta} />
      <StatPills results={results} />
      {headLinks.length > 0 && (
        <>
          <h4>Head → Link (preview)</h4>
          <SimpleTable cols={["Rel", "Href"]} rows={linkRows} />
        </>
      )}
      <h4>JSON completo</h4>
      <MonoBlock text={JSON.stringify({ meta, results }, null, 2)} />
    </>
  );
}

/* ---------- Component principale ---------- */

function ArchiveAnalyzer() {
  const [loading, setLoading] = useState(true);

  const [currentTabId, setCurrentTabId] = useState(null);
  const [currentTabSnap, setCurrentTabSnap] = useState(null);

  const [otherTabsSnaps, setOtherTabsSnaps] = useState([]);
  const [sessionSnap, setSessionSnap] = useState(null);
  const [localSnaps, setLocalSnaps] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 1) id tab corrente
      const tid = await analyzerReactController.getCurrentTabId();
      setCurrentTabId(tid);

      // 2) mappa completa per-tab
      const byTab = await analyzerReactController.getSessionByTabMap();
      const cur = byTab?.[tid] ? normalizeSnapshot(byTab[tid]) : null;
      setCurrentTabSnap(cur);

      const others = Object.entries(byTab || {})
        .filter(([k]) => String(k) !== String(tid))
        .map(([, v]) => normalizeSnapshot(v))
        .filter(Boolean)
        .sort((a, b) => (b?.meta?.timestamp || 0) - (a?.meta?.timestamp || 0));
      setOtherTabsSnaps(others);

      // 3) sessione globale
      const sess = await analyzerReactController.getSessionLastResult();
      setSessionSnap(normalizeSnapshot(sess));

      // 4) persistente
      const locals = await analyzerReactController.getLocalScanResults();
      const normalizedLocals = (Array.isArray(locals) ? locals : [])
        .map(s => {
          const norm = normalizeSnapshot(s.results || s);
          // portiamo dietro una label/time leggibile
          const ts = norm?.meta?.timestamp ?? (Number(String(s.key || "").replace("analyzerResults_", "")) || 0);
          return { key: s.key, ts, snap: norm };
        })
        .sort((a, b) => (b.ts || 0) - (a.ts || 0));
      setLocalSnaps(normalizedLocals);
    } catch (e) {
      console.error("[Archive] load error", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const off = analyzerReactController.onMessage({
      onScanComplete: () => load(),
      onRuntimeScanUpdate: () => load(),
      onScanError: () => {} // no-op
    });
    return () => off();
  }, [load]);

  return (
    <div className="archiveAnalyzer-div">
      <div className="archive-header">
        <h1>Archive</h1>
        <button className="archive-refresh" onClick={load} disabled={loading}>
          {loading ? "Aggiorno…" : "Aggiorna"}
        </button>
      </div>

      {/* 1) Tab corrente */}
      <Accordion title="Tab corrente" defaultOpen>
        {currentTabSnap
          ? <ResultPreview snapshot={currentTabSnap} />
          : <EmptyNote text="Nessuna scansione per il tab corrente." />}
      </Accordion>

      {/* 2) Altri tab */}
      <Accordion title={`Altri tab (${otherTabsSnaps.length})`}>
        {otherTabsSnaps.length
          ? otherTabsSnaps.map((s, i) => (
              <Accordion
                key={i}
                title={`${s?.meta?.tabId != null ? `Tab ${s.meta.tabId} — ` : ""}${s?.meta?.url || "—"}`}
              >
                <ResultPreview snapshot={s} />
              </Accordion>
            ))
          : <EmptyNote text="Nessuna scansione su altri tab in questa sessione." />}
      </Accordion>

      {/* 3) Sessione globale */}
      <Accordion title="Sessione">
        {sessionSnap
          ? <ResultPreview snapshot={sessionSnap} />
          : <EmptyNote text="Nessuna scansione di sessione disponibile." />}
      </Accordion>

      {/* 4) LocalStorage */}
      <Accordion title={`LocalStorage (${localSnaps.length})`}>
        {localSnaps.length
          ? localSnaps.map((s, i) => (
              <Accordion
                key={s.key || i}
                title={`${new Date(s.ts || Date.now()).toLocaleString()} — ${s.snap?.meta?.url || s.key || "—"}`}
              >
                <ResultPreview snapshot={s.snap} />
              </Accordion>
            ))
          : <EmptyNote text="Nessuna scansione salvata in memoria persistente." />}
      </Accordion>
    </div>
  );
}

export default ArchiveAnalyzer;
