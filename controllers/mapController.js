/**
 * Calculate straight-line distance in km using Haversine formula (fallback)
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(2));
}

/**
 * Search locations via OpenStreetMap Nominatim geocoding (native fetch)
 * GET /maps/search?q=query
 */
export const searchLocation = async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || query.trim().length < 2) {
            return res.status(200).json({ results: [] });
        }

        try {
            const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;
            const response = await fetch(nominatimUrl, {
                headers: {
                    'User-Agent': 'HopInCabBooking/1.0 (contact@hopin.com)',
                    'Accept-Language': 'en'
                },
                signal: AbortSignal.timeout(4000)
            });

            if (!response.ok) {
                throw new Error(`Nominatim error: ${response.status}`);
            }

            const data = await response.json();

            const results = (data || []).map((item) => ({
                id: item.place_id || String(Math.random()),
                address: item.display_name,
                shortName: item.address?.road || item.address?.suburb || item.display_name.split(',')[0],
                city: item.address?.city || item.address?.town || item.address?.state || '',
                latitude: parseFloat(item.lat),
                longitude: parseFloat(item.lon)
            }));

            return res.status(200).json({ results });
        } catch (osmError) {
            console.warn("OSM Nominatim search fallback engaged:", osmError.message);
            // Fallback default city landmarks
            const fallbackPlaces = [
                { id: '1', address: 'Connaught Place, Central Delhi, Delhi, India', shortName: 'Connaught Place', city: 'New Delhi', latitude: 28.6315, longitude: 77.2167 },
                { id: '2', address: 'Indira Gandhi International Airport, Terminal 3, New Delhi', shortName: 'IGI Airport T3', city: 'New Delhi', latitude: 28.5562, longitude: 77.1000 },
                { id: '3', address: 'DLF Cyber City, Sector 24, Gurugram, Haryana', shortName: 'Cyber City', city: 'Gurugram', latitude: 28.4950, longitude: 77.0895 },
                { id: '4', address: 'India Gate, Rajpath, New Delhi', shortName: 'India Gate', city: 'New Delhi', latitude: 28.6129, longitude: 77.2295 },
                { id: '5', address: 'Select Citywalk Mall, Saket District Centre, New Delhi', shortName: 'Select Citywalk', city: 'New Delhi', latitude: 28.5284, longitude: 77.2189 },
            ].filter(p => p.address.toLowerCase().includes(query.toLowerCase()) || p.shortName.toLowerCase().includes(query.toLowerCase()));

            return res.status(200).json({ results: fallbackPlaces });
        }
    } catch (error) {
        console.error("SearchLocation Error:", error);
        return res.status(500).json({ message: 'Failed to search locations', error: error.message });
    }
};

/**
 * Get route geometry, distance, and duration between two coordinates via OSRM (native fetch)
 * GET /maps/route?startLat=..&startLng=..&endLat=..&endLng=..
 */
export const getRoute = async (req, res) => {
    try {
        const { startLat, startLng, endLat, endLng } = req.query;

        if (!startLat || !startLng || !endLat || !endLng) {
            return res.status(400).json({ message: 'Start and destination coordinates are required' });
        }

        const sLat = parseFloat(startLat);
        const sLng = parseFloat(startLng);
        const eLat = parseFloat(endLat);
        const eLng = parseFloat(endLng);

        try {
            // OSRM Public Routing API: driving profile
            const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${sLng},${sLat};${eLng},${eLat}?overview=full&geometries=geojson`;
            const osrmResponse = await fetch(osrmUrl, { signal: AbortSignal.timeout(5000) });

            if (osrmResponse.ok) {
                const data = await osrmResponse.json();
                if (data?.routes && data.routes.length > 0) {
                    const route = data.routes[0];
                    const distanceKm = Number((route.distance / 1000).toFixed(2));
                    const durationMin = Math.max(1, Math.round(route.duration / 60));
                    // OSRM coordinates are [lng, lat], convert to Leaflet [lat, lng]
                    const coordinates = (route.geometry?.coordinates || []).map(coord => [coord[1], coord[0]]);

                    return res.status(200).json({
                        distanceKm,
                        durationMin,
                        coordinates
                    });
                }
            }
        } catch (osrmError) {
            console.warn("OSRM routing API fallback engaged:", osrmError.message);
        }

        // Reliable Fallback: Haversine distance + estimated average city speed (30 km/h)
        const distanceKm = haversineDistance(sLat, sLng, eLat, eLng);
        const durationMin = Math.max(2, Math.round((distanceKm / 30) * 60));
        const coordinates = [
            [sLat, sLng],
            [eLat, eLng]
        ];

        return res.status(200).json({
            distanceKm,
            durationMin,
            coordinates
        });

    } catch (error) {
        console.error("GetRoute Error:", error);
        return res.status(500).json({ message: 'Failed to calculate route', error: error.message });
    }
};
