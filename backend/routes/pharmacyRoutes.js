const express = require("express");
const { readData, saveData } = require("../utils/database");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const { joinInventory } = require("../utils/inventory");
const enqueueMutation = require("../utils/mutationQueue");

const router = express.Router();
const pharmacistOnly = [requireAuth, requireRole("Pharmacist")];

router.get("/customer/medicines", requireAuth, requireRole("Customer", "Admin"), async (req, res) => {
    try {
        const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
        const availability = typeof req.query.availability === "string" ? req.query.availability : "all";
        const category = typeof req.query.category === "string" ? req.query.category.trim().toLowerCase() : "";
        const [catalog, inventory, pharmacies] = await Promise.all([
            readData("catalog.json"), readData("inventory.json"), readData("pharmacies.json")
        ]);
        const pharmacyById = new Map(pharmacies.map(item => [String(item.id), item]));
        const medicines = joinInventory(inventory, catalog, pharmacies).filter(medicine => {
            const pharmacy = pharmacyById.get(String(medicine.pharmacyId));
            const matches = !search || [medicine.name, medicine.brandName, medicine.genericName, medicine.strength, medicine.category]
                .some(value => typeof value === "string" && value.toLowerCase().includes(search));
            const inStock = medicine.quantity > 0 && medicine.availabilityStatus !== "expired";
            const availabilityMatches = availability === "available" ? inStock : availability === "out-of-stock" ? !inStock : true;
            return matches && availabilityMatches && (!category || medicine.category.toLowerCase() === category) && medicine.active && pharmacy && pharmacy.active !== false;
        }).sort((a, b) => a.name.localeCompare(b.name) || a.price - b.price);
        if (search && req.user.role === "Customer" && req.query.suggestions !== "1") {
            try { const history = await readData("searchHistory.json"); history.push({ userId: String(req.user.id), query: search.slice(0, 120), resultCount: medicines.length, searchedAt: new Date().toISOString() }); await saveData("searchHistory.json", history.slice(-10000)); }
            catch (historyError) { console.error("Search history save error:", historyError); }
        }
        res.json({ success: true, medicines });
    } catch (error) {
        console.error("Customer medicine search error:", error);
        res.status(500).json({ success: false, message: "Unable to search medicines right now" });
    }
});

router.get("/customer/categories", requireAuth, requireRole("Customer"), async (_req,res)=>{
    try { const catalog=await readData("catalog.json");res.json({categories:[...new Set(catalog.filter(m=>m.active!==false).map(m=>m.category||"Other"))].sort((a,b)=>a.localeCompare(b))}); }
    catch(e){res.status(500).json({message:"Unable to load medicine categories"});}
});

router.get("/customer/search-history", requireAuth, requireRole("Customer"), async (req,res)=>{
    try { const history=await readData("searchHistory.json");res.json({ searches:history.filter(item=>String(item.userId)===String(req.user.id)).slice(-30).reverse() }); }
    catch(e){res.status(500).json({message:"Unable to load recent searches"});}
});

router.get("/customer/pharmacies", requireAuth, requireRole("Customer"), async (req, res) => {
    try {
        const pharmacies = await readData("pharmacies.json");
        const activePharmacies = pharmacies
            .filter(pharmacy => pharmacy.active !== false)
            .map(pharmacy => ({
                id: String(pharmacy.id),
                name: pharmacy.name,
                address: pharmacy.address || "",
                city: pharmacy.city || "",
                phone: pharmacy.phone || "",
                location: pharmacy.location || "",
                latitude: typeof pharmacy.latitude === "number" ? pharmacy.latitude : undefined,
                longitude: typeof pharmacy.longitude === "number" ? pharmacy.longitude : undefined
            }));
        res.json({ pharmacies: activePharmacies });
    } catch (error) {
        console.error("Customer pharmacy lookup error:", error);
        res.status(500).json({ message: "Unable to load pharmacies right now" });
    }
});

router.get("/pharmacist/pharmacy", ...pharmacistOnly, async (req, res) => {
    try {
        res.json({ pharmacy: await getOwnedPharmacy(req.user) });
    } catch (error) {
        console.error("Pharmacy lookup error:", error);
        res.status(500).json({ message: "Unable to load pharmacy information" });
    }
});

