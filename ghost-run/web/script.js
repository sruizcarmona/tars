async function loadGhostData(year) {
    // Attempt to find the data file relative to the current script location
    // Works for both local file system and GitHub Pages
    const paths = [
        `./data/ghosts/ghost_${year}.json`,
        `../data/ghosts/ghost_${year}.json`,
        `/ghost-run/data/ghosts/ghost_${year}.json`
    ];

    for (const path of paths) {
        try {
            const response = await fetch(path);
            if (response.ok) return await response.json();
        } catch (e) {
            continue;
        }
    }
    throw new Error(`Could not find ghost data for ${year}`);
}

function formatPace(pace) {
    if (pace === null || pace === undefined) return "--";
    const minutes = Math.floor(pace);
    const seconds = Math.round((pace - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function interpolate(data, distance) {
    if (!data || data.length === 0) return null;
    if (distance <= data[0].distance) return data[0];
    if (distance >= data[data.length - 1].distance) return data[data.length - 1];

    for (let i = 0; i < data.length - 1; i++) {
        if (distance >= data[i].distance && distance <= data[i + 1].distance) {
            const p1 = data[i];
            const p2 = data[i + 1];
            const t = (distance - p1.distance) / (p2.distance - p1.distance);
            
            return {
                lat: p1.lat + (p2.lat - p1.lat) * t,
                lng: p1.lng + (p2.lng - p1.lng) * t,
                alt: p1.alt + (p2.alt - p1.alt) * t,
                hr: p1.hr + (p2.hr - p1.hr) * t,
                pace: p1.pace + (p2.pace - p1.pace) * t,
                distance: distance
            };
        }
    }
}

async function init() {
    try {
        const ghost2025 = await loadGhostData('2025');
        const player2026 = await loadGhostData('2026');

        const map = L.map('map').setView([ghost2025[0].lat, ghost2025[0].lng], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(map);

        // Draw paths
        const path2025 = L.polyline(ghost2025.map(p => [p.lat, p.lng]), {color: 'white', weight: 2, opacity: 0.4}).addTo(map);
        const path2026 = L.polyline(player2026.map(p => [p.lat, p.lng]), {color: '#3498db', weight: 3, opacity: 0.8}).addTo(map);

        // Markers
        const ghostMarker = L.circleMarker([ghost2025[0].lat, ghost2025[0].lng], {
            radius: 8, color: 'white', fillOpacity: 0.5, fillWeight: 0
        }).addTo(map);
        
        const playerMarker = L.circleMarker([player2026[0].lat, player2026[0].lng], {
            radius: 8, color: '#3498db', fillOpacity: 1, fillWeight: 0
        }).addTo(map);

        const slider = document.getElementById('dist-slider');
        const paceDeltaEl = document.getElementById('pace-delta');
        const hrDeltaEl = document.getElementById('hr-delta');

        const maxDist = Math.min(ghost2025[ghost2025.length - 1].distance, player2026[player2026.length - 1].distance);
        const minDist = Math.max(ghost2025[0].distance, player2026[0].distance);
        
        slider.min = minDist;
        slider.max = maxDist;
        slider.value = minDist;

        function update() {
            const dist = parseFloat(slider.value);
            const p25 = interpolate(ghost2025, dist);
            const p26 = interpolate(player2026, dist);

            if (!p25 || !p26) return;

            ghostMarker.setLatLng([p25.lat, p25.lng]);
            playerMarker.setLatLng([p26.lat, p26.lng]);

            // Pace Delta
            if (p25.pace && p26.pace) {
                const delta = p26.pace - p25.pace;
                const sign = delta <= 0 ? '-' : '+';
                const color = delta <= 0 ? 'delta-pos' : 'delta-neg';
                paceDeltaEl.textContent = `${sign}${Math.abs(delta).toFixed(2)} min/km`;
                paceDeltaEl.className = `stat-value ${color}`;
            }

            // HR Delta
            if (p25.hr && p26.hr) {
                const delta = p26.hr - p25.hr;
                const sign = delta >= 0 ? '+' : '';
                const color = delta >= 0 ? 'delta-neg' : 'delta-pos';
                hrDeltaEl.textContent = `${sign}${delta} bpm`;
                hrDeltaEl.className = `stat-value ${color}`;
            }
        }

        slider.oninput = update;
        update();
    } catch (error) {
        console.error("Initialization failed:", error);
        alert("Error loading ghost data: " + error.message + ". Please check if the data files exist in the repo.");
    }
}

init();
