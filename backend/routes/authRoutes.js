
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { readData, saveData } = require("../utils/database");
const { jwtSecret, isProduction } = require("../utils/config");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();
const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/"
};

// REGISTER API
router.post("/signup", async (req, res) => {
    try {
        const { name, email, password, role } = req.body || {};

        // Check required fields
        if ([name, email, password, role].some(
            value => typeof value !== "string" || !value.trim()
        )) {
            return res.status(400).json({
                message: "Please fill all required fields"
            });
        }

        const cleanName = name.trim();
        const normalizedEmail = email.trim().toLowerCase();
        const cleanPassword = password;

        if (cleanName.length > 100 || normalizedEmail.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return res.status(400).json({ message: "Please provide a valid name and email" });
        }

        // Only Customer and Pharmacist can register
        if (!["Customer", "Pharmacist"].includes(role)) {
            return res.status(400).json({
                message: "Invalid role. Choose Customer or Pharmacist"
            });
        }

        // Validate password
        if (cleanPassword.length < 8) {
            return res.status(400).json({
                message: "Password must be at least 8 characters"
            });
        }

        // Read existing users
        const users = await readData("users.json");

        // Check duplicate email
        const existingUser = users.find(
            user => typeof user.email === "string" &&
                user.email.trim().toLowerCase() === normalizedEmail
        );

        if (existingUser) {
            return res.status(409).json({
                message: "Email is already registered"
            });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(cleanPassword, 10);

        // Create new user
        const newUser = {
            id: Date.now().toString(),
            name: cleanName,
            email: normalizedEmail,
            passwordHash,
            role,
            createdAt: new Date().toISOString()
        };

        // Save user
        users.push(newUser);
        await saveData("users.json", users);
        const notifications = await readData("notifications.json");
        notifications.push({ id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role: "Admin", title: role === "Customer" ? "New customer registered" : "New pharmacist registered", message: `${cleanName} created an account.`, read: false, createdAt: new Date().toISOString() });
        await saveData("notifications.json", notifications);

        // Send response without password
        res.status(201).json({
            message: "Registration successful!",
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role
            }
        });

    } catch (error) {
        console.error("Signup Error:", error);

        res.status(500).json({
            message: "Server error during registration"
        });
    }
});

// Login with email and password. The JWT is returned only as an HttpOnly cookie.
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (typeof email !== "string" || !email.trim() ||
            typeof password !== "string" || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const users = await readData("users.json");
        const user = users.find(record =>
            typeof record.email === "string" &&
            record.email.trim().toLowerCase() === normalizedEmail
        );

        if (!user || user.active === false || typeof user.passwordHash !== "string" ||
            !await bcrypt.compare(password, user.passwordHash)) {
            return res.status(401).json({ message: "Email or password is incorrect" });
        }

        const token = jwt.sign(
            { role: user.role },
            jwtSecret,
            { subject: String(user.id), algorithm: "HS256", expiresIn: "1h" }
        );
        res.cookie("medconnect_token", token, {
            ...cookieOptions,
            maxAge: 60 * 60 * 1000
        });
        return res.json({
            message: "Login successful",
            user: publicUser(user)
        });
    } catch (error) {
        console.error("Login Error:", error);
        return res.status(500).json({ message: "Unable to log in right now" });
    }
});

router.get("/me", requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user) });
});

router.patch("/profile", requireAuth, async (req, res) => {
    try {
        const { name, email } = req.body || {};
        const cleanName = typeof name === "string" ? name.trim() : "";
        const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
        if (!cleanName || cleanName.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) return res.status(400).json({ message: "Provide a valid name and email address" });
        const users = await readData("users.json");
        if (users.some(user => String(user.id) !== String(req.user.id) && String(user.email).toLowerCase() === normalizedEmail)) return res.status(409).json({ message: "Email is already registered" });
        const user = users.find(record => String(record.id) === String(req.user.id));
        if (!user) return res.status(404).json({ message: "Account not found" });
        user.name = cleanName; user.email = normalizedEmail;
        await saveData("users.json", users);
        res.json({ message: "Profile updated", user: publicUser(user) });
    } catch (error) { console.error("Profile update error:", error); res.status(500).json({ message: "Unable to update your profile" }); }
});

router.post("/logout", (req, res) => {
    res.clearCookie("medconnect_token", cookieOptions);
    res.json({ message: "Logged out successfully" });
});

function publicUser(user) {
    return {
        id: String(user.id),
        name: user.name,
        email: user.email,
        role: user.role
    };
}

module.exports = router;
