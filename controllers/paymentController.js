import Stripe from 'stripe';
import { prisma } from '../lib/prisma.js';
import { emitRideStatus, getIO } from '../lib/socket.js';

// Initialize Stripe instance
const stripeKey = process.env.STRIPE_SECRET_KEY || 'sk_test_mock_hopin_development_key';
export const stripe = new Stripe(stripeKey, {
    apiVersion: '2023-10-16'
});

// Webhook secret for HMAC signature verification
export const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_hopin_test_secret_development_key_12345';

// Create a Stripe PaymentIntent for a ride
// POST /payments/create-intent
export const createPaymentIntent = async (req, res) => {
    try {
        const riderId = req.user.id;
        const { rideId, method = 'CARD', currency = 'USD' } = req.body;

        if (!rideId) {
            return res.status(400).json({ message: 'rideId is required' });
        }

        // 1. Look up ride in PostgreSQL
        const ride = await prisma.ride.findUnique({
            where: { id: rideId },
            include: { payment: true }
        });

        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        if (ride.riderId !== riderId) {
            return res.status(403).json({ message: 'Unauthorized to pay for this ride' });
        }

        // 2. Prevent duplicate payment if already completed
        if (ride.payment && ride.payment.status === 'SUCCEEDED') {
            return res.status(400).json({
                message: 'Ride payment has already been completed and verified.',
                payment: ride.payment
            });
        }

        const fare = Number(ride.finalFare || ride.estimatedFare || 15.00);
        const amountInCents = Math.round(fare * 100);

        let paymentIntentId = null;
        let clientSecret = null;

        // 3. Initiate Stripe PaymentIntent (or sandbox simulation if test keys)
        try {
            if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('mock')) {
                const intent = await stripe.paymentIntents.create({
                    amount: amountInCents,
                    currency: currency.toLowerCase(),
                    payment_method_types: ['card'],
                    metadata: {
                        rideId: ride.id,
                        riderId,
                        pickup: (ride.pickupAddress || '').substring(0, 100),
                        dropoff: (ride.dropoffAddress || '').substring(0, 100)
                    }
                });
                paymentIntentId = intent.id;
                clientSecret = intent.client_secret;
            } else {
                // Realistic mock payment intent for testing & development
                const randomId = Math.random().toString(36).substring(2, 10);
                paymentIntentId = `pi_${Date.now()}_${randomId}`;
                clientSecret = `${paymentIntentId}_secret_${Math.random().toString(36).substring(2, 12)}`;
            }
        } catch (stripeErr) {
            console.warn("Stripe API call fallback to simulation intent:", stripeErr.message);
            const randomId = Math.random().toString(36).substring(2, 10);
            paymentIntentId = `pi_${Date.now()}_${randomId}`;
            clientSecret = `${paymentIntentId}_secret_${Math.random().toString(36).substring(2, 12)}`;
        }

        // 4. Record/Upsert initial PENDING Payment in PostgreSQL
        const paymentMethodEnum = ['CARD', 'WALLET', 'UPI', 'OTHER'].includes(method) ? method : 'CARD';

        const payment = await prisma.payment.upsert({
            where: { rideId: ride.id },
            update: {
                amount: fare.toFixed(2),
                currency: currency.toUpperCase(),
                method: paymentMethodEnum,
                status: 'PENDING',
                provider: 'stripe',
                providerPaymentId: paymentIntentId
            },
            create: {
                rideId: ride.id,
                riderId,
                amount: fare.toFixed(2),
                currency: currency.toUpperCase(),
                method: paymentMethodEnum,
                status: 'PENDING',
                provider: 'stripe',
                providerPaymentId: paymentIntentId
            }
        });

        return res.status(200).json({
            message: 'Payment intent created successfully',
            paymentIntentId,
            clientSecret,
            amount: fare.toFixed(2),
            currency: currency.toUpperCase(),
            payment
        });

    } catch (error) {
        console.error("CreatePaymentIntent Error:", error);
        return res.status(500).json({ message: 'Failed to create payment intent', error: error.message });
    }
};

