# Operation Pavé — Androubaix

**Project:** Mapping cobblestone/sett street surfaces in Sant Andreu (Barcelona)
**Status:** Active
**Commander:** Max
**Operator:** Tars 🤖
**Codename:** Androubaix (Paris-Roubaix vibes, Sant Andreu edition)

## Mission

Identify, measure, and visualize all street segments with `surface=sett`, `surface=cobblestone`, and `surface=paving_stones` in the Sant Andreu district of Barcelona, focusing on the area **south of Avinguda Meridiana**.

## Current Targets (Confirmed)

| Street | Surface | Total Sett Length | Notes |
|---|---|---|---|
| Carrer de Pons i Gallarza | sett | ~427m | Two contiguous segments, high quality |
| Carrer de Borriana | sett | ~403m | Living street + pedestrian, continuous run Segre→Fabra i Puig |
| Carrer de Vintró | sett | ~56m (visible) | OSM breaks from perpendicular asphalt; likely continuous |
| Carrer del Mercat | sett | ~72m (visible) | Near market square, interleaved pattern |
| Carrer de Sant Adrià | sett | ~19m (footway) | Mostly paving_stones, minor sett segments |

## Files

- `index.html` — Leaflet.js visual map with colour-coded segments and length labels
- `fetch_data.js` — Node.js script to pull OSM data via Overpass API and calculate lengths
- `AGENTS.md` — This file

## How To Pick Up The Project

1. **Fetch fresh data** — Run `node fetch_data.js` to pull the latest from Overpass API
2. **Update the map** — Add new segments to the `streets` array in `index.html`
3. **Push** — `git add && git commit && git push origin main` to deploy to GitHub Pages

## Known Puzzles

1. **OSM fragmentation** — Cross-streets break OSM ways, so a continuous sett stretch often appears as multiple tiny segments. The actual length is longer than the tagged data suggests. Cross-reference with the map visual.
2. **Asphalt gaps** — Many "asphalt" tagged segments are actually just perpendicular intersections (e.g., Carrer de Borriana at Fabra i Puig). The main street surface remains sett.
3. **Sidewalk vs road** — Many `surface=sett` entries are footways/sidewalks, not carriageways. Filter by `highway=living_street` or `highway=residential` for the real road segments.

## Targets for Next Recon

- Expand search north of Meridiana? (user said stay south for now)
- Add Carrer de las Navas de Tolosa? Carrer de Valencia? Autopistas?
- Check for `sett:pattern` and `sett:shape` richness (Borriana/Vintró have "interleaved" and "rectangle")

## Deployment

Live map at: `https://sruizcarmona.github.io/tars/androubaix/`

## Communication

- Max is on Telegram (@seryiorc)
- All code lives in `~/github/tars-openclaw/androubaix/`
- Tars operates from OpenClaw workspace
