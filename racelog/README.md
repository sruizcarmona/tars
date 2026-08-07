# RaceLog

Static, single-page race best-times dashboard. CSV-backed, no backend.

## Stack

- Plain HTML + CSS + React (UMD, via CDN) + Babel standalone
- Data: `pb_times.csv` fetched at runtime
- Hosting: GitHub Pages (drop `index.html` and it works)

## Files

```
racelog/
├── index.html      # mount point + script tags
├── app.jsx         # UI (transpiled in-browser by Babel standalone)
├── styles.css      # all styling
└── pb_times.csv    # the dataset
```

## CSV schema

```
date,runner,type,distance_km,race_name,location,time_seconds,notes
```

- `date` — ISO `YYYY-MM-DD`
- `runner` — free-text slug (`max`, `marta`, `carlos`, …). No accounts, no auth.
- `type` — `run` | `tri` (swim/bike-only events can be added later)
- `distance_km` — race distance in km (e.g. `21.1`, `113.0`)
- `race_name` — official race name
- `location` — city / venue
- `time_seconds` — finish time in seconds
- `notes` — free text, optional

## Adding data

Edit `pb_times.csv`, commit, push. The dashboard refetches on each page load
(`cache: "no-store"`).

Multiple finishes at the same distance are kept as raw rows; the dashboard
shows the best (lowest `time_seconds`) per `(runner, type, distance_km)` and
notes when more finishes exist.

## Local dev

Just open `index.html` in a browser — or serve the folder:

```sh
python3 -m http.server 8000
# → http://localhost:8000
```

A static server is recommended so `fetch("./pb_times.csv")` works
(`file://` blocks fetch in some browsers).

## Deploy

GitHub Pages, branch `main`, root `/`. Push and it's live.