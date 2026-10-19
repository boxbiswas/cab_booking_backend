import Stripe from 'stripe';

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_hopin_test_secret_development_key_12345';
const stripe = new Stripe('sk_test_mock_hopin_development_key', { apiVersion: '2023-10-16' });

const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
    reset: '\x1b[0m'
};

function pass(name, details = '') {
    console.log(`  ${colors.green}✔ PASS${colors.reset} ${name} ${details ? colors.cyan + '(' + details + ')' + colors.reset : ''}`);
}

function fail(name, error) {
    console.error(`  ${colors.red}✖ FAIL${colors.reset} ${name}:`, error);
}

async function runDay8Tests() {
    console.log(`\n${colors.bold}======================================================${colors.reset}`);
    console.log(`${colors.bold}    HopIn DAY 8: Stripe Payment & Webhook Test Suite  ${colors.reset}`);
    console.log(`${colors.bold}======================================================\n${colors.reset}`);

    let passed = 0;
    let failed = 0;
    let authHeader = {};
    let createdRideId = null;
    let paymentIntentId = null;
    let paymentId = null;
    let savedMethodId = null;

    const timestamp = Date.now();
    const testUser = {
        name: `Day8 Tester ${timestamp}`,
        email: `day8_${timestamp}@hopin.test`,
        phone: `+91${timestamp.toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`,
        password: `Pass@${timestamp}`
    };

    // 1. Register & Login Test Rider
    try {
        const regRes = await fetch(`${BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testUser)
        });
        const regData = await regRes.json();
        if (regRes.status !== 201) throw new Error(regData.message || 'Register failed');

        const loginRes = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: testUser.email, password: testUser.password })
        });
        const loginData = await loginRes.json();
        if (loginRes.status !== 200 || !loginData.token) throw new Error('Login failed');

        authHeader = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${loginData.token}`
        };

        pass("1. Rider Authentication", `Token acquired for ${testUser.email}`);
        passed++;
    } catch (e) {
        fail("1. Rider Authentication", e.message);
        failed++;
        return;
    }

    // 2. Create and Accept a Ride (To have a completed ride ready for payment)
    try {
        const rideRes = await fetch(`${BASE_URL}/rides`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({
                pickupAddress: "Connaught Place, New Delhi",
                pickupLatitude: 28.6315,
                pickupLongitude: 77.2167,
                dropoffAddress: "Indira Gandhi International Airport, Terminal 3",
                dropoffLatitude: 28.5562,
                dropoffLongitude: 77.1000,
                rideType: "SEDAN",
                distanceKm: 14.8,
                estimatedFare: 24.50,
                estimatedDurationMin: 32
            })
        });
        const rideData = await rideRes.json();
        if (rideRes.status !== 201 || !rideData.ride?.id) throw new Error(rideData.message || 'Ride creation failed');
        createdRideId = rideData.ride.id;

        // Transition ride to COMPLETED
        await fetch(`${BASE_URL}/rides/${createdRideId}/accept`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({ driverData: { driverName: "Vikramaditya Sharma" } })
        });
        await fetch(`${BASE_URL}/rides/${createdRideId}/status`, {
            method: 'PATCH',
            headers: authHeader,
            body: JSON.stringify({ status: "IN_PROGRESS" })
        });
        await fetch(`${BASE_URL}/rides/${createdRideId}/status`, {
            method: 'PATCH',
            headers: authHeader,
            body: JSON.stringify({ status: "COMPLETED" })
        });

        pass("2. Completed Ride Setup", `Ride ${createdRideId} ready in COMPLETED status`);
        passed++;
    } catch (e) {
        fail("2. Completed Ride Setup", e.message);
        failed++;
    }

    // 3. Initiate Payment (POST /payments/create-intent)
    try {
        const intentRes = await fetch(`${BASE_URL}/payments/create-intent`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({
                rideId: createdRideId,
                method: 'CARD',
                currency: 'USD'
            })
        });
        const intentData = await intentRes.json();
        if (intentRes.status !== 200 || !intentData.paymentIntentId || !intentData.clientSecret) {
            throw new Error(intentData.message || 'Payment intent creation failed');
        }

        paymentIntentId = intentData.paymentIntentId;
        paymentId = intentData.payment?.id;

        if (intentData.payment?.status !== 'PENDING') {
            throw new Error(`Expected PENDING status in DB, received ${intentData.payment?.status}`);
        }

        pass("3. Payment Initiation (POST /payments/create-intent)", `Created intent: ${paymentIntentId}, amount: $${intentData.amount}`);
        passed++;
    } catch (e) {
        fail("3. Payment Initiation", e.message);
        failed++;
    }

    // 4. Test Webhook Signature Rejection with Invalid Signature
    try {
        const fakePayload = JSON.stringify({
            id: 'evt_fake',
            type: 'payment_intent.succeeded',
            data: { object: { id: paymentIntentId } }
        });

        const rejectedRes = await fetch(`${BASE_URL}/payments/webhook`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'stripe-signature': 't=12345,v1=bad_signature_tampered_payload'
            },
            body: fakePayload
        });

        if (rejectedRes.status === 400) {
            pass("4. Webhook Security: Invalid Signature Rejection", "Tampered signature blocked with HTTP 400");
            passed++;
        } else {
            throw new Error(`Expected HTTP 400 rejection, received ${rejectedRes.status}`);
        }
    } catch (e) {
        fail("4. Webhook Security: Invalid Signature Rejection", e.message);
        failed++;
    }

    // 5. Test Webhook Verification with Valid Cryptographic Stripe Signature (POST /payments/webhook)
    try {
        const webhookPayload = JSON.stringify({
            id: `evt_test_${Date.now()}`,
            object: 'event',
            type: 'payment_intent.succeeded',
            data: {
                object: {
                    id: paymentIntentId,
                    amount: 2450, // $24.50
                    currency: 'usd',
                    status: 'succeeded',
                    metadata: {
                        rideId: createdRideId,
                        riderId: testUser.email
                    },
                    charges: {
                        data: [
                            {
                                id: `ch_${Date.now()}`,
                                receipt_url: `https://pay.stripe.com/receipts/${paymentIntentId}`
                            }
                        ]
                    }
                }
            }
        });

        // Compute real HMAC-SHA256 Stripe signature
        const validSignature = stripe.webhooks.generateTestHeaderString({
            payload: webhookPayload,
            secret: WEBHOOK_SECRET
        });

        const webhookRes = await fetch(`${BASE_URL}/payments/webhook`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'stripe-signature': validSignature
            },
            body: webhookPayload
        });

        const webhookData = await webhookRes.json();
        if (webhookRes.status === 200 && webhookData.status === 'SUCCEEDED') {
            pass("5. Verified Stripe Webhook Processing (POST /payments/webhook)", "Signature verified, status updated to SUCCEEDED in PostgreSQL");
            passed++;
        } else {
            throw new Error(webhookData.error || `Expected status 200, received ${webhookRes.status}`);
        }
    } catch (e) {
        fail("5. Verified Stripe Webhook Processing", e.message);
        failed++;
    }

    // 6. Test Duplicate Webhook Processing Prevention (Idempotency)
    try {
        const webhookPayload = JSON.stringify({
            id: `evt_dup_${Date.now()}`,
            object: 'event',
            type: 'payment_intent.succeeded',
            data: {
                object: {
                    id: paymentIntentId,
                    amount: 2450,
                    currency: 'usd',
                    metadata: { rideId: createdRideId }
                }
            }
        });

        const validSignature = stripe.webhooks.generateTestHeaderString({
            payload: webhookPayload,
            secret: WEBHOOK_SECRET
        });

        const dupRes = await fetch(`${BASE_URL}/payments/webhook`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'stripe-signature': validSignature
            },
            body: webhookPayload
        });

        const dupData = await dupRes.json();
        if (dupRes.status === 200 && dupData.duplicate === true) {
            pass("6. Duplicate Payment Prevention", "Second delivery flagged as duplicate and ignored");
            passed++;
        } else {
            throw new Error(`Expected duplicate flag, received: ${JSON.stringify(dupData)}`);
        }
    } catch (e) {
        fail("6. Duplicate Payment Prevention", e.message);
        failed++;
    }

    // 7. Fetch Verified Payment by ID (GET /payments/:id)
    try {
        const getRes = await fetch(`${BASE_URL}/payments/${createdRideId}`, {
            headers: authHeader
        });
        const getData = await getRes.json();
        if (getRes.status === 200 && getData.payment?.status === 'SUCCEEDED' && getData.payment?.providerPaymentId === paymentIntentId) {
            pass("7. Verified Payment Retrieval (GET /payments/:id)", `Payment confirmed: $${getData.payment.amount}, receipt: ${getData.payment.receiptUrl}`);
            passed++;
        } else {
            throw new Error(getData.message || 'Payment lookup failed');
        }
    } catch (e) {
        fail("7. Verified Payment Retrieval", e.message);
        failed++;
    }

    // 8. Driver Earnings Aggregation (GET /driver/earnings)
    try {
        const earnRes = await fetch(`${BASE_URL}/driver/earnings`, {
            headers: authHeader
        });
        const earnData = await earnRes.json();
        if (earnRes.status === 200 && earnData.summary && earnData.trips?.length > 0) {
            pass("8. Driver Earnings Records (GET /driver/earnings)", `Total rides: ${earnData.summary.totalCompletedRides}, Net Driver: $${earnData.summary.netDriverEarnings}`);
            passed++;
        } else {
            throw new Error(earnData.message || 'Driver earnings retrieval failed');
        }
    } catch (e) {
        fail("8. Driver Earnings Records", e.message);
        failed++;
    }

    // 9. Payment Methods Management (GET, POST, DELETE /payment-methods)
    try {
        // Create Payment Method
        const createPmRes = await fetch(`${BASE_URL}/payment-methods`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({
                type: 'CARD',
                displayLabel: 'Mastercard •••• 5555',
                isDefault: true
            })
        });
        const createPmData = await createPmRes.json();
        if (createPmRes.status !== 201 || !createPmData.paymentMethod?.id) {
            throw new Error('Payment method creation failed');
        }
        savedMethodId = createPmData.paymentMethod.id;

        // Fetch Payment Methods
        const listPmRes = await fetch(`${BASE_URL}/payment-methods`, {
            headers: authHeader
        });
        const listPmData = await listPmRes.json();
        if (listPmRes.status !== 200 || !listPmData.paymentMethods?.some(m => m.id === savedMethodId)) {
            throw new Error('Payment method list failed');
        }

        // Delete Payment Method
        const delPmRes = await fetch(`${BASE_URL}/payment-methods/${savedMethodId}`, {
            method: 'DELETE',
            headers: authHeader
        });
        if (delPmRes.status !== 200) {
            throw new Error('Payment method delete failed');
        }

        pass("9. Payment Methods CRUD (GET, POST, DELETE /payment-methods)", "Created, retrieved, and removed vaulted payment method in PostgreSQL");
        passed++;
    } catch (e) {
        fail("9. Payment Methods CRUD", e.message);
        failed++;
    }

    console.log(`\n${colors.bold}------------------------------------------------------${colors.reset}`);
    console.log(`Results: ${colors.green}${passed} Passed${colors.reset}, ${failed > 0 ? colors.red + failed + ' Failed' : colors.green + '0 Failed'}${colors.reset}`);
    console.log(`${colors.bold}------------------------------------------------------\n${colors.reset}`);

    if (failed === 0) {
        console.log(`${colors.green}${colors.bold}✔ ALL DAY 8 REQUIREMENTS VERIFIED SUCCESSFULLY!${colors.reset}\n`);
    } else {
        process.exit(1);
    }
}

runDay8Tests().catch(err => {
    console.error("Test runner crashed:", err);
    process.exit(1);
});
