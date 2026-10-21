// Calculate straight-line distance in km using Haversine formula (fallback)
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

// Curated landmark dictionary for reliable offline and high-priority place resolution
const CURATED_PLACES = [
    // Jamshedpur, Jharkhand
    { id: 'curated-jsr-1', address: 'Sonari, Jamshedpur, East Singhbhum, Jharkhand, 831011, India', shortName: 'Sonari', city: 'Jamshedpur', latitude: 22.8150, longitude: 86.1650 },
    { id: 'curated-jsr-2', address: 'Kadma, Jamshedpur, East Singhbhum, Jharkhand, 831005, India', shortName: 'Kadma', city: 'Jamshedpur', latitude: 22.7930, longitude: 86.1620 },
    { id: 'curated-jsr-3', address: 'Kadma Sonari Link Road, Jamshedpur, Jharkhand, 831001, India', shortName: 'Kadma Sonari Link Road', city: 'Jamshedpur', latitude: 22.8102, longitude: 86.1723 },
    { id: 'curated-jsr-4', address: 'Bistupur, Jamshedpur, East Singhbhum, Jharkhand, 831001, India', shortName: 'Bistupur', city: 'Jamshedpur', latitude: 22.7985, longitude: 86.1880 },
    { id: 'curated-jsr-5', address: 'Sakchi, Jamshedpur, East Singhbhum, Jharkhand, 831001, India', shortName: 'Sakchi', city: 'Jamshedpur', latitude: 22.8050, longitude: 86.2020 },
    { id: 'curated-jsr-6', address: 'Tatanagar Junction Railway Station, Khasmahal, Jamshedpur, Jharkhand, 831002, India', shortName: 'Tatanagar Railway Station', city: 'Jamshedpur', latitude: 22.7690, longitude: 86.2020 },
    { id: 'curated-jsr-7', address: 'Jubilee Park, Sakchi, Jamshedpur, Jharkhand, 831001, India', shortName: 'Jubilee Park', city: 'Jamshedpur', latitude: 22.8080, longitude: 86.1950 },
    { id: 'curated-jsr-8', address: 'Telco Colony, Jamshedpur, Jharkhand, 831004, India', shortName: 'Telco Colony', city: 'Jamshedpur', latitude: 22.7750, longitude: 86.2480 },
    { id: 'curated-jsr-9', address: 'Mango, Jamshedpur, Jharkhand, 831012, India', shortName: 'Mango', city: 'Jamshedpur', latitude: 22.8250, longitude: 86.2100 },
    { id: 'curated-jsr-10', address: 'Adityapur, Seraikela Kharsawan, Jharkhand, 831013, India', shortName: 'Adityapur', city: 'Jamshedpur', latitude: 22.7850, longitude: 86.1550 },
    { id: 'curated-jsr-11', address: 'Golmuri, Jamshedpur, East Singhbhum, Jharkhand, 831003, India', shortName: 'Golmuri', city: 'Jamshedpur', latitude: 22.7980, longitude: 86.2200 },
    // Delhi / NCR
    { id: 'curated-del-1', address: 'Connaught Place, Central Delhi, Delhi, 110001, India', shortName: 'Connaught Place', city: 'New Delhi', latitude: 28.6315, longitude: 77.2167 },
    { id: 'curated-del-2', address: 'Indira Gandhi International Airport, Terminal 3, New Delhi, 110037, India', shortName: 'IGI Airport T3', city: 'New Delhi', latitude: 28.5562, longitude: 77.1000 },
    { id: 'curated-del-3', address: 'DLF Cyber City, Sector 24, Gurugram, Haryana, 122002, India', shortName: 'Cyber City', city: 'Gurugram', latitude: 28.4950, longitude: 77.0895 },
    { id: 'curated-del-4', address: 'India Gate, Rajpath, New Delhi, 110001, India', shortName: 'India Gate', city: 'New Delhi', latitude: 28.6129, longitude: 77.2295 },
    { id: 'curated-del-5', address: 'Select Citywalk Mall, Saket District Centre, New Delhi, 110017, India', shortName: 'Select Citywalk', city: 'New Delhi', latitude: 28.5284, longitude: 77.2189 },
    // Mumbai
    { id: 'curated-mum-1', address: 'Bandra Kurla Complex, Bandra East, Mumbai, Maharashtra, 400051, India', shortName: 'BKC Bandra', city: 'Mumbai', latitude: 19.0657, longitude: 72.8687 },
    { id: 'curated-mum-2', address: 'Chhatrapati Shivaji Maharaj International Airport T2, Mumbai, 400099, India', shortName: 'Mumbai Airport T2', city: 'Mumbai', latitude: 19.0896, longitude: 72.8656 },
    // Bengaluru
    { id: 'curated-blr-1', address: 'Koramangala 4th Block, Bengaluru, Karnataka, 560034, India', shortName: 'Koramangala', city: 'Bengaluru', latitude: 12.9352, longitude: 77.6245 },
    { id: 'curated-blr-2', address: 'Kempegowda International Airport, Devanahalli, Bengaluru, Karnataka, 560300, India', shortName: 'BLR Airport', city: 'Bengaluru', latitude: 13.1986, longitude: 77.7066 },
    // Kolkata
    { id: 'curated-kol-1', address: 'Park Street, Kolkata, West Bengal, 700016, India', shortName: 'Park Street', city: 'Kolkata', latitude: 22.5513, longitude: 88.3524 },
    { id: 'curated-kol-2', address: 'Netaji Subhash Chandra Bose International Airport, Dum Dum, Kolkata, 700052, India', shortName: 'Kolkata Airport', city: 'Kolkata', latitude: 22.6547, longitude: 88.4467 }
];

