import express from 'express';
import {
    estimateFare,
    createRide,
    getRideById,
    acceptRide,
    declineRide,
    updateRideStatus
} from '../controllers/rideController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/estimate', estimateFare);
router.post('/', authenticate, createRide);
router.get('/:id', authenticate, getRideById);

// Day 5 Ride Assignment & Status Transitions
router.post('/:id/accept', authenticate, acceptRide);
router.post('/:id/decline', authenticate, declineRide);
router.patch('/:id/status', authenticate, updateRideStatus);

export default router;
