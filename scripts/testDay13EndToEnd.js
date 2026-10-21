// HopIn DAY 13: Master End-to-End Workflow & Integration Test Suite
// Validates all 14 workflow steps for the Rider application:
// 1. Register & login as rider
// 2. Simulated driver entity verification (Rider-only scope)
// 3. Driver availability management
// 4. Pickup & destination coordinate selection
// 5. Upfront fare estimation across vehicle tiers
// 6. Ride request creation (status REQUESTED)
// 7. Driver assignment & race-condition prevention
// 8. Live status updates & tracking telemetry
// 9. Status lifecycle transitions (ACCEPTED -> ARRIVING -> IN_PROGRESS -> COMPLETED)
// 10. Stripe payment initiation & verified status recording in PostgreSQL
// 11. Rider history retrieval & official tax receipt generation
// 12. Post-ride rating & review with database constraint enforcement
// 13. Cancellation policy, promo codes, multi-stop waypoints, SOS, and customer support
// 14. Security authorization, request validation & failure handling

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';

const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    bold: '\x1b[1m',
    reset: '\x1b[0m'
};

function pass(step, detail = '') {
    console.log(`  ${colors.green}✔ PASS${colors.reset} ${colors.bold}${step}${colors.reset} ${detail ? colors.cyan + '(' + detail + ')' + colors.reset : ''}`);
}

function fail(step, err) {
    console.error(`  ${colors.red}✖ FAIL${colors.reset} ${colors.bold}${step}${colors.reset}:`, err);
}

