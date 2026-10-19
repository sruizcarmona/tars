// ghost-run :: Mario Kart-style ghost playback
// 2025 = ghost (white)   2026 = player (blue)

async function loadGhostData(year) {
    const candidates = [
        `./data/ghosts/ghost_${year}.json`,
        `../data/ghosts/ghost_${year}.json`,
        `/ghost-run/data/ghosts/ghost_${year}.json`,
        `/tars/ghost-run/data/ghosts/ghost_${year}.json`,
    ];
    for (const path of candidates) {
        try {
            const res = await fetch(path);
            if (res.ok) return await res.json();
        } catch (e) { /* try next */ }
    }
    throw new Error(`ghost_${year}.json not found`);
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
    // signed mm:ss, e.g. "1:05" ahead or "2:13" behind
    const neg = sec < 0;
    const total = Math.round(Math.abs(sec));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${neg ? '\u2212' : '+'}${m}:${String(s).padStart(2, '0')}`;
}

function fmtPace(pace) {
    if (pace == null) return '--';
    const m = Math.floor(pace);
    const s = Math.round((pace - m) * 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

async function init() {
    try {
        const ghost = await loadGhostData('2025');
        const player = await loadGhostData('2026');

        const map = L.map('map');
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '\u00a9 OpenStreetMap',
        }).addTo(map);

        const ghostLine = L.polyline(ghost.map(p => [p.lat, p.lng]),
            { color: '#ffffff', weight: 2, opacity: 0.35 }).addTo(map);
        const playerLine = L.polyline(player.map(p => [p.lat, p.lng]),
            { color: '#3498db', weight: 3, opacity: 0.85 }).addTo(map);

        const ghostMarker = L.circleMarker([ghost[0].lat, ghost[0].lng],
            { radius: 9, color: '#fff', weight: 2, fillColor: '#fff', fillOpacity: 0.55 }).addTo(map);
        const playerMarker = L.circleMarker([player[0].lat, player[0].lng],
            { radius: 9, color: '#fff', weight: 2, fillColor: '#3498db', fillOpacity: 1 }).addTo(map);

        const bounds = playerLine.getBounds().extend(ghostLine.getBounds());
        map.fitBounds(bounds, { padding: [40, 40] });

        // --- state ---
        let mode = 'distance';   // 'distance' | 'time'
        let offset = 0;          // distance mode: metres; time mode: seconds

        const slider = document.getElementById('dist-slider');
        const gapEl = document.getElementById('gap-value');
        const gapLabel = document.getElementById('gap-label');
        const hrEl = document.getElementById('hr-delta');
        const paceEl = document.getElementById('pace-delta');
        const progressEl = document.getElementById('progress-label');
        const offsetEl = document.getElementById('offset-value');
        const modeDistBtn = document.getElementById('mode-distance');
        const modeTimeBtn = document.getElementById('mode-time');

        const maxOf = (arr, key) => arr[arr.length - 1][key];

        function axisMax() {
            return mode === 'distance'
                ? Math.min(maxOf(ghost, 'distance'), maxOf(player, 'distance'))
                : Math.min(maxOf(ghost, 't'), maxOf(player, 't'));
        }

        function relabelAxis() {
            const max = axisMax();
            slider.min = 0;
            slider.max = max;
            slider.step = mode === 'distance' ? 5 : 1;
            if (parseFloat(slider.value) > max) slider.value = 0;
            // reset offset when switching axes (unit changes)
            offset = 0;
            offsetEl.textContent = mode === 'distance' ? '0 m' : '0 s';
            update();
        }

        function setMode(next) {
            if (next === mode) return;
            mode = next;
            modeDistBtn.classList.toggle('active', mode === 'distance');
            modeTimeBtn.classList.toggle('active', mode === 'time');
            relabelAxis();
        }

        function update() {
            const v = parseFloat(slider.value);
            let g, p, ahead, gapText, gapColor, progress;

            if (mode === 'distance') {
                g = interp(ghost, 'distance', v + offset);
                p = interp(player, 'distance', v);
                const gap = p.t - g.t;            // >0 => 2026 slower here
                ahead = gap < 0;
                gapText = fmtGap(gap);
                gapColor = ahead ? 'delta-pos' : 'delta-neg';
                gapLabel.textContent = ahead ? '2026 ahead (time)' : '2026 behind (time)';
                progress = `${(v / 1000).toFixed(2)} km`;
            } else {
                g = interp(ghost, 't', v + offset);
                p = interp(player, 't', v);
                const gap = p.distance - g.distance; // >0 => 2026 further along
                ahead = gap > 0;
                gapText = `${gap < 0 ? '\u2212' : '+'}${Math.abs(Math.round(gap))} m`;
                gapColor = ahead ? 'delta-pos' : 'delta-neg';
                gapLabel.textContent = ahead ? '2026 ahead (distance)' : '2026 behind (distance)';
                progress = `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')} elapsed`;
            }

            ghostMarker.setLatLng([g.lat, g.lng]);
            playerMarker.setLatLng([p.lat, p.lng]);

            gapEl.textContent = gapText;
            gapEl.className = `stat-value ${gapColor}`;

            // HR delta (rounded, no decimals)
            if (g.hr != null && p.hr != null) {
                const d = Math.round(p.hr - g.hr);
                hrEl.textContent = `${d > 0 ? '+' : ''}${d} bpm`;
                hrEl.className = `stat-value ${d <= 0 ? 'delta-pos' : 'delta-neg'}`;
            } else {
                hrEl.textContent = '--';
                hrEl.className = 'stat-value';
            }

            // Pace delta (2 decimals)
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
        modeDistBtn.addEventListener('click', () => setMode('distance'));
        modeTimeBtn.addEventListener('click', () => setMode('time'));

        const step = () => (mode === 'distance' ? 25 : 5); // m or s
        document.getElementById('off-minus').addEventListener('click', () => { offset -= step(); update(); offsetEl.textContent = displayOffset(); });
        document.getElementById('off-plus').addEventListener('click', () => { offset += step(); update(); offsetEl.textContent = displayOffset(); });
        document.getElementById('off-reset').addEventListener('click', () => { offset = 0; update(); offsetEl.textContent = displayOffset(); });

        function displayOffset() {
            if (mode === 'distance') return `${offset > 0 ? '+' : ''}${offset} m`;
            return `${offset > 0 ? '+' : ''}${offset} s`;
        }

        relabelAxis();
        update();
    } catch (err) {
        console.error('ghost-run init failed:', err);
        alert('Error loading ghost data: ' + err.message);
    }
}

init();