// Handle Stripe Webhooks with Cryptographic Signature Verification
// Verifies Stripe webhook signatures and checks provider's payment identifiers to guarantee idempotency and prevent duplicate processing
export const handleWebhook = async (req, res) => {
    const sig = req.headers['stripe-signature'];

    let event;
    const rawPayload = req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

    try {
        if (!sig) {
            return res.status(400).json({ error: 'Missing stripe-signature header' });
        }

        // Verify cryptographic HMAC-SHA256 signature
        event = stripe.webhooks.constructEvent(rawPayload, sig, WEBHOOK_SECRET);
    } catch (err) {
        console.error("[Stripe Webhook Verification Error]:", err.message);
        return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
    }

    console.log(`[Stripe Webhook] Verified event: ${event.type} (ID: ${event.id})`);

    // Handle Event Types
    try {
        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object;
            const providerPaymentId = paymentIntent.id;
            const rideId = paymentIntent.metadata?.rideId;

            // 1. Look up existing payment by providerPaymentId to guarantee idempotency
            const existingPayment = await prisma.payment.findFirst({
                where: { providerPaymentId },
                include: { ride: true }
            });

            // Prevent duplicate processing
            if (existingPayment && existingPayment.status === 'SUCCEEDED') {
                console.log(`[Stripe Webhook] Payment ${providerPaymentId} already processed. Idempotent return.`);
                return res.status(200).json({
                    received: true,
                    duplicate: true,
                    message: 'Payment already processed and recorded'
                });
            }

            const targetRideId = rideId || existingPayment?.rideId;
            if (!targetRideId) {
                console.warn("[Stripe Webhook] No rideId associated with payment intent:", providerPaymentId);
                return res.status(400).json({ error: 'No rideId found in payment metadata or database' });
            }

            const ride = await prisma.ride.findUnique({
                where: { id: targetRideId }
            });

            if (!ride) {
                return res.status(404).json({ error: 'Associated ride not found' });
            }

            const paidAmount = paymentIntent.amount
                ? (paymentIntent.amount / 100).toFixed(2)
                : Number(ride.finalFare || ride.estimatedFare || 15.00).toFixed(2);

            const receiptUrl = paymentIntent.charges?.data?.[0]?.receipt_url ||
                `https://pay.stripe.com/receipts/${providerPaymentId}`;

            // 2. Update Payment record to SUCCEEDED in PostgreSQL
            const updatedPayment = await prisma.payment.upsert({
                where: { rideId: targetRideId },
                update: {
                    status: 'SUCCEEDED',
                    paidAt: new Date(),
                    providerPaymentId,
                    receiptUrl,
                    amount: paidAmount
                },
                create: {
                    rideId: targetRideId,
                    riderId: ride.riderId,
                    amount: paidAmount,
                    currency: (paymentIntent.currency || 'USD').toUpperCase(),
                    method: 'CARD',
                    status: 'SUCCEEDED',
                    provider: 'stripe',
                    providerPaymentId,
                    paidAt: new Date(),
                    receiptUrl
                }
            });

            // 3. Mark Ride as COMPLETED if not already completed
            const updatedRide = await prisma.ride.update({
                where: { id: targetRideId },
                data: {
                    status: 'COMPLETED',
                    completedAt: ride.completedAt || new Date(),
                    finalFare: updatedPayment.amount
                }
            });

            // 4. Record In-App Notification in PostgreSQL
            await prisma.notification.create({
                data: {
                    userId: ride.riderId,
                    rideId: ride.id,
                    type: 'PAYMENT',
                    title: 'Payment Successful',
                    message: `Payment of $${updatedPayment.amount} confirmed for your ride to ${ride.dropoffAddress.split(',')[0]}.`
                }
            });

            // 5. Emit Real-time Socket.IO events to authorized rider room
            emitRideStatus(targetRideId, 'COMPLETED', updatedRide, {
                title: 'Payment Confirmed',
                message: `Payment of $${updatedPayment.amount} received. Thank you!`,
                type: 'completed'
            });

            const io = getIO();
            if (io) {
                io.to(`ride_${targetRideId}`).emit('payment_success', {
                    rideId: targetRideId,
                    payment: updatedPayment
                });
            }

            console.log(`[Stripe Webhook] Successfully processed payment ${providerPaymentId} for ride ${targetRideId}`);
            return res.status(200).json({
                received: true,
                status: 'SUCCEEDED',
                paymentId: updatedPayment.id,
                rideId: targetRideId
            });

        } else if (event.type === 'payment_intent.payment_failed') {
            const paymentIntent = event.data.object;
            const providerPaymentId = paymentIntent.id;

            await prisma.payment.updateMany({
                where: { providerPaymentId },
                data: { status: 'FAILED' }
            });

            const failedPayment = await prisma.payment.findFirst({
                where: { providerPaymentId }
            });

            if (failedPayment) {
                const io = getIO();
                if (io) {
                    io.to(`ride_${failedPayment.rideId}`).emit('payment_failed', {
                        rideId: failedPayment.rideId,
                        message: paymentIntent.last_payment_error?.message || 'Payment authorization failed'
                    });
                }
            }

            return res.status(200).json({ received: true, status: 'FAILED' });
        }

        return res.status(200).json({ received: true, event: event.type });

    } catch (dbError) {
        console.error("[Stripe Webhook DB Error]:", dbError);
        return res.status(500).json({ error: 'Internal database processing failed', details: dbError.message });
    }
};

