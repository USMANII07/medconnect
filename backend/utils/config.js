const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be set in backend/.env and contain at least 32 characters.");
}

const allowedFrontendOrigins = new Set(
    (process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5500")
        .split(",")
        .map(origin => origin.trim())
        .filter(Boolean)
);
// localhost and 127.0.0.1 are often used interchangeably by local frontend servers.
// Allow the matching alias so the browser can use one host for both page and API cookies.
for (const origin of [...allowedFrontendOrigins]) {
    try {
        const parsed = new URL(origin);
        if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
            const alias = new URL(origin);
            alias.hostname = parsed.hostname === "localhost" ? "127.0.0.1" : "localhost";
            allowedFrontendOrigins.add(alias.origin);
        }
    } catch {}
}

module.exports = {
    jwtSecret,
    isProduction: process.env.NODE_ENV === "production",
    allowedFrontendOrigins
};
