
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const authRoutes = require("./routes/authRoutes");
const pharmacyRoutes = require("./routes/pharmacyRoutes");
const orderRoutes = require("./routes/orderRoutes");
const salesRoutes = require("./routes/salesRoutes");
const reservationRoutes = require("./routes/reservationRoutes");
const { allowedFrontendOrigins } = require("./utils/config");
const { ensureDataFiles } = require("./utils/database");

const app = express();
const PORT = 5000;

// Middleware
app.use(cors({
    origin: (origin, callback) => {
        callback(null, !origin || allowedFrontendOrigins.has(origin));
    },
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use((req, res, next) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
        req.headers.origin &&
        !allowedFrontendOrigins.has(req.headers.origin)) {
        return res.status(403).json({ message: "This website is not allowed to make that request" });
    }
    return next();
});

// Authentication routes
app.use("/api/auth", authRoutes);
app.use("/api", pharmacyRoutes);
app.use("/api", orderRoutes);
app.use("/api", salesRoutes);
app.use("/api", reservationRoutes);

app.get("/api/health", async (req, res) => {
    try {
        await ensureDataFiles();
        res.json({ status: "ok", storage: "local-json" });
    } catch (error) {
        console.error("Health check failed:", error);
        res.status(503).json({ status: "error", storage: "unavailable" });
    }
});

// Home route
app.get("/", (req, res) => {
    res.send("Welcome to MedConnect Backend!");
});

if (require.main === module) {
    ensureDataFiles().then(() => {
        app.listen(PORT, () => {
            console.log(`MedConnect server running at http://127.0.0.1:${PORT}`);
        });
    }).catch(error => {
        console.error("Backend startup failed:", error.message);
        process.exitCode = 1;
    });
}

module.exports = app;
