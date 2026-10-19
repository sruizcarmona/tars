#!/usr/bin/env python3
"""
ghost-run :: analyze.py
Builds "ghost tracks" from Polar/Garmin TCX files for side-by-side comparison.

Parsing is done with regex block extraction (1:1 <Trackpoint>...</Trackpoint>),
which is namespace-proof and immune to the ElementTree issues we hit earlier.

Outputs:
  data/ghosts/ghost_<year>.json   -> [{lat,lng,alt,hr,pace,distance,t}]
  results/comparison_summary.json -> overall + flats/climbs/descents stats
"""
import json
import math
import os
import re
from datetime import datetime

DATA_DIR = "data"
GHOST_DIR = os.path.join(DATA_DIR, "ghosts")
RESULTS_DIR = "results"

FILES = {
    "2025": os.path.join(DATA_DIR, "polar_2025-10-19_comparison.tcx"),
    "2026": os.path.join(DATA_DIR, "polar_2026-10-18_08-31-12_RUNNING.tcx"),
}

TP_RE = re.compile(r"<Trackpoint>(.*?)</Trackpoint>", re.S)


def _tag(block, tag):
    m = re.search(r"<%s>(.*?)</%s>" % (tag, tag), block, re.S)
    return m.group(1).strip() if m else None


def _num(block, *tags):
    for t in tags:
        v = _tag(block, t)
        if v is not None:
            try:
                return float(v)
            except ValueError:
                pass
    return None


def _parse_time(raw):
    if not raw:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S.%fZ"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    return None


def parse_tcx(path):
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        xml = fh.read()

    points = []
    for block in TP_RE.findall(xml):
        t = _parse_time(_tag(block, "Time"))
        if t is None:
            continue

        lat = _num(block, "LatitudeDegrees")
        lng = _num(block, "LongitudeDegrees")
        alt = _num(block, "AltitudeMeters", "Altitude") or 0.0
        dist = _num(block, "DistanceMeters", "Distance")
        hr = _num(block, "Value") if "HeartRateBpm" in block else None
        if hr is None:
            hr = _num(block, "HeartRateOverall")

        points.append({
            "t": t,
            "lat": lat,
            "lng": lng,
            "alt": alt,
            "dist": dist,
            "hr": int(hr) if hr is not None else None,
        })
    return points


def build_ghost(points):
    """GPS-only, monotonic-distance, pace-smoothed payload for the frontend."""
    # keep only points with real GPS
    pts = [p for p in points if p["lat"] is not None and p["lng"] is not None]

    # enforce monotonic distance (carry last known forward)
    last = 0.0
    for p in pts:
        if p["dist"] is None or p["dist"] < last:
            p["dist"] = last
        else:
            last = p["dist"]

    t0 = pts[0]["t"]
    ghost = []
    # pace over a ~100 m rolling window (instantaneous 3-sample pace was far too noisy)
    WIN = 100.0
    j = 0
    for i, p in enumerate(pts):
        elapsed = (p["t"] - t0).total_seconds()
        while j < i and p["dist"] - pts[j]["dist"] > WIN:
            j += 1
        pace = None
        if i > j:
            dt = (p["t"] - pts[j]["t"]).total_seconds()
            dd = p["dist"] - pts[j]["dist"]
            if dd > 10 and dt > 0:
                pace = (dt / 60.0) / (dd / 1000.0)
        if pace is None:
            for k in range(len(ghost) - 1, -1, -1):
                if ghost[k]["pace"] is not None:
                    pace = ghost[k]["pace"]
                    break

        ghost.append({
            "lat": round(p["lat"], 6),
            "lng": round(p["lng"], 6),
            "alt": round(p["alt"], 1),
            "hr": p["hr"],
            "pace": round(pace, 3) if pace is not None else None,
            "distance": round(p["dist"], 1),
            "t": round(elapsed, 1),
        })
    return ghost


def detect_alignment(ghost25, ghost26, cell=25.0, radius=5, near=25.0):
    """Find where the two routes diverge and where they reconnect.

    Returns the reconnection anchor so the frontend can resync there instead
    of at distance 0 (2026 took ~500 m of extra route before rejoining).
    """
    if not ghost25 or not ghost26:
        return None
    mlat = 111132.0
    mlng = 111320.0 * math.cos(math.radians(ghost26[0]["lat"] or 40.5))

    grid = {}
    for i, p in enumerate(ghost25):
        k = (int(p["lat"] * mlat / cell), int(p["lng"] * mlng / cell))
        grid.setdefault(k, []).append(i)

    sep, match = [None] * len(ghost26), [-1] * len(ghost26)
    for j, p in enumerate(ghost26):
        kx, ky = int(p["lat"] * mlat / cell), int(p["lng"] * mlng / cell)
        best, bi = None, -1
        for dx in range(-radius, radius + 1):
            for dy in range(-radius, radius + 1):
                for i in grid.get((kx + dx, ky + dy), ()):
                    dm = math.hypot((p["lat"] - ghost25[i]["lat"]) * mlat,
                                    (p["lng"] - ghost25[i]["lng"]) * mlng)
                    if best is None or dm < best:
                        best, bi = dm, i
        sep[j], match[j] = best, bi

    far = [(s is None or s > near) for s in sep]

    div, run = None, 0
    for j, f in enumerate(far):
        if f:
            run += 1
            if run >= 5 and div is None:
                div = j - run + 1
        else:
            run = 0

    rec = None
    if div is not None:
        for j in range(div + 1, len(far)):
            if not far[j]:
                win = far[j:j + 100]
                if sum(win) <= 0.1 * len(win):
                    rec = j
                    break

    if div is None or rec is None:
        return None

    i25 = match[rec]
    d25r, d26r = ghost25[i25]["distance"], ghost26[rec]["distance"]
    t25r, t26r = ghost25[i25]["t"], ghost26[rec]["t"]
    div25 = match[div] if match[div] >= 0 else 0
    return {
        "offset_m": round(d25r - d26r, 1),
        "extra_m": round(d26r - d25r, 1),
        "reconnect": {
            "lat": ghost26[rec]["lat"], "lng": ghost26[rec]["lng"],
            "d25": d25r, "d26": d26r, "t25": t25r, "t26": t26r,
        },
        "divergence": {
            "d25": ghost25[div25]["distance"] if div25 < len(ghost25) else 0,
            "d26": ghost26[div]["distance"],
        },
    }


