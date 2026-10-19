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
    getRideReview
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

// Single Ride Details
router.get('/:id', authenticate, getRideById);

// Day 5 Ride Assignment & Status Transitions
router.post('/:id/accept', authenticate, acceptRide);
router.post('/:id/decline', authenticate, declineRide);
router.patch('/:id/status', authenticate, updateRideStatus);

export default router;
