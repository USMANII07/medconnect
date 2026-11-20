const express = require("express");
const { readData, saveData } = require("../utils/database");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const router = express.Router();
const customer = [requireAuth, requireRole("Customer")];
const pharmacist = [requireAuth, requireRole("Pharmacist")];
const admin = [requireAuth, requireRole("Admin")];
const paymentsInFlight = new Set();
let orderCreationInFlight = false;
const id = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

async function notify(userId, role, title, message, orderId) {
    const list = await readData("notifications.json");
    list.push({ id: id("n"), userId: userId ? String(userId) : null, role, title, message, orderId: orderId || null, read: false, createdAt: new Date().toISOString() });
    await saveData("notifications.json", list);
}
async function pharmacyFor(user) {
    const ps = await readData("pharmacies.json");
    return ps.find(p => String(p.ownerId) === String(user.id) || (user.pharmacyId && String(p.id) === String(user.pharmacyId)));
}
function safeOrder(order) { return order; }

router.post("/customer/orders", ...customer, async (req, res) => {
    if (orderCreationInFlight) return res.status(409).json({ message: "An order is being saved. Please try again in a moment." });
    orderCreationInFlight = true;
    try {
        const { items, address, phone } = req.body || {};
        if (!Array.isArray(items) || !items.length || items.length > 40 || typeof address !== "string" || !address.trim() || address.trim().length > 500 || typeof phone !== "string" || !/^\+?[0-9][0-9 ()-]{7,18}$/.test(phone.trim()) || phone.replace(/\D/g, "").length < 9 || phone.replace(/\D/g, "").length > 15) return res.status(400).json({ message: "Add medicines and provide a valid delivery address and phone number" });
        const [medicines, catalog, pharmacies, users, orders] = await Promise.all([readData("inventory.json"), readData("catalog.json"), readData("pharmacies.json"), readData("users.json"), readData("orders.json")]);
        const normalized = [];
        if (new Set(items.map(item => String(item?.medicineId))).size !== items.length) return res.status(400).json({ message: "Each medicine can appear only once; combine its quantity" });
        for (const item of items) {
            const qty = Number(item.quantity);
            if (!Number.isInteger(qty) || qty < 1) return res.status(400).json({ message: "Each quantity must be a positive whole number" });
            const medicine = medicines.find(m => String(m.id) === String(item.medicineId));
            const pharmacy = medicine && pharmacies.find(p => String(p.id) === String(medicine.pharmacyId));
            const product = medicine && catalog.find(m => String(m.id) === String(medicine.medicineId));
            const reserved = orders.filter(o => !o.stockDeducted && !["Rejected", "Cancelled"].includes(o.status)).reduce((sum, o) => sum + (o.items || []).filter(line => String(line.medicineId) === String(item.medicineId)).reduce((n, line) => n + Number(line.quantity || 0), 0), 0);
            if (!medicine || !product || product.active === false || !pharmacy || pharmacy.active === false || Number(medicine.quantity) - reserved < qty || !medicine.expiryDate || medicine.expiryDate < new Date().toISOString().slice(0, 10)) return res.status(409).json({ message: `Insufficient or unavailable stock for ${medicine?.name || "a selected medicine"}` });
            normalized.push({ medicineId: String(medicine.id), name: medicine.name, strength: medicine.strength || "", quantity: qty, unitPrice: Number(medicine.price), lineTotal: Number(medicine.price) * qty });
        }
        const user = users.find(u => String(u.id) === String(req.user.id));
        if (!user) return res.status(401).json({ message: "Customer account was not found" });
        const grouped = new Map();
        for (const line of normalized) {
            const medicine = medicines.find(m => String(m.id) === line.medicineId);
            const pharmacyId = String(medicine.pharmacyId);
            if (!grouped.has(pharmacyId)) grouped.set(pharmacyId, []);
            grouped.get(pharmacyId).push(line);
        }
        const now = new Date().toISOString();
        const created = [];
        for (const [pharmacyId, pharmacyItems] of grouped) {
            const pharmacy = pharmacies.find(p => String(p.id) === pharmacyId);
            if (!pharmacy || pharmacy.active === false) return res.status(409).json({ message: "A selected pharmacy is unavailable" });
            const subtotal = pharmacyItems.reduce((sum, item) => sum + item.lineTotal, 0);
            created.push({ id: id("MC"), customerId: String(req.user.id), customer: { name: user.name, email: user.email, phone: phone.trim() }, pharmacyId, pharmacy: { name: pharmacy.name, address: pharmacy.address, city: pharmacy.city, phone: pharmacy.phone || "" }, items: pharmacyItems, address: address.trim(), subtotal, deliveryCharge: 100, discount: 0, total: subtotal + 100, status: "Pending", paymentId: null, stockDeducted: false, createdAt: now, updatedAt: now });
        }
        orders.push(...created); await saveData("orders.json", orders);
        for (const order of created) {
            const pharmacy = pharmacies.find(p => String(p.id) === order.pharmacyId);
            try { await notify(order.customerId, "Customer", "Order successfully placed", `Order ${order.id} was sent to ${order.pharmacy.name} for confirmation.`, order.id); }
            catch (notificationError) { console.error("Customer order notification error:", notificationError); }
            try { await notify(pharmacy.ownerId, "Pharmacist", "New order received", `${order.id} requires review.`, order.id); }
            catch (notificationError) { console.error("Order notification error:", notificationError); }
        }
        res.status(201).json({ orders: created, order: created[0] });
    } catch (error) { console.error("Order create error:", error); res.status(500).json({ message: "Unable to place order right now" }); }
    finally { orderCreationInFlight = false; }
});