router.post("/pharmacist/pharmacy", ...pharmacistOnly, async (req, res) => {
    try {
        const { name, address, city, phone, location } = req.body || {};
        if (![name, address, city].every(value => typeof value === "string" && value.trim())) {
            return res.status(400).json({ message: "Pharmacy name, address, and city are required" });
        }
        const pharmacies = await readData("pharmacies.json");
        if (pharmacies.some(pharmacy => pharmacy.ownerId === String(req.user.id))) {
            return res.status(409).json({ message: "Your pharmacy profile already exists" });
        }
        const pharmacy = {
            id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8),
            ownerId: String(req.user.id), name: name.trim(), address: address.trim(), city: city.trim(),
            phone: typeof phone === "string" ? phone.trim() : "",
            location: typeof location === "string" ? location.trim() : "",
            active: false, approvalStatus: "Pending", createdAt: new Date().toISOString()
        };
        pharmacies.push(pharmacy);
        await saveData("pharmacies.json", pharmacies);
        const notifications = await readData("notifications.json");
        notifications.push({ id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role: "Admin", title: "New pharmacy registered", message: `${pharmacy.name} was added by a pharmacist.`, read: false, createdAt: new Date().toISOString() });
        await saveData("notifications.json", notifications);

        const users = await readData("users.json");
        const userIndex = users.findIndex(user => String(user.id) === String(req.user.id));
        if (userIndex >= 0) {
            users[userIndex].pharmacyId = pharmacy.id;
            await saveData("users.json", users);
            req.user.pharmacyId = pharmacy.id;
        }
        res.status(201).json({ message: "Pharmacy profile created", pharmacy });
    } catch (error) {
        console.error("Pharmacy creation error:", error);
        res.status(500).json({ message: "Unable to save your pharmacy profile" });
    }
});

router.patch("/pharmacist/pharmacy", ...pharmacistOnly, async (req, res) => {
    try {
        const pharmacy = await getOwnedPharmacy(req.user);
        if (!pharmacy) return res.status(404).json({ message: "Create your pharmacy profile first" });
        const pharmacies = await readData("pharmacies.json");
        const target = pharmacies.find(p => String(p.id) === String(pharmacy.id));
        if (!target) return res.status(404).json({ message: "Pharmacy not found in database" });

        const { name, address, city, phone, location } = req.body || {};
        if (name !== undefined) {
            if (typeof name !== "string" || !name.trim()) return res.status(400).json({ message: "Pharmacy name cannot be empty" });
            target.name = name.trim();
        }
        if (address !== undefined) {
            if (typeof address !== "string" || !address.trim()) return res.status(400).json({ message: "Address cannot be empty" });
            target.address = address.trim();
        }
        if (city !== undefined) {
            if (typeof city !== "string" || !city.trim()) return res.status(400).json({ message: "City cannot be empty" });
            target.city = city.trim();
        }
        if (phone !== undefined) {
            target.phone = typeof phone === "string" ? phone.trim() : "";
        }
        if (location !== undefined) {
            target.location = typeof location === "string" ? location.trim() : "";
        }

        await saveData("pharmacies.json", pharmacies);
        res.json({ message: "Pharmacy profile updated", pharmacy: target });
    } catch (error) {
        console.error("Pharmacy update error:", error);
        res.status(500).json({ message: "Unable to update pharmacy profile" });
    }
});

router.get("/pharmacist/medicines", ...pharmacistOnly, async (req, res) => {
    try {
        const pharmacy = await getOwnedPharmacy(req.user);
        if (!pharmacy) return res.status(404).json({ message: "Create your pharmacy profile first" });
        const [inventory, catalog, pharmacies] = await Promise.all([
            readData("inventory.json"), readData("catalog.json"), readData("pharmacies.json")
        ]);
        const medicines = joinInventory(inventory.filter(item => String(item.pharmacyId) === String(pharmacy.id)), catalog, pharmacies);
        res.json({ medicines });
    } catch (error) {
        console.error("Inventory read error:", error);
        res.status(500).json({ message: "Unable to load your inventory" });
    }
});

router.get("/pharmacist/stock-history", ...pharmacistOnly, async (req,res)=>{
    try { const pharmacy=await getOwnedPharmacy(req.user);if(!pharmacy)return res.json({history:[]});const history=await readData("stockHistory.json");res.json({history:history.filter(row=>String(row.pharmacyId)===String(pharmacy.id)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,200)}); }
    catch(e){res.status(500).json({message:"Unable to load stock history"});}
});

