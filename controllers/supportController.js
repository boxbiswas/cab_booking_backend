import { prisma } from '../lib/prisma.js';

const VALID_CATEGORIES = ['PAYMENT', 'LOST_ITEM', 'DRIVER_ISSUE', 'RIDE_ISSUE', 'OTHER'];
const VALID_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

// Create customer support ticket
// POST /support/tickets
export const createSupportTicket = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { category, subject, description, rideId } = req.body || {};

        if (!category || !subject || !description) {
            return res.status(400).json({ message: 'Category, subject, and description are required' });
        }

        const normalizedCategory = category.toUpperCase().trim();
        if (!VALID_CATEGORIES.includes(normalizedCategory)) {
            return res.status(400).json({
                message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`
            });
        }

        // Validate ride association if provided
        if (rideId) {
            const ride = await prisma.ride.findUnique({ where: { id: rideId } });
            if (!ride) {
                return res.status(404).json({ message: 'Associated ride not found' });
            }
            if (userId && ride.riderId !== userId) {
                return res.status(403).json({ message: 'Unauthorized: Cannot link a ticket to another rider\'s ride' });
            }
        }

        const ticket = await prisma.supportTicket.create({
            data: {
                userId,
                rideId: rideId || null,
                category: normalizedCategory,
                subject: subject.trim(),
                description: description.trim(),
                status: 'OPEN'
            },
            include: {
                ride: {
                    select: {
                        id: true,
                        pickupAddress: true,
                        dropoffAddress: true,
                        createdAt: true,
                        status: true
                    }
                }
            }
        });

        // Record in-app confirmation notification for rider
        await prisma.notification.create({
            data: {
                userId,
                rideId: rideId || null,
                type: 'SUPPORT',
                title: 'Support Ticket Received',
                message: `Ticket #${ticket.id.slice(0, 8).toUpperCase()} for "${ticket.subject}" was submitted. We will update you shortly.`
            }
        });

        return res.status(201).json({
            message: 'Support ticket submitted successfully',
            ticket
        });

    } catch (error) {
        console.error("CreateSupportTicket Error:", error);
        return res.status(500).json({ message: 'Failed to create support ticket', error: error.message });
    }
};

// Retrieve all tickets submitted by authenticated rider
// GET /support/tickets
export const getSupportTickets = async (req, res) => {
    try {
        const userId = req.user?.id;

        const tickets = await prisma.supportTicket.findMany({
            where: { userId },
            include: {
                ride: {
                    select: {
                        id: true,
                        pickupAddress: true,
                        dropoffAddress: true,
                        createdAt: true,
                        status: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return res.status(200).json({ tickets });

    } catch (error) {
        console.error("GetSupportTickets Error:", error);
        return res.status(500).json({ message: 'Failed to retrieve support tickets', error: error.message });
    }
};

// Get single support ticket details
// GET /support/tickets/:id
export const getSupportTicketById = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;

        const ticket = await prisma.supportTicket.findUnique({
            where: { id },
            include: {
                ride: {
                    select: {
                        id: true,
                        pickupAddress: true,
                        dropoffAddress: true,
                        createdAt: true,
                        status: true
                    }
                }
            }
        });

        if (!ticket) {
            return res.status(404).json({ message: 'Support ticket not found' });
        }

        // Enforce ownership authorization
        if (userId && ticket.userId !== userId) {
            return res.status(403).json({ message: 'Unauthorized: You can only view your own support tickets' });
        }

        return res.status(200).json({ ticket });

    } catch (error) {
        console.error("GetSupportTicketById Error:", error);
        return res.status(500).json({ message: 'Failed to retrieve support ticket', error: error.message });
    }
};

// Update support ticket status / provide response
// PATCH /support/tickets/:id
export const updateSupportTicket = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;
        const { status, systemResponse } = req.body || {};

        const ticket = await prisma.supportTicket.findUnique({ where: { id } });
        if (!ticket) {
            return res.status(404).json({ message: 'Support ticket not found' });
        }

        // Restrict access: rider or system
        if (userId && ticket.userId !== userId) {
            return res.status(403).json({ message: 'Unauthorized: You cannot modify this ticket' });
        }

        const updateData = {};

        if (status) {
            const normalizedStatus = status.toUpperCase().trim();
            if (!VALID_STATUSES.includes(normalizedStatus)) {
                return res.status(400).json({
                    message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`
                });
            }
            updateData.status = normalizedStatus;
            if (normalizedStatus === 'RESOLVED' || normalizedStatus === 'CLOSED') {
                updateData.resolvedAt = new Date();
            }
        }

        if (systemResponse !== undefined) {
            updateData.systemResponse = systemResponse;
        }

        const updatedTicket = await prisma.supportTicket.update({
            where: { id },
            data: updateData,
            include: {
                ride: {
                    select: {
                        id: true,
                        pickupAddress: true,
                        dropoffAddress: true,
                        createdAt: true,
                        status: true
                    }
                }
            }
        });

        // Notify rider if ticket is resolved or response is added
        if (updateData.status === 'RESOLVED' || updateData.systemResponse) {
            await prisma.notification.create({
                data: {
                    userId: ticket.userId,
                    rideId: ticket.rideId,
                    type: 'SUPPORT',
                    title: 'Support Ticket Update',
                    message: `Ticket #${ticket.id.slice(0, 8).toUpperCase()} has been updated to "${updatedTicket.status}".`
                }
            });
        }

        return res.status(200).json({
            message: 'Support ticket updated successfully',
            ticket: updatedTicket
        });

    } catch (error) {
        console.error("UpdateSupportTicket Error:", error);
        return res.status(500).json({ message: 'Failed to update support ticket', error: error.message });
    }
};