router.get("/customer/orders", ...customer, async (req, res) => {
    try { const orders = await readData("orders.json"); res.json({ orders: orders.filter(o => String(o.customerId) === String(req.user.id)) }); }
    catch (e) { res.status(500).json({ message: "Unable to load orders" }); }
});
router.get("/customer/orders/:orderId/receipt", ...customer, async (req,res)=>{try{const [orders,payments]=await Promise.all([readData("orders.json"),readData("payments.json")]);const order=orders.find(o=>o.id===req.params.orderId&&String(o.customerId)===String(req.user.id));if(!order)return res.status(404).json({message:"Order not found"});if(!order.paymentId)return res.status(409).json({message:"Receipt is available after payment"});const payment=payments.find(p=>p.id===order.paymentId&&p.orderId===order.id&&String(p.customerId)===String(order.customerId)&&p.status==="PAID (DEMO)");if(!payment)return res.status(409).json({message:"Receipt is available after successful payment"});res.json({order,payment});}catch(e){res.status(500).json({message:"Unable to load receipt"});}});

router.post("/customer/orders/:orderId/pay", ...customer, async (req, res) => {
    const lockKey = `${req.user.id}:${req.params.orderId}`;
    if (paymentsInFlight.has(lockKey)) return res.status(409).json({ message: "Payment is already being processed" });
    paymentsInFlight.add(lockKey);
    try {
        const method = req.body?.method;
        if (!["Easypaisa", "JazzCash", "Visa", "Mastercard"].includes(method)) return res.status(400).json({ message: "Choose a supported demo payment method" });
        const orders = await readData("orders.json"); const order = orders.find(o => o.id === req.params.orderId && String(o.customerId) === String(req.user.id));
        if (!order) return res.status(404).json({ message: "Order not found" });
        if (order.status === "Paid" && order.paymentId) { const payments = await readData("payments.json"); const previous = payments.find(p => p.id === order.paymentId && p.orderId === order.id); if (!previous) return res.status(409).json({ message: "Payment record is inconsistent. Contact support." }); return res.json({ order, payment: previous, duplicate: true }); }
        if (order.status !== "Awaiting Payment" && order.status !== "Confirmed") return res.status(409).json({ message: "This order is not eligible for payment" });
        const [medicines, payments] = await Promise.all([readData("inventory.json"), readData("payments.json")]);
        for (const line of order.items) { const m = medicines.find(row => String(row.id) === String(line.medicineId)); if (!m || Number(m.quantity) < line.quantity) return res.status(409).json({ message: `Stock changed for ${line.name}; contact the pharmacy` }); }
        if (!order.stockDeducted) {
            for (const line of order.items) { const m = medicines.find(row => String(row.id) === String(line.medicineId)); m.quantity = Number(m.quantity) - line.quantity; m.availabilityStatus = m.quantity === 0 ? "out-of-stock" : m.quantity <= 5 ? "low-stock" : "available"; m.lastUpdated = new Date().toISOString(); }
            order.stockDeducted = true;
        }
        const payment = { id: id("PAY"), receiptNumber: id("RCPT"), orderId: order.id, customerId: String(req.user.id), method, amount: order.total, status: "PAID (DEMO)", reference: id("DEMO"), createdAt: new Date().toISOString() };
        payments.push(payment); order.paymentId = payment.id; order.status = "Paid"; order.updatedAt = new Date().toISOString();
        // Persist stock, payment, and the order's one-time deduction marker in sequence.
        // A retry sees the saved marker and cannot deduct inventory a second time.
        if (order.stockDeducted) await saveData("inventory.json", medicines);
        await saveData("payments.json", payments);
        await saveData("orders.json", orders);
        try { await notify(order.customerId, "Customer", "Demo payment successful", `Payment ${payment.reference} was recorded for ${order.id}.`, order.id); }
        catch (notificationError) { console.error("Customer payment notification error:", notificationError); }
        try { await notify(null, "Admin", "Demo payment recorded", `${payment.reference} for ${order.id}.`, order.id); }
        catch (notificationError) { console.error("Admin payment notification error:", notificationError); }
        res.json({ order, payment });
    } catch (e) { console.error("Demo payment error:", e); res.status(500).json({ message: "Unable to process demo payment" }); }
    finally { paymentsInFlight.delete(lockKey); }
});

