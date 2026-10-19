import { prisma } from '../lib/prisma.js';

// Base pricing rules per vehicle category
const TIER_PRICING = {
    SEDAN: {
        name: 'HopIn Sedan',
        description: 'Comfortable & reliable everyday rides',
        capacity: 4,
        baseFare: 4.00,
        perKmRate: 1.75,
        perMinRate: 0.35,
        minFare: 8.00,
        etaMin: 3
    },
    HATCHBACK: {
        name: 'HopIn Mini',
        description: 'Affordable compact city trips',
        capacity: 4,
        baseFare: 3.00,
        perKmRate: 1.35,
        perMinRate: 0.25,
        minFare: 6.00,
        etaMin: 4
    },
    SUV: {
        name: 'HopIn XL',
        description: 'Spacious 6-seater for luggage and groups',
        capacity: 6,
        baseFare: 6.50,
        perKmRate: 2.40,
        perMinRate: 0.50,
        minFare: 12.00,
        etaMin: 5
    },
    AUTO: {
        name: 'HopIn Auto',
        description: 'Quick transit through dense city traffic',
        capacity: 3,
        baseFare: 2.00,
        perKmRate: 1.00,
        perMinRate: 0.20,
        minFare: 4.50,
        etaMin: 2
    }
};

// Strict state transition map for backend validation
const VALID_TRANSITIONS = {
    REQUESTED: ['ACCEPTED', 'CANCELLED'],
    ACCEPTED: ['DRIVER_ARRIVING', 'CANCELLED'],
    DRIVER_ARRIVING: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: []
};

/**
 * Calculate fare estimates across all vehicle tiers
 * POST /rides/estimate or /api/rides/estimate
 */
export const estimateFare = async (req, res) => {
    try {
        const { distanceKm, durationMin } = req.body;

        const dist = parseFloat(distanceKm);
        const dur = parseInt(durationMin, 10);

        if (isNaN(dist) || isNaN(dur) || dist <= 0) {
            return res.status(400).json({ message: 'Valid distance (km) and duration (min) are required' });
        }

        const estimates = Object.entries(TIER_PRICING).map(([type, rule]) => {
            const rawFare = rule.baseFare + (rule.perKmRate * dist) + (rule.perMinRate * dur);
            const calculatedFare = Math.max(rule.minFare, rawFare);
            const roundedFare = Number(calculatedFare.toFixed(2));

            return {
                rideType: type,
                name: rule.name,
                description: rule.description,
                capacity: rule.capacity,
                estimatedFare: roundedFare,
                currency: 'USD',
                eta: `${rule.etaMin} min`,
                breakdown: {
                    baseFare: rule.baseFare,
                    distanceCharge: Number((rule.perKmRate * dist).toFixed(2)),
                    timeCharge: Number((rule.perMinRate * dur).toFixed(2))
                }
            };
        });

        return res.status(200).json({
            distanceKm: dist,
            durationMin: dur,
            estimates
        });

    } catch (error) {
        console.error("EstimateFare Error:", error);
        return res.status(500).json({ message: 'Failed to calculate fare estimate', error: error.message });
    }
};

/**
 * Create a new Ride request (Starts in REQUESTED status)
 * POST /rides or /api/rides
 */
export const createRide = async (req, res) => {
    try {
        const riderId = req.user.id;
        const {
            pickupAddress,
            pickupLatitude,
            pickupLongitude,
            dropoffAddress,
            dropoffLatitude,
            dropoffLongitude,
            rideType = 'SEDAN',
            distanceKm,
            estimatedFare,
            estimatedDurationMin
        } = req.body;

        if (!pickupAddress || !pickupLatitude || !pickupLongitude ||
            !dropoffAddress || !dropoffLatitude || !dropoffLongitude ||
            !distanceKm || !estimatedFare) {
            return res.status(400).json({ message: 'All ride details, coordinates, and fare must be provided' });
        }

        // Create ride in PostgreSQL via Prisma with status REQUESTED
        const newRide = await prisma.ride.create({
            data: {
                riderId,
                pickupAddress,
                pickupLatitude: parseFloat(pickupLatitude),
                pickupLongitude: parseFloat(pickupLongitude),
                dropoffAddress,
                dropoffLatitude: parseFloat(dropoffLatitude),
                dropoffLongitude: parseFloat(dropoffLongitude),
                rideType: rideType in TIER_PRICING ? rideType : 'SEDAN',
                status: 'REQUESTED',
                distanceKm: parseFloat(distanceKm),
                estimatedFare: parseFloat(estimatedFare),
                estimatedDurationMin: parseInt(estimatedDurationMin, 10) || 15,
                // Driver will be assigned when accepted
                driverName: null,
                driverPhone: null,
                driverVehicle: null,
                driverPlateNumber: null,
                driverRating: null
            }
        });

        return res.status(201).json({
            message: 'Ride requested successfully. Searching for nearby drivers.',
            ride: newRide
        });

    } catch (error) {
        console.error("CreateRide Error:", error);
        return res.status(500).json({ message: 'Failed to create ride request', error: error.message });
    }
};

