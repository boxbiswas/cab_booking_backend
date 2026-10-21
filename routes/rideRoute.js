import express from 'express';
import {
    estimateFare,
    createRide,
    getRidesHistory,
    getRideReceipt,
    emailRideReceipt,
    getRideById,
    acceptRide,
    declineRide,
    updateRideStatus,
    submitRideReview,
    getRideReview,
    cancelRide,
    addRideStops,
    getRideStops,
    triggerEmergency,
    getEmergencyAlerts
} from '../controllers/rideController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Fare calculation & ride creation
router.post('/estimate', estimateFare);
router.post('/', authenticate, createRide);

// Day 9 Rider Ride History (Must precede /:id)
router.get('/history', authenticate, getRidesHistory);

// Day 9 Ride Receipts
router.get('/:id/receipt', authenticate, getRideReceipt);
router.post('/:id/receipt/email', authenticate, emailRideReceipt);

// Day 10 Ride Ratings & Reviews (POST /rides/:id/review)
router.post('/:id/review', authenticate, submitRideReview);
router.get('/:id/review', authenticate, getRideReview);

// Day 12 Ride Cancellation (POST /rides/:id/cancel)
router.post('/:id/cancel', authenticate, cancelRide);

// Day 12 Multi-Stop Rides (POST & GET /rides/:id/stops)
router.post('/:id/stops', authenticate, addRideStops);
router.get('/:id/stops', authenticate, getRideStops);

// Day 12 Emergency SOS (POST & GET /rides/:id/emergency)
router.post('/:id/emergency', authenticate, triggerEmergency);
router.get('/:id/emergency', authenticate, getEmergencyAlerts);

// Single Ride Details
router.get('/:id', authenticate, getRideById);

// Day 5 Ride Assignment & Status Transitions
router.post('/:id/accept', authenticate, acceptRide);
router.post('/:id/decline', authenticate, declineRide);
router.patch('/:id/status', authenticate, updateRideStatus);

export default router;
