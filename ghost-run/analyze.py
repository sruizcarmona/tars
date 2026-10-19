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

    ghost = []
    for i, p in enumerate(pts):
        pace = None
        j = max(0, i - 3)
        if i > j:
            dt = (p["t"] - pts[j]["t"]).total_seconds()
            dd = p["dist"] - pts[j]["dist"]
            if dd > 5 and dt > 0:
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
        })
    return ghost


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
        with open(os.path.join(GHOST_DIR, "ghost_%s.json" % year), "w") as fh:
            json.dump(ghost, fh)

        summary[year] = {
            "overall": overall(pts),
            "segments": segment_summary(pts),
        }

    with open(os.path.join(RESULTS_DIR, "comparison_summary.json"), "w") as fh:
        json.dump(summary, fh, indent=2)

    for y in sorted(summary):
        o = summary[y]["overall"]
        print("%s overall: %s km | %s | HR %s | +%s m" % (
            y, o.get("distance_km"), o.get("avg_pace_min_km"), o.get("avg_hr"), o.get("elev_gain_m")))


if __name__ == "__main__":
    main()
