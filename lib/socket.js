import { Server } from 'socket.io';

let io = null;
const activeSimulations = new Map();

/**
 * Initialize Socket.IO with HTTP server
 */
export const initSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: [
                "http://localhost:5173",
                "http://127.0.0.1:5173"
            ],
            credentials: true,
            methods: ["GET", "POST", "PATCH"]
        }
    });

    io.on('connection', (socket) => {
        console.log(`[Socket.IO] Client connected: ${socket.id}`);

        // Join ride tracking room
        socket.on('join_ride', ({ rideId, userId }) => {
            if (rideId) {
                const room = `ride_${rideId}`;
                socket.join(room);
                console.log(`[Socket.IO] ${socket.id} joined room ${room}`);
            }
            if (userId) {
                socket.join(`user_${userId}`);
            }
        });

        // Leave ride tracking room
        socket.on('leave_ride', ({ rideId }) => {
            if (rideId) {
                socket.leave(`ride_${rideId}`);
                console.log(`[Socket.IO] ${socket.id} left ride_${rideId}`);
            }
        });

        // Manual driver location update
        socket.on('update_driver_location', (data) => {
            if (data?.rideId) {
                io.to(`ride_${data.rideId}`).emit('driver_location_update', {
                    ...data,
                    timestamp: new Date().toISOString()
                });
            }
        });

        socket.on('disconnect', () => {
            console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
        });
    });

    return io;
};

/**
 * Get active Socket.IO instance
 */
export const getIO = () => {
    return io;
};

/**
 * Emit ride status update and associated notification to authorized ride room
 */
export const emitRideStatus = (rideId, status, rideData, notification) => {
    if (!io) return;

    io.to(`ride_${rideId}`).emit('ride_status_update', {
        rideId,
        status,
        ride: rideData,
        timestamp: new Date().toISOString()
    });

    if (notification) {
        io.to(`ride_${rideId}`).emit('notification', {
            id: `notif-${Date.now()}`,
            rideId,
            status,
            ...notification,
            timestamp: new Date().toISOString()
        });
    }
};

/**
 * Emit live driver GPS coordinates
 */
export const emitDriverLocation = (rideId, locationData) => {
    if (!io) return;

    io.to(`ride_${rideId}`).emit('driver_location_update', {
        rideId,
        ...locationData,
        timestamp: new Date().toISOString()
    });
};

/**
 * Start live driver telemetry simulation along coordinates towards pickup and destination
 */
export const startDriverSimulation = (rideId, startCoord, targetCoord, options = {}) => {
    if (!io) return;

    // Clear any existing simulation for this ride
    if (activeSimulations.has(rideId)) {
        clearInterval(activeSimulations.get(rideId));
        activeSimulations.delete(rideId);
    }

    const steps = 12;
    let step = 0;

    const latDelta = (targetCoord.latitude - startCoord.latitude) / steps;
    const lngDelta = (targetCoord.longitude - startCoord.longitude) / steps;

    // Calculate heading angle
    const heading = Math.atan2(lngDelta, latDelta) * (180 / Math.PI);

    const intervalId = setInterval(() => {
        step++;
        const currentLat = Number((startCoord.latitude + (latDelta * step)).toFixed(7));
        const currentLng = Number((startCoord.longitude + (lngDelta * step)).toFixed(7));
        const remainingSteps = steps - step;
        const remainingEtaMin = Math.max(1, Math.ceil(remainingSteps / 3));

        emitDriverLocation(rideId, {
            latitude: currentLat,
            longitude: currentLng,
            heading: Math.round(heading >= 0 ? heading : heading + 360),
            speedKmh: 35 + Math.floor(Math.random() * 10),
            remainingEtaMin,
            status: options.status || 'IN_TRANSIT'
        });

        if (step >= steps) {
            clearInterval(intervalId);
            activeSimulations.delete(rideId);

            if (options.onComplete) {
                options.onComplete();
            }
        }
    }, 2000);

    activeSimulations.set(rideId, intervalId);
};

/**
 * Stop live simulation
 */
export const stopDriverSimulation = (rideId) => {
    if (activeSimulations.has(rideId)) {
        clearInterval(activeSimulations.get(rideId));
        activeSimulations.delete(rideId);
    }
};
