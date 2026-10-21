import "dotenv/config";
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { createServer } from 'node:http';
import { prisma } from "./lib/prisma.js";
import { initSocket } from "./lib/socket.js";

// Import routes
import authRoute from "./routes/authRoute.js";
import profileRoutes from "./routes/profileRoutes.js";
import driverRoutes from "./routes/driverRoutes.js";
import mapRoute from "./routes/mapRoute.js";
import rideRoute from "./routes/rideRoute.js";
import paymentRouter, { paymentMethodRouter } from "./routes/paymentRoutes.js";
import promotionRoutes from "./routes/promotionRoutes.js";
import emergencyRoutes from "./routes/emergencyRoutes.js";
import supportRoutes from "./routes/supportRoutes.js";

const app = express();

// Security headers with Helmet
app.use(helmet({
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false
}));

// Rate limiting protection
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests from this IP, please try again after 15 minutes' }
});
app.use(apiLimiter);

// Cors configuration
app.use(cors({
    origin: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://cab-booking-frontend-drab.vercel.app"
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Cookie', 'stripe-signature']
}));

// Capture raw body for Stripe webhook cryptographic signature verification
app.use(express.json({
    limit: '50mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Direct clean routes for Rider app
app.use('/auth', authRoute);
app.use('/profile', profileRoutes);
app.use('/driver', driverRoutes);
app.use('/drivers', driverRoutes);
app.use('/maps', mapRoute);
app.use('/rides', rideRoute);
app.use('/payments', paymentRouter);
app.use('/payment-methods', paymentMethodRouter);
app.use('/promotions', promotionRoutes);
app.use('/emergency-contacts', emergencyRoutes);
app.use('/support', supportRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        return res.status(200).json({ status: 'ok', message: 'HopIn Backend is healthy and database is connected' });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: 'Database connection failed', error: err.message });
    }
});

// Root route
app.get('/', (req, res) => {
    res.json({ message: 'HopIn Cab Booking API is running' });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    res.status(err.status || 500).json({
        message: err.message || "Internal Server Error"
    });
});

const PORT = process.env.PORT || 3000;
const httpServer = createServer(app);

// Initialize Socket.IO
initSocket(httpServer);

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server and Socket.IO are running and listening on port ${PORT}`);
});

export default app;