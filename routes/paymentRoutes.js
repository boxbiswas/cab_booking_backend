import express from 'express';
import {
    createPaymentIntent,
    handleWebhook,
    getPaymentById,
    getPaymentMethods,
    addPaymentMethod,
    deletePaymentMethod,
    simulateVerifiedWebhook
} from '../controllers/paymentController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

export const paymentRouter = express.Router();
export const paymentMethodRouter = express.Router();

// ==========================================
// Stripe Payments Routes
// ==========================================

// Webhook endpoint (Public, authenticates via stripe-signature header)
paymentRouter.post('/webhook', handleWebhook);

// Webhook simulation endpoint for end-to-end UI testing (cryptographic signature verified)
paymentRouter.post('/simulate-webhook', authenticate, simulateVerifiedWebhook);

// Payment Intent Initiation
paymentRouter.post('/create-intent', authenticate, createPaymentIntent);

// Get Payment Details / Status by Payment ID or Ride ID
paymentRouter.get('/:id', authenticate, getPaymentById);

// ==========================================
// Payment Methods Management Routes
// ==========================================
paymentMethodRouter.get('/', authenticate, getPaymentMethods);
paymentMethodRouter.post('/', authenticate, addPaymentMethod);
paymentMethodRouter.delete('/:id', authenticate, deletePaymentMethod);

export default paymentRouter;
