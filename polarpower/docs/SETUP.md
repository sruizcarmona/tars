# Setup notes

## 2026-07-24 — Initial project

- Created `~/github/tars-openclaw/polarpower/`
- Moved prototype from `~/.openclaw/workspace/scripts/polar.py` → `src/polar.py`
- Switched from raw env export → `.env` file (Option B)

## API quirks worth remembering

- `/exercises` returns last 30 days only
- `start-time` has no timezone suffix — treat as device local
- `/exercises/{id}/tcx` returns gzipped data; we gunzip on download
- Tokens valid ~24h; we cache in `~/.config/polar/tokens.json` and refresh 5 min early
- Scopes actually needed in practice: just `exercise`. The others we enabled for future use.

## First cron job (TODO)

Sync rides nightly, push to inbox, run analyzer. Will set env vars on the cron line itself.
