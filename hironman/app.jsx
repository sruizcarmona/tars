const { useEffect, useMemo, useRef, useState } = React;

const STORAGE_KEY = "hironman.training.completions.v1";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

function parsePaceToSecondsPerKm(text) {
  const s = String(text || "");
  const out = [];

  const range = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g;
  let m;
  while ((m = range.exec(s))) {
    const a = Number(m[1]) * 60 + Number(m[2]);
    const b = Number(m[3]) * 60 + Number(m[4]);
    out.push(a, b);
  }

  const single = /(\d{1,2}):(\d{2})(?:\s*\/\s*km|\s*km|\s*pace)?/g;
  while ((m = single.exec(s))) {
    const sec = Number(m[1]) * 60 + Number(m[2]);
    out.push(sec);
  }

  return out.filter((x) => Number.isFinite(x) && x > 120 && x < 900);
}

function getSessionId(weekNum, sessionIdx, session) {
  const key = `${weekNum}-${sessionIdx}-${session?.type || ""}-${session?.title || ""}`;
  return `w${weekNum}-s${sessionIdx}-${slugify(key)}`;
}

function getPhaseForWeek(phases, weekNum) {
  for (const p of phases || []) {
    if (typeof p.week === "number" && p.week === weekNum) return p;
    if (Array.isArray(p.weeks) && p.weeks.length === 2) {
      const [a, b] = p.weeks;
      if (weekNum >= a && weekNum <= b) return p;
    }
  }
  return null;
}

function typeBadgeClass(type) {
  const t = String(type || "").toLowerCase();
  if (t === "run") return "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30";
  if (t === "bike") return "bg-cyan-500/15 text-cyan-100 ring-1 ring-cyan-400/30";
  if (t === "swim") return "bg-indigo-500/15 text-indigo-100 ring-1 ring-indigo-400/30";
  if (t === "gym") return "bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/30";
  if (t === "brick") return "bg-fuchsia-500/15 text-fuchsia-100 ring-1 ring-fuchsia-400/30";
  if (t === "race") return "bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-400/30";
  return "bg-slate-500/15 text-slate-100 ring-1 ring-slate-400/30";
}

