// ghost-run :: Mario Kart-style ghost playback
// 2025 = ghost (white)   2026 = player (blue)

const DATA_PATHS = (file) => [
    `./data/ghosts/${file}`,
    `../data/ghosts/${file}`,
    `/ghost-run/data/ghosts/${file}`,
    `/tars/ghost-run/data/ghosts/${file}`,
];

async function loadJson(file) {
    for (const path of DATA_PATHS(file)) {
        try {
            const res = await fetch(path);
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

async function init() {
    try {
        const [ghost, player, align] = await Promise.all([
            loadJson('ghost_2025.json'),
            loadJson('ghost_2026.json'),
            loadJson('alignment.json').catch(() => null),
        ]);

        const rec = align && align.reconnect ? align.reconnect : null;

        const map = L.map('map');
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '\u00a9 OpenStreetMap',
        }).addTo(map);

        L.polyline(ghost.map(p => [p.lat, p.lng]),
            { color: '#ffffff', weight: 2, opacity: 0.35 }).addTo(map);

        if (rec) {
            // 2026 detour (before reconnection) highlighted in orange/dashed
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

        const ghostMarker = L.circleMarker([ghost[0].lat, ghost[0].lng],
            { radius: 9, color: '#fff', weight: 2, fillColor: '#fff', fillOpacity: 0.55 }).addTo(map);
        const playerMarker = L.circleMarker([player[0].lat, player[0].lng],
            { radius: 9, color: '#fff', weight: 2, fillColor: '#3498db', fillOpacity: 1 }).addTo(map);

        map.fitBounds(L.polyline(player.map(p => [p.lat, p.lng])).getBounds()
            .extend(L.polyline(ghost.map(p => [p.lat, p.lng])).getBounds()), { padding: [40, 40] });

        // --- state ---
        let mode = 'distance';   // 'distance' | 'time'
        let resynced = false;    // anchor at reconnection instead of activity start
        let offset = 0;          // manual nudge: metres (distance) or seconds (time)

        const $ = (id) => document.getElementById(id);
        const slider = $('dist-slider');
        const gapEl = $('gap-value');
        const gapLabel = $('gap-label');
        const hrEl = $('hr-delta');
        const paceEl = $('pace-delta');
        const progressEl = $('progress-label');
        const offsetEl = $('offset-value');
        const resyncBtn = $('resync-btn');

        const maxOf = (arr, key) => arr[arr.length - 1][key];

        function origins() {
            if (!resynced || !rec) return { d25: 0, d26: 0, t25: 0, t26: 0, gap0: 0 };
            return { d25: rec.d25, d26: rec.d26, t25: rec.t25, t26: rec.t26,
                     gap0: rec.t26 - rec.t25 };
        }

        function axisMax() {
            const o = origins();
            return mode === 'distance'
                ? Math.min(maxOf(ghost, 'distance') - o.d25, maxOf(player, 'distance') - o.d26)
                : Math.min(maxOf(ghost, 't') - o.t25, maxOf(player, 't') - o.t26);
        }

        function displayOffset() {
            const u = mode === 'distance' ? 'm' : 's';
            return `${offset > 0 ? '+' : ''}${offset} ${u}`;
        }

        function relabelAxis(resetOffset) {
            const max = axisMax();
            slider.min = 0;
            slider.max = max;
            slider.step = mode === 'distance' ? 5 : 1;
            slider.value = 0;
            if (resetOffset) { offset = 0; offsetEl.textContent = displayOffset(); }
            update();
        }

        function setMode(next) {
            if (next === mode) return;
            mode = next;
            $('mode-distance').classList.toggle('active', mode === 'distance');
            $('mode-time').classList.toggle('active', mode === 'time');
            relabelAxis(true);
        }

        function setResync(on) {
            resynced = on;
            resyncBtn.classList.toggle('active', resynced);
            relabelAxis(true);
        }

        function update() {
            const o = origins();
            const v = parseFloat(slider.value);
            let g, p, ahead, gapText, gapColor, progress, fromNote;

            if (mode === 'distance') {
                g = interp(ghost, 'distance', o.d25 + v + offset);
                p = interp(player, 'distance', o.d26 + v);
                const gap = (p.t - g.t) - o.gap0;
                ahead = gap < 0;
                gapText = fmtGap(gap);
                gapColor = ahead ? 'delta-pos' : 'delta-neg';
                gapLabel.textContent = (ahead ? '2026 ahead' : '2026 behind')
                    + (resynced ? ' \u00b7 from reconnection' : '');
                progress = `${(v / 1000).toFixed(2)} km`;
            } else {
                g = interp(ghost, 't', o.t25 + v + offset);
                p = interp(player, 't', o.t26 + v);
                const gap = (p.distance - o.d26) - (g.distance - o.d25);
                ahead = gap > 0;
                gapText = `${gap < 0 ? '\u2212' : '+'}${Math.abs(Math.round(gap))} m`;
                gapColor = ahead ? 'delta-pos' : 'delta-neg';
                gapLabel.textContent = (ahead ? '2026 ahead' : '2026 behind')
                    + (resynced ? ' \u00b7 from reconnection' : '');
                progress = `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')} elapsed`;
            }

            ghostMarker.setLatLng([g.lat, g.lng]);
            playerMarker.setLatLng([p.lat, p.lng]);

            gapEl.textContent = gapText;
            gapEl.className = `stat-value ${gapColor}`;

            if (g.hr != null && p.hr != null) {
                const d = Math.round(p.hr - g.hr);
                hrEl.textContent = `${d > 0 ? '+' : ''}${d} bpm`;
                hrEl.className = `stat-value ${d <= 0 ? 'delta-pos' : 'delta-neg'}`;
            } else {
                hrEl.textContent = '--';
                hrEl.className = 'stat-value';
            }

            if (g.pace != null && p.pace != null) {
                const d = p.pace - g.pace;
                paceEl.textContent = `${d > 0 ? '+' : '\u2212'}${Math.abs(d).toFixed(2)}`;
                paceEl.className = `stat-value ${d <= 0 ? 'delta-pos' : 'delta-neg'}`;
            } else {
                paceEl.textContent = '--';
                paceEl.className = 'stat-value';
            }

            progressEl.textContent = progress;
        }

        // --- wiring ---
        slider.addEventListener('input', update);
        $('mode-distance').addEventListener('click', () => setMode('distance'));
        $('mode-time').addEventListener('click', () => setMode('time'));

        const step = () => (mode === 'distance' ? 10 : 5);
        $('off-minus').addEventListener('click', () => { offset -= step(); offsetEl.textContent = displayOffset(); update(); });
        $('off-plus').addEventListener('click', () => { offset += step(); offsetEl.textContent = displayOffset(); update(); });
        $('off-reset').addEventListener('click', () => { offset = 0; offsetEl.textContent = displayOffset(); update(); });

        if (rec) {
            resyncBtn.addEventListener('click', () => setResync(!resynced));
            resyncBtn.textContent = `\u27f3 Resync @ ${(rec.d26 / 1000).toFixed(2)} km`;
        } else {
            resyncBtn.disabled = true;
            resyncBtn.title = 'No route divergence detected';
        }

        // detour note
        const noteEl = $('route-note');
        if (rec && align.extra_m) {
            noteEl.textContent = `2026 took a ${align.extra_m} m longer line `
                + `(diverge ${(align.divergence.d26 / 1000).toFixed(2)} km \u2192 rejoin ${(rec.d26 / 1000).toFixed(2)} km). `
                + `Resync so both start from the rejoin point.`;
        } else {
            noteEl.textContent = 'Routes are identical \u2014 no resync needed.';
        }

        relabelAxis(true);
        update();
    } catch (err) {
        console.error('ghost-run init failed:', err);
        alert('Error loading ghost data: ' + err.message);
    }
}

init();
