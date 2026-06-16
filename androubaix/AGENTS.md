# Operation Pavé — Androubaix

**Project:** Mapping cobblestone/sett street surfaces in Sant Andreu (Barcelona)
**Status:** Active
**Operator:** Tars 🤖
**Codename:** Androubaix (Paris-Roubaix vibes, Sant Andreu edition)
**Last recon:** 2026-06-16 (Overpass via maps.mail.ru mirror)

## Mission

Identify, measure, and visualize all street segments with `surface=sett`, `surface=cobblestone`, and `surface=paving_stones` in the Sant Andreu district of Barcelona, focusing on the area **south of Avinguda Meridiana**.

## Current Targets (Confirmed, June 2026)

| Street | Surface | Road Length | Notes |
|---|---|---|---|
| Carrer de Pons i Gallarza | sett | 427m | Two contiguous segments, high quality |
| Carrer de Borriana | sett | 403m | Living street + pedestrian, continuous run Segre→Fabra i Puig |
| Carrer del Llenguadoc | sett | 391m | One continuous living_street way, very clean |
| Carrer de Coroleu | sett | 431m | Two living_street sett ways (235m + 196m); also 836m paving_stones footways |
| Carrer de Vintró | sett | 56m visible | OSM breaks from perpendicular asphalt; likely continuous |
| Carrer del Mercat | sett | 72m | Near market square, interleaved pattern |
| Carrer de Sant Adrià | sett / paving_stones | 19m sett + 717m paving_stones | Mostly paving_stones, minor sett segments |
| Carrer del Doctor Santponç | paving_stones | 490m | Two living_street ways (329m + 106m) plus 55m residential; paving_stones, not sett |

**Total confirmed sett (roads):** ~1,808m  
**Total confirmed paving_stones (roads + footways):** ~2,000m+ (Coroleu + Sant Adrià + Doctor Santponç)

## Files

- `index.html` — Leaflet.js visual map with colour-coded segments and length labels
- `fetch_data.js` — Node.js script to pull OSM data via Overpass API and calculate lengths
- `AGENTS.md` — This file

## How To Pick Up The Project

1. **Fetch fresh data** — Run `node fetch_data.js` to pull the latest from Overpass
2. **Update the map** — Add new segments to the `streets` array in `index.html`
3. **Push** — `git add && git commit && git push origin main` to deploy to GitHub Pages

## Overpass Setup

Primary instance: `https://maps.mail.ru/osm/tools/overpass/api/interpreter`  
Fallbacks: `overpass.kumi.systems`, `overpass-api.de`  
Bbox used: `41.420,2.170,41.450,2.210` (Sant Andreu, S of Meridiana)  
UA: `TarsAndroubaix/1.0 (cobot recon)` — required, default node UA gets 406.

## Known Puzzles

1. **OSM fragmentation** — Cross-streets break OSM ways, so a continuous sett stretch often appears as multiple tiny segments. The actual length is longer than the tagged data suggests. Cross-reference with the map visual.
2. **Asphalt gaps** — Many "asphalt" tagged segments are actually just perpendicular intersections (e.g., Carrer de Borriana at Fabra i Puig). The main street surface remains sett.
3. **Sidewalk vs road** — Many `surface=sett` entries are footways/sidewalks, not carriageways. Filter by `highway=living_street` or `highway=residential` for the real road segments. Doctor Santponç and Coroleu have both road sett/paving_stones AND extensive footway paving_stones — distinguish in the viz.
4. **`sett` vs `paving_stones` distinction** — Doctor Santponç is tagged entirely as `paving_stones` in OSM (not `sett`), but visually it's the same cobblestone character. Consider treating both as "pavé" in the map.

## Targets for Next Recon

- Expand search north of Meridiana? (user said stay south for now)
- Add Carrer de las Navas de Tolosa? Carrer de Valencia? Autopistas?
- Check for `sett:pattern` and `sett:shape` richness (Borriana/Vintró/Coroleu have "interleaved" and "rectangle")
- Verify Doctor Santponç — is it really paving_stones, or are the sett tags missing?

## Deployment

Live map at: `https://sruizcarmona.github.io/tars/androubaix/`

## Communication

- All code lives in `~/github/tars-openclaw/androubaix/`
- Tars operates from OpenClaw workspace
