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

async function init() {
    try {
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

        const ghostMarker = L.circleMarker([ghost[0].lat, ghost[0].lng],
            { radius: 9, color: '#fff', weight: 2, fillColor: '#fff', fillOpacity: 0.55 }).addTo(map);
        const playerMarker = L.circleMarker([player[0].lat, player[0].lng],
            { radius: 9, color: '#fff', weight: 2, fillColor: '#3498db', fillOpacity: 1 }).addTo(map);

        map.fitBounds(L.polyline(player.map(p => [p.lat, p.lng])).getBounds()
            .extend(L.polyline(ghost.map(p => [p.lat, p.lng])).getBounds()), { padding: [40, 40] });

        // --- state ---
        let mode = 'distance';
        let resynced = false;
        let offset = 0;               // manual nudge
        let playing = false, playT = 0, speed = 30, lastTs = null;

        const $ = (id) => document.getElementById(id);
        const slider = $('dist-slider');
        const gapEl = $('gap-value');
        const gapLabel = $('gap-label');
        const hrEl = $('hr-delta');
        const paceEl = $('pace-delta');
        const progressEl = $('progress-label');
        const offsetEl = $('offset-value');
        const resyncBtn = $('resync-btn');
        const playBtn = $('play-btn');
        const graph = $('gap-graph');

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

        function gapAt(v, useOffset) {
            const o = origins();
            const off = useOffset ? offset : 0;
            if (mode === 'distance') {
                const g = interp(ghost, 'distance', o.d25 + v + off);
                const p = interp(player, 'distance', o.d26 + v);
                return (p.t - g.t) - o.gap0;
            }
            const g = interp(ghost, 't', o.t25 + v + off);
            const p = interp(player, 't', o.t26 + v);
            return (p.distance - o.d26) - (g.distance - o.d25);
        }

        function displayOffset() {
            const u = mode === 'distance' ? 'm' : 's';
            return `${offset > 0 ? '+' : ''}${offset} ${u}`;
        }

        // --- gap graph ---
        let seriesKey = '', seriesCache = null;
        function seriesFor() {
            const key = `${mode}|${resynced}|${rec ? rec.d26 : 0}`;
            if (key === seriesKey && seriesCache) return seriesCache;
            const max = axisMax();
            const N = 260, vals = [];
            let maxAbs = 1;
            for (let i = 0; i <= N; i++) {
                const g = gapAt(max * i / N, false);
                vals.push(g);
                maxAbs = Math.max(maxAbs, Math.abs(g));
            }
            seriesKey = key;
            seriesCache = { vals, maxAbs, max, N };
            return seriesCache;
        }

        function drawGraph() {
            const w = graph.clientWidth || 600, h = graph.clientHeight || 56;
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

            const S = seriesFor();
            const mid = h / 2, amp = h / 2 - 3;
            for (let i = 0; i < S.N; i++) {
                const x0 = w * i / S.N;
                const bw = Math.max(1, w * (i + 1) / S.N - x0);
                const g = S.vals[i];
                const y = mid + (g / S.maxAbs) * amp;
                ctx.fillStyle = g < 0 ? 'rgba(76,175,80,0.8)' : 'rgba(244,67,54,0.8)';
                ctx.fillRect(x0, Math.min(mid, y), bw, Math.abs(y - mid));
            }
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();

            const max = axisMax();
            const cv = parseFloat(slider.value) || 0;
            const x = w * (max ? cv / max : 0);
            ctx.strokeStyle = '#3498db'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();

            ctx.font = '9px sans-serif';
            ctx.fillStyle = '#4caf50'; ctx.fillText('2026 ahead', 4, 11);
            ctx.fillStyle = '#f44336'; ctx.fillText('2026 behind', 4, h - 4);
        }

        // --- main update ---
        function update() {
            const o = origins();
            const v = parseFloat(slider.value) || 0;
            let g, p, gapText, gapColor, ahead, progress;

            if (mode === 'distance') {
                g = interp(ghost, 'distance', o.d25 + v + offset);
                p = interp(player, 'distance', o.d26 + v);
                const gap = (p.t - g.t) - o.gap0;
                ahead = gap < 0;
                gapText = fmtGap(gap);
                progress = `${(v / 1000).toFixed(2)} km`;
            } else {
                g = interp(ghost, 't', o.t25 + v + offset);
                p = interp(player, 't', o.t26 + v);
                const gap = (p.distance - o.d26) - (g.distance - o.d25);
                ahead = gap > 0;
                gapText = isFinite(gap)
                    ? `${gap < 0 ? '\u2212' : '+'}${Math.abs(Math.round(gap))} m` : '--';
                progress = `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')} elapsed`;
            }

            gapColor = ahead ? 'delta-pos' : 'delta-neg';
            gapLabel.textContent = (ahead ? '2026 ahead' : '2026 behind')
                + (resynced ? ' \u00b7 from rejoin' : '');

            ghostMarker.setLatLng([g.lat, g.lng]);
            playerMarker.setLatLng([p.lat, p.lng]);

            gapEl.textContent = gapText;
            gapEl.className = `stat-value ${gapColor}`;
            progressEl.textContent = progress;

            if (g.hr != null && p.hr != null) {
                const d = Math.round(p.hr - g.hr);
                hrEl.textContent = `${d > 0 ? '+' : ''}${d} bpm`;
                hrEl.className = `stat-value ${d <= 0 ? 'delta-pos' : 'delta-neg'}`;
            } else {
                hrEl.textContent = '--'; hrEl.className = 'stat-value';
            }

            if (g.pace != null && p.pace != null) {
                const d = p.pace - g.pace;
                paceEl.textContent = `${d > 0 ? '+' : '\u2212'}${Math.abs(d).toFixed(2)}`;
                paceEl.className = `stat-value ${d <= 0 ? 'delta-pos' : 'delta-neg'}`;
            } else {
                paceEl.textContent = '--'; paceEl.className = 'stat-value';
            }

            drawGraph();
        }

        // --- playback ---
        function syncPlayFromSlider() {
            const o = origins();
            const v = parseFloat(slider.value) || 0;
            if (mode === 'distance') {
                const p = interp(player, 'distance', o.d26 + v);
                playT = p.t;
            } else {
                playT = o.t26 + v;
            }
        }

        function seekToTime(T) {
            const o = origins();
            const p = interp(player, 't', T);
            let v = mode === 'distance' ? (p.distance - o.d26) : (T - o.t26);
            v = Math.max(0, Math.min(axisMax(), v));
            slider.value = v;
            update();
        }

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

        // --- axis / mode / resync ---
        function relabelAxis(resetOffset) {
            const o = origins();
            slider.min = 0;
            slider.max = axisMax();
            slider.step = mode === 'distance' ? 5 : 1;
            slider.value = 0;
            playT = o.t26;
            if (resetOffset) { offset = 0; offsetEl.textContent = displayOffset(); }
            seriesKey = '';
            update();
        }

        function setMode(next) {
            if (next === mode) return;
            stopPlay();
            mode = next;
            $('mode-distance').classList.toggle('active', mode === 'distance');
            $('mode-time').classList.toggle('active', mode === 'time');
            relabelAxis(true);
        }

        function setResync(on) {
            if (on === resynced) return;
            stopPlay();
            resynced = on;
            resyncBtn.classList.toggle('active', resynced);
            relabelAxis(true);
        }

        // --- wiring ---
        slider.addEventListener('input', () => { stopPlay(); syncPlayFromSlider(); update(); });

        graph.addEventListener('click', (e) => {
            const r = graph.getBoundingClientRect();
            const frac = (e.clientX - r.left) / r.width;
            slider.value = Math.max(0, Math.min(axisMax(), axisMax() * frac));
            stopPlay(); syncPlayFromSlider(); update();
        });

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
                slider.value = Math.min(s.start_m, axisMax());
                stopPlay(); syncPlayFromSlider(); update();
            });
            listEl.appendChild(el);
        });
        if (!sections || !sections.length) listEl.innerHTML = '<div class="sec"><span class="nm">no sections</span></div>';

        // route note
        const noteEl = $('route-note');
        if (rec && align.extra_m) {
            noteEl.textContent = `2026 took a ${align.extra_m} m longer line `
                + `(diverges ${(align.divergence.d26 / 1000).toFixed(2)} km \u2192 rejoins ${(rec.d26 / 1000).toFixed(2)} km). `
                + `Resync so both are compared from the rejoin.`;
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
