#!/usr/bin/env python3
"""
Polar AccessLink CLI — download bike rides (TCX) from Polar Flow.

Uses OAuth2 authorization_code flow with explicit user registration.

Flow (one-time setup):
  polarpower register
    → prints auth URL you visit in your browser
    → after authorizing, paste the redirect URL back here
    → exchanges code, registers user, caches tokens
  polarpower auth
    → validates cached tokens
  polarpower list [--days N]
  polarpower pull [exerciseId|--latest] [--analyze]
"""
import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from requests.auth import HTTPBasicAuth

API_BASE = "https://www.polaraccesslink.com/v3"
AUTH_URL = "https://flow.polar.com/oauth2/authorization"
TOKEN_URL = "https://polarremote.com/v2/oauth2/token"
TOKEN_CACHE = Path.home() / ".config" / "polar" / "tokens.json"
INBOX = Path("/home/ubuntu/.openclaw/workspace/inbox")

# Default redirect — must match what you registered in Polar admin panel.
# You can override via POLAR_REDIRECT_URL env var or in .env
DEFAULT_REDIRECT_URI = "http://localhost:5000/oauth2_callback"


def get_credentials():
    cid = os.environ.get("POLAR_CLIENT_ID")
    sec = os.environ.get("POLAR_CLIENT_SECRET")
    if not cid or not sec:
        print("ERROR: set POLAR_CLIENT_ID and POLAR_CLIENT_SECRET env vars.", file=sys.stderr)
        sys.exit(2)
    return cid, sec


def get_redirect_uri():
    return os.environ.get("POLAR_REDIRECT_URL", DEFAULT_REDIRECT_URI)


def load_token_cache():
    """Load cached tokens. Returns dict or None."""
    if not TOKEN_CACHE.exists():
        return None
    try:
        return json.loads(TOKEN_CACHE.read_text())
    except (json.JSONDecodeError, OSError):
        return None


def save_token_cache(data: dict):
    TOKEN_CACHE.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_CACHE.write_text(json.dumps(data, indent=2))
    TOKEN_CACHE.chmod(0o600)
    print(f"  → Tokens saved to {TOKEN_CACHE}")


def user_api_get(path, access_token, **params):
    """Authenticated GET to AccessLink API using user-level token."""
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    }
    resp = requests.get(f"{API_BASE}{path}", headers=headers, params=params, timeout=30)
    if resp.status_code == 401:
        # Token expired — user needs to re-authorize
        print("ERROR: Token expired or invalid. Run `polarpower register` to re-authorize.", file=sys.stderr)
        sys.exit(1)
    if resp.status_code != 200:
        print(f"ERROR: GET {path} -> {resp.status_code} {resp.text[:300]}", file=sys.stderr)
        sys.exit(1)
    return resp


def get_access_token():
    """Return cached user-level access token."""
    cache = load_token_cache()
    if not cache or "access_token" not in cache:
        print("ERROR: No cached token. Run `polarpower register` first.", file=sys.stderr)
        sys.exit(1)
    return cache["access_token"]


def get_user_id():
    """Return cached x_user_id."""
    cache = load_token_cache()
    if not cache or "x_user_id" not in cache:
        print("ERROR: No user id cached. Run `polarpower register` first.", file=sys.stderr)
        sys.exit(1)
    return cache["x_user_id"]


# ─── Register (authorization_code flow) ───────────────────────────────

