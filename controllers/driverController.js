import { prisma } from '../lib/prisma.js';

// In-memory driver availability state for simulation
let driverAvailabilityState = {
    isAvailable: true,
    driverId: 'drv-sim-001',
    name: 'Vikramaditya Sharma',
    phone: '+91 98765 43210',
    vehicle: 'Maruti Suzuki Dzire (Pearl White)',
    plateNumber: 'DL 01 AB 4321',
    rating: 4.94,
    totalRides: 1840,
    updatedAt: new Date().toISOString()
};

/**
 * Get driver availability state
 * GET /driver/availability or /api/driver/availability
 */
export const getDriverAvailability = async (req, res) => {
    try {
        return res.status(200).json({
            isAvailable: driverAvailabilityState.isAvailable,
            driver: {
                name: driverAvailabilityState.name,
                phone: driverAvailabilityState.phone,
                vehicle: driverAvailabilityState.vehicle,
                plateNumber: driverAvailabilityState.plateNumber,
                rating: driverAvailabilityState.rating,
                totalRides: driverAvailabilityState.totalRides
            },
            updatedAt: driverAvailabilityState.updatedAt
        });
    } catch (error) {
        console.error("GetDriverAvailability Error:", error);
        return res.status(500).json({ message: 'Failed to get driver availability', error: error.message });
    }
};

/**
 * Toggle or update driver availability
 * PATCH /driver/availability or /api/driver/availability
 */
export const updateDriverAvailability = async (req, res) => {
    try {
        const { isAvailable } = req.body;

        if (typeof isAvailable !== 'boolean') {
            return res.status(400).json({ message: 'isAvailable boolean is required' });
        }

        driverAvailabilityState.isAvailable = isAvailable;
        driverAvailabilityState.updatedAt = new Date().toISOString();

        return res.status(200).json({
            message: `Driver is now ${isAvailable ? 'ONLINE and accepting rides' : 'OFFLINE'}`,
            isAvailable: driverAvailabilityState.isAvailable,
            updatedAt: driverAvailabilityState.updatedAt
        });
    } catch (error) {
        console.error("UpdateDriverAvailability Error:", error);
        return res.status(500).json({ message: 'Failed to update driver availability', error: error.message });
    }
};

/**
 * Get available ride requests (rides currently in REQUESTED status)
 * GET /driver/rides/available or /api/driver/rides/available
 */
export const getAvailableRides = async (req, res) => {
    try {
        const availableRides = await prisma.ride.findMany({
            where: {
                status: 'REQUESTED'
            },
            orderBy: {
                requestedAt: 'desc'
            },
            take: 20
        });

        return res.status(200).json({
            count: availableRides.length,
            rides: availableRides
        });
    } catch (error) {
        console.error("GetAvailableRides Error:", error);
        return res.status(500).json({ message: 'Failed to retrieve available rides', error: error.message });
    }
};

/**
 * Get driver details by ID
 * GET /drivers/:id or /api/drivers/:id
 */
export const getDriverById = async (req, res) => {
    try {
        const { id } = req.params;

        const driver = {
            id,
            name: driverAvailabilityState.name,
            rating: driverAvailabilityState.rating,
            totalRides: driverAvailabilityState.totalRides,
            vehicle: {
                make: "Maruti Suzuki",
                model: "Dzire",
                color: "Pearl White",
                plateNumber: driverAvailabilityState.plateNumber,
                type: "SEDAN"
            },
            phone: driverAvailabilityState.phone,
            isAvailable: driverAvailabilityState.isAvailable,
            reviews: [
                {
                    id: "rev-1",
                    rating: 5,
                    feedback: "Very polite driver, car was clean and AC was on point.",
                    createdAt: new Date(Date.now() - 86400000 * 1).toISOString()
                },
                {
                    id: "rev-2",
                    rating: 5,
                    feedback: "Arrived right on time and chose the fastest route.",
                    createdAt: new Date(Date.now() - 86400000 * 3).toISOString()
                }
            ]
        };

        return res.status(200).json({ driver });
    } catch (error) {
        console.error("GetDriver Error:", error);
        return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};