async function runMasterE2ETests() {
    console.log(`\n${colors.bold}======================================================${colors.reset}`);
    console.log(`${colors.bold}    HopIn DAY 13: Master End-to-End Test Suite        ${colors.reset}`);
    console.log(`${colors.bold}======================================================\n${colors.reset}`);

    const startTime = Date.now();
    let passedCount = 0;
    let failedCount = 0;

    let riderToken = '';
    let riderAuthHeader = {};
    let riderUser = null;

    let secondRiderToken = '';
    let secondRiderAuthHeader = {};

    let testRideId = '';
    let secondRideId = '';
    let paymentId = '';
    let emergencyContactId = '';
    let supportTicketId = '';

    const timestamp = Date.now();
    const primaryRiderData = {
        name: `Rider Primary ${timestamp}`,
        email: `rider_${timestamp}@hopin.test`,
        phone: `+1${Math.floor(Math.random() * 9000000000 + 1000000000)}`,
        password: `Password@${timestamp}`
    };

    const secondaryRiderData = {
        name: `Rider Secondary ${timestamp}`,
        email: `intruder_${timestamp}@hopin.test`,
        phone: `+1${Math.floor(Math.random() * 9000000000 + 1000000000)}`,
        password: `Password@${timestamp}`
    };

    // -------------------------------------------------------------------------
    // STEP 1: Register and Log In as a Rider
    // -------------------------------------------------------------------------
    try {
        let regRes = await fetch(`${BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(primaryRiderData)
        });
        let regJson = await regRes.json();
        if (regRes.status !== 201) {
            // Cold start retry
            await new Promise(r => setTimeout(r, 1500));
            regRes = await fetch(`${BASE_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(primaryRiderData)
            });
            regJson = await regRes.json();
        }
        if (regRes.status !== 201) throw new Error(regJson.message || 'Registration failed');

        const loginRes = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: primaryRiderData.email, password: primaryRiderData.password })
        });
        const loginJson = await loginRes.json();
        if (loginRes.status !== 200 || !loginJson.token) throw new Error(loginJson.message || 'Login failed');

        riderToken = loginJson.token;
        riderUser = loginJson.user;
        riderAuthHeader = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${riderToken}`
        };

        const profRes = await fetch(`${BASE_URL}/profile`, { headers: riderAuthHeader });
        const profJson = await profRes.json();
        if (profRes.status !== 200 || !profJson.user) throw new Error('Profile fetch failed');

        pass('1. Rider Registration, Login & Profile Verification', `Rider ID: ${riderUser.id.substring(0, 8)}...`);
        passedCount++;
    } catch (e) {
        fail('1. Rider Registration & Login', e.message);
        failedCount++;
    }

    // Register second rider for authorization testing
    try {
        await fetch(`${BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(secondaryRiderData)
        });
        const secLoginRes = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: secondaryRiderData.email, password: secondaryRiderData.password })
        });
        const secLoginJson = await secLoginRes.json();
        secondRiderToken = secLoginJson.token;
        secondRiderAuthHeader = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${secondRiderToken}`
        };
    } catch (e) {
        console.warn('Second rider prep warning:', e.message);
    }

    // -------------------------------------------------------------------------
    // STEP 2: Driver Registration / Simulated Entity (Rider-Only Scope)
    // -------------------------------------------------------------------------
    try {
        const ratingRes = await fetch(`${BASE_URL}/drivers/rating`, { headers: riderAuthHeader });
        const ratingJson = await ratingRes.json();

        if (ratingRes.status === 200 && ratingJson.averageRating !== undefined) {
            pass('2. Driver Simulation & Entity Verification (Rider Scope)', `Simulated Driver Rating: ${ratingJson.averageRating}★`);
            passedCount++;
        } else {
            throw new Error(ratingJson.message || 'Driver rating endpoint failed');
        }
    } catch (e) {
        fail('2. Driver Entity Verification', e.message);
        failedCount++;
    }

    // -------------------------------------------------------------------------
    // STEP 3: Set Driver as Available
    // -------------------------------------------------------------------------
    try {
        const toggleRes = await fetch(`${BASE_URL}/driver/availability`, {
            method: 'PATCH',
            headers: riderAuthHeader,
            body: JSON.stringify({ isAvailable: true })
        });
        const toggleJson = await toggleRes.json();

        const getAvailRes = await fetch(`${BASE_URL}/driver/availability`, { headers: riderAuthHeader });
        const getAvailJson = await getAvailRes.json();

        if (getAvailRes.status === 200 && getAvailJson.isAvailable === true) {
            pass('3. Driver Availability Management', 'Driver set to ONLINE');
            passedCount++;
        } else {
            throw new Error('Driver availability not confirmed true');
        }
    } catch (e) {
        fail('3. Driver Availability Management', e.message);
        failedCount++;
    }

    // -------------------------------------------------------------------------
    // STEP 4: Select Pickup and Destination
    // -------------------------------------------------------------------------
    const pickupLocation = {
        address: 'Connaught Place Inner Circle, New Delhi, Delhi',
        latitude: 28.6315,
        longitude: 77.2167
    };
    const dropoffLocation = {
        address: 'Cyber Hub, DLF Cyber City, Sector 24, Gurugram, Haryana',
        latitude: 28.4950,
        longitude: 77.0895
    };

    try {
        const routeRes = await fetch(`${BASE_URL}/maps/route?startLat=${pickupLocation.latitude}&startLng=${pickupLocation.longitude}&endLat=${dropoffLocation.latitude}&endLng=${dropoffLocation.longitude}`, {
            headers: riderAuthHeader
        });
        const routeJson = await routeRes.json();

        if (routeRes.status === 200 && routeJson.distanceKm > 0) {
            pass('4. Pickup & Destination Selection', `${routeJson.distanceKm} km, ~${routeJson.durationMin} mins`);
            passedCount++;
        } else {
            throw new Error(routeJson.message || 'Routing calculation failed');
        }
    } catch (e) {
        fail('4. Pickup & Destination Selection', e.message);
        failedCount++;
    }

    // -------------------------------------------------------------------------
    // STEP 5: Calculate Estimated Fare
    // -------------------------------------------------------------------------
    try {
        const estRes = await fetch(`${BASE_URL}/rides/estimate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ distanceKm: 25.4, durationMin: 42 })
        });
        const estJson = await estRes.json();

        const sedanEst = estJson.estimates?.find(e => e.rideType === 'SEDAN');
        const suvEst = estJson.estimates?.find(e => e.rideType === 'SUV');

        if (estRes.status === 200 && sedanEst && suvEst && sedanEst.estimatedFare > 0) {
            pass('5. Upfront Fare Calculation Across Tiers', `Sedan: $${sedanEst.estimatedFare}, SUV: $${suvEst.estimatedFare}`);
            passedCount++;
        } else {
            throw new Error('Tiered fare estimate incomplete');
        }
    } catch (e) {
        fail('5. Estimated Fare Calculation', e.message);
        failedCount++;
    }

    // -------------------------------------------------------------------------
    // STEP 6: Request a Ride (Status REQUESTED)
    // -------------------------------------------------------------------------
    try {
        const createRes = await fetch(`${BASE_URL}/rides`, {
            method: 'POST',
            headers: riderAuthHeader,
            body: JSON.stringify({
                pickupAddress: pickupLocation.address,
                pickupLatitude: pickupLocation.latitude,
                pickupLongitude: pickupLocation.longitude,
                dropoffAddress: dropoffLocation.address,
                dropoffLatitude: dropoffLocation.latitude,
                dropoffLongitude: dropoffLocation.longitude,
                rideType: 'SEDAN',
                distanceKm: 25.4,
                estimatedFare: 52.85,
                estimatedDurationMin: 42
            })
        });
        const createJson = await createRes.json();

        if (createRes.status === 201 && createJson.ride?.id && createJson.ride?.status === 'REQUESTED') {
            testRideId = createJson.ride.id;
            pass('6. Request a Ride', `Ride ID: ${testRideId.substring(0, 8)}... (Status: REQUESTED)`);
            passedCount++;
        } else {
            throw new Error(createJson.message || 'Ride request creation failed');
        }
    } catch (e) {
        fail('6. Request a Ride', e.message);
        failedCount++;
    }

    // -------------------------------------------------------------------------
    // STEP 7: Accept the Ride as Driver & Test Race-Condition Prevention
    // -------------------------------------------------------------------------
    try {
        const acceptRes = await fetch(`${BASE_URL}/rides/${testRideId}/accept`, {
            method: 'POST',
            headers: riderAuthHeader,
            body: JSON.stringify({
                driverName: 'Vikramaditya Sharma',
                driverVehicle: 'Maruti Suzuki Dzire (Pearl White)',
                driverPlateNumber: 'DL 01 AB 4321'
            })
        });
        const acceptJson = await acceptRes.json();

        if (acceptRes.status !== 200 || acceptJson.ride?.status !== 'ACCEPTED') {
            throw new Error(acceptJson.message || 'Driver accept failed');
        }

        // Test Race Condition: A second driver attempting to accept the same ride must be blocked
        const raceRes = await fetch(`${BASE_URL}/rides/${testRideId}/accept`, {
            method: 'POST',
            headers: riderAuthHeader,
            body: JSON.stringify({ driverName: 'Competitor Driver' })
        });
        const raceJson = await raceRes.json();

        if ((raceRes.status === 409 || raceRes.status === 400) && (raceJson.message?.includes('already') || raceJson.message?.includes('available'))) {
            pass('7. Driver Acceptance & Race-Condition Prevention', `Assigned: ${acceptJson.ride.driverName}, Second accept blocked HTTP ${raceRes.status}`);
            passedCount++;
        } else {
            throw new Error('Race condition test was not blocked as expected');
        }
    } catch (e) {
        fail('7. Driver Acceptance & Race-Condition Prevention', e.message);
        failedCount++;
    }

    // -------------------------------------------------------------------------
    // STEP 8: Verify Live Status and Location Updates
    // -------------------------------------------------------------------------
    try {
        const rideDetailsRes = await fetch(`${BASE_URL}/rides/${testRideId}`, { headers: riderAuthHeader });
        const rideDetailsJson = await rideDetailsRes.json();

        if (rideDetailsRes.status === 200 && (rideDetailsJson.ride?.status === 'ACCEPTED' || rideDetailsJson.ride?.status === 'DRIVER_ARRIVING') && rideDetailsJson.ride?.driverPlateNumber) {
            pass('8. Live Status & Driver Telemetry Synchronized', `Plate: ${rideDetailsJson.ride.driverPlateNumber}`);
            passedCount++;
        } else {
            throw new Error(`Ride status query failed: HTTP ${rideDetailsRes.status} status=${rideDetailsJson.ride?.status}`);
        }
    } catch (e) {
        fail('8. Live Status & Telemetry', e.message);
        failedCount++;
    }

    // -------------------------------------------------------------------------
    // STEP 9: Start and Complete the Ride Lifecycle
    // -------------------------------------------------------------------------
    try {
        // 9a. Ensure ride is at DRIVER_ARRIVING
        const checkRideRes = await fetch(`${BASE_URL}/rides/${testRideId}`, { headers: riderAuthHeader });
        const checkRideJson = await checkRideRes.json();
        if (checkRideJson.ride?.status === 'ACCEPTED') {
            const arrRes = await fetch(`${BASE_URL}/rides/${testRideId}/status`, {
                method: 'PATCH',
                headers: riderAuthHeader,
                body: JSON.stringify({ status: 'DRIVER_ARRIVING' })
            });
            const arrJson = await arrRes.json();
            if (arrRes.status !== 200 || arrJson.ride?.status !== 'DRIVER_ARRIVING') {
                throw new Error(arrJson.message || 'Transition to DRIVER_ARRIVING failed');
            }
        }

        // 9b. IN_PROGRESS
        const startRes = await fetch(`${BASE_URL}/rides/${testRideId}/status`, {
            method: 'PATCH',
            headers: riderAuthHeader,
            body: JSON.stringify({ status: 'IN_PROGRESS' })
        });
        const startJson = await startRes.json();
        if (startRes.status !== 200 || startJson.ride?.status !== 'IN_PROGRESS') {
            throw new Error(startJson.message || 'Transition to IN_PROGRESS failed');
        }

        // 9c. COMPLETED
        const compRes = await fetch(`${BASE_URL}/rides/${testRideId}/status`, {
            method: 'PATCH',
            headers: riderAuthHeader,
            body: JSON.stringify({ status: 'COMPLETED' })
        });
        const compJson = await compRes.json();
        if (compRes.status !== 200 || compJson.ride?.status !== 'COMPLETED') {
            throw new Error(compJson.message || 'Transition to COMPLETED failed');
        }

        pass('9. Ride Lifecycle Progression', 'ACCEPTED -> DRIVER_ARRIVING -> IN_PROGRESS -> COMPLETED');
        passedCount++;
    } catch (e) {
        fail('9. Ride Lifecycle Progression', e.message);
        failedCount++;
    }

    // -------------------------------------------------------------------------
    // STEP 10: Process Payment and Verify Status
    // -------------------------------------------------------------------------
    try {
        const intentRes = await fetch(`${BASE_URL}/payments/create-intent`, {
            method: 'POST',
            headers: riderAuthHeader,
            body: JSON.stringify({
                rideId: testRideId,
                amount: 52.85,
                currency: 'usd'
            })
        });
        const intentJson = await intentRes.json();
        if (intentRes.status !== 200 || !intentJson.paymentIntentId) {
            throw new Error(intentJson.message || 'Payment intent creation failed');
        }

        // Simulate verified Stripe payment completion
        const verifyRes = await fetch(`${BASE_URL}/payments/simulate-webhook`, {
            method: 'POST',
            headers: riderAuthHeader,
            body: JSON.stringify({
                paymentIntentId: intentJson.paymentIntentId,
                rideId: testRideId,
                amount: 52.85
            })
        });
        const verifyJson = await verifyRes.json();
        if (verifyRes.status !== 200 || verifyJson.status !== 'SUCCEEDED') {
            throw new Error(verifyJson.message || 'Payment verification failed');
        }

        paymentId = verifyJson.paymentId;

        // Query payment by ID
        const getPayRes = await fetch(`${BASE_URL}/payments/${paymentId}`, { headers: riderAuthHeader });
        const getPayJson = await getPayRes.json();

        if (getPayRes.status === 200 && getPayJson.payment?.status === 'SUCCEEDED') {
            pass('10. Stripe Payment Processing & PostgreSQL Verification', `Amount: $${getPayJson.payment.amount}, Ref: ${getPayJson.payment.providerPaymentId.substring(0, 16)}...`);
            passedCount++;
        } else {
            throw new Error('Payment verification lookup failed');
        }
    } catch (e) {
        fail('10. Payment Processing', e.message);
        failedCount++;
    }

    // -------------------------------------------------------------------------
    // STEP 11: View Ride History and Retrieve the Receipt
    // -------------------------------------------------------------------------
    try {
        const histRes = await fetch(`${BASE_URL}/rides/history`, { headers: riderAuthHeader });
        const histJson = await histRes.json();

        const completedInHistory = histJson.rides?.find(r => r.id === testRideId);
        if (!completedInHistory) throw new Error(`Completed ride not found in rider history: status=${histRes.status}, count=${histJson.rides?.length}, testRideId=${testRideId}, message=${histJson.message}, error=${histJson.error}`);

        const rcptRes = await fetch(`${BASE_URL}/rides/${testRideId}/receipt`, { headers: riderAuthHeader });
        const rcptJson = await rcptRes.json();
        if (rcptRes.status !== 200 || !rcptJson.receipt?.receiptNumber) {
            throw new Error(`${rcptJson.message || 'Receipt generation failed'}: ${rcptJson.error}`);
        }

        const emailRes = await fetch(`${BASE_URL}/rides/${testRideId}/receipt/email`, {
            method: 'POST',
            headers: riderAuthHeader,
            body: JSON.stringify({ targetEmail: primaryRiderData.email })
        });
        const emailJson = await emailRes.json();
        if (emailRes.status !== 200) throw new Error(emailJson.message || 'Receipt email delivery failed');

        pass('11. Ride History, Tax Invoice & Email Dispatch', `Receipt: ${rcptJson.receipt.receiptNumber}, Total: $${rcptJson.receipt.totalFare}`);
        passedCount++;
    } catch (e) {
        fail('11. Ride History & Receipts', e.message);
        failedCount++;
    }

    // -------------------------------------------------------------------------
    // STEP 12: Submit Rating and Review
    // -------------------------------------------------------------------------
    try {
        const revRes = await fetch(`${BASE_URL}/rides/${testRideId}/review`, {
            method: 'POST',
            headers: riderAuthHeader,
            body: JSON.stringify({
                rating: 5,
                feedback: 'Fantastic smooth trip, very punctual driver and clean car!'
            })
        });
        const revJson = await revRes.json();
        if (revRes.status !== 201 || revJson.review?.rating !== 5) {
            throw new Error(`${revJson.message || 'Review submission failed'}: ${revJson.error}`);
        }

        // Test 1-Review-Per-Ride Constraint
        const dupRevRes = await fetch(`${BASE_URL}/rides/${testRideId}/review`, {
            method: 'POST',
            headers: riderAuthHeader,
            body: JSON.stringify({ rating: 4, feedback: 'Trying second review' })
        });
        const dupRevJson = await dupRevRes.json();

        if (dupRevRes.status === 409 || (dupRevRes.status === 400 && dupRevJson.message?.includes('already reviewed'))) {
            pass('12. Post-Ride 5-Star Review & One-Review-Per-Ride Constraint', `Duplicate review prevented with HTTP ${dupRevRes.status}`);
            passedCount++;
        } else {
            throw new Error(`Duplicate review constraint not enforced: HTTP ${dupRevRes.status} - ${JSON.stringify(dupRevJson)}`);
        }
    } catch (e) {
        fail('12. Rating and Review', e.message);
        failedCount++;
    }

    // -------------------------------------------------------------------------
    // STEP 13: Test Cancellation, Promo Codes, Multi-Stop, SOS & Support Tickets
    // -------------------------------------------------------------------------
    try {
        // 13a. Promo Code Validation
        const promoRes = await fetch(`${BASE_URL}/promotions/validate`, {
            method: 'POST',
            headers: riderAuthHeader,
            body: JSON.stringify({ code: 'HOPIN50', rideFare: 30.00 })
        });
        const promoJson = await promoRes.json();
        if (promoRes.status !== 200 || promoJson.discountAmount !== 10) {
            throw new Error(`Promo HOPIN50 calculation mismatch: expected 10, got ${promoJson.discountAmount}`);
        }

        // 13b. Multi-Stop Ride Creation & Upfront Fare Recalculation
        const secondRideRes = await fetch(`${BASE_URL}/rides`, {
            method: 'POST',
            headers: riderAuthHeader,
            body: JSON.stringify({
                pickupAddress: 'Saket Community Centre, New Delhi',
                pickupLatitude: 28.5284,
                pickupLongitude: 77.2189,
                dropoffAddress: 'IGI Airport T3, New Delhi',
                dropoffLatitude: 28.5562,
                dropoffLongitude: 77.1000,
                rideType: 'SUV',
                distanceKm: 14.2,
                estimatedFare: 42.00,
                estimatedDurationMin: 28,
                stops: [
                    { address: 'Select Citywalk Mall, Saket', latitude: 28.5280, longitude: 77.2180, sequence: 1 }
                ]
            })
        });
        const secondRideJson = await secondRideRes.json();
        if (secondRideRes.status !== 201 || !secondRideJson.ride?.id) {
            throw new Error(`Second ride creation failed: HTTP ${secondRideRes.status} - ${JSON.stringify(secondRideJson)}`);
        }
        secondRideId = secondRideJson.ride.id;

        // Add additional intermediary waypoint
        const addStopRes = await fetch(`${BASE_URL}/rides/${secondRideId}/stops`, {
            method: 'POST',
            headers: riderAuthHeader,
            body: JSON.stringify({
                stops: [
                    { address: 'Hauz Khas Metro Station', latitude: 28.5432, longitude: 77.2065, sequence: 2 }
                ]
            })
        });
        const addStopJson = await addStopRes.json();
        if (addStopRes.status !== 201 || addStopJson.stops?.length < 2) {
            throw new Error(`Multi-stop addition failed: HTTP ${addStopRes.status} - ${JSON.stringify(addStopJson)}`);
        }

        // 13c. Emergency Contact & SOS Alert
        const contactRes = await fetch(`${BASE_URL}/emergency-contacts`, {
            method: 'POST',
            headers: riderAuthHeader,
            body: JSON.stringify({
                name: 'Kavita Sharma',
                phone: '+919988776655',
                relationship: 'Sister'
            })
        });
        const contactJson = await contactRes.json();
        if (contactRes.status !== 201 || !contactJson.contact?.id) {
            throw new Error(`Emergency contact creation failed: HTTP ${contactRes.status} - ${JSON.stringify(contactJson)}`);
        }
        emergencyContactId = contactJson.contact.id;

        const sosRes = await fetch(`${BASE_URL}/rides/${secondRideId}/emergency`, {
            method: 'POST',
            headers: riderAuthHeader,
            body: JSON.stringify({ latitude: 28.5400, longitude: 77.2100 })
        });
        const sosJson = await sosRes.json();
        if (sosRes.status !== 201 || !sosJson.alert?.id) {
            throw new Error(`Emergency SOS trigger failed: HTTP ${sosRes.status} - ${JSON.stringify(sosJson)}`);
        }

        // 13d. Ride Cancellation
        const cancelRes = await fetch(`${BASE_URL}/rides/${secondRideId}/cancel`, {
            method: 'POST',
            headers: riderAuthHeader,
            body: JSON.stringify({ reason: 'Flight departure time changed' })
        });
        const cancelJson = await cancelRes.json();
        if (cancelRes.status !== 200 || cancelJson.ride?.status !== 'CANCELLED') {
            throw new Error(`Ride cancellation failed: HTTP ${cancelRes.status} - ${JSON.stringify(cancelJson)}`);
        }

        // 13e. Customer Support Ticket Lifecycle
        const ticketRes = await fetch(`${BASE_URL}/support/tickets`, {
            method: 'POST',
            headers: riderAuthHeader,
            body: JSON.stringify({
                category: 'LOST_ITEM',
                subject: 'Forgotten headphones in backseat',
                description: 'Black Sony headphones left on the rear seat during ride',
                rideId: testRideId
            })
        });
        const ticketJson = await ticketRes.json();
        if (ticketRes.status !== 201 || !ticketJson.ticket?.id) {
            throw new Error(`Support ticket creation failed: HTTP ${ticketRes.status} - ${JSON.stringify(ticketJson)}`);
        }
        supportTicketId = ticketJson.ticket.id;

        // Support resolution response
        const resolveRes = await fetch(`${BASE_URL}/support/tickets/${supportTicketId}`, {
            method: 'PATCH',
            headers: riderAuthHeader,
            body: JSON.stringify({
                status: 'RESOLVED',
                systemResponse: 'Driver contacted. Item has been located and vaulted at the local hub.'
            })
        });
        const resolveJson = await resolveRes.json();
        if (resolveRes.status !== 200 || resolveJson.ticket?.status !== 'RESOLVED') {
            throw new Error(`Support ticket resolution failed: HTTP ${resolveRes.status} - ${JSON.stringify(resolveJson)}`);
        }

        pass('13. Cancellation, Promo, Multi-Stop, SOS & Support Tickets', 'All 5 feature suites validated successfully');
        passedCount++;
    } catch (e) {
        fail('13. Additional Features Suite', e.message);
        failedCount++;
    }

    // -------------------------------------------------------------------------
    // STEP 14: Verify Authorization, Validation & Failure Handling
    // -------------------------------------------------------------------------
    try {
        let authPassed = true;

        // 14a. Unauthorized access: Second rider trying to cancel first rider's ride
        const unauthCancelRes = await fetch(`${BASE_URL}/rides/${testRideId}/cancel`, {
            method: 'POST',
            headers: secondRiderAuthHeader,
            body: JSON.stringify({ reason: 'Intruder cancelling' })
        });
        if (unauthCancelRes.status !== 403) {
            authPassed = false;
            throw new Error(`Expected HTTP 403 for cross-rider cancellation, got ${unauthCancelRes.status}`);
        }

        // 14b. Unauthenticated access: Request without token rejected
        const noAuthRes = await fetch(`${BASE_URL}/rides/history`);
        if (noAuthRes.status !== 401) {
            authPassed = false;
            throw new Error(`Expected HTTP 401 for unauthenticated request, got ${noAuthRes.status}`);
        }

        // 14c. Input validation: Request ride with missing fields rejected
        const badRideRes = await fetch(`${BASE_URL}/rides`, {
            method: 'POST',
            headers: riderAuthHeader,
            body: JSON.stringify({ pickupAddress: 'Connaught Place' }) // Missing coordinates & fare
        });
        if (badRideRes.status !== 400) {
            authPassed = false;
            throw new Error(`Expected HTTP 400 for incomplete ride payload, got ${badRideRes.status}`);
        }

        // 14d. Invalid lifecycle transition: Attempting to complete already cancelled ride
        const invalidTransRes = await fetch(`${BASE_URL}/rides/${secondRideId}/status`, {
            method: 'PATCH',
            headers: riderAuthHeader,
            body: JSON.stringify({ status: 'COMPLETED' })
        });
        if (invalidTransRes.status !== 400) {
            authPassed = false;
            throw new Error(`Expected HTTP 400 for transitioning CANCELLED ride, got ${invalidTransRes.status}`);
        }

        if (authPassed) {
            pass('14. Security Authorization, Validation & Failure Handling', '401, 403, 400 error codes properly enforced');
            passedCount++;
        }
    } catch (e) {
        fail('14. Security Authorization & Validation', e.message);
        failedCount++;
    }

    // -------------------------------------------------------------------------
    // Final Results Summary
    // -------------------------------------------------------------------------
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n${colors.bold}------------------------------------------------------${colors.reset}`);
    console.log(`${colors.bold}Results: ${colors.green}${passedCount} Passed${colors.reset}, ${failedCount > 0 ? colors.red : colors.green}${failedCount} Failed${colors.reset} (${duration}s)`);
    console.log(`${colors.bold}------------------------------------------------------${colors.reset}\n`);

    if (failedCount === 0) {
        console.log(`${colors.green}${colors.bold}✔ ALL 14 DAY 13 END-TO-END WORKFLOW SCENARIOS PASSED!${colors.reset}\n`);
    } else {
        console.error(`${colors.red}${colors.bold}✖ SOME SCENARIOS FAILED. Check log details above.${colors.reset}\n`);
        process.exit(1);
    }
}

runMasterE2ETests().catch((err) => {
    console.error('Fatal Test Execution Error:', err);
    process.exit(1);
});
