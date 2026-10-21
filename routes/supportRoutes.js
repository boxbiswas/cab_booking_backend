import express from 'express';
import {
    createSupportTicket,
    getSupportTickets,
    getSupportTicketById,
    updateSupportTicket
} from '../controllers/supportController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Customer support ticket endpoints for riders
router.post('/tickets', authenticate, createSupportTicket);
router.get('/tickets', authenticate, getSupportTickets);
router.get('/tickets/:id', authenticate, getSupportTicketById);
router.patch('/tickets/:id', authenticate, updateSupportTicket);

// Direct alias routes if mounted at /support or /api/support
router.post('/', authenticate, createSupportTicket);
router.get('/', authenticate, getSupportTickets);
router.get('/:id', authenticate, getSupportTicketById);
router.patch('/:id', authenticate, updateSupportTicket);

export default router;
