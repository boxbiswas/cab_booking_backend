import { prisma } from '../lib/prisma.js';

// Get rider's configured emergency contacts
// GET /emergency-contacts
export const getEmergencyContacts = async (req, res) => {
    try {
        const userId = req.user.id;

        const contacts = await prisma.emergencyContact.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });

        return res.status(200).json({ contacts });

    } catch (error) {
        console.error("GetEmergencyContacts Error:", error);
        return res.status(500).json({ message: 'Failed to retrieve emergency contacts', error: error.message });
    }
};

// Add a new trusted emergency contact
// POST /emergency-contacts
export const createEmergencyContact = async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, phone, relationship } = req.body || {};

        if (!name || !phone) {
            return res.status(400).json({ message: 'Name and phone number are required' });
        }

        const newContact = await prisma.emergencyContact.create({
            data: {
                userId,
                name: name.trim(),
                phone: phone.trim(),
                relationship: (relationship || 'Family').trim()
            }
        });

        return res.status(201).json({
            message: 'Emergency contact added successfully',
            contact: newContact
        });

    } catch (error) {
        console.error("CreateEmergencyContact Error:", error);
        return res.status(500).json({ message: 'Failed to add emergency contact', error: error.message });
    }
};

// Delete an emergency contact
// DELETE /emergency-contacts/:id
export const deleteEmergencyContact = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const contact = await prisma.emergencyContact.findUnique({
            where: { id }
        });

        if (!contact) {
            return res.status(404).json({ message: 'Emergency contact not found' });
        }

        // Enforce ownership authorization
        if (contact.userId !== userId) {
            return res.status(403).json({ message: 'Unauthorized: You can only remove your own emergency contacts' });
        }

        await prisma.emergencyContact.delete({
            where: { id }
        });

        return res.status(200).json({ message: 'Emergency contact removed successfully' });

    } catch (error) {
        console.error("DeleteEmergencyContact Error:", error);
        return res.status(500).json({ message: 'Failed to delete emergency contact', error: error.message });
    }
};
