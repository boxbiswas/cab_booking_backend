import express from 'express';
import {
    getEmergencyContacts,
    createEmergencyContact,
    deleteEmergencyContact
} from '../controllers/emergencyController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Emergency contacts CRUD for authenticated riders
router.get('/', authenticate, getEmergencyContacts);
router.post('/', authenticate, createEmergencyContact);
router.delete('/:id', authenticate, deleteEmergencyContact);

export default router;
