import express from 'express';
import {
    getDriverAvailability,
    updateDriverAvailability,
    getAvailableRides,
    getDriverById
} from '../controllers/driverController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Driver Availability
router.get('/availability', authenticate, getDriverAvailability);
router.patch('/availability', authenticate, updateDriverAvailability);

// Available Rides for Drivers
router.get('/rides/available', authenticate, getAvailableRides);

// Driver Profile / Details
router.get('/:id', authenticate, getDriverById);

export default router;
