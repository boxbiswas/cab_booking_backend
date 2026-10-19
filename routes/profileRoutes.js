import express from 'express';
import { getProfile, updateProfile } from '../controllers/profileController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', authenticate, getProfile);
router.patch('/', authenticate, updateProfile);

export default router;
