const express = require("express");
const { readData, saveData } = require("../utils/database");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const enqueueMutation = require("../utils/mutationQueue");

const router = express.Router();
const pharmacist = [requireAuth, requireRole("Pharmacist")];
const admin = [requireAuth, requireRole("Admin")];
const id = prefix => `${prefix}-${Date.now()}-${require("crypto").randomBytes(4).toString("hex").toUpperCase()}`;

async function ownedPharmacy(user) {
    const pharmacies = await readData("pharmacies.json");
    return pharmacies.find(p => String(p.ownerId) === String(user.id) || (user.pharmacyId && String(p.id) === String(user.pharmacyId))) || null;
}

router.post("/pharmacist/sales", ...pharmacist, async (req, res) => {
    await enqueueMutation(() => createSale(req, res));
});

async function createSale(req, res) {
    try {
        const pharmacy = await ownedPharmacy(req.user);
        if (!pharmacy) return res.status(404).json({ message: "Create your pharmacy profile first" });
        const { items, customerName = "", customerPhone = "", discount = 0 } = req.body || {};
        if (!Array.isArray(items) || items.length < 1 || items.length > 100) return res.status(400).json({ message: "Add at least one medicine to the sale" });
        if (typeof customerName !== "string" || customerName.length > 120 || typeof customerPhone !== "string" || customerPhone.length > 40) return res.status(400).json({ message: "Customer details are invalid" });
        if (!Number.isFinite(Number(discount)) || Number(discount) < 0) return res.status(400).json({ message: "Discount must be zero or more" });

        const [inventory, catalog, users, sales, stockHistory, reservations] = await Promise.all(["inventory.json", "catalog.json", "users.json", "sales.json", "stockHistory.json", "reservations.json"].map(readData));
        const user = users.find(u => String(u.id) === String(req.user.id));
        if (!user) return res.status(401).json({ message: "Pharmacist account not found" });
        const seen = new Set();
        let subtotal = 0;
        const normalized = [];
        for (const item of items) {
            const inventoryId = String(item?.inventoryId || "");
            const quantity = Number(item?.quantity);
            if (!inventoryId || seen.has(inventoryId) || !Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ message: "Each medicine needs a unique inventory record and positive whole quantity" });
            seen.add(inventoryId);
            const row = inventory.find(r => String(r.id) === inventoryId && String(r.pharmacyId) === String(pharmacy.id));
            const product = row && catalog.find(c => String(c.id) === String(row.medicineId));
            if (!row || !product || product.active === false) return res.status(404).json({ message: "A selected medicine was not found in your inventory" });
            if (row.expiryDate && row.expiryDate < new Date().toISOString().slice(0, 10)) return res.status(409).json({ message: `${product.name} is expired and cannot be sold` });
            const reserved = reservations.filter(r => String(r.inventoryId) === inventoryId && ["Pending", "Accepted"].includes(r.status)).reduce((sum, r) => sum + Number(r.quantity), 0);
            if (Number(row.quantity) - reserved < quantity) return res.status(409).json({ message: `Insufficient unreserved stock for ${product.name}` });
            const unitPrice = Number(row.price);
            if (!Number.isFinite(unitPrice) || unitPrice < 0) return res.status(409).json({ message: `Invalid price for ${product.name}` });
            subtotal += unitPrice * quantity;
            normalized.push({ inventoryId, medicineId: String(product.id), name: product.name, strength: product.strength || "", batchNumber: row.batchNumber || "", quantity, unitPrice, lineTotal: unitPrice * quantity,
                purchaseCost: Number.isFinite(Number(row.purchaseCost)) && row.purchaseCost !== "" ? Number(row.purchaseCost) : null });
        }
        if (Number(discount) > subtotal) return res.status(400).json({ message: "Discount cannot exceed the subtotal" });
        const now = new Date().toISOString();
        const sale = { id: id("SALE"), invoiceNumber: id("INV"), pharmacyId: String(pharmacy.id), pharmacistId: String(user.id), pharmacistName: user.name,
            customerName: customerName.trim(), customerPhone: customerPhone.trim(), items: normalized, totalQuantity: normalized.reduce((n, x) => n + x.quantity, 0),
            subtotal: money(subtotal), discount: money(Number(discount)), total: money(subtotal - Number(discount)), createdAt: now };
        const originalInventory = JSON.stringify(inventory);
        const originalHistory = JSON.stringify(stockHistory);
        for (const line of normalized) {
            const row = inventory.find(r => String(r.id) === line.inventoryId);
            const before = Number(row.quantity);
            row.quantity = before - line.quantity;
            row.availabilityStatus = row.quantity === 0 ? "out-of-stock" : row.quantity <= 5 ? "low-stock" : "available";
            row.lastUpdated = now;
            stockHistory.push({ id: id("STK"), inventoryId: line.inventoryId, medicineId: line.medicineId, pharmacyId: sale.pharmacyId, userId: sale.pharmacistId,
                type: "sale", quantityChange: -line.quantity, quantityBefore: before, quantityAfter: row.quantity, reference: sale.invoiceNumber, createdAt: now });
        }
        try {
            await saveData("inventory.json", inventory);
            await saveData("stockHistory.json", stockHistory);
            sales.push(sale);
            await saveData("sales.json", sales);
        } catch (error) {
            await saveData("inventory.json", JSON.parse(originalInventory));
            await saveData("stockHistory.json", JSON.parse(originalHistory));
            throw error;
        }
        try {
            const notices = await readData("notifications.json");
            notices.push({ id: id("N"), userId: String(user.id), role: "Pharmacist", title: "Sale recorded", message: `${sale.invoiceNumber} · Rs. ${sale.total.toFixed(2)}`, read: false, createdAt: now });
            await saveData("notifications.json", notices);
        } catch (notificationError) { console.error("Sale notification error:", notificationError); }
        return res.status(201).json({ sale });
    } catch (error) {
        console.error("Sale creation error:", error);
        return res.status(500).json({ message: "Unable to save sale" });
    }
}

router.get("/pharmacist/sales", ...pharmacist, async (req, res) => {
    try { const pharmacy = await ownedPharmacy(req.user); if (!pharmacy) return res.json({ sales: [] });
        res.json({ sales: (await readData("sales.json")).filter(s => String(s.pharmacyId) === String(pharmacy.id)).sort((a,b) => b.createdAt.localeCompare(a.createdAt)) });
    } catch (e) { res.status(500).json({ message: "Unable to load sales" }); }
});

router.get("/admin/sales", ...admin, async (req, res) => {
    try { res.json({ sales: (await readData("sales.json")).sort((a,b) => b.createdAt.localeCompare(a.createdAt)) }); }
    catch (e) { res.status(500).json({ message: "Unable to load sales" }); }
});

function money(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
module.exports = router;
