import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import "dotenv/config";

// Helper for cookie options based on environment
const getCookieOptions = () => {
    const isProduction = process.env.NODE_ENV === 'production';
    return {
        httpOnly: true,
        secure: isProduction, // HTTPS only in production
        sameSite: isProduction ? 'none' : 'lax', // 'none' needed for cross-origin in prod
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    };
};

export const register = async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'Email is already registered' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Fallback phone if not provided
        const userPhone = phone || `+1${Date.now().toString().slice(-10)}`;

        // Create user
        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                phone: userPhone,
                passwordHash
            }
        });

        return res.status(201).json({
            message: 'Registration successful. Please log in.',
            user: { id: newUser.id, name: newUser.name, email: newUser.email, phone: newUser.phone }
        });

    } catch (error) {
        console.error("Register Error:", error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Find user
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Set cookie and respond
        res.cookie('token', token, getCookieOptions());

        return res.status(200).json({
            message: 'Login successful',
            user: { id: user.id, name: user.name, email: user.email, phone: user.phone, profileImage: user.profileImage }
        });

    } catch (error) {
        console.error("Login Error:", error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const logout = (req, res) => {
    // Clear the cookie with the exact same options (excluding maxAge)
    const isProduction = process.env.NODE_ENV === 'production';
    res.clearCookie('token', {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax'
    });

    return res.status(200).json({ message: 'Logged out successfully' });
};
