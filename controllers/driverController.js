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

// Get driver availability state
// GET /driver/availability
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

// Toggle or update driver availability
// PATCH /driver/availability
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

// Get available ride requests (rides currently in REQUESTED status)
// GET /driver/rides/available
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

// Get driver details by ID with dynamic ratings and reviews (Day 10)
// GET /driver/:id
export const getDriverById = async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch stored reviews from PostgreSQL
        const storedReviews = await prisma.review.findMany({
            include: {
                rider: {
                    select: { id: true, name: true, profileImage: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        // Compute average rating from database
        const allRatings = await prisma.review.findMany({
            select: { rating: true }
        });
        const totalReviews = allRatings.length;
        const sumRatings = allRatings.reduce((sum, r) => sum + r.rating, 0);
        const dynamicRating = totalReviews > 0
            ? Number((sumRatings / totalReviews).toFixed(2))
            : driverAvailabilityState.rating;

        const driver = {
            id: id || driverAvailabilityState.driverId,
            name: driverAvailabilityState.name,
            rating: dynamicRating,
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
            reviews: storedReviews
        };

        return res.status(200).json({ driver });
    } catch (error) {
        console.error("GetDriver Error:", error);
        return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};

// Get driver reviews list with breakdown (Day 10 - UC-09)
// GET /driver/:id/reviews or GET /drivers/:id/reviews
export const getDriverReviews = async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch all rider reviews from PostgreSQL
        const storedReviews = await prisma.review.findMany({
            include: {
                rider: {
                    select: { id: true, name: true, profileImage: true }
                },
                ride: {
                    select: {
                        id: true,
                        rideType: true,
                        pickupAddress: true,
                        dropoffAddress: true,
                        completedAt: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Calculate star rating distribution and average
        const totalReviews = storedReviews.length;
        const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        let sumRatings = 0;

        storedReviews.forEach(r => {
            sumRatings += r.rating;
            if (distribution[r.rating] !== undefined) {
                distribution[r.rating] += 1;
            }
        });

        const averageRating = totalReviews > 0
            ? Number((sumRatings / totalReviews).toFixed(2))
            : 4.94;

        return res.status(200).json({
            driverId: id || driverAvailabilityState.driverId,
            driverName: driverAvailabilityState.name,
            totalReviews,
            averageRating,
            distribution,
            reviews: storedReviews
        });

    } catch (error) {
        console.error("GetDriverReviews Error:", error);
        return res.status(500).json({ message: 'Failed to retrieve driver reviews', error: error.message });
    }
};

// Get driver average rating and distribution (Day 10 - UC-09)
// GET /driver/:id/rating or GET /drivers/:id/rating
export const getDriverRating = async (req, res) => {
    try {
        const { id } = req.params;

        // Aggregate ratings from PostgreSQL
        const storedReviews = await prisma.review.findMany({
            select: { rating: true }
        });

        const totalReviews = storedReviews.length;
        const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        let sumRatings = 0;

        storedReviews.forEach(r => {
            sumRatings += r.rating;
            if (distribution[r.rating] !== undefined) {
                distribution[r.rating] += 1;
            }
        });

        const averageRating = totalReviews > 0
            ? Number((sumRatings / totalReviews).toFixed(2))
            : 4.94;

        return res.status(200).json({
            driverId: id || driverAvailabilityState.driverId,
            driverName: driverAvailabilityState.name,
            averageRating,
            totalReviews,
            distribution
        });

    } catch (error) {
        console.error("GetDriverRating Error:", error);
        return res.status(500).json({ message: 'Failed to retrieve driver rating', error: error.message });
    }
};

// Driver earnings records through completed ride payments (Day 8)
// GET /driver/earnings
export const getDriverEarnings = async (req, res) => {
    try {
        const completedRides = await prisma.ride.findMany({
            where: {
                status: 'COMPLETED'
            },
            include: {
                payment: true,
                rider: {
                    select: { id: true, name: true, phone: true }
                }
            },
            orderBy: { completedAt: 'desc' }
        });

        const totalCompletedRides = completedRides.length;
        const totalGrossFares = completedRides.reduce((sum, r) => {
            const fare = r.payment?.status === 'SUCCEEDED'
                ? Number(r.payment.amount)
                : Number(r.finalFare || r.estimatedFare || 0);
            return sum + fare;
        }, 0);

        const platformCommissionRate = 0.15; // 15% platform commission
        const platformFees = Number((totalGrossFares * platformCommissionRate).toFixed(2));
        const netDriverEarnings = Number((totalGrossFares - platformFees).toFixed(2));

        const tripBreakdown = completedRides.map(r => {
            const fare = r.payment?.status === 'SUCCEEDED'
                ? Number(r.payment.amount)
                : Number(r.finalFare || r.estimatedFare || 0);
            const netFare = Number((fare * 0.85).toFixed(2));
            const fee = Number((fare * 0.15).toFixed(2));

            return {
                rideId: r.id,
                date: r.completedAt || r.updatedAt,
                riderName: r.rider?.name || 'Rider',
                pickup: r.pickupAddress,
                dropoff: r.dropoffAddress,
                distanceKm: Number(r.distanceKm),
                rideType: r.rideType,
                grossFare: fare,
                platformFee: fee,
                netEarnings: netFare,
                paymentStatus: r.payment?.status || 'PENDING',
                paymentMethod: r.payment?.method || 'CARD',
                paidAt: r.payment?.paidAt || null,
                receiptUrl: r.payment?.receiptUrl || null
            };
        });

        return res.status(200).json({
            driver: {
                name: driverAvailabilityState.name,
                vehicle: driverAvailabilityState.vehicle,
                plateNumber: driverAvailabilityState.plateNumber,
                rating: driverAvailabilityState.rating,
                totalLifetimeRides: driverAvailabilityState.totalRides + totalCompletedRides
            },
            summary: {
                totalCompletedRides,
                totalGrossFares: Number(totalGrossFares.toFixed(2)),
                platformCommissionRate: '15%',
                platformFees,
                netDriverEarnings,
                currency: 'USD'
            },
            trips: tripBreakdown
        });
    } catch (error) {
        console.error("GetDriverEarnings Error:", error);
        return res.status(500).json({ message: 'Failed to retrieve driver earnings', error: error.message });
    }
};

// Driver historical rides (Day 9 backend record)
// GET /driver/rides/history
export const getDriverRideHistory = async (req, res) => {
    try {
        const rides = await prisma.ride.findMany({
            where: {
                status: 'COMPLETED'
            },
            include: {
                payment: true,
                rider: {
                    select: { id: true, name: true, phone: true }
                }
            },
            orderBy: { completedAt: 'desc' }
        });

        return res.status(200).json({
            count: rides.length,
            driver: {
                name: driverAvailabilityState.name,
                vehicle: driverAvailabilityState.vehicle,
                plateNumber: driverAvailabilityState.plateNumber,
                rating: driverAvailabilityState.rating
            },
            rides
        });
    } catch (error) {
        console.error("GetDriverRideHistory Error:", error);
        return res.status(500).json({ message: 'Failed to retrieve driver ride history', error: error.message });
    }
};


