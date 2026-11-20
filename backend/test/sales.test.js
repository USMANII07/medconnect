const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

test("pharmacist sales validate access and stock, then save invoice and inventory history", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "medconnect-sales-"));
    process.env.MEDCONNECT_DATA_DIR = dir;
    const { jwtSecret } = require("../utils/config");
    const jwt = require("jsonwebtoken");
    const app = require("../server");
    const seed = {
        "users.json": [
            { id: "pharm-1", name: "Pharmacist One", email: "one@example.test", role: "Pharmacist", active: true },
            { id: "pharm-2", name: "Pharmacist Two", email: "two@example.test", role: "Pharmacist", active: true },
            { id: "customer-1", name: "Customer", email: "customer@example.test", role: "Customer", active: true },
            { id: "admin-1", name: "Admin", email: "admin@example.test", role: "Admin", active: true }
        ],
        "pharmacies.json": [{ id: "store-1", ownerId: "pharm-1", name: "Store One", active: true }, { id: "store-2", ownerId: "pharm-2", name: "Store Two", active: true }],
        "catalog.json": [{ id: "med-1", name: "Sample medicine", strength: "10mg", active: true }],
        "inventory.json": [{ id: "inv-1", pharmacyId: "store-1", medicineId: "med-1", quantity: 5, price: 20, purchaseCost: 12, batchNumber: "B-01", expiryDate: "2099-12-31" }],
        "sales.json": [], "stockHistory.json": [], "notifications.json": []
    };
    for (const [name, rows] of Object.entries(seed)) await fs.writeFile(path.join(dir, name), JSON.stringify(rows));
    const server = app.listen(0);
    try {
        await new Promise(resolve => server.once("listening", resolve));
        const base = `http://127.0.0.1:${server.address().port}/api`;
        const token = role => jwt.sign({ role }, jwtSecret, { subject: ({ Customer: "customer-1", Admin: "admin-1" })[role] || "pharm-1", expiresIn: "1h" });
        const post = (role, payload) => fetch(`${base}/pharmacist/sales`, { method: "POST", headers: { "content-type": "application/json", cookie: `medconnect_token=${token(role)}` }, body: JSON.stringify(payload) });

        assert.equal((await post("Customer", { items: [{ inventoryId: "inv-1", quantity: 1 }] })).status, 403);
        assert.equal((await post("Pharmacist", { items: [{ inventoryId: "inv-1", quantity: 6 }] })).status, 409);
        const result = await post("Pharmacist", { items: [{ inventoryId: "inv-1", quantity: 2 }], customerName: "Walk-in", discount: 5 });
        assert.equal(result.status, 201);
        const { sale } = await result.json();
        assert.match(sale.invoiceNumber, /^INV-/);
        assert.equal(sale.subtotal, 40);
        assert.equal(sale.total, 35);
        assert.equal(sale.items[0].batchNumber, "B-01");
        assert.equal(sale.items[0].purchaseCost, 12);
        assert.equal(JSON.parse(await fs.readFile(path.join(dir, "inventory.json"), "utf8"))[0].quantity, 3);
        assert.equal(JSON.parse(await fs.readFile(path.join(dir, "stockHistory.json"), "utf8"))[0].quantityChange, -2);

        const isolatedToken = jwt.sign({ role: "Pharmacist" }, jwtSecret, { subject: "pharm-2", expiresIn: "1h" });
        const isolated = await fetch(`${base}/pharmacist/sales`, { headers: { cookie: `medconnect_token=${isolatedToken}` } });
        assert.deepEqual((await isolated.json()).sales, []);

        const reservationResponse = await fetch(`${base}/customer/reservations`, { method: "POST", headers: { "content-type": "application/json", cookie: `medconnect_token=${token("Customer")}` }, body: JSON.stringify({ inventoryId: "inv-1", quantity: 2 }) });
        assert.equal(reservationResponse.status, 201);
        const { reservation } = await reservationResponse.json();
        assert.equal(reservation.status, "Pending");
        assert.equal(JSON.parse(await fs.readFile(path.join(dir, "inventory.json"), "utf8"))[0].quantity, 3, "reservations do not create a sale or deduct stock");
        const overReserved = await fetch(`${base}/customer/reservations`, { method: "POST", headers: { "content-type": "application/json", cookie: `medconnect_token=${token("Customer")}` }, body: JSON.stringify({ inventoryId: "inv-1", quantity: 2 }) });
        assert.equal(overReserved.status, 409);
        const decision = await fetch(`${base}/pharmacist/reservations/${encodeURIComponent(reservation.id)}`, { method: "PATCH", headers: { "content-type": "application/json", cookie: `medconnect_token=${token("Pharmacist")}` }, body: JSON.stringify({ status: "Accepted" }) });
        assert.equal(decision.status, 200);

        const categoryResponse=await fetch(`${base}/customer/categories`,{headers:{cookie:`medconnect_token=${token("Customer")}`}});
        assert.deepEqual((await categoryResponse.json()).categories,["Other"]);
        const profileResponse=await fetch(`${base}/auth/profile`,{method:"PATCH",headers:{"content-type":"application/json",cookie:`medconnect_token=${token("Customer")}`},body:JSON.stringify({name:"Updated Customer",email:"updated@example.test"})});
        assert.equal(profileResponse.status,200);
        const adminSearch=await fetch(`${base}/customer/medicines?search=Sample`,{headers:{cookie:`medconnect_token=${token("Admin")}`}});
        const adminSearchBody=await adminSearch.json();assert.equal(adminSearch.status,200);assert.equal(adminSearchBody.success,true);assert.equal(adminSearchBody.medicines[0].pharmacy.name,"Store One");
        const customerSearch=await fetch(`${base}/customer/medicines?search=Sample`,{headers:{cookie:`medconnect_token=${token("Customer")}`}});
        const customerSearchBody=await customerSearch.json();assert.equal(customerSearch.status,200);assert.equal(customerSearchBody.success,true);assert.equal(customerSearchBody.medicines[0].name,"Sample medicine");
    } finally {
        await new Promise(resolve => server.close(resolve));
        await fs.rm(dir, { recursive: true, force: true });
        delete process.env.MEDCONNECT_DATA_DIR;
    }
});