def cmd_register(args):
    cid, sec = get_credentials()
    redirect_uri = get_redirect_uri()

    from urllib.parse import urlencode
    auth_url = f"{AUTH_URL}?{urlencode({'response_type': 'code', 'client_id': cid, 'redirect_uri': redirect_uri})}"

    if not args.code:
        # Just print instructions
        print("=" * 60)
        print("  POLAR ACCESSLINK — USER REGISTRATION")
        print("=" * 60)
        print()
        print("Step 1 — Open this URL in your browser:")
        print()
        print(f"  {auth_url}")
        print()
        print("Step 2 — Log in to Polar Flow and authorize access.")
        print()
        print("Step 3 — After authorizing, your browser will redirect")
        print("         to a URL that looks like:")
        print(f"         {redirect_uri}?code=***")
        print()
        print("         That page will probably show an error — that's OK.")
        print("         Copy the ENTIRE redirect URL from the address bar")
        print("         and send it to me.")
        print()
        print(f"  {auth_url}")
        print()
        return

    # Extract authorization code
    reply = args.code.strip()
    match = re.search(r"[?&]code=([^&]+)", reply)
    if match:
        authorization_code = match.group(1)
    else:
        # Assume it's just the raw code
        authorization_code = reply
    print(f"  ✓ Got authorization code: {authorization_code[:20]}...")

    # Exchange code for access token
    print("\n  → Exchanging code for access token...")
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json;charset=UTF-8",
    }
    data = {
        "grant_type": "authorization_code",
        "code": authorization_code,
    }
    if redirect_uri:
        data["redirect_uri"] = redirect_uri

    token_resp = requests.post(
        TOKEN_URL,
        data=data,
        auth=HTTPBasicAuth(cid, sec),
        headers=headers,
        timeout=30,
    )
    if token_resp.status_code != 200:
        print(f"ERROR: Token exchange failed: {token_resp.status_code}", file=sys.stderr)
        print(f"       {token_resp.text[:300]}", file=sys.stderr)
        sys.exit(1)

    token_data = token_resp.json()
    user_access_token = token_data["access_token"]
    x_user_id = token_data["x_user_id"]

    print(f"  ✓ Token received! (x_user_id: {x_user_id})")

    # Register user with the client application
    print("\n  → Registering user with AccessLink...")
    register_headers = {
        "Authorization": f"Bearer {user_access_token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    register_resp = requests.post(
        f"{API_BASE}/users",
        headers=register_headers,
        json={},
        timeout=30,
    )
    if register_resp.status_code == 409:
        # 409 Conflict = already registered, which is fine
        print("  ✓ User already registered (409 — OK, continuing)")
    elif register_resp.status_code != 200:
        print(f"ERROR: User registration failed: {register_resp.status_code}", file=sys.stderr)
        print(f"       {register_resp.text[:300]}", file=sys.stderr)
        sys.exit(1)
    else:
        print("  ✓ User registered successfully!")

    # Cache tokens
    cache = {
        "access_token": user_access_token,
        "x_user_id": x_user_id,
        "scopes": token_data.get("scopes", ""),
        "registered_at": datetime.now(timezone.utc).isoformat(),
    }
    # Copy over register-related stuff if Polar returns it
    for k in ("member_id", "polar_user_id", "first_name"):
        if k in register_resp.json() if register_resp.status_code == 200 else {}:
            cache[k] = register_resp.json()[k]

    # Also preserve any existing reg info if 409
    if register_resp.status_code == 409:
        cache["note"] = "User was already registered (prev OK)"

    save_token_cache(cache)
    print()
    print("✅ Registration complete! You can now use:")
    print("   polarpower auth            → validate setup")
    print("   polarpower list            → see your rides")
    print("   polarpower pull --latest   → download last ride")
    print("   polarpower pull --latest --analyze  → + power analysis")


# ─── Auth check (validate cached tokens) ──────────────────────────────

def cmd_auth(args):
    cache = load_token_cache()
    if not cache:
        print("ERROR: No cached tokens. Run `polarpower register` first.", file=sys.stderr)
        sys.exit(1)

    uid = cache.get("x_user_id")
    token = cache.get("access_token")
    if not uid or not token:
        print("ERROR: Cache incomplete. Run `polarpower register` again.", file=sys.stderr)
        sys.exit(1)

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }
    resp = requests.get(f"{API_BASE}/users/{uid}", headers=headers, timeout=30)
    if resp.status_code == 401:
        print("ERROR: Token expired or invalid. Re-run `polarpower register`.", file=sys.stderr)
        sys.exit(1)
    if resp.status_code != 200:
        print(f"ERROR: Auth check failed: {resp.status_code} {resp.text[:200]}", file=sys.stderr)
        sys.exit(1)

    user = resp.json()
    print(f"✅ Auth OK — {user.get('first-name', '?')} {user.get('last-name', '?')}")
    print(f"   Polar user ID: {user.get('polar-user-id', '?')}")
    print(f"   Member ID:     {user.get('member-id', '?')}")
    if user.get("weight"):
        print(f"   Weight:        {user['weight']} kg")