function ProgressRing({ value, label }) {
  const v = clamp(value, 0, 100);
  const r = 44;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;
  const color =
    v >= 75 ? "stroke-emerald-400" : v >= 50 ? "stroke-amber-400" : "stroke-rose-400";

  return (
    <div className="relative h-28 w-28">
      <svg viewBox="0 0 120 120" className="h-28 w-28 -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="rgba(148,163,184,0.18)"
          strokeWidth="10"
        />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          className={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="text-2xl font-semibold tabular-nums">{Math.round(v)}%</div>
          <div className="text-[11px] text-slate-300">{label}</div>
        </div>
      </div>
    </div>
  );
}

function ConfidenceGauge({ plan, completions }) {
  const { score, details } = useMemo(() => {
    const goalStr = plan?.athlete?.goal_run_pace || "4:30 min/km";
    const goalSecs = (parsePaceToSecondsPerKm(goalStr)[0] ?? 270);

    const weeks = plan?.training_plan?.weekly_schedule || [];
    const maxWeek = Math.max(1, ...weeks.map((w) => w.week || 1));

    const runLike = (s) => {
      const t = String(s?.type || "").toLowerCase();
      return t === "run" || t === "brick" || t === "race";
    };

    const runSessions = [];
    for (const w of weeks) {
      const sessions = w.sessions || [];
      sessions.forEach((s, idx) => {
        if (!runLike(s)) return;
        const id = getSessionId(w.week, idx, s);
        const paces = parsePaceToSecondsPerKm(s.description);
        const hasTargetMention =
          paces.some((p) => Math.abs(p - goalSecs) <= 3) || /4:30/.test(s.description || "");
        const hasFasterThanGoal = paces.some((p) => p < goalSecs - 10);
        runSessions.push({
          week: w.week,
          id,
          type: s.type,
          title: s.title,
          hasTargetMention,
          hasFasterThanGoal,
          bestPace: paces.length ? Math.min(...paces) : null,
        });
      });
    }

    const plannedRun = runSessions.length;
    const completedRun = runSessions.filter((s) => completions[s.id]).length;

    const plannedTarget = runSessions.filter((s) => s.hasTargetMention).length;
    const completedTarget = runSessions.filter(
      (s) => s.hasTargetMention && completions[s.id]
    ).length;

    const weightedCompleted = runSessions.reduce((acc, s) => {
      if (!completions[s.id]) return acc;
      const w = clamp((s.week || 1) / maxWeek, 0, 1);
      return acc + (0.35 + 0.65 * w);
    }, 0);
    const weightedPlanned = runSessions.reduce((acc, s) => {
      const w = clamp((s.week || 1) / maxWeek, 0, 1);
      return acc + (0.35 + 0.65 * w);
    }, 0);
    const recencyRatio = weightedPlanned > 0 ? weightedCompleted / weightedPlanned : 0;

    const base =
      30 * (plannedRun > 0 ? completedRun / plannedRun : 0) +
      50 * (plannedTarget > 0 ? completedTarget / plannedTarget : 0) +
      20 * recencyRatio;

    const completedFaster = runSessions.filter(
      (s) => s.hasFasterThanGoal && completions[s.id]
    ).length;
    const bonus = clamp(completedFaster * 3, 0, 10);

    const bestCompletedPace = (() => {
      const values = runSessions
        .filter((s) => completions[s.id] && s.bestPace != null)
        .map((s) => s.bestPace);
      if (!values.length) return null;
      return Math.min(...values);
    })();

    const finalScore = clamp(base + bonus, 0, 100);

    const label = finalScore >= 75 ? "High" : finalScore >= 50 ? "Building" : "Low";
    return {
      score: finalScore,
      details: {
        label,
        goalStr,
        plannedRun,
        completedRun,
        plannedTarget,
        completedTarget,
        completedFaster,
        bestCompletedPace,
      },
    };
  }, [plan, completions]);

  const best =
    details.bestCompletedPace == null
      ? "—"
      : `${Math.floor(details.bestCompletedPace / 60)}:${pad2(
          details.bestCompletedPace % 60
        )}/km`;

  return (
    <div className="rounded-2xl bg-slate-900/60 shadow-lg shadow-slate-900/40 ring-1 ring-white/10 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-slate-300">Confidence Gauge</div>
          <div className="text-lg font-semibold leading-tight">
            Run target: {details.goalStr}
          </div>
          <div className="mt-1 text-sm text-slate-300">
            Target-pace sessions done:{" "}
            <span className="font-semibold text-slate-100 tabular-nums">
              {details.completedTarget}/{details.plannedTarget || 0}
            </span>
          </div>
          <div className="text-sm text-slate-300">
            Run-like sessions done:{" "}
            <span className="font-semibold text-slate-100 tabular-nums">
              {details.completedRun}/{details.plannedRun || 0}
            </span>
          </div>
          <div className="text-sm text-slate-300">
            Best completed pace found:{" "}
            <span className="font-semibold text-slate-100">{best}</span>
          </div>
        </div>
        <ProgressRing value={score} label={details.label} />
      </div>
      <div className="mt-4 text-xs text-slate-400">
        Heuristic based on completed run/brick/race sessions, 4:30 exposure and recency
        weighting.
      </div>
    </div>
  );
}

function CountdownCard({ raceDateStr }) {
  const raceDate = useMemo(() => {
    const s = String(raceDateStr || "");
    if (!s) return null;
    return new Date(`${s}T00:00:00`);
  }, [raceDateStr]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const diffMs = raceDate ? raceDate.getTime() - now.getTime() : 0;
  const t = formatDuration(diffMs);
  const done = diffMs <= 0;

  return (
    <div className="rounded-2xl bg-gradient-to-br from-slate-900/80 to-slate-900/40 shadow-lg shadow-slate-900/40 ring-1 ring-white/10 p-4">
      <div className="text-sm text-slate-300">Countdown</div>
      <div className="text-lg font-semibold leading-tight">
        Race day: {raceDateStr || "—"}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {[
          ["Days", t.days],
          ["Hours", t.hours],
          ["Min", t.minutes],
          ["Sec", t.seconds],
        ].map(([k, v]) => (
          <div
            key={k}
            className="rounded-xl bg-slate-950/60 ring-1 ring-white/10 px-2 py-2 text-center"
          >
            <div className="text-xl font-semibold tabular-nums">
              {done ? "0" : v}
            </div>
            <div className="text-[11px] text-slate-300">{k}</div>
          </div>
        ))}
      </div>
      {done ? (
        <div className="mt-3 text-sm text-emerald-200">It’s race day. Execute.</div>
      ) : (
        <div className="mt-3 text-sm text-slate-300">
          Keep stacking sessions; the last 2 weeks count the most.
        </div>
      )}
    </div>
  );
}

function WeekCard({ week, phase, completions, onToggle }) {
  const sessions = week.sessions || [];
  const total = sessions.length;
  const done = sessions.reduce((acc, s, idx) => {
    const id = getSessionId(week.week, idx, s);
    return acc + (completions[id] ? 1 : 0);
  }, 0);

  return (
    <div className="rounded-2xl bg-slate-900/70 shadow-lg shadow-slate-900/40 ring-1 ring-white/10 overflow-hidden">
      <div className="px-4 py-3 bg-slate-950/40">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm text-slate-300">Week</div>
              <div className="text-lg font-semibold">#{week.week}</div>
              {week.start_date ? (
                <span className="text-xs rounded-full bg-emerald-500/10 ring-1 ring-emerald-400/20 px-2 py-1 text-emerald-100">
                  {week.start_date}
                </span>
              ) : null}
              {week.name ? (
                <span className="text-xs rounded-full bg-white/5 ring-1 ring-white/10 px-2 py-1 text-slate-200">
                  {week.name}
                </span>
              ) : null}
              {phase?.name ? (
                <span className="text-xs rounded-full bg-sky-500/10 ring-1 ring-sky-400/20 px-2 py-1 text-sky-100">
                  {phase.name}
                </span>
              ) : null}
            </div>
            {phase?.focus ? (
              <div className="mt-1 text-sm text-slate-300">{phase.focus}</div>
            ) : null}
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-300">Completed</div>
            <div className="text-sm font-semibold tabular-nums">
              {done}/{total}
            </div>
          </div>
        </div>
      </div>

      <div className="divide-y divide-white/5">
        {sessions.map((s, idx) => {
          const id = getSessionId(week.week, idx, s);
          const checked = !!completions[id];
          return (
            <label
              key={id}
              className="flex gap-3 px-4 py-3 items-start hover:bg-white/5 transition-colors cursor-pointer"
            >
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-emerald-400"
                checked={checked}
                onChange={() => onToggle(id)}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs rounded-full px-2 py-1 ${typeBadgeClass(s.type)}`}>
                    {s.type}
                  </span>
                  <div
                    className={`font-semibold ${
                      checked
                        ? "text-slate-300 line-through decoration-white/20"
                        : "text-slate-100"
                    }`}
                  >
                    {s.title}
                  </div>
                </div>
                {s.description ? (
                  <div
                    className={`mt-1 text-sm ${
                      checked ? "text-slate-400" : "text-slate-300"
                    }`}
                  >
                    {s.description}
                  </div>
                ) : null}
              </div>
            </label>
          );
        })}
      </div>

      {week.daily_targets ? (
        <div className="px-4 py-3 bg-slate-950/30">
          <div className="text-sm font-semibold text-slate-100">Daily targets</div>
          <div className="mt-2 grid gap-2">
            {Object.entries(week.daily_targets).map(([day, text]) => (
              <div
                key={day}
                className="rounded-xl bg-white/5 ring-1 ring-white/10 px-3 py-2"
              >
                <div className="text-xs text-slate-300">{day}</div>
                <div className="text-sm text-slate-100">{text}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function App() {
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [completions, setCompletions] = useState(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return safeJsonParse(raw, {}) || {};
  });
  const [serverCompletions, setServerCompletions] = useState(null);

  const saveTimer = useRef(null);
  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(completions));
    }, 120);
    return () => clearTimeout(saveTimer.current);
  }, [completions]);

  useEffect(() => {
    let cancelled = false;
    fetch("./training_plan.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load training_plan.json (HTTP ${r.status})`);
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        setPlan(json);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e?.message || e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("./sessions.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) {
          if (r.status === 404) return null;
          throw new Error(`Failed to load sessions.json (HTTP ${r.status})`);
        }
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        if (!json) {
          setServerCompletions(null);
          return;
        }
        if (Array.isArray(json.sessions)) {
          const map = {};
          json.sessions.forEach((s) => {
            if (!s || !s.id) return;
            map[s.id] = !!s.completed;
          });
          setServerCompletions(map);
        } else {
          const map = {};
          Object.keys(json || {}).forEach((k) => {
            const v = json[k];
            if (v && typeof v === "object" && "completed" in v) {
              map[k] = !!v.completed;
            } else {
              map[k] = !!v;
            }
          });
          setServerCompletions(map);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setServerCompletions(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const schedule = plan?.training_plan?.weekly_schedule || [];
  const phases = plan?.training_plan?.phases || [];

  const effectiveCompletions = useMemo(() => {
    return {
      ...(serverCompletions || {}),
      ...(completions || {}),
    };
  }, [serverCompletions, completions]);

  const completionSummary = useMemo(() => {
    let total = 0;
    let done = 0;
    schedule.forEach((w) => {
      (w.sessions || []).forEach((s, idx) => {
        total += 1;
        const id = getSessionId(w.week, idx, s);
        if (effectiveCompletions[id]) done += 1;
      });
    });
    return { total, done };
  }, [schedule, effectiveCompletions]);

  function onToggle(id) {
    setCompletions((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function onReset() {
    localStorage.removeItem(STORAGE_KEY);
    setCompletions({});
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm text-slate-300">Peñiscola Half Ironman · 26 April 2026</div>
            <div className="text-2xl sm:text-3xl font-semibold tracking-tight">
              HIRONMAN training dashboard
            </div>
            <div className="mt-1 text-sm text-slate-300">
              Overall completed:{" "}
              <span className="font-semibold text-slate-100 tabular-nums">
                {completionSummary.done}/{completionSummary.total}
              </span>
            </div>
          </div>
          <button
            onClick={onReset}
            className="rounded-xl bg-white/5 hover:bg-white/10 ring-1 ring-white/10 px-3 py-2 text-sm text-slate-100 transition-colors"
            type="button"
          >
            Reset checkmarks
          </button>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl bg-rose-500/10 ring-1 ring-rose-400/20 p-4 text-rose-100">
            <div className="font-semibold">Couldn’t load `training_plan.json`</div>
            <div className="mt-1 text-sm text-rose-100/90">{error}</div>
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
          <div className="space-y-4">
            {schedule
              .slice()
              .sort((a, b) => (a.week || 0) - (b.week || 0))
              .map((w) => (
                <WeekCard
                  key={`week-${w.week}`}
                  week={w}
                  phase={getPhaseForWeek(phases, w.week)}
                  completions={effectiveCompletions}
                  onToggle={onToggle}
                />
              ))}
          </div>

          <div className="space-y-4 lg:sticky lg:top-6 h-fit">
            <CountdownCard raceDateStr={plan?.athlete?.race_date} />
            <ConfidenceGauge plan={plan} completions={effectiveCompletions} />

            <div className="rounded-2xl bg-slate-900/70 shadow-lg shadow-slate-900/40 ring-1 ring-white/10 p-4">
              <div className="text-sm text-slate-300">Athlete</div>
              <div className="mt-2 grid gap-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-300">Weight</span>
                  <span className="font-semibold tabular-nums">
                    {plan?.athlete?.weight_kg ?? "—"} kg
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-300">Goal pace</span>
                  <span className="font-semibold">
                    {plan?.athlete?.goal_run_pace ?? "—"}
                  </span>
                </div>
                <div className="pt-2 mt-2 border-t border-white/10">
                  <div className="text-xs text-slate-400">Benchmarks</div>
                  {plan?.athlete?.benchmarks
                    ? Object.entries(plan.athlete.benchmarks).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3 mt-1">
                          <span className="text-slate-300">
                            {k.replace(/_/g, " ")}
                          </span>
                          <span className="font-semibold">{v}</span>
                        </div>
                      ))
                    : null}
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-900/40 ring-1 ring-white/10 p-4 text-xs text-slate-400">
              Progress is saved locally in your browser (LocalStorage). Opening this
              dashboard on another device won’t sync automatically.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (ReactDOM.createRoot) {
  ReactDOM.createRoot(rootEl).render(<App />);
} else {
  ReactDOM.render(<App />, rootEl);
}