router.post("/pharmacist/medicines", ...pharmacistOnly, async (req, res) => {
    try {
        const pharmacy = await getOwnedPharmacy(req.user);
        if (!pharmacy) return res.status(404).json({ message: "Create your pharmacy profile first" });
        const validation = validateMedicine(req.body);
        if (validation) return res.status(400).json({ message: validation });
        const [catalog, inventory] = await Promise.all([readData("catalog.json"), readData("inventory.json")]);
        const name = req.body.name.trim();
        const strength = typeof req.body.strength === "string" ? req.body.strength.trim() : "";
        let product = catalog.find(item => item.name.toLowerCase() === name.toLowerCase() &&
            String(item.strength || "").toLowerCase() === strength.toLowerCase());
        if (!product) {
            product = { id: `MED-CUSTOM-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                name, genericName: name, brandName: null, strength, dosageForm: "Unspecified", category: "Other",
                prescriptionRequired: false, description: "Pharmacist-entered listing.", active: true, demoData: false };
            catalog.push(product);
            await saveData("catalog.json", catalog);
            await saveData("medicines.json", catalog);
        }
        if (inventory.some(item => String(item.pharmacyId) === String(pharmacy.id) && String(item.medicineId) === String(product.id))) {
            return res.status(409).json({ message: "This medicine already exists in your inventory" });
        }
        const medicine = { id: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            pharmacyId: String(pharmacy.id), medicineId: String(product.id), name: product.name,
            quantity: Number(req.body.quantity), price: Number(req.body.price), expiryDate: req.body.expiryDate,
            batchNumber: typeof req.body.batchNumber === "string" ? req.body.batchNumber.trim().slice(0, 80) : "",
            purchaseCost: req.body.purchaseCost === undefined || req.body.purchaseCost === "" ? null : Number(req.body.purchaseCost),
            availabilityStatus: Number(req.body.quantity) === 0 ? "out-of-stock" : Number(req.body.quantity) <= 5 ? "low-stock" : "available",
            lastUpdated: new Date().toISOString(), demoData: false };
        inventory.push(medicine);
        const history = await readData("stockHistory.json");
        history.push({ id: `STK-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, inventoryId: medicine.id, medicineId: medicine.medicineId, pharmacyId: String(pharmacy.id), userId: String(req.user.id), type: "initial-stock", quantityChange: medicine.quantity, quantityBefore: 0, quantityAfter: medicine.quantity, createdAt: medicine.lastUpdated });
        try { await saveData("inventory.json", inventory); await saveData("stockHistory.json", history); }
        catch (error) { await saveData("inventory.json", inventory.filter(row => String(row.id) !== String(medicine.id))); throw error; }
        res.status(201).json({ message: "Medicine added to your inventory.", medicine: { ...product, ...medicine } });
    } catch (error) {
        console.error("Inventory create error:", error);
        res.status(500).json({ message: "Unable to add medicine right now" });
    }
});

