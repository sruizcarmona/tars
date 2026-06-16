const axios = require('axios');

/**
 * Operation Pavé Data Fetcher
 * This script fetches road geometry and surface tags for specific targets 
 * and prepares them for a Leaflet.js visualization.
 */

const OVERPASS_URL = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';
const OVERPASS_FALLBACKS = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter'
];
const TARGET_SQUARE = {
    lat: 41.4305,
    lon: 2.1920,
    radius: 1000 // 1km
};

const TARGET_STREETS = [
    "Carrer de Borriana",
    "Carrer de Vintró",
    "Carrer de Pons i Gallarza",
    "Carrer del Mercat",
    "Carrer de Sant Adrià",
    "Carrer del Doctor Santponç",
    "Carrer de Llenguadoc",
    "Carrer de Coroleu"
];

async function fetchStreetData() {
    // Query for all ways that match our targeting criteria
    // Only focusing on the Sant Andreu sector (south of Meridiana)
    // Bbox: ~41.420,2.170 to 41.450,2.210 (Sant Andreu S of Meridiana)
    const BBOX = '41.420,2.170,41.450,2.210';
    const query = `
        [out:json][timeout:25];
        (
          way(${BBOX})[name~"${TARGET_STREETS.join('|')}"][surface~"sett|cobblestone|paving_stones"];
          way(${BBOX})[name~"${TARGET_STREETS.join('|')}"];
        );
        out geom;
    `;

    try {
        console.log("Executing Operation Pavé reconnaissance query...");
        const post = (url) => axios.post(url, new URLSearchParams({ data: query }).toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'TarsAndroubaix/1.0 (cobot recon)'
            },
            timeout: 60000
        });
        let response;
        try {
            response = await post(OVERPASS_URL);
        } catch (e) {
            console.warn(`Primary ${OVERPASS_URL} failed (${e.response?.status || e.message}), trying fallbacks...`);
            for (const fb of OVERPASS_FALLBACKS) {
                try { response = await post(fb); console.log(`Fallback ${fb} OK`); break; }
                catch (e2) { console.warn(`Fallback ${fb} failed: ${e2.response?.status || e2.message}`); }
            }
            if (!response) throw new Error('All Overpass instances failed');
        }
        
        const processed = response.data.elements.map(way => {
            // Calculate length of the segment
            let length = 0;
            const geom = way.geometry;
            for (let i = 0; i < geom.length - 1; i++) {
                length += calculateDistance(geom[i], geom[i+1]);
            }

            return {
                id: way.id,
                name: way.tags.name,
                surface: way.tags.surface || 'unknown',
                length: Math.round(length),
                geometry: geom,
                type: way.tags.highway
            };
        });

        console.log(`Found ${processed.length} segments.`);
        return processed;

    } catch (error) {
        console.error("Reconnaissance failed:", error.message);
    }
}

function calculateDistance(p1, p2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = p1.lat * Math.PI/180;
    const φ2 = p2.lat * Math.PI/180;
    const Δφ = (p2.lat-p1.lat) * Math.PI/180;
    const Δλ = (p2.lon-p1.lon) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
}

fetchStreetData().then(data => {
    console.log(JSON.stringify(data, null, 2));
});