router.get("/pharmacist/orders", ...pharmacist, async (req, res) => {
    try { const p = await pharmacyFor(req.user); if (!p) return res.json({ orders: [] }); const orders = await readData("orders.json"); res.json({ orders: orders.filter(o => String(o.pharmacyId) === String(p.id)) }); }
    catch (e) { res.status(500).json({ message: "Unable to load pharmacy orders" }); }
});
router.patch("/pharmacist/orders/:orderId", ...pharmacist, async (req, res) => {
    try {
        const p = await pharmacyFor(req.user); const orders = await readData("orders.json"); const order = orders.find(o => o.id === req.params.orderId && p && String(o.pharmacyId) === String(p.id));
        if (!order) return res.status(404).json({ message: "Order not found for your pharmacy" });
        const status = req.body?.status;
        const transitions = { Pending: ["Confirmed", "Rejected"], Confirmed: ["Preparing", "Out for Delivery", "Delivered"], "Awaiting Payment": ["Preparing", "Out for Delivery", "Delivered"], Paid: ["Preparing", "Out for Delivery", "Delivered"], Preparing: ["Out for Delivery", "Delivered"], "Out for Delivery": ["Delivered"] };
        if (!transitions[order.status]?.includes(status)) return res.status(400).json({ message: "That order status change is not allowed" });
        order.status = status; order.updatedAt = new Date().toISOString();
        await saveData("orders.json", orders);
        const notice = status === "Confirmed" ? "Order confirmed. Demo payment is now available." : status === "Rejected" ? "Order rejected. Payment is unavailable." : `Order status updated to ${status}.`;
        await notify(order.customerId, "Customer", status === "Confirmed" ? "Order confirmed" : status === "Rejected" ? "Order rejected" : "Order status updated", notice, order.id);
        await notify(null, "Admin", "Order activity", `${order.id}: ${status}.`, order.id);
        res.json({ order });
    } catch (e) { res.status(500).json({ message: "Unable to update order" }); }
});

router.get("/notifications", requireAuth, async (req, res) => {
    try { const list = await readData("notifications.json"); res.json({ notifications: list.filter(n => n.role === req.user.role && (!n.userId || String(n.userId) === String(req.user.id))).slice(-100).reverse() }); }
    catch (e) { res.status(500).json({ message: "Unable to load notifications" }); }
});

