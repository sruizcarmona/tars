# polarpower

CLI to pull cycling (and other) exercises from Polar Flow → TCX files, with optional power analysis.

## Auth flow (important!)

This uses Polar's **OAuth2 authorization_code** flow with explicit user registration (`POST /v3/users`). Not client_credentials.

**Why not client_credentials?** That grant type looks like it works (you get a token) but it can't access user data. You MUST use `authorization_code` to get a user-level token.

## Setup (one-time)

### 1. Register an API client
- Go to https://admin.polaraccesslink.com
- Create a client with **authorization_code** grant type
- Set a redirect URL (e.g., `https://localhost` — just needs to be a valid URL, the redirect will fail in browser but the code will be in the URL)
- Copy the `client_id` and `client_secret`

### 2. Configure credentials
```bash
cp .env.example .env
# Edit .env with your client_id and client_secret
```

### 3. Register the user
```bash
# This will print an authorization URL
bin/polar register

# Open that URL in your browser, log into Polar Flow, authorize
# Your browser will redirect to a failing page — copy the full URL with ?code=*** from the address bar
# Then run:
bin/polar register --code 'https://localhost/?code=...'

# Verify it worked:
bin/polar auth
```

**Gotchas (read these):**
- ❌ Never reuse an authorization code — Polar revokes it after one exchange
- ❌ Don't skip `POST /v3/users` — this is the user registration step we originally missed
- ❌ Don't send a JSON body to the registration endpoint — empty body causes 400
- ❌ The redirect URL in the auth URL must exactly match what you registered (including port/path if any)
- ⚠️ Polar only returns data uploaded **after** user registration — rides uploaded before won't appear

## Usage

```bash
# List exercises in the last 30 days
bin/polar list

# List only from last 7 days
bin/polar list --days 7

# Download the most recent exercise as TCX
bin/polar pull --latest

# Download + run power analysis
bin/polar pull --latest --analyze

# Validate cached tokens
bin/polar auth
```

## Available data endpoints

| Endpoint | Type | What it gives |
|---|---|---|
| `GET /v3/exercises` | Non-transactional | Last 30 days of exercises |
| `GET /v3/users/sleep/` | Non-transactional | Sleep data (score, stages, interruptions) |
| `GET /v3/users/nightly-recharge/` | Non-transactional | Nightly recharge status |
| `GET /v3/exercises/{id}/tcx` | File download | Gzipped TCX with GPS + HR + power data |

## Project layout

```
polarpower/
├── .env.example       # template for secrets (committed)
├── .env               # real secrets (git-ignored)
├── bin/polar          # convenience wrapper that loads .env + runs the CLI
├── src/polar.py       # the CLI
├── docs/              # notes (setup, API quirks)
└── inbox/             # downloaded TCX files (git-ignored)
```

## Auth flow reference (the full story)

If you need to re-do the auth or set this up on a new machine, here's the exact flow:

```
1. User visits: https://flow.polar.com/oauth2/authorization?response_type=code&client_id=<ID>
2. Logs in → authorizes → browser redirects to <redirect_url>?code=<AUTH_CODE>
3. POST https://polarremote.com/v2/oauth2/token  (Basic Auth, grant_type=authorization_code)
   → Response: { access_token, x_user_id, ... }
4. POST https://www.polaraccesslink.com/v3/users  (Bearer token, no body)
   → 200 OK or 409 Conflict (already registered)
5. Cache token + x_user_id, done.
```

Full details in the Polar AccessLink skill (pending in Skill Workshop).
