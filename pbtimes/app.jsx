const { useEffect, useMemo, useRef, useState } = React;

const STORAGE_KEY = "pbtimes.v1";

const DISTANCES = [
  { key: "5K", km: 5, label: "5K" },
  { key: "10K", km: 10, label: "10K" },
  { key: "15K", km: 15, label: "15K" },
  { key: "HM", km: 21.0975, label: "Half Marathon" },
  { key: "M", km: 42.195, label: "Marathon" },
];

const TRI_TYPES = [
  { key: "sprint", label: "Sprint", distance: "0.75 / 20 / 5" },
  { key: "olympic", label: "Olympic", distance: "1.5 / 40 / 10" },
  { key: "half", label: "Half", distance: "1.9 / 90 / 21.1" },
  { key: "full", label: "Full", distance: "3.8 / 180 / 42.2" },
];

/* ---------- helpers ---------- */

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function parseTimeToSeconds(str) {
  if (str == null) return null;
  const s = String(str).trim();
  if (!s) return null;
  const parts = s.split(":").map((p) => parseInt(p, 10));
  if (parts.length === 0 || parts.some((p) => isNaN(p))) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function fmtTime(totalSeconds) {
  if (totalSeconds == null || isNaN(totalSeconds)) return "—";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${m}:${ss}`;
}

function fmtPace(totalSeconds, km) {
  if (totalSeconds == null || !km) return "—";
  const perKm = totalSeconds / km;
  const m = Math.floor(perKm / 60);
  const s = Math.round(perKm % 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function defaultData() {
  return {
    runs: [],
    tris: [
      {
        id: uid(),
        type: "half",
        totalSeconds: 5 * 3600 + 15 * 60,
        swimSeconds: null,
        bikeSeconds: 2 * 3600 + 45 * 60,
        runSeconds: 1 * 3600 + 30 * 60,
        date: "2026-04-26",
        location: "Peñíscola, Spain",
        notes: "Half Ironman. Bike felt great, cramps at km 8 on the run — lost ~15 min.",
      },
    ],
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.runs) && Array.isArray(parsed.tris)) {
        return parsed;
      }
    }
  } catch (e) {
    /* corrupted storage -> fresh start */
  }
  return defaultData();
}

/* ---------- app shell ---------- */

function App() {
  const [data, setData] = useState(loadData);
  const [tab, setTab] = useState("run");

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      /* storage full or blocked */
    }
  }, [data]);

  const allFriends = useMemo(() => {
    const names = new Set();
    data.runs.forEach((r) => (r.friends || []).forEach((f) => f.name && names.add(f.name.trim())));
    return [...names].sort();
  }, [data.runs]);

  const addRun = (run) => setData((d) => ({ ...d, runs: [run, ...d.runs] }));
  const addTri = (tri) => setData((d) => ({ ...d, tris: [tri, ...d.tris] }));
  const deleteRun = (id) => setData((d) => ({ ...d, runs: d.runs.filter((r) => r.id !== id) }));
  const deleteTri = (id) => setData((d) => ({ ...d, tris: d.tris.filter((t) => t.id !== id) }));
  const toggleHighlight = (id) =>
    setData((d) => ({
      ...d,
      runs: d.runs.map((r) => (r.id === id ? { ...r, highlight: !r.highlight } : r)),
    }));

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pbtimes-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (parsed && Array.isArray(parsed.runs) && Array.isArray(parsed.tris)) {
          setData(parsed);
        } else {
          alert("That doesn't look like a PBTimes backup file.");
        }
      } catch (e) {
        alert("Could not parse that file.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Header tab={tab} setTab={setTab} runCount={data.runs.length} triCount={data.tris.length} />
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-6">
        {tab === "run" ? (
          <RunView
            runs={data.runs}
            allFriends={allFriends}
            addRun={addRun}
            deleteRun={deleteRun}
            toggleHighlight={toggleHighlight}
          />
        ) : (
          <TriView tris={data.tris} addTri={addTri} deleteTri={deleteTri} />
        )}
        <Footer onExport={exportJson} onImport={importJson} />
      </main>
    </div>
  );
}

function Header({ tab, setTab, runCount, triCount }) {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight">
            PB<span className="text-cyan-400">Times</span>
          </h1>
          <p className="text-xs text-slate-400">Running & triathlon best-time log</p>
        </div>
        <nav className="flex gap-2">
          <TabBtn active={tab === "run"} onClick={() => setTab("run")}>
            🏃 Running ({runCount})
          </TabBtn>
          <TabBtn active={tab === "tri"} onClick={() => setTab("tri")}>
            🏊 Triathlon ({triCount})
          </TabBtn>
        </nav>
      </div>
    </header>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/40"
          : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

/* ---------- running ---------- */

function RunView({ runs, allFriends, addRun, deleteRun, toggleHighlight }) {
  const [showForm, setShowForm] = useState(false);
  const [filterDist, setFilterDist] = useState("all");
  const [filterFriend, setFilterFriend] = useState("all");
  const [onlyHighlights, setOnlyHighlights] = useState(false);
  const [query, setQuery] = useState("");

  const sorted = useMemo(() => [...runs].sort((a, b) => (a.date < b.date ? 1 : -1)), [runs]);

  const pbs = useMemo(() => {
    const map = {};
    DISTANCES.forEach((d) => (map[d.key] = null));
    runs.forEach((r) => {
      const d = DISTANCES.find((x) => x.key === r.distance);
      if (!d) return;
      if (!map[d.key] || r.timeSeconds < map[d.key].timeSeconds) {
        map[d.key] = { timeSeconds: r.timeSeconds, date: r.date, location: r.location };
      }
    });
    return map;
  }, [runs]);

  const filtered = useMemo(
    () =>
      sorted.filter((r) => {
        if (filterDist !== "all" && r.distance !== filterDist) return false;
        if (onlyHighlights && !r.highlight) return false;
        if (filterFriend !== "all" && !(r.friends || []).some((f) => f.name === filterFriend)) return false;
        if (query) {
          const q = query.toLowerCase();
          const hay = `${r.location || ""} ${r.notes || ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    [sorted, filterDist, filterFriend, onlyHighlights, query]
  );

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Personal Bests</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {DISTANCES.map((d) => {
            const pb = pbs[d.key];
            return (
              <div key={d.key} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                <div className="text-xs font-medium text-slate-400">{d.label}</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-cyan-300">
                  {pb ? fmtTime(pb.timeSeconds) : "—"}
                </div>
                <div className="text-xs text-slate-500">
                  {pb ? `${fmtPace(pb.timeSeconds, d.km)} · ${pb.date}` : "No time yet"}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Log</h2>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            {showForm ? "Close" : "+ Add run"}
          </button>
        </div>

        {showForm && <RunForm allFriends={allFriends} onAdd={addRun} onDone={() => setShowForm(false)} />}

        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <select
            value={filterDist}
            onChange={(e) => setFilterDist(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-500"
          >
            <option value="all">All distances</option>
            {DISTANCES.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
          <select
            value={filterFriend}
            onChange={(e) => setFilterFriend(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-500"
          >
            <option value="all">All runs</option>
            {allFriends.map((n) => (
              <option key={n} value={n}>
                With {n}
              </option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center gap-1.5 text-slate-300">
            <input
              type="checkbox"
              checked={onlyHighlights}
              onChange={(e) => setOnlyHighlights(e.target.checked)}
              className="accent-cyan-500"
            />
            ⭐ Highlights only
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search location / notes…"
            className="min-w-40 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-500"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center text-slate-500">
            No runs here yet. Add your first highlight run 🏃
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((r) => (
              <RunCard key={r.id} run={r} onDelete={() => deleteRun(r.id)} onToggleStar={() => toggleHighlight(r.id)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RunForm({ allFriends, onAdd, onDone }) {
  const [distance, setDistance] = useState("10K");
  const [customKm, setCustomKm] = useState("");
  const [time, setTime] = useState("");
  const [date, setDate] = useState(todayStr());
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [isRace, setIsRace] = useState(true);
  const [friends, setFriends] = useState([]);
  const [friendName, setFriendName] = useState("");
  const [friendTime, setFriendTime] = useState("");
  const [error, setError] = useState("");

  const km =
    distance === "custom" ? parseFloat(customKm) : DISTANCES.find((d) => d.key === distance)?.km || null;

  const addFriend = () => {
    const name = friendName.trim();
    if (!name) return;
    if (friends.some((f) => f.name.toLowerCase() === name.toLowerCase())) return;
    setFriends([...friends, { name, timeSeconds: parseTimeToSeconds(friendTime) }]);
    setFriendName("");
    setFriendTime("");
  };

  const submit = (e) => {
    e.preventDefault();
    const timeSeconds = parseTimeToSeconds(time);
    if (!timeSeconds || timeSeconds <= 0) {
      setError("Enter a valid time, e.g. 42:30 or 1:23:45");
      return;
    }
    if (distance === "custom" && (!km || km <= 0)) {
      setError("Enter a valid custom distance in km");
      return;
    }
    onAdd({
      id: uid(),
      distance,
      customKm: distance === "custom" ? km : null,
      timeSeconds,
      date,
      location: location.trim(),
      notes: notes.trim(),
      race: isRace,
      highlight: false,
      friends: friends.map((f) => ({ name: f.name, timeSeconds: f.timeSeconds })),
    });
    onDone();
  };

  return (
    <form
      onSubmit={submit}
      className="mb-4 space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-soft"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="text-xs text-slate-400">
          Distance
          <select
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-cyan-500"
          >
            {DISTANCES.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
            <option value="custom">Custom…</option>
          </select>
        </label>
        {distance === "custom" ? (
          <label className="text-xs text-slate-400">
            Distance (km)
            <input
              value={customKm}
              onChange={(e) => setCustomKm(e.target.value)}
              placeholder="e.g. 12.5"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-500"
            />
          </label>
        ) : null}
        <label className="text-xs text-slate-400">
          Time
          <input
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="42:30 or 1:23:45"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-500"
          />
        </label>
        <label className="text-xs text-slate-400">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-cyan-500"
          />
        </label>
        <label className="text-xs text-slate-400">
          Location
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Barcelona"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-500"
          />
        </label>
        <label className="flex items-end gap-2 pb-1 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={isRace}
            onChange={(e) => setIsRace(e.target.checked)}
            className="accent-cyan-500"
          />
          Race
        </label>
      </div>

      <div className="rounded-lg bg-slate-800/60 p-3">
        <div className="mb-2 text-xs font-medium text-slate-300">Ran with friends (optional)</div>
        <div className="flex flex-wrap gap-2">
          <input
            value={friendName}
            onChange={(e) => setFriendName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addFriend();
              }
            }}
            list="friend-names"
            placeholder="Friend name"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-500"
          />
          <datalist id="friend-names">
            {allFriends.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <input
            value={friendTime}
            onChange={(e) => setFriendTime(e.target.value)}
            placeholder="Their time (optional)"
            className="w-36 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-500"
          />
          <button
            type="button"
            onClick={addFriend}
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-100 hover:bg-slate-600"
          >
            + Add
          </button>
        </div>
        {friends.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {friends.map((f, i) => (
              <span
                key={f.name}
                className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/15 px-2.5 py-1 text-xs text-cyan-300"
              >
                {f.name}
                {f.timeSeconds != null ? ` · ${fmtTime(f.timeSeconds)}` : ""}
                <button
                  type="button"
                  onClick={() => setFriends(friends.filter((_, j) => j !== i))}
                  className="text-cyan-400/70 hover:text-red-400"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <label className="block text-xs text-slate-400">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="How did it feel? Weather? Anything notable…"
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-500"
        />
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-lg bg-cyan-500 px-4 py-1.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
        >
          Save run
        </button>
      </div>
    </form>
  );
}

function RunCard({ run, onDelete, onToggleStar }) {
  const dist = DISTANCES.find((d) => d.key === run.distance);
  const km = run.distance === "custom" ? run.customKm : dist?.km;
  const distLabel = dist ? dist.label : `${run.customKm ? run.customKm + "K" : "Custom"}`;

  const comparison = useMemo(() => {
    const rows = [{ name: "Me", timeSeconds: run.timeSeconds }, ...(run.friends || [])];
    return rows.sort((a, b) => {
      if (a.timeSeconds == null) return 1;
      if (b.timeSeconds == null) return -1;
      return a.timeSeconds - b.timeSeconds;
    });
  }, [run]);

  const fastestName = comparison.length > 0 && comparison[0].timeSeconds != null ? comparison[0].name : null;

  return (
    <li className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-slate-100">{distLabel}</span>
            {run.race && (
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                Race
              </span>
            )}
            {run.highlight && <span title="Highlight run">⭐</span>}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {run.date}
            {run.location ? ` · ${run.location}` : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tabular-nums text-cyan-300">{fmtTime(run.timeSeconds)}</div>
          <div className="text-xs text-slate-500">{fmtPace(run.timeSeconds, km)}</div>
        </div>
      </div>

      {(run.friends || []).length > 0 && (
        <div className="mt-3 rounded-lg bg-slate-800/60 p-2.5">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Head to head
          </div>
          <table className="w-full text-sm">
            <tbody>
              {comparison.map((c) => (
                <tr key={c.name} className={c.name === fastestName ? "text-emerald-300" : "text-slate-300"}>
                  <td className="py-0.5">
                    {c.name}
                    {c.name === fastestName ? " 🏆" : ""}
                  </td>
                  <td className="text-right tabular-nums">{fmtTime(c.timeSeconds)}</td>
                  <td className="text-right text-xs text-slate-500">{fmtPace(c.timeSeconds, km)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {run.notes && <p className="mt-2 text-sm text-slate-400">{run.notes}</p>}

      <div className="mt-3 flex gap-3">
        <button onClick={onToggleStar} className="text-xs text-slate-400 transition hover:text-amber-300">
          {run.highlight ? "Remove highlight" : "⭐ Highlight"}
        </button>
        <button
          onClick={() => {
            if (window.confirm("Delete this run?")) onDelete();
          }}
          className="text-xs text-slate-500 transition hover:text-red-400"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

/* ---------- triathlon ---------- */

function TriView({ tris, addTri, deleteTri }) {
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState("all");

  const sorted = useMemo(() => [...tris].sort((a, b) => (a.date < b.date ? 1 : -1)), [tris]);

  const pbs = useMemo(() => {
    const map = {};
    TRI_TYPES.forEach((t) => (map[t.key] = null));
    tris.forEach((t) => {
      if (!map[t.type] || t.totalSeconds < map[t.type].totalSeconds) {
        map[t.type] = { totalSeconds: t.totalSeconds, date: t.date, location: t.location };
      }
    });
    return map;
  }, [tris]);

  const filtered = sorted.filter((t) => filterType === "all" || t.type === filterType);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Personal Bests</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {TRI_TYPES.map((t) => {
            const pb = pbs[t.key];
            return (
              <div key={t.key} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                <div className="text-xs font-medium text-slate-400">{t.label}</div>
                <div className="text-[10px] text-slate-600">swim/bike/run km: {t.distance}</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-cyan-300">
                  {pb ? fmtTime(pb.totalSeconds) : "—"}
                </div>
                <div className="text-xs text-slate-500">
                  {pb ? `${pb.date}${pb.location ? ` · ${pb.location}` : ""}` : "No race yet"}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Races</h2>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            {showForm ? "Close" : "+ Add race"}
          </button>
        </div>

        {showForm && <TriForm onAdd={addTri} onDone={() => setShowForm(false)} />}

        <div className="mb-3 flex gap-2 text-sm">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-500"
          >
            <option value="all">All types</option>
            {TRI_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center text-slate-500">
            No races logged yet. Add your first one 🏊
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((t) => (
              <TriCard key={t.id} tri={t} onDelete={() => deleteTri(t.id)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TriForm({ onAdd, onDone }) {
  const [type, setType] = useState("olympic");
  const [total, setTotal] = useState("");
  const [swim, setSwim] = useState("");
  const [bike, setBike] = useState("");
  const [run, setRun] = useState("");
  const [date, setDate] = useState(todayStr());
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const swimS = parseTimeToSeconds(swim);
  const bikeS = parseTimeToSeconds(bike);
  const runS = parseTimeToSeconds(run);
  const totalS = parseTimeToSeconds(total);
  const computedTotal =
    totalS ||
    (swimS != null && bikeS != null && runS != null ? swimS + bikeS + runS : null);

  const submit = (e) => {
    e.preventDefault();
    if (!computedTotal || computedTotal <= 0) {
      setError("Enter a total time, or all three splits (swim + bike + run).");
      return;
    }
    onAdd({
      id: uid(),
      type,
      totalSeconds: computedTotal,
      swimSeconds: swimS,
      bikeSeconds: bikeS,
      runSeconds: runS,
      date,
      location: location.trim(),
      notes: notes.trim(),
    });
    onDone();
  };

  return (
    <form onSubmit={submit} className="mb-4 space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-soft">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="text-xs text-slate-400">
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-cyan-500"
          >
            {TRI_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Total time
          <input
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder="5:15:00"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-500"
          />
        </label>
        <label className="text-xs text-slate-400">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-cyan-500"
          />
        </label>
        <label className="text-xs text-slate-400">
          Swim (optional)
          <input
            value={swim}
            onChange={(e) => setSwim(e.target.value)}
            placeholder="38:00"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-500"
          />
        </label>
        <label className="text-xs text-slate-400">
          Bike (optional)
          <input
            value={bike}
            onChange={(e) => setBike(e.target.value)}
            placeholder="2:45:00"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-500"
          />
        </label>
        <label className="text-xs text-slate-400">
          Run (optional)
          <input
            value={run}
            onChange={(e) => setRun(e.target.value)}
            placeholder="1:30:00"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-500"
          />
        </label>
        <label className="text-xs text-slate-400 sm:col-span-2">
          Location
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Peñíscola, Spain"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-500"
          />
        </label>
      </div>

      {computedTotal && totalS == null && (
        <p className="text-xs text-slate-400">
          Total auto-calculated from splits: <span className="font-semibold text-cyan-300">{fmtTime(computedTotal)}</span>
        </p>
      )}

      <label className="block text-xs text-slate-400">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Course, conditions, how it went…"
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-500"
        />
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200">
          Cancel
        </button>
        <button type="submit" className="rounded-lg bg-cyan-500 px-4 py-1.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400">
          Save race
        </button>
      </div>
    </form>
  );
}

function TriCard({ tri, onDelete }) {
  const typeInfo = TRI_TYPES.find((t) => t.key === tri.type) || { label: tri.type };
  return (
    <li className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-300">
              {typeInfo.label}
            </span>
            <span className="text-sm font-bold text-slate-100">{fmtTime(tri.totalSeconds)}</span>
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {tri.date}
            {tri.location ? ` · ${tri.location}` : ""}
          </div>
        </div>
        <div className="text-right text-xs text-slate-400">
          <div>
            🏊 <span className="tabular-nums">{fmtTime(tri.swimSeconds)}</span>
          </div>
          <div>
            🚴 <span className="tabular-nums">{fmtTime(tri.bikeSeconds)}</span>
          </div>
          <div>
            🏃 <span className="tabular-nums">{fmtTime(tri.runSeconds)}</span>
          </div>
        </div>
      </div>
      {tri.notes && <p className="mt-2 text-sm text-slate-400">{tri.notes}</p>}
      <div className="mt-3">
        <button
          onClick={() => {
            if (window.confirm("Delete this race?")) onDelete();
          }}
          className="text-xs text-slate-500 transition hover:text-red-400"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

/* ---------- footer ---------- */

function Footer({ onExport, onImport }) {
  const fileRef = useRef(null);
  return (
    <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-4 text-xs text-slate-500">
      <span>Data is saved locally in your browser.</span>
      <div className="flex gap-3">
        <button onClick={onExport} className="transition hover:text-cyan-300">
          ⬇ Export JSON
        </button>
        <button onClick={() => fileRef.current && fileRef.current.click()} className="transition hover:text-cyan-300">
          ⬆ Import JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            onImport(e.target.files[0]);
            e.target.value = "";
          }}
        />
      </div>
    </footer>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