# ─── List exercises ──────────────────────────────────────────────────

def cmd_list(args):
    token = get_access_token()
    resp = user_api_get("/exercises", token)
    exercises = resp.json()
    if not exercises:
        print("No exercises in the last 30 days.")
        return

    cutoff = None
    if args.days:
        cutoff = datetime.now(timezone.utc) - timedelta(days=args.days)

    print(f"{'date':<22} {'sport':<12} {'duration':>10} {'id':<20}  name")
    print("-" * 100)
    for ex in exercises:
        st = ex.get("start-time", "")[:19].replace("T", " ")
        sport = ex.get("sport", "?")
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
    if not d:
        return "0:00"
    s = str(d)
    if s.startswith("PT"):
        hours = int(m.group(1)) if (m := re.search(r"(\d+)H", s)) else 0
        mins = int(m.group(1)) if (m := re.search(r"(\d+)M", s)) else 0
        secs = int(m.group(1)) if (m := re.search(r"(\d+)S", s)) else 0
        return f"{hours}:{mins:02d}:{secs:02d}"
    if ":" in s:
        parts = s.split(":")
        if len(parts) >= 3:
            return f"{int(parts[0])}:{int(parts[1]):02d}:{int(float(parts[2])):02d}"
    return s


# ─── Pull TCX ────────────────────────────────────────────────────────

def find_latest_cycling_exercise():
    token = get_access_token()
    resp = user_api_get("/exercises", token)
    exercises = resp.json()
    cycling = [e for e in exercises
               if any(kw in str(e.get("sport", "")).lower()
                      for kw in ("cycl", "bike", "bik", "road", "mountain"))]
    if not cycling:
        cycling = exercises
    if not cycling:
        print("No exercises found.", file=sys.stderr)
        sys.exit(1)
    cycling.sort(key=lambda e: e.get("start-time", ""), reverse=True)
    return cycling[0]


def cmd_pull(args):
    token = get_access_token()

    if args.latest:
        ex = find_latest_cycling_exercise()
        eid = ex["id"]
        print(f"Latest: {ex.get('start-time')} {ex.get('sport')} [{eid[:18]}]")
    else:
        eid = args.exercise_id

    # Download TCX
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }
    resp = requests.get(f"{API_BASE}/exercises/{eid}/tcx", headers=headers, timeout=60)
    if resp.status_code != 200:
        print(f"ERROR: TCX download failed: {resp.status_code} {resp.text[:200]}", file=sys.stderr)
        sys.exit(1)

    raw = resp.content
    try:
        import gzip
        decompressed = gzip.decompress(raw)
    except (OSError, gzip.BadGzipFile):
        decompressed = raw

    # Get metadata for filename
    meta_resp = user_api_get(f"/exercises/{eid}", token)
    meta = meta_resp.json()
    start = meta.get("start-time", "unknown")[:19].replace(":", "-").replace("T", "_")
    sport = meta.get("sport", "activity")
    out_name = f"polar_{start}_{sport}.tcx"
    out_path = INBOX / out_name

    INBOX.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(decompressed)
    print(f"✅ Saved {len(decompressed)} bytes → {out_path}")

    if args.analyze:
        analyzer = Path("/tmp/analyze_ride.py")
        if analyzer.exists():
            weight = args.weight or os.environ.get("RIDER_WEIGHT_KG", "80")
            ftp = args.ftp or os.environ.get("FTP_W", "")
            cmd = ["python3", str(analyzer), str(out_path), str(weight)]
            if ftp:
                cmd.append(str(ftp))
            print(f"\n→ Running analyzer (weight={weight}kg, ftp={ftp or 'unset'})…\n")
            os.execvp("python3", cmd)
        else:
            print(f"  (Analyzer not found at {analyzer} — skipping)")


# ─── Main ────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description="Polar AccessLink CLI")
    sub = p.add_subparsers(dest="cmd", required=True)

    sp_reg = sub.add_parser("register", help="Authorize + register user (one-time setup)")
    sp_reg.add_argument("--code", help="Authorization code from the redirect URL (paste the whole URL)")
    sp_reg.set_defaults(func=cmd_register)

    sp_auth = sub.add_parser("auth", help="Validate cached tokens")
    sp_auth.set_defaults(func=cmd_auth)

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