router.get("/admin/data", ...admin, async (req, res) => {
    try {
        const [users, pharmacies, catalog, inventory, orders, payments, notifications] = await Promise.all([
            "users.json", "pharmacies.json", "catalog.json", "inventory.json", "orders.json", "payments.json", "notifications.json"
        ].map(readData));
        const { joinInventory } = require("../utils/inventory");
        const inventoryRows = joinInventory(inventory, catalog, pharmacies);
        const sales = await readData("sales.json");
        res.json({ users: users.map(({ passwordHash, ...u }) => u), pharmacies, medicines: catalog,
            catalog, inventory: inventoryRows, orders, payments, sales, notifications: notifications.filter(n => n.role === "Admin"),
            counts: { customers: users.filter(u => u.role === "Customer").length,
                pharmacists: users.filter(u => u.role === "Pharmacist").length, pharmacies: pharmacies.length,
                medicines: catalog.length, inventory: inventoryRows.length, orders: orders.length,
                sales: sales.length, salesRevenue: sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0),
                pending: orders.filter(o => o.status === "Pending").length,
                pendingPharmacyApprovals: pharmacies.filter(p => p.approvalStatus === "Pending").length,
                activePharmacies: pharmacies.filter(p => p.active !== false).length,
                lowStock: inventoryRows.filter(m => m.availabilityStatus === "low-stock").length,
                expiredInventory: inventoryRows.filter(m => m.availabilityStatus === "expired").length,
                completed: orders.filter(o => o.status === "Delivered").length, payments: payments.length } });
    } catch (e) { res.status(500).json({ message: "Unable to load admin data" }); }
});
router.patch("/admin/users/:userId", ...admin, async (req, res) => {
    try { const users = await readData("users.json"); const user = users.find(u => String(u.id) === req.params.userId && u.role !== "Admin"); if (!user) return res.status(404).json({ message: "Account not found" }); if (typeof req.body?.active !== "boolean") return res.status(400).json({ message: "Provide active true or false" }); user.active = req.body.active; await saveData("users.json", users); res.json({ user: (({ passwordHash, ...safe }) => safe)(user) }); }
    catch (e) { res.status(500).json({ message: "Unable to update account" }); }
});
router.post("/admin/pharmacies", ...admin, async (req, res) => {
    try { const { name, address, city, phone = "", location = "" } = req.body || {}; if (![name, address, city].every(v => typeof v === "string" && v.trim())) return res.status(400).json({ message: "Name, address and city are required" }); const ps = await readData("pharmacies.json"); const pharmacy = { id: id("PH"), name: name.trim(), address: address.trim(), city: city.trim(), phone: String(phone).slice(0, 40), location: String(location).slice(0, 300), active: true }; ps.push(pharmacy); await saveData("pharmacies.json", ps); await notify(null, "Admin", "New pharmacy added", pharmacy.name); res.status(201).json({ pharmacy }); }
    catch (e) { res.status(500).json({ message: "Unable to add pharmacy" }); }
});
router.patch("/admin/pharmacies/:pharmacyId", ...admin, async (req, res) => {
    try { const ps=await readData("pharmacies.json");const p=ps.find(x=>String(x.id)===req.params.pharmacyId);if(!p)return res.status(404).json({message:"Pharmacy not found"});const {name,address,city,phone,location,active,approvalStatus}=req.body||{};for(const [key,value] of Object.entries({name,address,city,phone,location})){if(value!==undefined){if(typeof value!=="string"||value.length>500)return res.status(400).json({message:`Invalid ${key}`});p[key]=value.trim();}}if(approvalStatus!==undefined){if(!["Pending","Approved","Rejected"].includes(approvalStatus))return res.status(400).json({message:"Invalid approval status"});p.approvalStatus=approvalStatus;p.active=approvalStatus==="Approved";}if(active!==undefined){if(typeof active!=="boolean")return res.status(400).json({message:"active must be boolean"});p.active=active;if(active)p.approvalStatus="Approved";}await saveData("pharmacies.json",ps);res.json({pharmacy:p});}
    catch(e){res.status(500).json({message:"Unable to update pharmacy"});}
});
router.post("/admin/medicines", ...admin, async (req, res) => {
    try {
        const b = req.body || {};
        if (![b.name, b.pharmacyId, b.expiryDate].every(v => typeof v === "string" && v.trim()) ||
            !Number.isInteger(Number(b.quantity)) || Number(b.quantity) < 0 || !Number.isFinite(Number(b.price)) || Number(b.price) < 0)
            return res.status(400).json({ message: "Valid name, pharmacy, expiry, quantity and price are required" });
        const [catalog, inventory, pharmacies] = await Promise.all([readData("catalog.json"), readData("inventory.json"), readData("pharmacies.json")]);
        if (!pharmacies.some(p => String(p.id) === b.pharmacyId)) return res.status(400).json({ message: "Pharmacy not found" });
        const name = b.name.trim(), strength = String(b.strength || "").trim();
        let product = catalog.find(m => m.name.toLowerCase() === name.toLowerCase() && String(m.strength || "").toLowerCase() === strength.toLowerCase());
        if (!product) {
            product = { id: id("MED"), name, genericName: name, brandName: null, strength, dosageForm: "Unspecified",
                category: "Other", prescriptionRequired: false, description: "Admin-entered listing.", active: true, demoData: false };
            catalog.push(product);
            await saveData("catalog.json", catalog); await saveData("medicines.json", catalog);
        }
        const row = { id: id("INV"), medicineId: product.id, pharmacyId: b.pharmacyId, name,
            quantity: Number(b.quantity), price: Number(b.price), expiryDate: b.expiryDate,
            availabilityStatus: Number(b.quantity) === 0 ? "out-of-stock" : Number(b.quantity) <= 5 ? "low-stock" : "available",
            lastUpdated: new Date().toISOString(), demoData: false };
        inventory.push(row); await saveData("inventory.json", inventory); res.status(201).json({ medicine: { ...product, ...row } });
    } catch (e) { res.status(500).json({ message: "Unable to add medicine" }); }
});
router.patch("/admin/medicines/:medicineId", ...admin, async (req,res)=>{
    try { const inventory=await readData("inventory.json"); const m=inventory.find(x=>String(x.id)===req.params.medicineId); if(!m)return res.status(404).json({message:"Inventory record not found"});
        const b=req.body||{};
        if(b.name!==undefined||b.strength!==undefined)return res.status(400).json({message:"Medicine catalog details are managed separately from inventory"});
        if(b.expiryDate!==undefined){if(typeof b.expiryDate!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(b.expiryDate))return res.status(400).json({message:"Invalid expiry date"});m.expiryDate=b.expiryDate;}
        if(b.quantity!==undefined){if(!Number.isInteger(Number(b.quantity))||Number(b.quantity)<0)return res.status(400).json({message:"Quantity must be zero or more"});m.quantity=Number(b.quantity);}
        if(b.price!==undefined){if(!Number.isFinite(Number(b.price))||Number(b.price)<0)return res.status(400).json({message:"Price must be zero or more"});m.price=Number(b.price);}
        m.availabilityStatus=m.quantity===0?"out-of-stock":m.quantity<=5?"low-stock":"available";m.lastUpdated=new Date().toISOString();
        await saveData("inventory.json",inventory);res.json({medicine:m});
    }catch(e){res.status(500).json({message:"Unable to update inventory"});}
});
router.delete("/admin/medicines/:medicineId", ...admin, async(req,res)=>{
    try{const [inventory,orders]=await Promise.all([readData("inventory.json"),readData("orders.json")]);
        if(orders.some(o=>o.items?.some(i=>String(i.medicineId)===req.params.medicineId)))return res.status(409).json({message:"Medicine appears in order history and cannot be deleted"});
        const keep=inventory.filter(m=>String(m.id)!==req.params.medicineId);if(keep.length===inventory.length)return res.status(404).json({message:"Inventory record not found"});
        await saveData("inventory.json",keep);res.json({message:"Inventory record deleted"});
    }catch(e){res.status(500).json({message:"Unable to delete inventory record"});}
});

module.exports = router;
