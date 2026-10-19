import express from 'express';
import {
    getDriverAvailability,
    updateDriverAvailability,
    getAvailableRides,
    getDriverEarnings,
    getDriverRideHistory,
    getDriverById,
    getDriverReviews,
    getDriverRating
} from '../controllers/driverController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Driver Availability
router.get('/availability', authenticate, getDriverAvailability);
router.patch('/availability', authenticate, updateDriverAvailability);

// Available Rides for Drivers
router.get('/rides/available', authenticate, getAvailableRides);

// Driver Historical Rides (Day 9)
router.get('/rides/history', authenticate, getDriverRideHistory);

// Driver Earnings (Day 8)
router.get('/earnings', authenticate, getDriverEarnings);

// Day 10 Driver Reviews & Ratings (placed before /:id)
router.get('/reviews', authenticate, getDriverReviews);
router.get('/rating', authenticate, getDriverRating);
router.get('/:id/reviews', authenticate, getDriverReviews);
router.get('/:id/rating', authenticate, getDriverRating);

// Driver Profile / Details
router.get('/:id', authenticate, getDriverById);

export default router;
