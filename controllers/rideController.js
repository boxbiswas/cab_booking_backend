import nodemailer from 'nodemailer';
import { prisma } from '../lib/prisma.js';
import {
    emitRideStatus,
    emitDriverLocation,
    startDriverSimulation,
    stopDriverSimulation
} from '../lib/socket.js';

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

// Calculate fare estimates across all vehicle tiers
// POST /rides/estimate
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

// Create a new Ride request (Starts in REQUESTED status)
// POST /rides
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

// Accept a ride request (Assigns driver & prevents multiple drivers from accepting)
// POST /rides/:id/accept
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

        // Emit real-time status update & in-app notification to ride room
        emitRideStatus(id, 'ACCEPTED', updatedRide, {
            title: 'Driver Assigned',
            message: `${updatedRide.driverName} has accepted your ride and is en route!`,
            type: 'accepted'
        });

        // Start live driver telemetry simulation heading towards pickup
        const pickupLat = Number(updatedRide.pickupLatitude);
        const pickupLng = Number(updatedRide.pickupLongitude);
        const driverStartCoord = {
            latitude: pickupLat + 0.008,
            longitude: pickupLng + 0.007
        };

        startDriverSimulation(id, driverStartCoord, { latitude: pickupLat, longitude: pickupLng }, {
            status: 'EN_ROUTE_PICKUP',
            onComplete: async () => {
                try {
                    const arrivingRide = await prisma.ride.update({
                        where: { id },
                        data: { status: 'DRIVER_ARRIVING' }
                    });
                    emitRideStatus(id, 'DRIVER_ARRIVING', arrivingRide, {
                        title: 'Driver Arrived',
                        message: `${arrivingRide.driverName} has arrived at your pickup location!`,
                        type: 'arriving'
                    });
                } catch (err) {
                    console.warn("Auto-transition to DRIVER_ARRIVING failed:", err.message);
                }
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

// Decline a ride request
// POST /rides/:id/decline
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

// Update ride lifecycle status with backend validation
// PATCH /rides/:id/status
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

        // Notifications and telemetry handling per status
        if (status === 'DRIVER_ARRIVING') {
            emitRideStatus(id, 'DRIVER_ARRIVING', updatedRide, {
                title: 'Driver Arrived',
                message: `${updatedRide.driverName || 'Driver'} is at your pickup location!`,
                type: 'arriving'
            });
        } else if (status === 'IN_PROGRESS') {
            emitRideStatus(id, 'IN_PROGRESS', updatedRide, {
                title: 'Ride Started',
                message: `You're on your way to ${updatedRide.dropoffAddress.split(',')[0]}!`,
                type: 'progress'
            });

            // Start simulation from pickup towards dropoff
            const pLat = Number(updatedRide.pickupLatitude);
            const pLng = Number(updatedRide.pickupLongitude);
            const dLat = Number(updatedRide.dropoffLatitude);
            const dLng = Number(updatedRide.dropoffLongitude);

            startDriverSimulation(id, { latitude: pLat, longitude: pLng }, { latitude: dLat, longitude: dLng }, {
                status: 'ON_TRIP',
                onComplete: async () => {
                    try {
                        const finalRide = await prisma.ride.update({
                            where: { id },
                            data: {
                                status: 'COMPLETED',
                                completedAt: new Date(),
                                finalFare: updatedRide.estimatedFare,
                                actualDurationMin: updatedRide.estimatedDurationMin
                            }
                        });
                        emitRideStatus(id, 'COMPLETED', finalRide, {
                            title: 'Ride Completed',
                            message: 'You have arrived at your destination. Hope you enjoyed the ride!',
                            type: 'completed'
                        });
                    } catch (err) {
                        console.warn("Auto-transition to COMPLETED failed:", err.message);
                    }
                }
            });
        } else if (status === 'COMPLETED') {
            stopDriverSimulation(id);
            emitRideStatus(id, 'COMPLETED', updatedRide, {
                title: 'Ride Completed',
                message: 'Thank you for riding with HopIn. Have a wonderful day!',
                type: 'completed'
            });
        } else if (status === 'CANCELLED') {
            stopDriverSimulation(id);
            emitRideStatus(id, 'CANCELLED', updatedRide, {
                title: 'Ride Cancelled',
                message: 'Your ride request has been cancelled.',
                type: 'cancelled'
            });
        }

        return res.status(200).json({
            message: `Ride status updated to ${status}`,
            ride: updatedRide
        });

    } catch (error) {
        console.error("UpdateRideStatus Error:", error);
        return res.status(500).json({ message: 'Failed to update ride status', error: error.message });
    }
};

// Fetch Ride details by ID
// GET /rides/:id
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

// Fetch Rider ride history with stats and filters (Day 9)
// GET /rides/history
export const getRidesHistory = async (req, res) => {
    try {
        const riderId = req.user.id;
        const { status, search, limit = 50, page = 1 } = req.query;

        const whereClause = { riderId };

        if (status && status !== 'ALL') {
            whereClause.status = status;
        }

        if (search && search.trim()) {
            const query = search.trim();
            whereClause.OR = [
                { pickupAddress: { contains: query, mode: 'insensitive' } },
                { dropoffAddress: { contains: query, mode: 'insensitive' } },
                { driverName: { contains: query, mode: 'insensitive' } }
            ];
        }

        const parsedLimit = parseInt(limit, 10) || 50;
        const parsedPage = parseInt(page, 10) || 1;
        const skip = (parsedPage - 1) * parsedLimit;

        const [rides, totalCount] = await Promise.all([
            prisma.ride.findMany({
                where: whereClause,
                include: {
                    payment: true,
                    review: true,
                    stops: { orderBy: { sequence: 'asc' } }
                },
                orderBy: { createdAt: 'desc' },
                take: parsedLimit,
                skip
            }),
            prisma.ride.count({ where: whereClause })
        ]);

        // Aggregate lifetime rider stats
        const allRiderRides = await prisma.ride.findMany({
            where: { riderId },
            include: { payment: true }
        });

        const completedRides = allRiderRides.filter(r => r.status === 'COMPLETED');
        const totalSpent = completedRides.reduce((sum, r) => {
            const amount = r.payment?.status === 'SUCCEEDED'
                ? Number(r.payment.amount)
                : Number(r.finalFare || r.estimatedFare || 0);
            return sum + amount;
        }, 0);

        const totalDistanceKm = completedRides.reduce((sum, r) => sum + Number(r.distanceKm || 0), 0);

        return res.status(200).json({
            rides,
            pagination: {
                total: totalCount,
                page: parsedPage,
                limit: parsedLimit,
                pages: Math.ceil(totalCount / parsedLimit) || 1
            },
            stats: {
                totalRides: allRiderRides.length,
                completedRides: completedRides.length,
                cancelledRides: allRiderRides.filter(r => r.status === 'CANCELLED').length,
                totalSpent: Number(totalSpent.toFixed(2)),
                totalDistanceKm: Number(totalDistanceKm.toFixed(1))
            }
        });
    } catch (error) {
        console.error("GetRidesHistory Error:", error);
        return res.status(500).json({ message: 'Failed to retrieve ride history', error: error.message });
    }
};

// Fetch official ride receipt data (Day 9)
// GET /rides/:id/receipt
export const getRideReceipt = async (req, res) => {
    try {
        const { id } = req.params;
        const riderId = req.user.id;

        const ride = await prisma.ride.findUnique({
            where: { id },
            include: {
                payment: true,
                review: true,
                stops: { orderBy: { sequence: 'asc' } },
                rider: {
                    select: { id: true, name: true, email: true, phone: true }
                }
            }
        });

        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        if (ride.riderId !== riderId) {
            return res.status(403).json({ message: 'Unauthorized to view receipt for this ride' });
        }

        const fare = Number(ride.payment?.amount || ride.finalFare || ride.estimatedFare || 15.00);
        const baseFare = Number((fare * 0.45).toFixed(2));
        const distanceFare = Number((fare * 0.40).toFixed(2));
        const platformFee = Number((fare * 0.15).toFixed(2));

        const receipt = {
            receiptNumber: `RCP-${ride.id.substring(0, 8).toUpperCase()}`,
            date: ride.completedAt || ride.updatedAt || new Date(),
            status: ride.payment?.status || (ride.status === 'COMPLETED' ? 'SUCCEEDED' : 'PENDING'),
            currency: ride.payment?.currency || 'USD',
            totalFare: fare.toFixed(2),
            fareBreakdown: {
                baseFare: baseFare.toFixed(2),
                distanceFare: distanceFare.toFixed(2),
                distanceKm: Number(ride.distanceKm),
                platformFee: platformFee.toFixed(2),
                taxRate: '15%'
            },
            payment: {
                method: ride.payment?.method || 'CARD',
                provider: ride.payment?.provider || 'stripe',
                transactionId: ride.payment?.providerPaymentId || `pi_${ride.id.substring(0, 10)}`,
                paidAt: ride.payment?.paidAt || ride.completedAt,
                receiptUrl: ride.payment?.receiptUrl || null
            },
            driver: {
                name: ride.driverName || 'Vikramaditya Sharma',
                vehicle: ride.driverVehicle || 'Maruti Suzuki Dzire',
                plateNumber: ride.driverPlateNumber || 'DL 01 AB 4321',
                rating: ride.driverRating ? Number(ride.driverRating) : 4.94
            },
            route: {
                pickupAddress: ride.pickupAddress,
                dropoffAddress: ride.dropoffAddress,
                durationMin: ride.actualDurationMin || ride.estimatedDurationMin
            },
            rider: {
                name: ride.rider?.name,
                email: ride.rider?.email,
                phone: ride.rider?.phone
            }
        };

        return res.status(200).json({ receipt, ride });
    } catch (error) {
        console.error("GetRideReceipt Error:", error);
        return res.status(500).json({ message: 'Failed to retrieve receipt', error: error.message });
    }
};

// Send ride receipt to rider's email (Day 9)
// POST /rides/:id/receipt/email
export const emailRideReceipt = async (req, res) => {
    try {
        const { id } = req.params;
        const riderId = req.user.id;
        const { targetEmail } = req.body;

        const ride = await prisma.ride.findUnique({
            where: { id },
            include: {
                payment: true,
                rider: true
            }
        });

        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        if (ride.riderId !== riderId) {
            return res.status(403).json({ message: 'Unauthorized to send receipt for this ride' });
        }

        const recipient = targetEmail || ride.rider?.email || req.user.email;
        if (!recipient) {
            return res.status(400).json({ message: 'Recipient email is required' });
        }

        const fare = Number(ride.payment?.amount || ride.finalFare || ride.estimatedFare || 15.00).toFixed(2);
        const receiptNo = `RCP-${ride.id.substring(0, 8).toUpperCase()}`;

        // Send via nodemailer if SMTP configured, else log delivery simulation
        if (process.env.SMTP_HOST && process.env.SMTP_USER) {
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT || 587,
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });

            await transporter.sendMail({
                from: process.env.SMTP_FROM || '"HopIn Cabs" <no-reply@hopin.com>',
                to: recipient,
                subject: `Your HopIn Ride Receipt [${receiptNo}] - $${fare}`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 16px;">
                        <h2 style="color: #FF7A59; margin-bottom: 4px;">HopIn Official Ride Receipt</h2>
                        <p style="color: #666; font-size: 14px;">Receipt: <strong>${receiptNo}</strong></p>
                        <hr style="border: none; border-top: 1px dashed #ddd; margin: 16px 0;" />
                        <p><strong>Pickup:</strong> ${ride.pickupAddress}</p>
                        <p><strong>Dropoff:</strong> ${ride.dropoffAddress}</p>
                        <p><strong>Driver:</strong> ${ride.driverName || 'Vikramaditya Sharma'} (${ride.driverVehicle || 'Dzire'})</p>
                        <hr style="border: none; border-top: 1px dashed #ddd; margin: 16px 0;" />
                        <h3 style="color: #059669;">Total Paid: $${fare} USD</h3>
                        <p style="color: #999; font-size: 12px;">Thank you for riding with HopIn!</p>
                    </div>
                `
            });
        } else {
            console.log(`[Email Service Simulation] Sent receipt ${receiptNo} for ride ${ride.id} to ${recipient} (Fare: $${fare})`);
        }

        return res.status(200).json({
            message: `Official receipt sent successfully to ${recipient}`,
            receiptNumber: receiptNo,
            recipient
        });

    } catch (error) {
        console.error("EmailRideReceipt Error:", error);
        return res.status(500).json({ message: 'Failed to email receipt', error: error.message });
    }
};

// Submit post-ride review and rating (Day 10 - UC-09)
// POST /rides/:id/review
export const submitRideReview = async (req, res) => {
    try {
        const { id } = req.params;
        const riderId = req.user.id;
        const { rating, feedback } = req.body;

        // Validate rating range (1 to 5 stars)
        const parsedRating = parseInt(rating, 10);
        if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
            return res.status(400).json({ message: 'Rating must be an integer between 1 and 5' });
        }

        // Fetch ride to verify ownership and completion status
        const ride = await prisma.ride.findUnique({
            where: { id },
            include: { review: true }
        });

        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        // Only the rider associated with the ride may submit its review
        if (ride.riderId !== riderId) {
            return res.status(403).json({ message: 'Unauthorized to review this ride' });
        }

        // Only completed rides can be reviewed
        if (ride.status !== 'COMPLETED') {
            return res.status(400).json({
                message: 'Only completed rides can be reviewed',
                currentStatus: ride.status
            });
        }

        // Enforce the one-review-per-ride constraint
        if (ride.review) {
            return res.status(409).json({
                message: 'This ride has already been reviewed',
                review: ride.review
            });
        }

        // Save review in PostgreSQL
        const review = await prisma.review.create({
            data: {
                rideId: id,
                riderId,
                rating: parsedRating,
                feedback: feedback ? feedback.trim() : null
            },
            include: {
                rider: {
                    select: { id: true, name: true, profileImage: true }
                }
            }
        });

        // Calculate dynamic average driver rating across all stored reviews in PostgreSQL
        const allStoredReviews = await prisma.review.findMany({
            select: { rating: true }
        });
        const totalReviews = allStoredReviews.length;
        const sumRatings = allStoredReviews.reduce((sum, r) => sum + r.rating, 0);
        const averageRating = totalReviews > 0
            ? Number((sumRatings / totalReviews).toFixed(2))
            : 5.00;

        // Update ride record with updated driver rating
        await prisma.ride.update({
            where: { id },
            data: { driverRating: averageRating }
        });

        return res.status(201).json({
            message: 'Review submitted successfully. Thank you for your feedback!',
            review,
            averageDriverRating: averageRating,
            totalReviews
        });

    } catch (error) {
        // Handle unique constraint violation in case of concurrent requests
        if (error.code === 'P2002') {
            return res.status(409).json({ message: 'This ride has already been reviewed' });
        }
        console.error("SubmitRideReview Error:", error);
        return res.status(500).json({ message: 'Failed to submit review', error: error.message });
    }
};

// Retrieve review for a ride (Day 10)
// GET /rides/:id/review
export const getRideReview = async (req, res) => {
    try {
        const { id } = req.params;

        const review = await prisma.review.findUnique({
            where: { rideId: id },
            include: {
                rider: {
                    select: { id: true, name: true, profileImage: true }
                }
            }
        });

        if (!review) {
            return res.status(404).json({ message: 'No review found for this ride' });
        }

        return res.status(200).json({ review });

    } catch (error) {
        console.error("GetRideReview Error:", error);
        return res.status(500).json({ message: 'Failed to retrieve review', error: error.message });
    }
};


