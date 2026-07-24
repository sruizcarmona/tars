# polarpower

CLI to pull cycling (and other) exercises from Polar Flow → TCX files, with a planned analyzer pass on top.

## What this is

Polar AccessLink uses **OAuth2 client_credentials** for machine-to-machine access. No browser, no user redirect — but the Polar admin form still asks for a redirect URL. We just put `https://localhost` there; it's never used.

## Setup (one-time)

1. Create a Polar AccessLink client at https://admin.polaraccesslink.com
   - Redirect URL: `https://localhost` (placeholder, never invoked)
   - Scopes: `exercise`, `activity`, `physical_info` — grant all, your data, no downside
2. Link the client to your Polar user (one-time browser step):
   ```
   https://www.polaraccesslink.com/v3/oauth2/authorization?response_type=code&client_id=YOUR_CLIENT_ID&scope=exercise
   ```
   Log in → click Allow → done. Future pulls are fully automatic.
3. Copy `.env.example` → `.env`, fill in client_id + secret:
   ```bash
   cp .env.example .env
   $EDITOR .env
   ```

## Usage

```bash
# Load env vars
set -a && source .env && set +a

# Validate creds (and confirm user link is active)
python3 src/polar.py auth

# List recent exercises
python3 src/polar.py list --days 30

# Pull the most recent exercise as TCX
python3 src/polar.py pull --latest

# Pull + run the ride analyzer (weight from $RIDER_WEIGHT_KG, FTP from $FTP_W)
python3 src/polar.py pull --latest --analyze
```

## Project layout

```
polarpower/
├── .env.example       # template for secrets (committed)
├── .env               # real secrets (git-ignored)
├── bin/polar          # convenience wrapper that loads .env + runs the CLI
├── src/polar.py       # the CLI
├── docs/              # notes (setup, API quirks, analysis ideas)
└── inbox/             # downloaded TCX files (git-ignored)
```

## Why client_credentials and not the regular OAuth flow?

Polar's `client_credentials` flow gives us a token that lets us read **our own** data forever, no user interaction per call. The catch: it needs a one-time browser step to register our client against our user. After that, fully headless. Perfect for cron + automation.
