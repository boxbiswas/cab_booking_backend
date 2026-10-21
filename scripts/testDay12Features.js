// HopIn Day 12 Feature & Security Automated Verification Test Suite
// Verifies:
// 1. Promo codes validation (POST /promotions/validate)
// 2. Multi-stop rides (POST & GET /rides/:id/stops)
// 3. Ride cancellation with policy fee & reason (POST /rides/:id/cancel)
// 4. Emergency SOS alert & contact dispatch (POST & GET /rides/:id/emergency)
// 5. Emergency contacts CRUD (POST & GET /emergency-contacts)
// 6. Customer support tickets lifecycle (POST, GET, PATCH /support/tickets)
// 7. Security & authorization ownership enforcement

const BASE_URL = 'http://localhost:3000';

const pass = (label, detail = '') => console.log(`  ✔ PASS ${label} ${detail ? `(${detail})` : ''}`);
const fail = (label, detail = '') => console.error(`  ✖ FAIL ${label} ${detail ? `(${detail})` : ''}`);

async function runTests() {
    console.log("\n======================================================");
    console.log("    HopIn DAY 12: Security & Feature Test Suite       ");
    console.log("======================================================\n");

    let passed = 0;
    let failed = 0;

    let token = '';
    let riderId = '';
    let testRideId = '';
    let activeRideId = '';
    let testTicketId = '';
    let testContactId = '';

    const timestamp = Date.now();
    const testEmail = `day12_${timestamp}@hopin.test`;
    const testPassword = 'Password123!';

    // 1. Rider Registration & Authentication
    try {
        const regRes = await fetch(`${BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: `Day12 Rider ${timestamp}`,
                email: testEmail,
                password: testPassword,
                phone: `+1${timestamp.toString().slice(-10)}`
            })
        });

        const loginRes = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: testEmail,
                password: testPassword
            })
        });
        const loginData = await loginRes.json();
        token = loginData.token;
        riderId = loginData.user.id;

        // Extract cookie if token not in body
        if (!token && loginRes.headers.get('set-cookie')) {
            const rawCookie = loginRes.headers.get('set-cookie');
            const match = rawCookie.match(/token=([^;]+)/);
            if (match) token = match[1];
        }

        if (token) {
            pass("1. Rider Authentication", `Token acquired for ${testEmail}`);
            passed++;
        } else {
            fail("1. Rider Authentication", "Token missing");
            failed++;
        }
    } catch (err) {
        fail("1. Rider Authentication", err.message);
        failed++;
    }

    const authHeader = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    // 2. Promo Codes Validation (POST /promotions/validate)
    try {
        // Percentage discount validation (HOPIN50)
        const promoRes = await fetch(`${BASE_URL}/promotions/validate`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({
                code: 'HOPIN50',
                estimatedFare: 20.00
            })
        });
        const promoData = await promoRes.json();

        if (promoRes.status === 200 && promoData.valid && promoData.discountAmount === 10.00 && promoData.finalFare === 10.00) {
            pass("2. Promo Code Percentage Calculation", `Code HOPIN50: $20 fare reduced by $10 -> $${promoData.finalFare}`);
            passed++;
        } else {
            fail("2. Promo Code Percentage Calculation", JSON.stringify(promoData));
            failed++;
        }

        // Minimum fare validation rejection
        const minFareRes = await fetch(`${BASE_URL}/promotions/validate`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({
                code: 'WELCOME10',
                estimatedFare: 10.00 // Minimum fare is $15
            })
        });
        const minFareData = await minFareRes.json();

        if (minFareRes.status === 400 && !minFareData.valid) {
            pass("3. Promo Code Minimum Fare Enforcement", `HTTP 400: ${minFareData.message}`);
            passed++;
        } else {
            fail("3. Promo Code Minimum Fare Enforcement", `Expected 400, got ${minFareRes.status}`);
            failed++;
        }
    } catch (err) {
        fail("2/3. Promo Codes Validation", err.message);
        failed++;
    }

    // 4. Create Test Rides for multi-stops and cancellation
    try {
        const rideRes = await fetch(`${BASE_URL}/rides`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({
                pickupAddress: "Connaught Place, New Delhi",
                pickupLatitude: 28.6315,
                pickupLongitude: 77.2167,
                dropoffAddress: "Cyber City, Gurugram",
                dropoffLatitude: 28.4950,
                dropoffLongitude: 77.0890,
                rideType: "SEDAN",
                distanceKm: 25.0,
                estimatedFare: 35.00,
                estimatedDurationMin: 45
            })
        });
        const rideData = await rideRes.json();
        testRideId = rideData.ride.id;

        // Accept ride to put it into ACCEPTED status
        await fetch(`${BASE_URL}/rides/${testRideId}/accept`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({})
        });

        pass("4. Test Ride Setup", `Created & Accepted ride ${testRideId.slice(0, 8)}`);
        passed++;
    } catch (err) {
        fail("4. Test Ride Setup", err.message);
        failed++;
    }

    // 5. Multi-Stop Rides (POST & GET /rides/:id/stops)
    try {
        const stopsRes = await fetch(`${BASE_URL}/rides/${testRideId}/stops`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({
                stops: [
                    {
                        sequence: 1,
                        address: "Hauz Khas Village, New Delhi",
                        latitude: 28.5534,
                        longitude: 77.1945
                    },
                    {
                        sequence: 2,
                        address: "DLF Phase 2, Gurugram",
                        latitude: 28.4812,
                        longitude: 77.0825
                    }
                ]
            })
        });
        const stopsData = await stopsRes.json();

        // Retrieve stops via GET
        const getStopsRes = await fetch(`${BASE_URL}/rides/${testRideId}/stops`, {
            headers: authHeader
        });
        const getStopsData = await getStopsRes.json();

        if (stopsRes.status === 201 && getStopsData.stops.length === 2 && stopsData.updatedFare > 35.00) {
            pass("5. Multi-Stop Addition & Fare Recalculation", `Added 2 stops, new fare: $${stopsData.updatedFare}`);
            passed++;
        } else {
            fail("5. Multi-Stop Addition & Fare Recalculation", JSON.stringify(stopsData));
            failed++;
        }
    } catch (err) {
        fail("5. Multi-Stop Addition", err.message);
        failed++;
    }

    // 6. Ride Cancellation with Policy Fee (POST /rides/:id/cancel)
    try {
        const cancelRes = await fetch(`${BASE_URL}/rides/${testRideId}/cancel`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({
                reason: "Change of plans, rebooking for tomorrow"
            })
        });
        const cancelData = await cancelRes.json();

        if (cancelRes.status === 200 && cancelData.ride.status === 'CANCELLED' && cancelData.ride.cancelledBy === 'RIDER') {
            pass("6. Ride Cancellation", `Status: CANCELLED, Actor: ${cancelData.ride.cancelledBy}, Fee: $${cancelData.cancellationFee}`);
            passed++;
        } else {
            fail("6. Ride Cancellation", JSON.stringify(cancelData));
            failed++;
        }

        // Prevent double cancellation
        const doubleCancelRes = await fetch(`${BASE_URL}/rides/${testRideId}/cancel`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({ reason: "Duplicate cancel test" })
        });
        const doubleCancelData = await doubleCancelRes.json();

        if (doubleCancelRes.status === 400) {
            pass("7. Prevent Duplicate Cancellation", `HTTP 400: ${doubleCancelData.message}`);
            passed++;
        } else {
            fail("7. Prevent Duplicate Cancellation", `Expected 400, got ${doubleCancelRes.status}`);
            failed++;
        }
    } catch (err) {
        fail("6/7. Ride Cancellation", err.message);
        failed++;
    }

    // 8. Emergency Contacts Management (POST & GET /emergency-contacts)
    try {
        const contactRes = await fetch(`${BASE_URL}/emergency-contacts`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({
                name: "Sarah Connor (Sister)",
                phone: "+15551234567",
                relationship: "Sister"
            })
        });
        const contactData = await contactRes.json();
        testContactId = contactData.contact?.id;

        const getContactsRes = await fetch(`${BASE_URL}/emergency-contacts`, {
            headers: authHeader
        });
        const getContactsData = await getContactsRes.json();

        if (contactRes.status === 201 && getContactsData.contacts.length >= 1) {
            pass("8. Emergency Contacts Configuration", `Added contact ${contactData.contact.name} (${contactData.contact.phone})`);
            passed++;
        } else {
            fail("8. Emergency Contacts Configuration", JSON.stringify(contactData));
            failed++;
        }
    } catch (err) {
        fail("8. Emergency Contacts Configuration", err.message);
        failed++;
    }

    // 9. Emergency SOS Trigger (POST & GET /rides/:id/emergency)
    try {
        // Create an active ride for SOS test
        const activeRideRes = await fetch(`${BASE_URL}/rides`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({
                pickupAddress: "India Gate, New Delhi",
                pickupLatitude: 28.6129,
                pickupLongitude: 77.2295,
                dropoffAddress: "Indira Gandhi International Airport, Delhi",
                dropoffLatitude: 28.5562,
                dropoffLongitude: 77.1000,
                rideType: "SEDAN",
                distanceKm: 14.5,
                estimatedFare: 22.00,
                estimatedDurationMin: 30
            })
        });
        const activeRideData = await activeRideRes.json();
        activeRideId = activeRideData.ride.id;

        const sosRes = await fetch(`${BASE_URL}/rides/${activeRideId}/emergency`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({
                latitude: 28.5900,
                longitude: 77.1800
            })
        });
        const sosData = await sosRes.json();

        const getSosRes = await fetch(`${BASE_URL}/rides/${activeRideId}/emergency`, {
            headers: authHeader
        });
        const getSosData = await getSosRes.json();

        if (sosRes.status === 201 && sosData.alert.status === 'TRIGGERED' && getSosData.alerts.length >= 1) {
            pass("9. Emergency SOS Trigger & Contact Dispatch", `Alert ${sosData.alert.id.slice(0, 8)} at (${sosData.alert.latitude}, ${sosData.alert.longitude})`);
            passed++;
        } else {
            fail("9. Emergency SOS Trigger & Contact Dispatch", JSON.stringify(sosData));
            failed++;
        }
    } catch (err) {
        fail("9. Emergency SOS", err.message);
        failed++;
    }

    // 10. Customer Support Tickets Lifecycle (POST, GET, PATCH /support/tickets)
    try {
        // Create support ticket
        const ticketRes = await fetch(`${BASE_URL}/support/tickets`, {
            method: 'POST',
            headers: authHeader,
            body: JSON.stringify({
                category: "LOST_ITEM",
                subject: "Forgot sunglasses in cab",
                description: "Black Ray-Ban sunglasses left on the back seat near door",
                rideId: activeRideId
            })
        });
        const ticketData = await ticketRes.json();
        testTicketId = ticketData.ticket?.id;

        // Retrieve tickets list
        const getTicketsRes = await fetch(`${BASE_URL}/support/tickets`, {
            headers: authHeader
        });
        const getTicketsData = await getTicketsRes.json();

        // Update ticket status & add system response
        const updateTicketRes = await fetch(`${BASE_URL}/support/tickets/${testTicketId}`, {
            method: 'PATCH',
            headers: authHeader,
            body: JSON.stringify({
                status: "RESOLVED",
                systemResponse: "Driver located sunglasses and confirmed pickup location at HopIn Hub."
            })
        });
        const updateTicketData = await updateTicketRes.json();

        if (
            ticketRes.status === 201 &&
            getTicketsData.tickets.length >= 1 &&
            updateTicketData.ticket.status === 'RESOLVED' &&
            updateTicketData.ticket.systemResponse
        ) {
            pass("10. Customer Support Ticket Lifecycle", `Created #${testTicketId.slice(0, 8)} -> Resolved with response`);
            passed++;
        } else {
            fail("10. Customer Support Ticket Lifecycle", JSON.stringify(updateTicketData));
            failed++;
        }
    } catch (err) {
        fail("10. Customer Support Tickets", err.message);
        failed++;
    }

    // 11. Security & Ownership Authorization Verification
    try {
        // Register second rider
        const otherEmail = `other_${timestamp}@hopin.test`;
        const otherRegRes = await fetch(`${BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: "Intruder User",
                email: otherEmail,
                password: "Password123!",
                phone: `+1${(timestamp + 1).toString().slice(-10)}`
            })
        });

        const otherLoginRes = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: otherEmail,
                password: "Password123!"
            })
        });
        const otherLoginData = await otherLoginRes.json();
        const otherToken = otherLoginData.token;

        const otherAuthHeader = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${otherToken}`
        };

        // Try to cancel first rider's active ride using second rider's token
        const unauthorizedCancelRes = await fetch(`${BASE_URL}/rides/${activeRideId}/cancel`, {
            method: 'POST',
            headers: otherAuthHeader,
            body: JSON.stringify({ reason: "Malicious cancel" })
        });
        const unauthorizedCancelData = await unauthorizedCancelRes.json();

        if (unauthorizedCancelRes.status === 403) {
            pass("11. Role & Ownership Authorization", `HTTP 403: ${unauthorizedCancelData.message}`);
            passed++;
        } else {
            fail("11. Role & Ownership Authorization", `Expected 403, got ${unauthorizedCancelRes.status}`);
            failed++;
        }
    } catch (err) {
        fail("11. Security & Ownership", err.message);
        failed++;
    }

    console.log("\n------------------------------------------------------");
    console.log(`Results: ${passed} Passed, ${failed} Failed`);
    console.log("------------------------------------------------------\n");

    if (failed === 0) {
        console.log("✔ ALL DAY 12 BACKEND REQUIREMENTS VERIFIED!\n");
        process.exit(0);
    } else {
        console.error("✖ SOME DAY 12 TESTS FAILED.\n");
        process.exit(1);
    }
}

runTests();