/**
 * Accept a ride request (Assigns driver & prevents multiple drivers from accepting)
 * POST /rides/:id/accept or /api/rides/:id/accept
 */
export const acceptRide = async (req, res) => {
    try {
        const { id } = req.params;

        const ride = await prisma.ride.findUnique({
            where: { id }
        });

        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        // Multiple driver acceptance prevention
        if (ride.status !== 'REQUESTED') {
            return res.status(409).json({
                message: 'This ride has already been accepted by another driver or is no longer available',
                currentStatus: ride.status
            });
        }

        // Vehicle default profile based on ride tier
        const vehicleMap = {
            SEDAN: 'Maruti Suzuki Dzire (Pearl White)',
            HATCHBACK: 'Hyundai Grand i10 Nios (Silver)',
            SUV: 'Toyota Innova Crysta (Pearl White)',
            AUTO: 'HopIn Electric Auto (Green)'
        };

        const updatedRide = await prisma.ride.update({
            where: { id },
            data: {
                status: 'ACCEPTED',
                acceptedAt: new Date(),
                driverName: req.body.driverName || 'Vikramaditya Sharma',
                driverPhone: req.body.driverPhone || '+91 98765 43210',
                driverVehicle: req.body.driverVehicle || vehicleMap[ride.rideType] || 'Maruti Suzuki Dzire (Pearl White)',
                driverPlateNumber: req.body.driverPlateNumber || 'DL 01 AB 4321',
                driverRating: req.body.driverRating || 4.94
            }
        });

        return res.status(200).json({
            message: 'Ride accepted successfully and driver assigned.',
            ride: updatedRide
        });

    } catch (error) {
        console.error("AcceptRide Error:", error);
        return res.status(500).json({ message: 'Failed to accept ride', error: error.message });
    }
};

/**
 * Decline a ride request
 * POST /rides/:id/decline or /api/rides/:id/decline
 */
export const declineRide = async (req, res) => {
    try {
        const { id } = req.params;

        const ride = await prisma.ride.findUnique({
            where: { id }
        });

        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        return res.status(200).json({
            message: 'Ride declined by driver. Request remains open for other nearby drivers.',
            rideId: id
        });

    } catch (error) {
        console.error("DeclineRide Error:", error);
        return res.status(500).json({ message: 'Failed to decline ride', error: error.message });
    }
};

/**
 * Update ride lifecycle status with backend validation
 * PATCH /rides/:id/status or /api/rides/:id/status
 */
export const updateRideStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, reason, cancelledBy } = req.body;

        if (!status) {
            return res.status(400).json({ message: 'Status is required' });
        }

        const ride = await prisma.ride.findUnique({
            where: { id }
        });

        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        // Validate state transitions
        const allowedNextStates = VALID_TRANSITIONS[ride.status] || [];
        if (!allowedNextStates.includes(status)) {
            return res.status(400).json({
                message: `Invalid status transition: cannot change from ${ride.status} to ${status}.`,
                allowedTransitions: allowedNextStates
            });
        }

        const updateData = { status };

        if (status === 'ACCEPTED' && !ride.acceptedAt) {
            updateData.acceptedAt = new Date();
        } else if (status === 'IN_PROGRESS' && !ride.startedAt) {
            updateData.startedAt = new Date();
        } else if (status === 'COMPLETED' && !ride.completedAt) {
            updateData.completedAt = new Date();
            updateData.finalFare = ride.estimatedFare;
            updateData.actualDurationMin = ride.estimatedDurationMin;
        } else if (status === 'CANCELLED') {
            updateData.cancelledAt = new Date();
            updateData.cancellationReason = reason || 'Cancelled by user';
            updateData.cancelledBy = cancelledBy || 'RIDER';
        }

        const updatedRide = await prisma.ride.update({
            where: { id },
            data: updateData
        });

        return res.status(200).json({
            message: `Ride status updated to ${status}`,
            ride: updatedRide
        });

    } catch (error) {
        console.error("UpdateRideStatus Error:", error);
        return res.status(500).json({ message: 'Failed to update ride status', error: error.message });
    }
};

/**
 * Fetch Ride details by ID
 * GET /rides/:id or /api/rides/:id
 */
export const getRideById = async (req, res) => {
    try {
        const { id } = req.params;
        const riderId = req.user.id;

        const ride = await prisma.ride.findUnique({
            where: { id },
            include: {
                stops: { orderBy: { sequence: 'asc' } },
                payment: true,
                review: true
            }
        });

        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        if (ride.riderId !== riderId) {
            return res.status(403).json({ message: 'Unauthorized to view this ride' });
        }

        return res.status(200).json({ ride });

    } catch (error) {
        console.error("GetRideById Error:", error);
        return res.status(500).json({ message: 'Failed to retrieve ride', error: error.message });
    }
};
