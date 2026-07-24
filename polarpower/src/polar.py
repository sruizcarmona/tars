#!/usr/bin/env python3
"""
Polar AccessLink CLI — download bike rides (TCX) from Polar Flow.

Designed for a single-user setup with client_credentials OAuth2.
Reads creds from env vars; caches the access token in ~/.config/polar/tokens.json.

Usage:
  export POLAR_CLIENT_ID=...
  export POLAR_CLIENT_SECRET=...
  polar.py auth                          # validate creds, cache token
  polar.py list [--days N]               # list recent exercises
  polar.py pull [exerciseId|--latest]    # download TCX to inbox/
  polar.py latest --analyze              # download + run analyzer
"""
import argparse
import gzip
import io
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

API_BASE = "https://www.polaraccesslink.com/v3"
TOKEN_URL = "https://www.polaraccesslink.com/v3/oauth2/token"
TOKEN_CACHE = Path.home() / ".config" / "polar" / "tokens.json"
INBOX = Path("/home/ubuntu/.openclaw/workspace/inbox")


def get_credentials():
    cid = os.environ.get("POLAR_CLIENT_ID")
    sec = os.environ.get("POLAR_CLIENT_SECRET")
    if not cid or not sec:
        print("ERROR: set POLAR_CLIENT_ID and POLAR_CLIENT_SECRET env vars.", file=sys.stderr)
        sys.exit(2)
    return cid, sec


