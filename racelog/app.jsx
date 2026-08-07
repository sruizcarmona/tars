const { useEffect, useMemo, useState } = React;

const CSV_URL = "./pb_times.csv";

/* ---------- utilities ---------- */

function parseCSV(text) {
  // RFC-4180-ish: handles quoted fields with commas; no escaped quotes in seed data
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const split = (line) => {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const header = split(lines[0]);
  const rows = lines.slice(1).map((l) => {
    const cells = split(l);
    const obj = {};
    header.forEach((h, i) => { obj[h] = cells[i] ?? ""; });
    return obj;
  });
  return { header, rows };
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatPace(seconds, distanceKm) {
  const d = Number(distanceKm);
  if (!d || d <= 0) return "—";
  const secPerKm = Math.max(0, Math.floor(Number(seconds) || 0)) / d;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" });
}

function titleCase(slug) {
  return String(slug || "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function initials(name) {
  return String(name || "?")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

/* ---------- derived data ---------- */

function groupPRs(rows) {
  // Best time per (runner, type, distance_km)
  const best = new Map();
  for (const r of rows) {
    const key = `${r.runner}|${r.type}|${r.distance_km}`;
    const cur = best.get(key);
    const t = Number(r.time_seconds);
    if (!cur || t < Number(cur.time_seconds)) best.set(key, r);
  }
  return Array.from(best.values());
}

/* ---------- UI ---------- */

function RunnerChip({ name, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`chip ${active ? "chip-active" : ""}`}
      title={titleCase(name)}
    >
      <span className="avatar">{initials(name)}</span>
      <span className="chip-label">{titleCase(name)}</span>
    </button>
  );
}

function PBCard({ pr, allRows }) {
  // For pace-style display, run events get pace per km
  const isRun = pr.type === "run";
  const sameRace = allRows.filter(
    (r) => r.runner === pr.runner && r.type === pr.type && r.distance_km === pr.distance_km
  );
  return (
    <div className="pb-card">
      <div className="pb-card-head">
        <span className={`tag tag-${pr.type}`}>{isRun ? "Run" : "Tri"}</span>
        <span className="pb-distance">{Number(pr.distance_km).toFixed(1)} km</span>
      </div>
      <div className="pb-time">{formatTime(pr.time_seconds)}</div>
      {isRun && <div className="pb-pace">{formatPace(pr.time_seconds, pr.distance_km)}</div>}
      <div className="pb-meta">
        <div>{pr.race_name}</div>
        <div className="pb-sub">{pr.location} · {formatDate(pr.date)}</div>
        {sameRace.length > 1 && (
          <div className="pb-sub">{sameRace.length} finishes · best shown</div>
        )}
        {pr.notes && <div className="pb-notes">{pr.notes}</div>}
      </div>
    </div>
  );
}

function App() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const [error, setError] = useState(null);
  const [activeRunner, setActiveRunner] = useState("all");
  const [activeType, setActiveType] = useState("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(CSV_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (cancelled) return;
        const { rows: parsed } = parseCSV(text);
        setRows(parsed);
        setStatus("ok");
      } catch (e) {
        if (cancelled) return;
        setError(e.message || String(e));
        setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const runners = useMemo(() => {
    const set = new Set(rows.map((r) => r.runner).filter(Boolean));
    return Array.from(set).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (activeRunner !== "all" && r.runner !== activeRunner) return false;
      if (activeType !== "all" && r.type !== activeType) return false;
      return true;
    });
  }, [rows, activeRunner, activeType]);

  const prs = useMemo(() => groupPRs(filteredRows), [filteredRows]);

  const totals = useMemo(() => {
    const races = filteredRows.length;
    const prs = groupPRs(filteredRows).length;
    return { races, prs };
  }, [filteredRows]);

  return (
    <div className="app">
      <header className="hero">
        <h1>RaceLog</h1>
        <p className="hero-sub">Official race results — running & triathlon</p>
      </header>

      {status === "loading" && <div className="banner">Loading…</div>}
      {status === "error" && (
        <div className="banner banner-error">
          Could not load <code>{CSV_URL}</code>: {error}
        </div>
      )}

      <section className="filters">
        <div className="filter-row">
          <span className="filter-label">Runner</span>
          <div className="chips">
            <button
              type="button"
              onClick={() => setActiveRunner("all")}
              className={`chip ${activeRunner === "all" ? "chip-active" : ""}`}
            >
              <span className="avatar avatar-all">★</span>
              <span className="chip-label">Everyone</span>
            </button>
            {runners.map((r) => (
              <RunnerChip
                key={r}
                name={r}
                active={activeRunner === r}
                onClick={() => setActiveRunner(r)}
              />
            ))}
          </div>
        </div>

        <div className="filter-row">
          <span className="filter-label">Type</span>
          <div className="chips">
            {["all", "run", "tri"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActiveType(t)}
                className={`chip chip-text ${activeType === t ? "chip-active" : ""}`}
              >
                <span className="chip-label">{t === "all" ? "All" : t === "run" ? "Run" : "Triathlon"}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="summary">
        <div className="stat">
          <div className="stat-n">{totals.races}</div>
          <div className="stat-l">races</div>
        </div>
        <div className="stat">
          <div className="stat-n">{totals.prs}</div>
          <div className="stat-l">PRs</div>
        </div>
        <div className="stat">
          <div className="stat-n">{runners.length}</div>
          <div className="stat-l">runners</div>
        </div>
      </section>

      {status === "ok" && prs.length === 0 && (
        <div className="banner">No results for these filters.</div>
      )}

      <section className="grid">
        {prs
          .sort((a, b) => Number(a.time_seconds) - Number(b.time_seconds))
          .map((pr, i) => (
            <PBCard key={`${pr.runner}-${pr.type}-${pr.distance_km}`} pr={pr} allRows={rows} />
          ))}
      </section>

      <footer className="foot">
        <span>
          Data: <code>pb_times.csv</code> · {rows.length} rows · static GitHub Pages
        </span>
      </footer>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);