// Search locations with priority matching, proximity awareness, and OpenStreetMap/Photon fallback
// GET /maps/search?q=query&lat=..&lng=..
export const searchLocation = async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || query.trim().length < 2) {
            return res.status(200).json({ results: [] });
        }

        const cleanQuery = query.trim().toLowerCase();
        const lat = parseFloat(req.query.lat);
        const lng = parseFloat(req.query.lng);
        const hasCoords = !isNaN(lat) && !isNaN(lng);

        // 1. Check curated high-priority landmark dictionary
        let curatedMatches = CURATED_PLACES.filter((p) => {
            const shortMatch = p.shortName.toLowerCase().includes(cleanQuery);
            const addressMatch = p.address.toLowerCase().includes(cleanQuery);
            const cityMatch = p.city.toLowerCase().includes(cleanQuery);
            return shortMatch || addressMatch || cityMatch;
        });

        // If proximity coordinates exist, sort curated places by distance to user
        if (hasCoords && curatedMatches.length > 0) {
            curatedMatches.sort((a, b) => {
                const distA = haversineDistance(lat, lng, a.latitude, a.longitude);
                const distB = haversineDistance(lat, lng, b.latitude, b.longitude);
                return distA - distB;
            });
        }

        let liveResults = [];

        // 2. Query OpenStreetMap Nominatim with India country filter and optional proximity viewbox
        try {
            let nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=in&limit=10&addressdetails=1`;
            if (hasCoords) {
                const minLng = (lng - 0.6).toFixed(4);
                const maxLng = (lng + 0.6).toFixed(4);
                const minLat = (lat - 0.6).toFixed(4);
                const maxLat = (lat + 0.6).toFixed(4);
                nominatimUrl += `&viewbox=${minLng},${maxLat},${maxLng},${minLat}&bounded=0`;
            }

            const response = await fetch(nominatimUrl, {
                headers: {
                    'User-Agent': 'HopInCabBooking/1.0 (contact@hopin.com)',
                    'Accept-Language': 'en'
                },
                signal: AbortSignal.timeout(4500)
            });

            if (response.ok) {
                const data = await response.json();
                liveResults = (data || []).map((item) => ({
                    id: String(item.place_id || Math.random()),
                    address: item.display_name,
                    shortName: item.address?.suburb || item.address?.neighbourhood || item.address?.road || item.display_name.split(',')[0],
                    city: item.address?.city || item.address?.town || item.address?.county || item.address?.state || '',
                    latitude: parseFloat(item.lat),
                    longitude: parseFloat(item.lon)
                }));
            }
        } catch (osmError) {
            console.warn("OSM Nominatim live query skipped/timed out:", osmError.message);
        }

        // 3. Photon API fallback if liveResults is empty or throttled
        if (liveResults.length === 0) {
            try {
                let photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=10`;
                if (hasCoords) {
                    photonUrl += `&lat=${lat}&lon=${lng}`;
                }
                const photonRes = await fetch(photonUrl, { signal: AbortSignal.timeout(3500) });
                if (photonRes.ok) {
                    const pData = await photonRes.json();
                    liveResults = (pData.features || []).map((f) => {
                        const props = f.properties || {};
                        const coords = f.geometry?.coordinates || [0, 0];
                        const name = props.name || props.street || query;
                        const locality = props.district || props.city || props.state || '';
                        const country = props.country || 'India';
                        return {
                            id: String(props.osm_id || Math.random()),
                            address: [name, locality, country].filter(Boolean).join(', '),
                            shortName: name,
                            city: props.city || props.state || '',
                            latitude: coords[1],
                            longitude: coords[0]
                        };
                    });
                }
            } catch (photonErr) {
                console.warn("Photon fallback query error:", photonErr.message);
            }
        }

        // 4. Merge curated matches with live results, deduplicating close coordinates
        const combined = [...curatedMatches];
        for (const liveItem of liveResults) {
            const isDuplicate = combined.some((item) => {
                const sameCoords = Math.abs(item.latitude - liveItem.latitude) < 0.005 && Math.abs(item.longitude - liveItem.longitude) < 0.005;
                const sameName = item.shortName.toLowerCase() === liveItem.shortName.toLowerCase();
                return sameCoords || sameName;
            });
            if (!isDuplicate) {
                combined.push(liveItem);
            }
        }

        return res.status(200).json({ results: combined.slice(0, 8) });
    } catch (error) {
        console.error("SearchLocation Error:", error);
        return res.status(500).json({ message: 'Failed to search locations', error: error.message });
    }
};

// Get route geometry, distance, and duration between two coordinates via OSRM (native fetch)
// GET /maps/route?startLat=..&startLng=..&endLat=..&endLng=..
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
