import jwt from 'jsonwebtoken';
import "dotenv/config";

export const authenticate = (req, res, next) => {
    let token = req.cookies?.token;
    if (!token && req.headers?.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ message: 'You are not logged in - token missing' });
    }

    try {
        let data = jwt.verify(token, process.env.JWT_SECRET);
        req.user = data;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token', error: err.message });
    }
};