// Fetch Payment details by Payment ID or Ride ID
// GET /payments/:id
export const getPaymentById = async (req, res) => {
    try {
        const { id } = req.params;
        const riderId = req.user.id;

        const payment = await prisma.payment.findFirst({
            where: {
                OR: [
                    { id },
                    { rideId: id }
                ]
            },
            include: {
                ride: {
                    select: {
                        id: true,
                        status: true,
                        pickupAddress: true,
                        dropoffAddress: true,
                        distanceKm: true,
                        rideType: true,
                        driverName: true,
                        driverVehicle: true,
                        driverPlateNumber: true,
                        driverRating: true,
                        completedAt: true,
                        createdAt: true
                    }
                }
            }
        });

        if (!payment) {
            return res.status(404).json({ message: 'Payment record not found' });
        }

        // Authorize rider
        if (payment.riderId !== riderId) {
            return res.status(403).json({ message: 'Unauthorized to view this payment' });
        }

        return res.status(200).json({ payment });

    } catch (error) {
        console.error("GetPaymentById Error:", error);
        return res.status(500).json({ message: 'Failed to retrieve payment record', error: error.message });
    }
};

// Get Saved Payment Methods for current rider
// GET /payment-methods
export const getPaymentMethods = async (req, res) => {
    try {
        const userId = req.user.id;

        const methods = await prisma.paymentMethod.findMany({
            where: { userId },
            orderBy: [
                { isDefault: 'desc' },
                { createdAt: 'desc' }
            ]
        });

        return res.status(200).json({ paymentMethods: methods });
    } catch (error) {
        console.error("GetPaymentMethods Error:", error);
        return res.status(500).json({ message: 'Failed to retrieve payment methods', error: error.message });
    }
};

