/**
 * HopIn Core Workflow Automated Test Suite (Day 7)
 * Runs full end-to-end integration tests against the live Express backend & PostgreSQL database.
 */

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';

const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
    reset: '\x1b[0m'
};

function pass(testName, details = '') {
    console.log(`  ${colors.green}✔ PASS${colors.reset} ${testName} ${details ? colors.cyan + '(' + details + ')' + colors.reset : ''}`);
}

function fail(testName, error) {
    console.error(`  ${colors.red}✖ FAIL${colors.reset} ${testName}:`, error);
}

async function runTests() {
    console.log(`\n${colors.bold}==================================================${colors.reset}`);
    console.log(`${colors.bold}    HopIn DAY 7: Core Workflow & API Test Suite    ${colors.reset}`);
    console.log(`${colors.bold}==================================================${colors.reset}\n`);

    let passedCount = 0;
    let failedCount = 0;
    let authCookie = null;
    let testRideId = null;

    const randomSuffix = Math.floor(Math.random() * 900000 + 100000);
    const testUser = {
        name: `Tester ${randomSuffix}`,
        email: `test_${randomSuffix}@hopin.test`,
        phone: `+9198${randomSuffix}`,
        password: `Password@${randomSuffix}`
    };

    // 1. Health Check
    try {
        const res = await fetch(`${BASE_URL}/health`);
        const data = await res.json();
        if (res.status === 200 && data.status === 'ok') {
            pass("1. Health Check & PostgreSQL Connection", "Database connected");
            passedCount++;
        } else {
            throw new Error(`Unexpected status ${res.status}`);
        }
    } catch (e) {
        fail("1. Health Check", e.message);
        failedCount++;
    }

    // 2. Rider Registration
    try {
        const res = await fetch(`${BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testUser)
        });
        const data = await res.json();
        if (res.status === 201 && data.user?.email === testUser.email) {
            pass("2. Rider Registration", `User ID: ${data.user.id}`);
            passedCount++;
        } else {
            throw new Error(data.message || `Status: ${res.status}`);
        }
    } catch (e) {
        fail("2. Rider Registration", e.message);
        failedCount++;
    }

    // 3. Rider Login & Cookie Capture
    try {
        const res = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: testUser.email, password: testUser.password })
        });
        const rawCookie = res.headers.get('set-cookie');
        const data = await res.json();
        if (res.status === 200 && data.user) {
            authCookie = rawCookie;
            pass("3. Rider Login & JWT Authentication", "httpOnly cookie received");
            passedCount++;
        } else {
            throw new Error(data.message || `Status: ${res.status}`);
        }
    } catch (e) {
        fail("3. Rider Login", e.message);
        failedCount++;
    }

    // 4. Rider Profile Read & Update
    try {
        const res = await fetch(`${BASE_URL}/profile`, {
            headers: { 'Cookie': authCookie || '' }
        });
        const data = await res.json();
        if (res.status === 200 && data.user) {
            pass("4. Rider Profile Retrieval", `Name: ${data.user.name}`);
            passedCount++;
        } else {
            throw new Error(data.message || `Status: ${res.status}`);
        }
    } catch (e) {
        fail("4. Rider Profile Retrieval", e.message);
        failedCount++;
    }

    // 5. Map Search (Nominatim Geocoding)
    try {
        const res = await fetch(`${BASE_URL}/maps/search?q=Connaught`);
        const data = await res.json();
        if (res.status === 200 && Array.isArray(data.results) && data.results.length > 0) {
            pass("5. Map Location Search (OSM Nominatim)", `${data.results.length} results returned`);
            passedCount++;
        } else {
            throw new Error("No results returned");
        }
    } catch (e) {
        fail("5. Map Location Search", e.message);
        failedCount++;
    }

    // 6. Upfront Fare Estimation Across All Tiers
    try {
        const res = await fetch(`${BASE_URL}/rides/estimate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ distanceKm: 8.5, durationMin: 22 })
        });
        const data = await res.json();
        if (res.status === 200 && Array.isArray(data.estimates) && data.estimates.length === 4) {
            pass("6. Upfront Fare Estimation", "All 4 tiers calculated (Sedan, Mini, XL, Auto)");
            passedCount++;
        } else {
            throw new Error("Tiers calculation mismatch");
        }
    } catch (e) {
        fail("6. Upfront Fare Estimation", e.message);
        failedCount++;
    }

    // 7. Ride Booking Creation (Starts in REQUESTED status)
    try {
        const ridePayload = {
            pickupAddress: "Connaught Place, New Delhi",
            pickupLatitude: 28.6315,
            pickupLongitude: 77.2167,
            dropoffAddress: "Indira Gandhi International Airport, T3, New Delhi",
            dropoffLatitude: 28.5562,
            dropoffLongitude: 77.1000,
            rideType: "SEDAN",
            distanceKm: 14.2,
            estimatedFare: 28.85,
            estimatedDurationMin: 30
        };

        const res = await fetch(`${BASE_URL}/rides`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': authCookie || ''
            },
            body: JSON.stringify(ridePayload)
        });
        const data = await res.json();
        if (res.status === 201 && data.ride?.id && data.ride.status === 'REQUESTED') {
            testRideId = data.ride.id;
            pass("7. Ride Request Creation", `Ride ID: ${testRideId}, Status: REQUESTED`);
            passedCount++;
        } else {
            throw new Error(data.message || `Status: ${res.status}`);
        }
    } catch (e) {
        fail("7. Ride Request Creation", e.message);
        failedCount++;
    }

    // 8. Driver Availability Check
    try {
        const res = await fetch(`${BASE_URL}/driver/availability`, {
            headers: { 'Cookie': authCookie || '' }
        });
        const data = await res.json();
        if (res.status === 200 && typeof data.isAvailable === 'boolean') {
            pass("8. Driver Availability Query", `Available: ${data.isAvailable}`);
            passedCount++;
        } else {
            throw new Error(data.message || `Status: ${res.status}`);
        }
    } catch (e) {
        fail("8. Driver Availability Query", e.message);
        failedCount++;
    }

    // 9. Available Rides Query (Driver view)
    try {
        const res = await fetch(`${BASE_URL}/driver/rides/available`, {
            headers: { 'Cookie': authCookie || '' }
        });
        const data = await res.json();
        if (res.status === 200 && Array.isArray(data.rides)) {
            pass("9. Available Ride Requests Query", `${data.count} pending ride(s) available`);
            passedCount++;
        } else {
            throw new Error(data.message || `Status: ${res.status}`);
        }
    } catch (e) {
        fail("9. Available Ride Requests Query", e.message);
        failedCount++;
    }

    // 10. Driver Accepts Ride (Assignment)
    try {
        if (!testRideId) throw new Error("No active ride ID");
        const res = await fetch(`${BASE_URL}/rides/${testRideId}/accept`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': authCookie || ''
            },
            body: JSON.stringify({
                driverName: "Vikramaditya Sharma",
                driverPlateNumber: "DL 01 AB 4321"
            })
        });
        const data = await res.json();
        if (res.status === 200 && data.ride?.status === 'ACCEPTED') {
            pass("10. Driver Ride Acceptance & Assignment", `Driver: ${data.ride.driverName}, Vehicle: ${data.ride.driverVehicle}`);
            passedCount++;
        } else {
            throw new Error(data.message || `Status: ${res.status}`);
        }
    } catch (e) {
        fail("10. Driver Ride Acceptance", e.message);
        failedCount++;
    }

    // 11. Multiple Driver Race Condition Prevention (409 Conflict)
    try {
        if (!testRideId) throw new Error("No active ride ID");
        const res = await fetch(`${BASE_URL}/rides/${testRideId}/accept`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': authCookie || ''
            },
            body: JSON.stringify({ driverName: "Second Driver" })
        });
        const data = await res.json();
        if (res.status === 409) {
            pass("11. Double-Accept Prevention (Race Condition)", "Correctly blocked with 409 Conflict");
            passedCount++;
        } else {
            throw new Error(`Expected 409 Conflict, received status ${res.status}`);
        }
    } catch (e) {
        fail("11. Double-Accept Prevention", e.message);
        failedCount++;
    }

    // 12. State Machine Validation: Invalid Transition Rejected
    try {
        if (!testRideId) throw new Error("No active ride ID");
        const res = await fetch(`${BASE_URL}/rides/${testRideId}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': authCookie || ''
            },
            body: JSON.stringify({ status: 'COMPLETED' }) // Cannot jump from ACCEPTED directly to COMPLETED
        });
        const data = await res.json();
        if (res.status === 400) {
            pass("12. Status State Machine Validation", "Invalid transition correctly rejected with 400");
            passedCount++;
        } else {
            throw new Error(`Expected 400 Bad Request, received status ${res.status}`);
        }
    } catch (e) {
        fail("12. Status State Machine Validation", e.message);
        failedCount++;
    }

    // 13. Valid State Machine Lifecycle Transitions
    try {
        if (!testRideId) throw new Error("No active ride ID");

        // 13a. ACCEPTED -> DRIVER_ARRIVING
        const resArriving = await fetch(`${BASE_URL}/rides/${testRideId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Cookie': authCookie || '' },
            body: JSON.stringify({ status: 'DRIVER_ARRIVING' })
        });
        const dataArriving = await resArriving.json();

        // 13b. DRIVER_ARRIVING -> IN_PROGRESS
        const resProgress = await fetch(`${BASE_URL}/rides/${testRideId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Cookie': authCookie || '' },
            body: JSON.stringify({ status: 'IN_PROGRESS' })
        });
        const dataProgress = await resProgress.json();

        // 13c. IN_PROGRESS -> COMPLETED
        const resCompleted = await fetch(`${BASE_URL}/rides/${testRideId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Cookie': authCookie || '' },
            body: JSON.stringify({ status: 'COMPLETED' })
        });
        const dataCompleted = await resCompleted.json();

        if (dataArriving.ride?.status === 'DRIVER_ARRIVING' &&
            dataProgress.ride?.status === 'IN_PROGRESS' &&
            dataCompleted.ride?.status === 'COMPLETED' &&
            dataCompleted.ride?.completedAt) {
            pass("13. Full Ride Lifecycle Progression", "ACCEPTED -> DRIVER_ARRIVING -> IN_PROGRESS -> COMPLETED");
            passedCount++;
        } else {
            throw new Error("Status transition step failed");
        }
    } catch (e) {
        fail("13. Full Ride Lifecycle Progression", e.message);
        failedCount++;
    }

    // 14. Final Results
    console.log(`\n${colors.bold}--------------------------------------------------${colors.reset}`);
    console.log(`${colors.bold}Test Results:${colors.reset} ${passedCount > 0 ? colors.green : ''}${passedCount} Passed${colors.reset}, ${failedCount > 0 ? colors.red : ''}${failedCount} Failed${colors.reset}`);
    console.log(`${colors.bold}--------------------------------------------------${colors.reset}\n`);

    if (failedCount === 0) {
        console.log(`${colors.green}${colors.bold}✔ ALL CORE WORKFLOW TESTS PASSED! DAYS 1–7 COMPLETE.${colors.reset}\n`);
    } else {
        process.exitCode = 1;
    }
}

runTests();
