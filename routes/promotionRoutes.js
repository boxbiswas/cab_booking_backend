import express from 'express';
import { validatePromotion, getActivePromotions } from '../controllers/promotionController.js';

const router = express.Router();

// Public route to view active promotions
router.get('/', getActivePromotions);

// Day 12 Promo code validation endpoint
// POST /promotions/validate
router.post('/validate', validatePromotion);

export default router;