def segment_summary(points):
    segs = {"flats": [], "climbs": [], "descents": []}
    for i in range(1, len(points)):
        p1, p2 = points[i - 1], points[i]
        dd = p2["dist"] - p1["dist"]
        if dd <= 1:
            continue
        dt = (p2["t"] - p1["t"]).total_seconds()
        slope = (p2["alt"] - p1["alt"]) / dd
        kind = "climbs" if slope > 0.02 else "descents" if slope < -0.02 else "flats"
        segs[kind].append({
            "pace": (dt / 60.0) / (dd / 1000.0) if dt > 0 else None,
            "hr": p2["hr"],
            "dist": dd,
        })

    out = {}
    for kind, rows in segs.items():
        d = sum(r["dist"] for r in rows)
        tp = sum(r["pace"] for r in rows if r["pace"]) or None
        hrs = [r["hr"] for r in rows if r["hr"]]
        out[kind] = {
            "distance_m": round(d, 1),
            "avg_pace_min_km": round(sum(r["pace"] for r in rows if r["pace"]) / len([r for r in rows if r["pace"]]), 3) if any(r["pace"] for r in rows) else None,
            "avg_hr": round(sum(hrs) / len(hrs), 1) if hrs else None,
            "samples": len(rows),
        }
    return out


def overall(points):
    if len(points) < 2:
        return {}
    d = max(p["dist"] for p in points if p["dist"] is not None)
    secs = (points[-1]["t"] - points[0]["t"]).total_seconds()
    hrs = [p["hr"] for p in points if p["hr"]]
    gain = sum(max(0.0, points[i]["alt"] - points[i - 1]["alt"]) for i in range(1, len(points)))
    return {
        "distance_km": round(d / 1000.0, 3),
        "duration_s": int(secs),
        "avg_pace_min_km": round((secs / 60.0) / (d / 1000.0), 3) if d > 0 else None,
        "avg_hr": round(sum(hrs) / len(hrs), 1) if hrs else None,
        "max_hr": max(hrs) if hrs else None,
        "elev_gain_m": round(gain, 0),
    }


def main():
    os.makedirs(GHOST_DIR, exist_ok=True)
    os.makedirs(RESULTS_DIR, exist_ok=True)
    summary = {}
    ghosts = {}

    for year, path in FILES.items():
        if not os.path.exists(path):
            print("MISSING: %s" % path)
            continue
        pts = parse_tcx(path)
        gps = [p for p in pts if p["lat"] is not None]
        print("%s: %d trackpoints parsed, %d with GPS" % (year, len(pts), len(gps)))
        if not pts:
            print("FAILED to extract %s" % year)
            continue

        ghost = build_ghost(pts)
        ghosts[year] = ghost
        with open(os.path.join(GHOST_DIR, "ghost_%s.json" % year), "w") as fh:
            json.dump(ghost, fh)

        summary[year] = {
            "overall": overall(pts),
            "segments": segment_summary(pts),
        }

    with open(os.path.join(RESULTS_DIR, "comparison_summary.json"), "w") as fh:
        json.dump(summary, fh, indent=2)

    # route alignment (detour detection) -> data/ghosts/alignment.json
    align = None
    if "2025" in ghosts and "2026" in ghosts:
        align = detect_alignment(ghosts["2025"], ghosts["2026"])
        with open(os.path.join(GHOST_DIR, "alignment.json"), "w") as fh:
            json.dump(align or {}, fh, indent=2)
        if align:
            print("alignment: diverge @ %sm, reconnect @ %sm | 2026 has +%sm of extra route" % (
                align["divergence"]["d26"], align["reconnect"]["d26"], align["extra_m"]))
        else:
            print("alignment: routes appear identical, no detour detected")

    for y in sorted(summary):
        o = summary[y]["overall"]
        print("%s overall: %s km | %s | HR %s | +%s m" % (
            y, o.get("distance_km"), o.get("avg_pace_min_km"), o.get("avg_hr"), o.get("elev_gain_m")))


if __name__ == "__main__":
    main()
