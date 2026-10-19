import { prisma } from '../lib/prisma.js';

/**
 * Fetch Rider profile with stats
 * GET /api/profile
 */
export const getProfile = async (req, res) => {
    try {
        const userId = req.user.id;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                profileImage: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        rides: true,
                        paymentMethods: true,
                        emergencyContacts: true,
                    }
                },
                paymentMethods: {
                    select: {
                        id: true,
                        provider: true,
                        type: true,
                        displayLabel: true,
                        isDefault: true,
                    }
                }
            }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.status(200).json({ user });
    } catch (error) {
        console.error("GetProfile Error:", error);
        return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};

/**
 * Update Rider profile details
 * PATCH /api/profile
 */
export const updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, phone, profileImage } = req.body;

        const updateData = {};

        if (name && typeof name === 'string') {
            updateData.name = name.trim();
        }

        if (profileImage !== undefined) {
            updateData.profileImage = profileImage;
        }

        if (phone && typeof phone === 'string') {
            const trimmedPhone = phone.trim();

            // Check if another user is already using this phone
            const existingPhone = await prisma.user.findFirst({
                where: {
                    phone: trimmedPhone,
                    NOT: { id: userId }
                }
            });

            if (existingPhone) {
                return res.status(400).json({ message: 'This phone number is already registered to another account' });
            }

            updateData.phone = trimmedPhone;
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                profileImage: true,
                createdAt: true,
                updatedAt: true,
            }
        });

        return res.status(200).json({
            message: 'Profile updated successfully',
            user: updatedUser
        });

    } catch (error) {
        console.error("UpdateProfile Error:", error);
        return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};
