import express from 'express';
import { searchLocation, getRoute } from '../controllers/mapController.js';

const router = express.Router();

router.get('/search', searchLocation);
router.get('/route', getRoute);

export default router;
