import { prisma } from '../lib/prisma.js';

// Seed default promotional coupon codes if table is empty
const seedDefaultPromos = async () => {
    const count = await prisma.promoCode.count();
    if (count === 0) {
        const now = new Date();
        const nextYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

        await prisma.promoCode.createMany({
            data: [
                {
                    code: 'HOPIN50',
                    discountType: 'PERCENTAGE',
                    discountValue: 50.00,
                    minimumFare: 12.00,
                    maximumDiscount: 10.00,
                    startsAt: now,
                    expiresAt: nextYear,
                    usageLimit: 1000,
                    usageCount: 0,
                    isActive: true
                },
                {
                    code: 'WELCOME10',
                    discountType: 'FIXED_AMOUNT',
                    discountValue: 10.00,
                    minimumFare: 15.00,
                    maximumDiscount: 10.00,
                    startsAt: now,
                    expiresAt: nextYear,
                    usageLimit: 500,
                    usageCount: 0,
                    isActive: true
                },
                {
                    code: 'SAVE20',
                    discountType: 'PERCENTAGE',
                    discountValue: 20.00,
                    minimumFare: 8.00,
                    maximumDiscount: 6.00,
                    startsAt: now,
                    expiresAt: nextYear,
                    usageLimit: 2000,
                    usageCount: 0,
                    isActive: true
                }
            ]
        });
    }
};

// Validate promo code and calculate discount
// POST /promotions/validate
export const validatePromotion = async (req, res) => {
    try {
        const { code, estimatedFare, rideId } = req.body || {};

        if (!code || typeof code !== 'string') {
            return res.status(400).json({ valid: false, message: 'Promo code is required' });
        }

        const fare = parseFloat(estimatedFare || req.body?.rideFare || req.body?.fare);
        if (isNaN(fare) || fare <= 0) {
            return res.status(400).json({ valid: false, message: 'Valid estimated fare is required to calculate discount' });
        }

        // Ensure default promotional codes exist
        await seedDefaultPromos();

        const cleanCode = code.trim().toUpperCase();

        // Query database for promo code
        const promo = await prisma.promoCode.findUnique({
            where: { code: cleanCode }
        });

        if (!promo || !promo.isActive) {
            return res.status(404).json({
                valid: false,
                message: 'Invalid or inactive promotional code'
            });
        }

        const now = new Date();

        // Validate date boundaries
        if (now < new Date(promo.startsAt)) {
            return res.status(400).json({
                valid: false,
                message: 'This promo code is not yet active'
            });
        }

        if (now > new Date(promo.expiresAt)) {
            return res.status(400).json({
                valid: false,
                message: 'This promo code has expired'
            });
        }

        // Validate usage limits
        if (promo.usageLimit !== null && promo.usageCount >= promo.usageLimit) {
            return res.status(400).json({
                valid: false,
                message: 'This promo code has reached its maximum usage limit'
            });
        }

        // Validate minimum fare threshold
        const minFare = parseFloat(promo.minimumFare);
        if (fare < minFare) {
            return res.status(400).json({
                valid: false,
                message: `Minimum fare of $${minFare.toFixed(2)} required to apply ${promo.code}`
            });
        }

        // Calculate discount on the backend
        let discount = 0;
        const discountVal = parseFloat(promo.discountValue);

        if (promo.discountType === 'PERCENTAGE') {
            discount = fare * (discountVal / 100);
            if (promo.maximumDiscount !== null) {
                discount = Math.min(discount, parseFloat(promo.maximumDiscount));
            }
        } else if (promo.discountType === 'FIXED_AMOUNT') {
            discount = Math.min(fare, discountVal);
        }

        const discountAmount = Number(discount.toFixed(2));
        const finalFare = Number(Math.max(0, fare - discountAmount).toFixed(2));

        // If a rideId is associated, link promotion record to the ride
        if (rideId) {
            const rideExists = await prisma.ride.findUnique({ where: { id: rideId } });
            if (rideExists) {
                await prisma.ridePromotion.upsert({
                    where: { rideId },
                    update: {
                        promoCodeId: promo.id,
                        discountAmount
                    },
                    create: {
                        rideId,
                        promoCodeId: promo.id,
                        discountAmount
                    }
                });

                await prisma.ride.update({
                    where: { id: rideId },
                    data: { estimatedFare: finalFare }
                });
            }
        }

        return res.status(200).json({
            valid: true,
            code: promo.code,
            discountType: promo.discountType,
            discountValue: discountVal,
            discountAmount,
            originalFare: fare,
            finalFare,
            message: `Promo code ${promo.code} applied! You saved $${discountAmount.toFixed(2)}.`
        });

    } catch (error) {
        console.error("ValidatePromotion Error:", error);
        return res.status(500).json({ valid: false, message: 'Failed to validate promo code', error: error.message });
    }
};

// List available public promo codes for riders
// GET /promotions
export const getActivePromotions = async (req, res) => {
    try {
        await seedDefaultPromos();

        const now = new Date();
        const promos = await prisma.promoCode.findMany({
            where: {
                isActive: true,
                startsAt: { lte: now },
                expiresAt: { gte: now }
            },
            select: {
                id: true,
                code: true,
                discountType: true,
                discountValue: true,
                minimumFare: true,
                maximumDiscount: true,
                expiresAt: true
            },
            orderBy: { createdAt: 'desc' }
        });

        return res.status(200).json({ promotions: promos });

    } catch (error) {
        console.error("GetActivePromotions Error:", error);
        return res.status(500).json({ message: 'Failed to retrieve promotions', error: error.message });
    }
};