def get_access_token(force_refresh=False):
    """Returns a valid access_token, fetching a new one if needed/cached."""
    cache = {}
    if TOKEN_CACHE.exists() and not force_refresh:
        try:
            cache = json.loads(TOKEN_CACHE.read_text())
        except Exception:
            cache = {}

    # Check expiry (Polar tokens are valid for ~24h, we use 1h to be safe)
    if cache.get("access_token") and cache.get("expires_at", 0) > time.time() + 60:
        return cache["access_token"]

    cid, sec = get_credentials()
    resp = requests.post(
        TOKEN_URL,
        data={"grant_type": "client_credentials"},
        auth=(cid, sec),
        timeout=30,
    )
    if resp.status_code != 200:
        print(f"ERROR: token request failed: {resp.status_code} {resp.text}", file=sys.stderr)
        sys.exit(1)

    data = resp.json()
    token = data["access_token"]
    expires_in = int(data.get("expires_in", 3600))
    cache = {
        "access_token": token,
        "expires_at": time.time() + expires_in - 300,  # refresh 5 min early
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
    TOKEN_CACHE.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_CACHE.write_text(json.dumps(cache, indent=2))
    TOKEN_CACHE.chmod(0o600)
    return token


def api_get(path, **params):
    token = get_access_token()
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    resp = requests.get(f"{API_BASE}{path}", headers=headers, params=params, timeout=30)
    if resp.status_code == 401:
        # Token expired mid-flight, retry once
        token = get_access_token(force_refresh=True)
        headers["Authorization"] = f"Bearer {token}"
        resp = requests.get(f"{API_BASE}{path}", headers=headers, params=params, timeout=30)
    if resp.status_code != 200:
        print(f"ERROR: GET {path} -> {resp.status_code} {resp.text}", file=sys.stderr)
        sys.exit(1)
    return resp


def cmd_auth(args):
    token = get_access_token(force_refresh=True)
    # Validate by hitting /users
    resp = api_get("/users")
    users = resp.json()
    print(f"✅ Auth OK. {len(users)} user(s) registered to this client.")
    for u in users:
        print(f"  - polar-user-id: {u.get('polar-user-id')}, member-id: {u.get('member-id')}")


def cmd_list(args):
    resp = api_get("/exercises")
    exercises = resp.json()
    if not exercises:
        print("No exercises in the last 30 days.")
        return
    # Filter by days if requested
    cutoff = None
    if args.days:
        cutoff = datetime.now(timezone.utc) - timedelta(days=args.days)
    print(f"{'date':<22} {'sport':<12} {'duration':>10} {'id':<20}  name")
    print("-" * 100)
    for ex in exercises:
        # start-time is "2026-07-17T09:13:41.513" (no Z, device local time per docs)
        st = ex.get("start-time", "")[:19].replace("T", " ")
        sport = ex.get("sport", "?")
        dur_s = ex.get("duration", "00:00:00.000")
        # Polar returns ISO 8601 duration "PT1H13M4S" or "00:01:13:04.000" depending on version
        dur = format_duration(ex.get("duration", "PT0S"))
        eid = ex.get("id", "")[:18]
        name = ex.get("name") or ex.get("device-name", "")
        if cutoff:
            try:
                ex_dt = datetime.fromisoformat(ex["start-time"].replace("Z", ""))
                if ex_dt < cutoff:
                    continue
            except Exception:
                pass
        print(f"{st:<22} {sport:<12} {dur:>10}  {eid:<20}  {name}")


def format_duration(d):
    """Polar duration is either ISO 8601 (PT1H13M4S) or HH:MM:SS(.fff)."""
    if not d:
        return "0:00"
    s = str(d)
    if s.startswith("PT"):
        # Parse ISO 8601 duration
        import re
        hours = int(m.group(1)) if (m := re.search(r"(\d+)H", s)) else 0
        mins = int(m.group(1)) if (m := re.search(r"(\d+)M", s)) else 0
        secs = int(m.group(1)) if (m := re.search(r"(\d+)S", s)) else 0
        return f"{hours}:{mins:02d}:{secs:02d}"
    if ":" in s:
        parts = s.split(":")
        if len(parts) >= 3:
            return f"{int(parts[0])}:{int(parts[1]):02d}:{int(float(parts[2])):02d}"
    return s


def find_latest_cycling_exercise():
    """Find the most recent cycling exercise in the last 30 days."""
    resp = api_get("/exercises")
    exercises = resp.json()
    cycling = [e for e in exercises if "cycl" in str(e.get("sport", "")).lower() or "bike" in str(e.get("sport", "")).lower() or "bik" in str(e.get("sport", "")).lower()]
    if not cycling:
        # Fall back to most recent exercise of any kind
        cycling = exercises
    if not cycling:
        print("No exercises found.", file=sys.stderr)
        sys.exit(1)
    # Sort by start-time desc
    cycling.sort(key=lambda e: e.get("start-time", ""), reverse=True)
    return cycling[0]


def cmd_pull(args):
    if args.latest:
        ex = find_latest_cycling_exercise()
        eid = ex["id"]
        print(f"Latest exercise: {ex.get('start-time')} {ex.get('sport')} {ex.get('id')[:18]}")
    else:
        eid = args.exercise_id

    # Download TCX (gzip-encoded per API)
    token = get_access_token()
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    resp = requests.get(f"{API_BASE}/exercises/{eid}/tcx", headers=headers, timeout=60)
    if resp.status_code == 401:
        token = get_access_token(force_refresh=True)
        headers["Authorization"] = f"Bearer {token}"
        resp = requests.get(f"{API_BASE}/exercises/{eid}/tcx", headers=headers, timeout=60)
    if resp.status_code != 200:
        print(f"ERROR: TCX download failed: {resp.status_code} {resp.text}", file=sys.stderr)
        sys.exit(1)

    raw = resp.content
    # Polar returns gzipped TCX — try to gunzip
    try:
        decompressed = gzip.decompress(raw)
    except (OSError, gzip.BadGzipFile):
        decompressed = raw

    # Build filename
    meta_resp = api_get(f"/exercises/{eid}")
    meta = meta_resp.json()
    start = meta.get("start-time", "unknown")[:19].replace(":", "-").replace("T", "_")
    sport = meta.get("sport", "activity")
    out_name = f"polar_{start}_{sport}.tcx"
    out_path = INBOX / out_name

    INBOX.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(decompressed)
    print(f"✅ Saved {len(decompressed)} bytes → {out_path}")

    if args.analyze:
        # Defer to the existing analyzer
        analyzer = "/tmp/analyze_ride.py"
        if Path(analyzer).exists():
            weight = args.weight or os.environ.get("RIDER_WEIGHT_KG", "73")
            ftp = args.ftp or os.environ.get("FTP_W", "")
            cmd = ["python3", analyzer, str(out_path), weight]
            if ftp:
                cmd.append(ftp)
            print(f"\n→ Running analyzer (weight={weight}kg, ftp={ftp or 'unset'})…\n")
            os.execvp("python3", cmd)
        else:
            print(f"Analyzer not found at {analyzer}", file=sys.stderr)


def main():
    p = argparse.ArgumentParser(description="Polar AccessLink CLI")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("auth", help="Validate creds + cache token")

    sp_list = sub.add_parser("list", help="List recent exercises")
    sp_list.add_argument("--days", type=int, default=0, help="Filter to last N days")
    sp_list.set_defaults(func=cmd_list)

    sp_pull = sub.add_parser("pull", help="Download TCX for an exercise")
    sp_pull.add_argument("exercise_id", nargs="?", help="Exercise ID (or use --latest)")
    sp_pull.add_argument("--latest", action="store_true", help="Pull most recent exercise")
    sp_pull.add_argument("--analyze", action="store_true", help="Run analyzer on downloaded file")
    sp_pull.add_argument("--weight", type=float, help="Rider weight in kg (for analyzer)")
    sp_pull.add_argument("--ftp", type=float, help="FTP in W (for analyzer zones)")
    sp_pull.set_defaults(func=cmd_pull)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
