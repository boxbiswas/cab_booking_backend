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

async function runDay9Tests() {
    console.log(`\n${colors.bold}======================================================${colors.reset}`);
    console.log(`${colors.bold}    HopIn DAY 9: Ride History & Receipts Test Suite   ${colors.reset}`);
    console.log(`${colors.bold}======================================================\n${colors.reset}`);

    let passed = 0;
    let failed = 0;
    let authHeader = {};
    let testRideId = null;

    const timestamp = Date.now();
    const testUser = {
        name: `Day9 Rider ${timestamp}`,
        email: `day9_${timestamp}@hopin.test`,
        phone: `+91${timestamp.toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`,
        password: `Pass@${timestamp}`
    };

    // 1. Rider Authentication
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

    // 2. Create, Complete & Pay for a Test Ride
    try {
        const rideRes = await fetch(`${BASE_URL}/rides`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({
                pickupAddress: "Cyber Hub, DLF Phase 2, Gurugram",
                pickupLatitude: 28.4950,
                pickupLongitude: 77.0890,
                dropoffAddress: "Ambience Mall, NH 8, Gurugram",
                dropoffLatitude: 28.5042,
                dropoffLongitude: 77.0967,
                rideType: "SEDAN",
                distanceKm: 5.2,
                estimatedFare: 16.50,
                estimatedDurationMin: 18
            })
        });
        const rideData = await rideRes.json();
        if (rideRes.status !== 201 || !rideData.ride?.id) throw new Error('Ride creation failed');
        testRideId = rideData.ride.id;

        // Progress ride to COMPLETED
        await fetch(`${BASE_URL}/rides/${testRideId}/accept`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({ driverData: { driverName: "Vikramaditya Sharma" } })
        });
        await fetch(`${BASE_URL}/rides/${testRideId}/status`, {
            method: 'PATCH',
            headers: authHeader,
            body: JSON.stringify({ status: "IN_PROGRESS" })
        });
        await fetch(`${BASE_URL}/rides/${testRideId}/status`, {
            method: 'PATCH',
            headers: authHeader,
            body: JSON.stringify({ status: "COMPLETED" })
        });

        // Pay for the ride via simulated webhook
        await fetch(`${BASE_URL}/payments/simulate-webhook`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({
                rideId: testRideId,
                amount: 16.50,
                outcome: 'success'
            })
        });

        pass("2. Completed & Paid Ride Setup", `Ride ${testRideId} completed & paid ($16.50)`);
        passed++;
    } catch (e) {
        fail("2. Completed & Paid Ride Setup", e.message);
        failed++;
    }

    // 3. Query Rider Ride History (GET /rides/history)
    try {
        const histRes = await fetch(`${BASE_URL}/rides/history`, {
            headers: authHeader
        });
        const histData = await histRes.json();
        if (histRes.status !== 200 || !Array.isArray(histData.rides)) {
            throw new Error(histData.message || 'Ride history query failed');
        }

        const foundRide = histData.rides.find(r => r.id === testRideId);
        if (!foundRide) {
            throw new Error(`Ride ${testRideId} missing from history`);
        }

        if (!histData.stats || histData.stats.completedRides < 1) {
            throw new Error('Stats computation missing or invalid');
        }

        pass("3. Rider Ride History (GET /rides/history)", `Found ${histData.rides.length} ride(s), Spent: $${histData.stats.totalSpent}, Distance: ${histData.stats.totalDistanceKm}km`);
        passed++;
    } catch (e) {
        fail("3. Rider Ride History", e.message);
        failed++;
    }

    // 4. Ride History Filtering by Status (GET /rides/history?status=COMPLETED)
    try {
        const filterRes = await fetch(`${BASE_URL}/rides/history?status=COMPLETED`, {
            headers: authHeader
        });
        const filterData = await filterRes.json();
        if (filterRes.status !== 200 || filterData.rides.some(r => r.status !== 'COMPLETED')) {
            throw new Error('Filtered results contained non-COMPLETED rides');
        }

        pass("4. History Status Filter", `Filtered ${filterData.rides.length} COMPLETED ride(s)`);
        passed++;
    } catch (e) {
        fail("4. History Status Filter", e.message);
        failed++;
    }

    // 5. Official Ride Receipt Retrieval (GET /rides/:id/receipt)
    try {
        const rcpRes = await fetch(`${BASE_URL}/rides/${testRideId}/receipt`, {
            headers: authHeader
        });
        const rcpData = await rcpRes.json();
        if (rcpRes.status !== 200 || !rcpData.receipt) {
            throw new Error(rcpData.message || 'Receipt retrieval failed');
        }

        const rcp = rcpData.receipt;
        if (!rcp.receiptNumber || !rcp.fareBreakdown || rcp.status !== 'SUCCEEDED') {
            throw new Error(`Receipt incomplete or invalid status: ${rcp.status}`);
        }

        pass("5. Official Ride Receipt (GET /rides/:id/receipt)", `Receipt No: ${rcp.receiptNumber}, Total: $${rcp.totalFare}, Base: $${rcp.fareBreakdown.baseFare}`);
        passed++;
    } catch (e) {
        fail("5. Official Ride Receipt", e.message);
        failed++;
    }

    // 6. Receipt Email Delivery (POST /rides/:id/receipt/email)
    try {
        const emailRes = await fetch(`${BASE_URL}/rides/${testRideId}/receipt/email`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({ targetEmail: testUser.email })
        });
        const emailData = await emailRes.json();
        if (emailRes.status !== 200 || !emailData.receiptNumber) {
            throw new Error(emailData.message || 'Email delivery endpoint failed');
        }

        pass("6. Receipt Email Delivery (POST /rides/:id/receipt/email)", `Delivered receipt ${emailData.receiptNumber} to ${emailData.recipient}`);
        passed++;
    } catch (e) {
        fail("6. Receipt Email Delivery", e.message);
        failed++;
    }

    // 7. Driver Ride History (GET /driver/rides/history)
    try {
        const drvRes = await fetch(`${BASE_URL}/driver/rides/history`, {
            headers: authHeader
        });
        const drvData = await drvRes.json();
        if (drvRes.status !== 200 || !Array.isArray(drvData.rides)) {
            throw new Error(drvData.message || 'Driver history failed');
        }

        pass("7. Driver Ride History (GET /driver/rides/history)", `Retrieved ${drvData.count} historical driver rides`);
        passed++;
    } catch (e) {
        fail("7. Driver Ride History", e.message);
        failed++;
    }

    console.log(`\n${colors.bold}------------------------------------------------------${colors.reset}`);
    console.log(`Results: ${colors.green}${passed} Passed${colors.reset}, ${failed > 0 ? colors.red + failed + ' Failed' : colors.green + '0 Failed'}${colors.reset}`);
    console.log(`${colors.bold}------------------------------------------------------\n${colors.reset}`);

    if (failed === 0) {
        console.log(`${colors.green}${colors.bold}✔ ALL DAY 9 BACKEND REQUIREMENTS VERIFIED!${colors.reset}\n`);
    } else {
        process.exit(1);
    }
}

runDay9Tests().catch(err => {
    console.error("Test runner crashed:", err);
    process.exit(1);
});
