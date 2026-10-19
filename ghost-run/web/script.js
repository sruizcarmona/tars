// ghost-run :: Mario Kart-style ghost playback + race analysis
// 2025 = ghost (white)   2026 = player (blue)

const CACHE_BUST = '?v=' + Date.now();   // defeats stale GitHub Pages caching
const DATA_PATHS = (file) => [
    `./data/ghosts/${file}${CACHE_BUST}`,
    `../data/ghosts/${file}${CACHE_BUST}`,
    `/ghost-run/data/ghosts/${file}${CACHE_BUST}`,
    `/tars/ghost-run/data/ghosts/${file}${CACHE_BUST}`,
];

async function loadJson(file) {
    for (const path of DATA_PATHS(file)) {
        try {
            const res = await fetch(path, { cache: 'no-store' });
            if (res.ok) return await res.json();
        } catch (e) { /* try next */ }
    }
    throw new Error(`${file} not found`);
}

function lerpPoint(a, b, t) {
    const mix = (k) => {
        if (a[k] == null) return b[k];
        if (b[k] == null) return a[k];
        return a[k] + (b[k] - a[k]) * t;
    };
    return {
        lat: mix('lat'), lng: mix('lng'), alt: mix('alt'),
        hr: mix('hr'), pace: mix('pace'), distance: mix('distance'), t: mix('t'),
    };
}

function interp(data, key, value) {
    if (!data || !data.length) return null;
    if (value <= data[0][key]) return data[0];
    const n = data.length;
    if (value >= data[n - 1][key]) return data[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (data[mid][key] <= value) lo = mid; else hi = mid;
    }
    const a = data[lo], b = data[hi];
    const span = (b[key] - a[key]) || 1;
    return lerpPoint(a, b, (value - a[key]) / span);
}

