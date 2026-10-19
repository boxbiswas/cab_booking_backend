const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';

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

async function runDay10Tests() {
    console.log(`\n${colors.bold}======================================================${colors.reset}`);
    console.log(`${colors.bold}    HopIn DAY 10: Ratings & Reviews Test Suite        ${colors.reset}`);
    console.log(`${colors.bold}======================================================\n${colors.reset}`);

    let passed = 0;
    let failed = 0;
    let authHeader = {};
    let completedRideId = null;
    let requestedRideId = null;

    const timestamp = Date.now();
    const testUser = {
        name: `Day10 Rider ${timestamp}`,
        email: `day10_${timestamp}@hopin.test`,
        phone: `+91${timestamp.toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`,
        password: `Pass@${timestamp}`
    };

    // 1. Rider Registration & Authentication
    try {
        const regRes = await fetch(`${BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testUser)
        });
        const regData = await regRes.json();

        if (regRes.status !== 201) {
            throw new Error(regData.message || 'Registration failed');
        }

        const loginRes = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: testUser.email, password: testUser.password })
        });
        const loginData = await loginRes.json();

        if (loginRes.status !== 200 || !loginData.token) {
            throw new Error(loginData.message || 'Login failed');
        }

        authHeader = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${loginData.token}`
        };

        pass("1. Rider Authentication", `Token acquired for ${testUser.email}`);
        passed++;
    } catch (err) {
        fail("1. Rider Authentication", err.message);
        failed++;
        process.exit(1);
    }

    // 2. Create Completed Ride & Pending Ride
    try {
        // Create ride 1: to be completed
        const ride1Res = await fetch(`${BASE_URL}/rides`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({
                pickupAddress: 'Connaught Place, New Delhi',
                pickupLatitude: 28.6315,
                pickupLongitude: 77.2167,
                dropoffAddress: 'Indira Gandhi International Airport, New Delhi',
                dropoffLatitude: 28.5562,
                dropoffLongitude: 77.1000,
                rideType: 'SEDAN',
                distanceKm: 14.8,
                estimatedFare: 22.50,
                estimatedDurationMin: 35
            })
        });
        const ride1Data = await ride1Res.json();
        completedRideId = ride1Data.ride.id;

        // Transition ride 1 to ACCEPTED, IN_PROGRESS, COMPLETED
        await fetch(`${BASE_URL}/rides/${completedRideId}/accept`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({
                driverName: 'Vikramaditya Sharma',
                driverPhone: '+91 98765 43210',
                driverVehicle: 'Maruti Suzuki Dzire (Pearl White)',
                driverPlateNumber: 'DL 01 AB 4321',
                driverRating: 4.94
            })
        });

        await fetch(`${BASE_URL}/rides/${completedRideId}/status`, {
            method: 'PATCH',
            headers: authHeader,
            body: JSON.stringify({ status: 'DRIVER_ARRIVING' })
        });

        await fetch(`${BASE_URL}/rides/${completedRideId}/status`, {
            method: 'PATCH',
            headers: authHeader,
            body: JSON.stringify({ status: 'IN_PROGRESS' })
        });

        await fetch(`${BASE_URL}/rides/${completedRideId}/status`, {
            method: 'PATCH',
            headers: authHeader,
            body: JSON.stringify({ status: 'COMPLETED' })
        });

        // Create ride 2: stays in REQUESTED status
        const ride2Res = await fetch(`${BASE_URL}/rides`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({
                pickupAddress: 'Karol Bagh, New Delhi',
                pickupLatitude: 28.6517,
                pickupLongitude: 77.1906,
                dropoffAddress: 'Rajouri Garden, New Delhi',
                dropoffLatitude: 28.6492,
                dropoffLongitude: 77.1226,
                rideType: 'SEDAN',
                distanceKm: 7.2,
                estimatedFare: 12.00,
                estimatedDurationMin: 20
            })
        });
        const ride2Data = await ride2Res.json();
        requestedRideId = ride2Data.ride.id;

        pass("2. Test Rides Setup", `Completed: ${completedRideId.slice(0, 8)}, Requested: ${requestedRideId.slice(0, 8)}`);
        passed++;
    } catch (err) {
        fail("2. Test Rides Setup", err.message);
        failed++;
    }

    // 3. Reject review on non-completed ride
    try {
        const rejectRes = await fetch(`${BASE_URL}/rides/${requestedRideId}/review`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({
                rating: 5,
                feedback: 'Nice ride'
            })
        });
        const rejectData = await rejectRes.json();

        if (rejectRes.status === 400) {
            pass("3. Reject Non-Completed Ride Review", `HTTP 400: ${rejectData.message}`);
            passed++;
        } else {
            fail("3. Reject Non-Completed Ride Review", `Expected 400, got ${rejectRes.status}`);
            failed++;
        }
    } catch (err) {
        fail("3. Reject Non-Completed Ride Review", err.message);
        failed++;
    }

    // 4. Reject review with invalid rating (>5 or <1)
    try {
        const invalidRes = await fetch(`${BASE_URL}/rides/${completedRideId}/review`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({
                rating: 6,
                feedback: 'Super'
            })
        });
        const invalidData = await invalidRes.json();

        if (invalidRes.status === 400) {
            pass("4. Reject Invalid Rating (>5)", `HTTP 400: ${invalidData.message}`);
            passed++;
        } else {
            fail("4. Reject Invalid Rating (>5)", `Expected 400, got ${invalidRes.status}`);
            failed++;
        }
    } catch (err) {
        fail("4. Reject Invalid Rating (>5)", err.message);
        failed++;
    }

    // 5. Submit valid post-ride review (1-to-5 star rating + feedback)
    try {
        const reviewRes = await fetch(`${BASE_URL}/rides/${completedRideId}/review`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({
                rating: 5,
                feedback: 'Vikramaditya was extremely punctual, polite, and kept the car spotless. Great trip!'
            })
        });
        const reviewData = await reviewRes.json();

        if (reviewRes.status === 201 && reviewData.review?.rating === 5) {
            pass("5. Submit Post-Ride Review (POST /rides/:id/review)", `Rating: ${reviewData.review.rating}★, Avg: ${reviewData.averageDriverRating}★`);
            passed++;
        } else {
            fail("5. Submit Post-Ride Review", `Status: ${reviewRes.status}, data: ${JSON.stringify(reviewData)}`);
            failed++;
        }
    } catch (err) {
        fail("5. Submit Post-Ride Review", err.message);
        failed++;
    }

    // 6. Enforce one-review-per-ride: reject second review on the same ride
    try {
        const dupRes = await fetch(`${BASE_URL}/rides/${completedRideId}/review`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({
                rating: 4,
                feedback: 'Trying duplicate review'
            })
        });
        const dupData = await dupRes.json();

        if (dupRes.status === 409) {
            pass("6. Enforce One-Review-Per-Ride", `HTTP 409: ${dupData.message}`);
            passed++;
        } else {
            fail("6. Enforce One-Review-Per-Ride", `Expected 409, got ${dupRes.status}`);
            failed++;
        }
    } catch (err) {
        fail("6. Enforce One-Review-Per-Ride", err.message);
        failed++;
    }

    // 7. Get ride review (GET /rides/:id/review)
    try {
        const getRes = await fetch(`${BASE_URL}/rides/${completedRideId}/review`, {
            method: 'GET',
            headers: authHeader
        });
        const getData = await getRes.json();

        if (getRes.status === 200 && getData.review?.rating === 5) {
            pass("7. Retrieve Ride Review (GET /rides/:id/review)", `Rating: ${getData.review.rating}★, Rider: ${getData.review.rider?.name}`);
            passed++;
        } else {
            fail("7. Retrieve Ride Review", `Expected 200, got ${getRes.status}`);
            failed++;
        }
    } catch (err) {
        fail("7. Retrieve Ride Review", err.message);
        failed++;
    }

    // 8. Retrieve driver reviews list (GET /drivers/:id/reviews)
    try {
        const driverRevRes = await fetch(`${BASE_URL}/drivers/drv-sim-001/reviews`, {
            method: 'GET',
            headers: authHeader
        });
        const driverRevData = await driverRevRes.json();

        if (driverRevRes.status === 200 && Array.isArray(driverRevData.reviews) && driverRevData.totalReviews >= 1) {
            pass("8. Driver Reviews List (GET /drivers/:id/reviews)", `Count: ${driverRevData.totalReviews}, Avg: ${driverRevData.averageRating}★`);
            passed++;
        } else {
            fail("8. Driver Reviews List", `Expected 200, got ${driverRevRes.status}`);
            failed++;
        }
    } catch (err) {
        fail("8. Driver Reviews List", err.message);
        failed++;
    }

    // 9. Retrieve driver average rating & distribution (GET /drivers/:id/rating)
    try {
        const ratingRes = await fetch(`${BASE_URL}/drivers/drv-sim-001/rating`, {
            method: 'GET',
            headers: authHeader
        });
        const ratingData = await ratingRes.json();

        if (ratingRes.status === 200 && typeof ratingData.averageRating === 'number' && ratingData.distribution['5'] >= 1) {
            pass("9. Driver Average Rating (GET /drivers/:id/rating)", `Calculated: ${ratingData.averageRating}★ from ${ratingData.totalReviews} stored review(s)`);
            passed++;
        } else {
            fail("9. Driver Average Rating", `Expected 200, got ${ratingRes.status}`);
            failed++;
        }
    } catch (err) {
        fail("9. Driver Average Rating", err.message);
        failed++;
    }

    console.log(`\n${colors.bold}------------------------------------------------------${colors.reset}`);
    console.log(`Results: ${passed} Passed, ${failed} Failed`);
    console.log(`${colors.bold}------------------------------------------------------\n${colors.reset}`);

    if (failed === 0) {
        console.log(`${colors.green}✔ ALL DAY 10 BACKEND REQUIREMENTS VERIFIED!${colors.reset}\n`);
        process.exit(0);
    } else {
        console.error(`${colors.red}✖ SOME DAY 10 TESTS FAILED${colors.reset}\n`);
        process.exit(1);
    }
}

runDay10Tests();