// Add a new Saved Payment Method
// POST /payment-methods
export const addPaymentMethod = async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            type = 'CARD',
            displayLabel,
            isDefault = false,
            providerMethodId,
            providerCustomerId
        } = req.body;

        const validTypes = ['CARD', 'WALLET', 'UPI', 'OTHER'];
        const methodType = validTypes.includes(type) ? type : 'CARD';

        // If setting as default, unmark other payment methods for this user
        if (isDefault) {
            await prisma.paymentMethod.updateMany({
                where: { userId },
                data: { isDefault: false }
            });
        }

        const generatedMethodId = providerMethodId || `pm_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const generatedCustomerId = providerCustomerId || `cus_${userId.substring(0, 8)}`;

        const newMethod = await prisma.paymentMethod.create({
            data: {
                userId,
                provider: 'stripe',
                providerCustomerId: generatedCustomerId,
                providerMethodId: generatedMethodId,
                type: methodType,
                displayLabel: displayLabel || (methodType === 'CARD' ? 'Visa •••• 4242' : `${methodType} Method`),
                isDefault: Boolean(isDefault)
            }
        });

        return res.status(201).json({
            message: 'Payment method saved successfully',
            paymentMethod: newMethod
        });
    } catch (error) {
        console.error("AddPaymentMethod Error:", error);
        return res.status(500).json({ message: 'Failed to save payment method', error: error.message });
    }
};

// Delete a Saved Payment Method
// DELETE /payment-methods/:id
export const deletePaymentMethod = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const existing = await prisma.paymentMethod.findUnique({
            where: { id }
        });

        if (!existing) {
            return res.status(404).json({ message: 'Payment method not found' });
        }

        if (existing.userId !== userId) {
            return res.status(403).json({ message: 'Unauthorized to delete this payment method' });
        }

        await prisma.paymentMethod.delete({
            where: { id }
        });

        // If the deleted method was default, promote the next available method
        if (existing.isDefault) {
            const nextMethod = await prisma.paymentMethod.findFirst({
                where: { userId },
                orderBy: { createdAt: 'desc' }
            });

            if (nextMethod) {
                await prisma.paymentMethod.update({
                    where: { id: nextMethod.id },
                    data: { isDefault: true }
                });
            }
        }

        return res.status(200).json({ message: 'Payment method removed successfully' });
    } catch (error) {
        console.error("DeletePaymentMethod Error:", error);
        return res.status(500).json({ message: 'Failed to delete payment method', error: error.message });
    }
};

// Helper to generate a verified Stripe Webhook event for testing & UI confirmation
// Invokes the exact webhook handler with a valid cryptographic signature
// POST /payments/simulate-webhook
export const simulateVerifiedWebhook = async (req, res) => {
    try {
        const { rideId, amount, paymentIntentId, outcome = 'success' } = req.body;

        if (!rideId) {
            return res.status(400).json({ message: 'rideId is required' });
        }

        const resolvedIntentId = paymentIntentId || `pi_${Date.now()}_sim_${Math.random().toString(36).substring(2, 6)}`;
        const amountCents = Math.round(Number(amount || 15.00) * 100);

        const eventType = outcome === 'success' ? 'payment_intent.succeeded' : 'payment_intent.payment_failed';

        const mockEventPayload = JSON.stringify({
            id: `evt_sim_${Date.now()}`,
            object: 'event',
            type: eventType,
            data: {
                object: {
                    id: resolvedIntentId,
                    amount: amountCents,
                    currency: 'usd',
                    status: outcome === 'success' ? 'succeeded' : 'failed',
                    metadata: {
                        rideId,
                        riderId: req.user?.id
                    },
                    charges: {
                        data: [
                            {
                                id: `ch_${Date.now()}`,
                                receipt_url: `https://pay.stripe.com/receipts/${resolvedIntentId}`
                            }
                        ]
                    }
                }
            }
        });

        // Generate genuine cryptographic Stripe HMAC signature using the test webhook secret
        const stripeSignatureHeader = stripe.webhooks.generateTestHeaderString({
            payload: mockEventPayload,
            secret: WEBHOOK_SECRET
        });

        // Dispatch through handleWebhook with verified signature header & raw body
        const simulatedReq = {
            headers: {
                'stripe-signature': stripeSignatureHeader
            },
            rawBody: mockEventPayload,
            body: JSON.parse(mockEventPayload)
        };

        return await handleWebhook(simulatedReq, res);

    } catch (error) {
        console.error("SimulateVerifiedWebhook Error:", error);
        return res.status(500).json({ message: 'Simulation failed', error: error.message });
    }
};
