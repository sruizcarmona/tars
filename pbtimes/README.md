# PBTimes — Running & Triathlon Best-Time Log

Log your highlight runs and triathlons, filter them, and compare times with friends.

## Stack

Pure static: `index.html` + `app.jsx`. React 18 + Tailwind via CDN, no build step.
Data is saved in `localStorage`. Deploys to GitHub Pages like a regular `index.html`.

Same shape as `hironman/`, `hironfood/`, `lazybros/`, etc.

## Run it

Open `index.html` in a browser. That's it.

## Features

**Running tab**
- Personal bests per distance (5K / 10K / 15K / Half / Marathon / custom)
- Log highlight runs: distance, time, date, location, race flag, notes
- ⭐ Highlight runs for quick filtering
- Tag friends with their times → head-to-head comparison with 🏆 on the fastest

**Triathlon tab**
- PBs per type (Sprint / Olympic / Half / Full)
- Log total time + optional swim/bike/run splits (total auto-computed from splits)
- Filter by race type

**General**
- Filters: distance, friend, highlights-only (running); type (triathlon)
- Export/import full backup as JSON
- Data persisted in browser localStorage
