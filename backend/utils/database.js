
const fs = require("fs").promises;
const path = require("path");

// Location of JSON database files
const DATA_FOLDER = process.env.MEDCONNECT_DATA_DIR || path.join(__dirname, "../data");

// Read data
async function readData(fileName) {
    const filePath = resolveDataPath(fileName);

    try {
        const data = await fs.readFile(filePath, "utf8");
        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed)) throw new Error(`Storage file ${fileName} must contain a JSON array.`);
        return parsed;
    } catch (error) {
        if (error.code === "ENOENT") {
            return [];
        }
        if (error instanceof SyntaxError) {
            throw new Error(`Storage file ${fileName} contains invalid JSON; refusing to replace existing data.`);
        }
        throw error;
    }
}

async function ensureDataFiles(fileNames = ["users.json", "pharmacies.json", "medicines.json", "catalog.json", "inventory.json", "orders.json", "payments.json", "notifications.json", "sales.json", "stockHistory.json", "reservations.json", "searchHistory.json"]) {
    await fs.mkdir(DATA_FOLDER, { recursive: true });
    for (const fileName of fileNames) {
        const filePath = resolveDataPath(fileName);
        try {
            await fs.writeFile(filePath, "[]", { encoding: "utf8", flag: "wx" });
        } catch (error) {
            if (error.code !== "EEXIST") throw error;
            const data = await fs.readFile(filePath, "utf8");
            if (!Array.isArray(JSON.parse(data))) throw new Error(`Storage file ${fileName} must contain a JSON array.`);
        }
    }
}

// Save data
async function saveData(fileName, data) {
    if (!Array.isArray(data)) throw new TypeError(`Storage data for ${fileName} must be an array.`);
    const filePath = resolveDataPath(fileName);
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

    await fs.mkdir(DATA_FOLDER, { recursive: true });
    await fs.writeFile(temporaryPath, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(temporaryPath, filePath);

    return true;
}

function resolveDataPath(fileName) {
    if (typeof fileName !== "string" || path.basename(fileName) !== fileName) {
        throw new TypeError("Data filename must be a simple filename");
    }
    return path.join(DATA_FOLDER, fileName);
}

module.exports = {
    readData,
    saveData,
    ensureDataFiles
};
