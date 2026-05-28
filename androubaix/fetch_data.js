const axios = require('axios');

/**
 * Operation Pavé Data Fetcher
 * This script fetches road geometry and surface tags for specific targets 
 * and prepares them for a Leaflet.js visualization.
 */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
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
    "Carrer de Sant Adrià"
];

async function fetchStreetData() {
    // Query for all ways that match our targeting criteria
    // Only focusing on the Sant Andreu sector (south of Meridiana)
    const query = `
        [out:json][timeout:25];
        (
          way[name~"${TARGET_STREETS.join('|')}"][surface~"sett|cobblestone|paving_stones"];
          way[name~"${TARGET_STREETS.join('|')}"];
        );
        out geom;
    `;

    try {
        console.log("Executing Operation Pavé reconnaissance query...");
        const response = await axios.post(OVERPASS_URL, `data=${encodeURIComponent(query)}`);
        
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
