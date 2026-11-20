const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../utils/config");
const { readData } = require("../utils/database");

async function requireAuth(req, res, next) {
    const token = req.cookies && req.cookies.medconnect_token;
    if (!token) {
        return res.status(401).json({ message: "Please log in to continue" });
    }

    try {
        const payload = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });
        if (typeof payload.sub !== "string" || typeof payload.role !== "string") {
            return res.status(401).json({ message: "Invalid authentication token" });
        }

        const users = await readData("users.json");
        const user = users.find(record =>
            String(record.id) === payload.sub && record.role === payload.role
        );
        if (!user) {
            return res.status(401).json({ message: "This account is no longer available" });
        }
        if (user.active === false) return res.status(403).json({ message: "This account is inactive. Contact MedConnect support." });
        req.user = user;
        return next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({ message: "Your session expired. Please log in again" });
        }
        if (error.name === "JsonWebTokenError" || error.name === "NotBeforeError") {
            return res.status(401).json({ message: "Invalid authentication token" });
        }
        return next(error);
    }
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: "You do not have permission to access this resource" });
        }
        return next();
    };
}

module.exports = { requireAuth, requireRole };