function fmtGap(sec) {
    if (sec == null || !isFinite(sec)) return '--';       // never show nan
    const neg = sec < 0;
    const total = Math.round(Math.abs(sec));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${neg ? '\u2212' : '+'}${m}:${String(s).padStart(2, '0')}`;
}

const clampIdx = (arr, key, v) => {
    let i = 0;
    while (i < arr.length && arr[i][key] < v) i++;
    return i;
};

// Fail loudly if this script is paired with stale markup (cached page), instead
// of throwing a cryptic "Cannot read properties of null".
const REQUIRED_IDS = ['map', 'profile-chart', 'play-btn', 'speed-select',
    'progress-label', 'resync-btn', 'offset-value', 'time-delta', 'time-sub',
    'dist-delta', 'dist-sub', 'sections', 'sections-toggle', 'section-list',
    'route-note', 'off-minus', 'off-plus', 'off-reset'];

async function init() {
    try {
        const missing = REQUIRED_IDS.filter((id) => !document.getElementById(id));
        if (missing.length) {
            throw new Error('page/script version mismatch \u2014 missing element(s): '
                + missing.join(', ') + '. Hard-refresh (Ctrl/Cmd + Shift + R).');
        }

        const [ghost, player, align, sections] = await Promise.all([
            loadJson('ghost_2025.json'),
            loadJson('ghost_2026.json'),
            loadJson('alignment.json').catch(() => null),
            loadJson('sections.json').catch(() => []),
        ]);

        const rec = align && align.reconnect ? align.reconnect : null;

        const map = L.map('map');
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '\u00a9 OpenStreetMap',
        }).addTo(map);

        L.polyline(ghost.map(p => [p.lat, p.lng]),
            { color: '#ffffff', weight: 2, opacity: 0.35 }).addTo(map);

        if (rec) {
            const bIdx = clampIdx(player, 'distance', rec.d26);
            L.polyline(player.slice(0, bIdx + 1).map(p => [p.lat, p.lng]),
                { color: '#e67e22', weight: 3, opacity: 0.95, dashArray: '7 6' }).addTo(map);
            L.polyline(player.slice(bIdx).map(p => [p.lat, p.lng]),
                { color: '#3498db', weight: 3, opacity: 0.85 }).addTo(map);
            L.circleMarker([rec.lat, rec.lng],
                { radius: 7, color: '#fff', weight: 2, fillColor: '#e67e22', fillOpacity: 1 })
                .addTo(map).bindTooltip('Reconnection point');
        } else {
            L.polyline(player.map(p => [p.lat, p.lng]),
                { color: '#3498db', weight: 3, opacity: 0.85 }).addTo(map);
        }

        // player = filled dot, ghost = hollow ring drawn on top so BOTH stay
        // visible when distance-sync pins the two markers together
        const playerMarker = L.circleMarker([player[0].lat, player[0].lng],
            { radius: 7, color: '#fff', weight: 2, fillColor: '#3498db', fillOpacity: 1 }).addTo(map);
        const ghostMarker = L.circleMarker([ghost[0].lat, ghost[0].lng],
            { radius: 13, color: '#fff', weight: 3, fillColor: '#fff', fillOpacity: 0 }).addTo(map);
        const link = L.polyline([],
            { color: '#ffd24a', weight: 2, dashArray: '5 6', opacity: 0.95 }).addTo(map);

        map.fitBounds(L.polyline(player.map(p => [p.lat, p.lng])).getBounds()
            .extend(L.polyline(ghost.map(p => [p.lat, p.lng])).getBounds()), { padding: [40, 40] });

        // --- state ---
        const mode = 'time';       // always a clock-based race replay (no selector)
        let pos = 0;               // seconds elapsed since the 2026 rejoin
        let resynced = !!rec;      // resync ON by default when a detour exists
        let offset = 0;               // manual nudge (seconds)
        let playing = false, playT = 0, speed = 30, lastTs = null;

        const $ = (id) => document.getElementById(id);
        const timeEl = $('time-delta');
        const timeSub = $('time-sub');
        const distEl = $('dist-delta');
        const distSub = $('dist-sub');
        const progressEl = $('progress-label');
        const offsetEl = $('offset-value');
        const resyncBtn = $('resync-btn');
        const playBtn = $('play-btn');
        const graph = $('profile-chart');

        const maxOf = (arr, key) => arr[arr.length - 1][key];

        function origins() {
            if (!resynced || !rec) return { d25: 0, d26: 0, t25: 0, t26: 0, gap0: 0 };
            return { d25: rec.d25, d26: rec.d26, t25: rec.t25, t26: rec.t26,
                     gap0: rec.t26 - rec.t25 };
        }

        // shared course length, in metres, after the resync origin
        function maxDist() {
            const o = origins();
            return Math.min(maxOf(ghost, 'distance') - o.d25, maxOf(player, 'distance') - o.d26);
        }

        function axisMax() {
            const o = origins();
            return mode === 'distance'
                ? maxDist()
                : Math.min(maxOf(ghost, 't') - o.t25, maxOf(player, 't') - o.t26);
        }

        // Both deltas, always - anchored on the 2026 player's current state.
        //   timeDelta: seconds 2026 needed vs 2025 for the SAME point (>0 = slower)
        //   distDelta: metres 2026 is ahead at the SAME clock     (<0 = behind)
        function deltas() {
            const o = origins();
            const v = pos;
            let t26cur, d26c;
            if (mode === 'distance') {
                d26c = v;
                t26cur = interp(player, 'distance', o.d26 + v).t;
            } else {
                t26cur = o.t26 + v;
                d26c = interp(player, 't', t26cur).distance - o.d26;
            }
            // same place (the manual nudge adjusts the distance anchor)
            const gAtD = interp(ghost, 'distance',
                o.d25 + d26c + (mode === 'distance' ? offset : 0));
            const timeDelta = (t26cur - gAtD.t) - o.gap0;
            // same clock (true tracks, no nudge)
            const gAtT = interp(ghost, 't', o.t25 + (t26cur - o.t26));
            const distDelta = d26c - (gAtT.distance - o.d25);
            return { timeDelta, distDelta };
        }

        // Course position of each year at the current playhead, for the rings.
        function ringInfo() {
            const o = origins();
            const v = pos;
            if (mode === 'distance') return { d26c: v, d25c: v + offset };
            return {
                d26c: interp(player, 't', o.t26 + v).distance - o.d26,
                d25c: interp(ghost, 't', o.t25 + v + offset).distance - o.d25,
            };
        }

        function displayOffset() {
            const u = mode === 'distance' ? 'm' : 's';
            return `${offset > 0 ? '+' : ''}${offset} ${u}`;
        }

        // --- profile strip ---
        let seriesKey = '', seriesCache = null;
        // Signed "who is ahead" over the COURSE (x = metres from rejoin):
        //   > 0 = 2026 ahead. Distance mode measures TIME, so a negative time
        //   gap means ahead; Time mode measures DISTANCE, so positive = ahead.
        function aheadnessAtDist(d) {
            const o = origins();
            const p = interp(player, 'distance', o.d26 + d);
            const g = interp(ghost, 'distance', o.d25 + d);
            const timeDelta = (p.t - g.t) - o.gap0;
            if (mode === 'distance') return -timeDelta;
            const gAtT = interp(ghost, 't', o.t25 + (p.t - o.t26));
            return d - (gAtT.distance - o.d25);
        }

        function seriesFor() {
            const key = `${mode}|${resynced}|${rec ? rec.d26 : 0}`;
            if (key === seriesKey && seriesCache) return seriesCache;
            const max = maxDist();
            const N = 260, vals = [];
            let maxAbs = 1;
            for (let i = 0; i <= N; i++) {
                const a = aheadnessAtDist(max * i / N);
                vals.push(a);
                maxAbs = Math.max(maxAbs, Math.abs(a));
            }
            seriesKey = key;
            seriesCache = { vals, maxAbs, max, N };
            return seriesCache;
        }

        const altAtDist = (d) => {
            const o = origins();
            const lim = maxDist();
            const dd = Math.max(0, Math.min(lim, d));
            return interp(player, 'distance', o.d26 + dd).alt;
        };

        // Course profile: elevation silhouette (lower band), difference overlay
        // (upper band) and one synced ring per year sitting on the terrain.
        function drawProfile() {
            const w = graph.clientWidth || 600, h = graph.clientHeight || 96;
            const dpr = window.devicePixelRatio || 1;
            if (graph.width !== Math.round(w * dpr) || graph.height !== Math.round(h * dpr)) {
                graph.width = Math.round(w * dpr);
                graph.height = Math.round(h * dpr);
            }
            const ctx = graph.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#111';
            ctx.fillRect(0, 0, w, h);

            const max = maxDist();
            const X = (d) => (max ? w * Math.max(0, Math.min(max, d)) / max : 0);
            const N = 260;

            // ---- lower band: elevation silhouette ----
            const eTop = h * 0.50, eBot = h - 3;
            const alt = [];
            let aMin = Infinity, aMax = -Infinity;
            for (let i = 0; i <= N; i++) {
                const a = altAtDist(max * i / N);
                alt.push(a);
                if (a != null && isFinite(a)) {
                    aMin = Math.min(aMin, a);
                    aMax = Math.max(aMax, a);
                }
            }
            if (!isFinite(aMin) || aMax <= aMin) { aMin = 0; aMax = 1; }
            const AY = (a) => eBot - ((a == null ? aMin : a) - aMin) / (aMax - aMin) * (eBot - eTop);

            ctx.beginPath();
            ctx.moveTo(0, eBot);
            for (let i = 0; i <= N; i++) ctx.lineTo(w * i / N, AY(alt[i]));
            ctx.lineTo(w, eBot);
            ctx.closePath();
            ctx.fillStyle = 'rgba(150,180,220,0.15)';
            ctx.fill();

            ctx.beginPath();
            for (let i = 0; i <= N; i++) {
                const x = w * i / N, y = AY(alt[i]);
                if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
            }
            ctx.strokeStyle = 'rgba(150,180,220,0.55)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // ---- upper band: difference overlay ----
            const S = seriesFor();
            const mid = h * 0.24, amp = h * 0.21;
            for (let i = 0; i < S.N; i++) {
                const x0 = w * i / S.N;
                const bw = Math.max(1, w * (i + 1) / S.N - x0);
                const a = S.vals[i];                      // > 0 = 2026 ahead
                const y = mid - (a / S.maxAbs) * amp;     // ahead rises above the line
                ctx.fillStyle = a > 0 ? 'rgba(76,175,80,0.75)' : 'rgba(244,67,54,0.75)';
                ctx.fillRect(x0, Math.min(mid, y), bw, Math.abs(y - mid));
            }
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();

            // ---- synced ring per year, sitting on the terrain ----
            const R = ringInfo();
            const ring = (d, colour, filled) => {
                const x = X(d), y = AY(altAtDist(d));
                ctx.beginPath();
                ctx.arc(x, y, filled ? 4 : 7, 0, Math.PI * 2);
                if (filled) {
                    ctx.fillStyle = colour; ctx.fill();
                    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
                } else {
                    ctx.strokeStyle = colour; ctx.lineWidth = 3;
                }
                ctx.stroke();
            };
            ring(R.d25c, '#ffffff', false);   // 2025 ring
            ring(R.d26c, '#3498db', true);    // 2026 dot

            // ---- playhead ----
            const xc = X(R.d26c);
            ctx.strokeStyle = 'rgba(52,152,219,0.9)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(xc, 0); ctx.lineTo(xc, h); ctx.stroke();

            // ---- labels ----
            ctx.font = '9px sans-serif';
            ctx.fillStyle = '#4caf50'; ctx.fillText('2026 ahead', 4, 10);
            ctx.fillStyle = '#f44336'; ctx.fillText('2026 behind', 4, mid + 11);
            const scale = mode === 'time'
                ? `\u00b1${Math.round(S.maxAbs)} m`
                : `\u00b1${fmtGap(S.maxAbs).replace('+', '')}`;
            ctx.fillStyle = '#888'; ctx.textAlign = 'right';
            ctx.fillText(scale, w - 4, 10);
            ctx.fillStyle = '#6f8cb0';
            ctx.fillText(`elev ${Math.round(aMin)}\u2013${Math.round(aMax)} m`, w - 4, eBot - 2);
            ctx.textAlign = 'left';
        }

        // --- main update ---
        function update() {
            const o = origins();
            const v = pos;
            let g, p, progress;

            g = interp(ghost, 't', o.t25 + v + offset);
            p = interp(player, 't', o.t26 + v);
            const R0 = ringInfo();
            progress = `${(R0.d26c / 1000).toFixed(2)} / ${(maxDist() / 1000).toFixed(2)} km`;

            ghostMarker.setLatLng([g.lat, g.lng]);
            playerMarker.setLatLng([p.lat, p.lng]);
            link.setLatLngs([[g.lat, g.lng], [p.lat, p.lng]]);
            progressEl.textContent = progress;

            // both deltas, always present
            const D = deltas();
            const tFaster = D.timeDelta < 0;    // 2026 quicker to this point
            const dAhead = D.distDelta > 0;     // 2026 further along at this clock

            timeEl.textContent = fmtGap(D.timeDelta);
            timeEl.className = `stat-value big ${tFaster ? 'delta-pos' : 'delta-neg'}`;
            timeSub.textContent = tFaster ? '2026 faster to here' : '2026 slower to here';

            distEl.textContent = isFinite(D.distDelta)
                ? `${D.distDelta < 0 ? '\u2212' : '+'}${Math.abs(Math.round(D.distDelta))} m`
                : '--';
            distEl.className = `stat-value big ${dAhead ? 'delta-pos' : 'delta-neg'}`;
            distSub.textContent = dAhead ? '2026 ahead' : '2026 behind';

            drawProfile();
        }

        // --- playback ---
        // single source of truth for the playhead: seconds since the rejoin
        function setPos(v) {
            pos = Math.max(0, Math.min(axisMax(), v));
            playT = origins().t26 + pos;
            update();
        }

        function seekToTime(T) { setPos(T - origins().t26); }

        function stopPlay() { playing = false; playBtn.innerHTML = '&#9654;'; }

        function stepPlay(ts) {
            if (!playing) return;
            if (lastTs == null) lastTs = ts;
            const dt = (ts - lastTs) / 1000;
            lastTs = ts;
            playT += dt * speed;
            const pMax = maxOf(player, 't');
            if (playT >= pMax) { playT = pMax; seekToTime(playT); stopPlay(); return; }
            seekToTime(playT);
            requestAnimationFrame(stepPlay);
        }

        playBtn.addEventListener('click', () => {
            if (playing) { stopPlay(); return; }
            if (playT >= maxOf(player, 't') - 1) playT = origins().t26;
            playing = true;
            playBtn.innerHTML = '&#10074;&#10074;';
            lastTs = null;
            requestAnimationFrame(stepPlay);
        });
        $('speed-select').addEventListener('change', (e) => { speed = parseFloat(e.target.value) || 1; });

        // --- resync ---
        function resetView(resetOffset) {
            const o = origins();
            pos = 0;
            playT = o.t26;
            if (resetOffset) { offset = 0; offsetEl.textContent = displayOffset(); }
            seriesKey = '';
            update();
        }

        function setResync(on) {
            if (on === resynced) return;
            stopPlay();
            resynced = on;
            resyncBtn.classList.toggle('active', resynced);
            resetView(true);
        }

        // --- wiring --- (the profile strip IS the scrubber)
        graph.addEventListener('click', (e) => {
            // profile x-axis is course DISTANCE; convert the click to a clock pos
            const r = graph.getBoundingClientRect();
            const frac = (e.clientX - r.left) / r.width;
            const o = origins();
            const d = maxDist() * Math.max(0, Math.min(1, frac));
            stopPlay();
            setPos(interp(player, 'distance', o.d26 + d).t - o.t26);
        });

        const step = () => (mode === 'distance' ? 10 : 5);
        $('off-minus').addEventListener('click', () => { offset -= step(); offsetEl.textContent = displayOffset(); update(); });
        $('off-plus').addEventListener('click', () => { offset += step(); offsetEl.textContent = displayOffset(); update(); });
        $('off-reset').addEventListener('click', () => { offset = 0; offsetEl.textContent = displayOffset(); update(); });

        if (rec) {
            resyncBtn.classList.toggle('active', resynced);
            resyncBtn.addEventListener('click', () => setResync(!resynced));
            resyncBtn.textContent = `\u27f3 Resync @ ${(rec.d26 / 1000).toFixed(2)} km`;
        } else {
            resyncBtn.disabled = true;
        }

        // --- sections panel ---
        const listEl = $('section-list');
        const icon = { climb: '\u25b2', descent: '\u25bc', flat: '\u2014' };
        (sections || []).forEach((s) => {
            const el = document.createElement('div');
            el.className = 'sec';
            const aheadSec = s.gap_s < 0;
            el.innerHTML = `<span class="nm">${icon[s.type] || ''} ${(s.start_m / 1000).toFixed(2)}\u2013${(s.end_m / 1000).toFixed(2)} km</span>`
                + `<span class="gp ${aheadSec ? 'delta-pos' : 'delta-neg'}">${fmtGap(s.gap_s)}</span>`;
            el.title = `${s.type} \u00b7 ${Math.round(s.dist_m)} m \u00b7 gain ${s.gain_m > 0 ? '+' : ''}${Math.round(s.gain_m)} m`
                + ` \u00b7 pace ${s.pace25} \u2192 ${s.pace26} min/km`;
            el.addEventListener('click', () => {
                setResync(true);
                const o2 = origins();
                const dm = Math.min(s.start_m, maxDist());
                stopPlay();
                setPos(interp(player, 'distance', o2.d26 + dm).t - o2.t26);
            });
            listEl.appendChild(el);
        });
        if (!sections || !sections.length) listEl.innerHTML = '<div class="sec"><span class="nm">no sections</span></div>';

        // collapsible panel — collapsed by default on narrow screens
        const sectionsEl = $('sections');
        const sectionsToggle = $('sections-toggle');
        sectionsEl.classList.toggle('collapsed', window.innerWidth < 760);
        const syncToggle = () => sectionsToggle.setAttribute('aria-expanded',
            String(!sectionsEl.classList.contains('collapsed')));
        syncToggle();
        sectionsToggle.addEventListener('click', () => {
            sectionsEl.classList.toggle('collapsed');
            syncToggle();
        });

        // route note
        const noteEl = $('route-note');
        if (rec && align.extra_m) {
            noteEl.textContent = `2026 took a ${align.extra_m} m longer line `
                + `(diverges ${(align.divergence.d26 / 1000).toFixed(2)} km \u2192 rejoins ${(rec.d26 / 1000).toFixed(2)} km). `
                + `Resync is ON, so both years are compared from the rejoin, where the gap starts at zero. `
                + `Both markers run on the same clock at their real recorded speeds \u2014 `
                + `press play, or click the profile to jump.`;
        } else {
            noteEl.textContent = 'Routes are identical \u2014 no resync needed.';
        }

        resetView(true);
        update();
    } catch (err) {
        console.error('ghost-run init failed:', err);
        alert('Error loading ghost data: ' + err.message);
    }
}

init();
