const express = require("express");
const { readData, saveData } = require("../utils/database");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const enqueueMutation = require("../utils/mutationQueue");
const router = express.Router();
const customer = [requireAuth, requireRole("Customer")];
const pharmacist = [requireAuth, requireRole("Pharmacist")];
const uid = () => `RSV-${Date.now()}-${require("crypto").randomBytes(4).toString("hex").toUpperCase()}`;

router.post("/customer/reservations", ...customer, async (req, res) => {
    await enqueueMutation(async () => {
        try {
            const { inventoryId, quantity } = req.body || {};
            if (typeof inventoryId !== "string" || !Number.isInteger(Number(quantity)) || Number(quantity) < 1) return res.status(400).json({ message: "Choose a medicine and a positive whole quantity" });
            const [inventory, catalog, pharmacies, reservations, users] = await Promise.all(["inventory.json", "catalog.json", "pharmacies.json", "reservations.json", "users.json"].map(readData));
            const row = inventory.find(x => String(x.id) === inventoryId), pharmacy = row && pharmacies.find(x => String(x.id) === String(row.pharmacyId)), medicine = row && catalog.find(x => String(x.id) === String(row.medicineId));
            if (!row || !pharmacy || pharmacy.active === false || !medicine || medicine.active === false) return res.status(404).json({ message: "Medicine or pharmacy is unavailable" });
            if (row.expiryDate && row.expiryDate < new Date().toISOString().slice(0, 10)) return res.status(409).json({ message: "Expired medicines cannot be reserved" });
            const held = reservations.filter(r => String(r.inventoryId) === inventoryId && ["Pending", "Accepted"].includes(r.status)).reduce((sum, r) => sum + Number(r.quantity), 0);
            if (Number(row.quantity) - held < Number(quantity)) return res.status(409).json({ message: "Not enough unreserved stock is available" });
            const user = users.find(x => String(x.id) === String(req.user.id));
            const reservation = { id: uid(), customerId: String(user.id), customerName: user.name, inventoryId, medicineId: String(medicine.id), medicineName: medicine.name, quantity: Number(quantity), unitPrice: Number(row.price), pharmacyId: String(pharmacy.id), pharmacyName: pharmacy.name, status: "Pending", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
            reservations.push(reservation); await saveData("reservations.json", reservations);
            try { const notices = await readData("notifications.json"); notices.push({ id: uid(), userId: String(pharmacy.ownerId), role: "Pharmacist", title: "New reservation request", message: `${reservation.customerName} requested ${reservation.quantity} × ${reservation.medicineName}.`, read: false, createdAt: reservation.createdAt }); await saveData("notifications.json", notices); } catch (e) { console.error("Reservation notification error:", e); }
            res.status(201).json({ reservation });
        } catch (e) { console.error("Reservation creation error:", e); res.status(500).json({ message: "Unable to create reservation" }); }
    });
});

router.get("/customer/reservations", ...customer, async (req, res) => {
    try { res.json({ reservations: (await readData("reservations.json")).filter(r => String(r.customerId) === String(req.user.id)).sort((a,b) => b.createdAt.localeCompare(a.createdAt)) }); }
    catch (e) { res.status(500).json({ message: "Unable to load reservations" }); }
});

router.patch("/customer/reservations/:id/cancel", ...customer, async (req, res) => {
    try { const list = await readData("reservations.json"), reservation = list.find(r => r.id === req.params.id && String(r.customerId) === String(req.user.id)); if (!reservation) return res.status(404).json({ message: "Reservation not found" }); if (reservation.status !== "Pending") return res.status(409).json({ message: "Only pending reservations can be cancelled" }); reservation.status = "Cancelled"; reservation.updatedAt = new Date().toISOString(); await saveData("reservations.json", list); res.json({ reservation }); }
    catch (e) { res.status(500).json({ message: "Unable to cancel reservation" }); }
});

router.get("/pharmacist/reservations", ...pharmacist, async (req, res) => {
    try { const [pharmacies, list] = await Promise.all([readData("pharmacies.json"), readData("reservations.json")]); const p=pharmacies.find(x=>String(x.ownerId)===String(req.user.id)||(req.user.pharmacyId&&String(x.id)===String(req.user.pharmacyId))); res.json({ reservations: p ? list.filter(r=>String(r.pharmacyId)===String(p.id)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)) : [] }); }
    catch (e) { res.status(500).json({ message: "Unable to load pharmacy reservations" }); }
});

router.patch("/pharmacist/reservations/:id", ...pharmacist, async (req, res) => {
    try { const [pharmacies,list] = await Promise.all([readData("pharmacies.json"),readData("reservations.json")]); const p=pharmacies.find(x=>String(x.ownerId)===String(req.user.id)||(req.user.pharmacyId&&String(x.id)===String(req.user.pharmacyId))); const r=list.find(x=>x.id===req.params.id&&p&&String(x.pharmacyId)===String(p.id));if(!r)return res.status(404).json({message:"Reservation not found for your pharmacy"});const next=req.body?.status;const transitions={Pending:["Accepted","Rejected"],Accepted:["Collected","Rejected"]};if(!transitions[r.status]?.includes(next))return res.status(400).json({message:"That reservation status change is not allowed"});if(next==="Accepted"){const [inventory,reservations]=await Promise.all([readData("inventory.json"),readData("reservations.json")]);const row=inventory.find(x=>String(x.id)===r.inventoryId);const held=reservations.filter(x=>x.id!==r.id&&String(x.inventoryId)===r.inventoryId&&["Pending","Accepted"].includes(x.status)).reduce((n,x)=>n+Number(x.quantity),0);if(!row||Number(row.quantity)-held<r.quantity)return res.status(409).json({message:"Stock is no longer available"});}r.status=next;r.updatedAt=new Date().toISOString();await saveData("reservations.json",list);try{const notices=await readData("notifications.json");notices.push({id:uid(),userId:r.customerId,role:"Customer",title:`Reservation ${next.toLowerCase()}`,message:`${r.medicineName}: ${next.toLowerCase()}.`,read:false,createdAt:r.updatedAt});await saveData("notifications.json",notices);}catch(e){console.error("Reservation notification error:",e);}res.json({reservation:r}); }
    catch(e){res.status(500).json({message:"Unable to update reservation"});}
});
module.exports=router;