router.put("/pharmacist/medicines/:medicineId", ...pharmacistOnly, async (req, res) => enqueueMutation(async () => {
    try {
        const pharmacy = await getOwnedPharmacy(req.user);
        if (!pharmacy) return res.status(404).json({ message: "Create your pharmacy profile first" });
        const inventory = await readData("inventory.json");
        const medicine = inventory.find(item => String(item.id) === req.params.medicineId && String(item.pharmacyId) === String(pharmacy.id));
        if (!medicine) return res.status(404).json({ message: "Medicine was not found in your pharmacy" });
        const { quantity, price, expiryDate } = req.body || {};
        if (quantity !== undefined && (!isNumericInput(quantity) || !Number.isInteger(Number(quantity)) || Number(quantity) < 0)) return res.status(400).json({ message: "Quantity must be a whole number of zero or more" });
        if (price !== undefined && (!isNumericInput(price) || !Number.isFinite(Number(price)) || Number(price) < 0)) return res.status(400).json({ message: "Price must be a valid amount of zero or more" });
        if (expiryDate !== undefined && (typeof expiryDate !== "string" || !isValidDate(expiryDate))) return res.status(400).json({ message: "Please provide a valid expiry date" });
        if (quantity === undefined && price === undefined && expiryDate === undefined && req.body.batchNumber === undefined && req.body.purchaseCost === undefined) return res.status(400).json({ message: "Provide an inventory field to update" });
        const beforeQuantity = Number(medicine.quantity);
        const originalInventory = JSON.stringify(inventory);
        if (quantity !== undefined) {
            const reservations = await readData("reservations.json");
            const reserved = reservations.filter(r => String(r.inventoryId) === String(medicine.id) && ["Pending", "Accepted"].includes(r.status)).reduce((sum, r) => sum + Number(r.quantity), 0);
            if (Number(quantity) < reserved) return res.status(409).json({ message: "Quantity cannot be lower than outstanding reservations" });
        }
        if (quantity !== undefined) medicine.quantity = Number(quantity);
        if (price !== undefined) medicine.price = Number(price);
        if (expiryDate !== undefined) medicine.expiryDate = expiryDate;
        if (req.body.batchNumber !== undefined) { if (typeof req.body.batchNumber !== "string" || req.body.batchNumber.length > 80) return res.status(400).json({ message: "Batch number is invalid" }); medicine.batchNumber = req.body.batchNumber.trim(); }
        if (req.body.purchaseCost !== undefined) { if (req.body.purchaseCost !== null && (req.body.purchaseCost === "" || !isNumericInput(req.body.purchaseCost) || Number(req.body.purchaseCost) < 0)) return res.status(400).json({ message: "Purchase cost must be zero or more" }); medicine.purchaseCost = req.body.purchaseCost === null ? null : Number(req.body.purchaseCost); }
        medicine.availabilityStatus = medicine.quantity === 0 ? "out-of-stock" : medicine.quantity <= 5 ? "low-stock" : "available";
        medicine.lastUpdated = new Date().toISOString();
        try {
            await saveData("inventory.json", inventory);
            if (quantity !== undefined && Number(quantity) !== beforeQuantity) {
                const history = await readData("stockHistory.json");
                history.push({ id: `STK-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, inventoryId: String(medicine.id), medicineId: String(medicine.medicineId), pharmacyId: String(pharmacy.id), userId: String(req.user.id), type: "adjustment", quantityChange: Number(quantity) - beforeQuantity, quantityBefore: beforeQuantity, quantityAfter: Number(quantity), createdAt: new Date().toISOString() });
                await saveData("stockHistory.json", history);
            }
        } catch (error) { await saveData("inventory.json", JSON.parse(originalInventory)); throw error; }
        res.json({ message: "Inventory updated", medicine });
    } catch (error) {
        console.error("Inventory update error:", error);
        res.status(500).json({ message: "Unable to update inventory right now" });
    }
}));

router.delete("/pharmacist/medicines/:medicineId", ...pharmacistOnly, async (req,res)=>enqueueMutation(async ()=>{
    try { const pharmacy=await getOwnedPharmacy(req.user);if(!pharmacy)return res.status(404).json({message:"Create your pharmacy profile first"});const [inventory,sales,reservations]=await Promise.all(["inventory.json","sales.json","reservations.json"].map(readData));const row=inventory.find(item=>String(item.id)===req.params.medicineId&&String(item.pharmacyId)===String(pharmacy.id));if(!row)return res.status(404).json({message:"Medicine was not found in your pharmacy"});if(sales.some(s=>s.items?.some(i=>String(i.inventoryId)===String(row.id))))return res.status(409).json({message:"This inventory record appears in sales history and cannot be deleted"});if(reservations.some(r=>String(r.inventoryId)===String(row.id)&&["Pending","Accepted"].includes(r.status)))return res.status(409).json({message:"Resolve active reservations before deleting this medicine"});await saveData("inventory.json",inventory.filter(item=>String(item.id)!==String(row.id)));res.json({message:"Inventory record deleted"}); }
    catch(e){res.status(500).json({message:"Unable to delete inventory record"});}
}));

router.get("/admin/overview", requireAuth, requireRole("Admin"), async (req, res) => {
    try {
        const [users, pharmacies, medicines, inventory] = await Promise.all([
            readData("users.json"), readData("pharmacies.json"), readData("catalog.json"), readData("inventory.json")
        ]);
        res.json({ counts: { users: users.length, pharmacies: pharmacies.length, medicines: medicines.length, inventory: inventory.length } });
    } catch (error) {
        console.error("Admin overview error:", error);
        res.status(500).json({ message: "Unable to load the admin overview" });
    }
});

async function getOwnedPharmacy(user) {
    const pharmacies = await readData("pharmacies.json");
    return pharmacies.find(pharmacy =>
        pharmacy.ownerId === String(user.id) ||
        (user.pharmacyId && String(pharmacy.id) === String(user.pharmacyId))
    ) || null;
}

function validateMedicine(body) {
    if (!body || typeof body.name !== "string" || !body.name.trim()) return "Medicine name is required";
    if (!isNumericInput(body.quantity) || !Number.isInteger(Number(body.quantity)) || Number(body.quantity) < 0) {
        return "Quantity must be a whole number of zero or more";
    }
    if (!isNumericInput(body.price) || !Number.isFinite(Number(body.price)) || Number(body.price) < 0) {
        return "Price must be a valid amount of zero or more";
    }
    if (typeof body.expiryDate !== "string" || !isValidDate(body.expiryDate)) return "A valid expiry date is required";
    if (body.batchNumber !== undefined && (typeof body.batchNumber !== "string" || body.batchNumber.length > 80)) return "Batch number must be 80 characters or fewer";
    if (body.purchaseCost !== undefined && body.purchaseCost !== "" && (!isNumericInput(body.purchaseCost) || Number(body.purchaseCost) < 0)) return "Purchase cost must be zero or more";
    return null;
}

function isNumericInput(value) {
    return (typeof value === "number" && Number.isFinite(value)) ||
        (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)));
}

function isValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + "T00:00:00.000Z");
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

module.exports = router;
