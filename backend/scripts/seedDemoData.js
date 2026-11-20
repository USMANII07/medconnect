const { readData, saveData } = require("../utils/database");

const demoPharmacies = [
    ["PH001", "City Care Pharmacy", "Gulshan-e-Iqbal", "0300-1112233"],
    ["PH002", "Health Plus Pharmacy", "Johar", "0301-2223344"],
    ["PH003", "MediLife Pharmacy", "DHA Phase 2", "0302-3334455"],
    ["PH004", "Al-Shifa Pharmacy", "North Nazimabad", "0303-4445566"],
    ["PH005", "LifeCare Medical Store", "PECHS", "0304-5556677"]
].map(([id, name, area, phone], index) => ({
    id, name, address: `${area}, Karachi`, area, city: "Karachi", phone,
    location: `${area}, Karachi`, openingHours: "09:00–22:00 (demo)",
    status: "active", active: true, demoData: true,
    description: "Fictional pharmacy record for MedConnect demo use.", demoIndex: index
}));

// Fields and pricing here are fictional demo data, not medical advice or market claims.
const products = [
    ["Panadol", "paracetamol", "Panadol", "500mg", "Tablet", "Pain / Fever", false],
    ["Calpol", "paracetamol", "Calpol", "120mg/5ml", "Syrup", "Pain / Fever", false],
    ["Brufen", "ibuprofen", "Brufen", "400mg", "Tablet", "Pain / Inflammation", true],
    ["Disprin", "acetylsalicylic acid", "Disprin", "300mg", "Tablet", "Pain / Fever", false],
    ["Ponstan", "mefenamic acid", "Ponstan", "500mg", "Tablet", "Pain", true],
    ["Diclofenac", "diclofenac", "", "50mg", "Tablet", "Pain", true],
    ["Augmentin", "amoxicillin / clavulanic acid", "Augmentin", "625mg", "Tablet", "Antibiotic", true],
    ["Amoxil", "amoxicillin", "Amoxil", "500mg", "Capsule", "Antibiotic", true],
    ["Azithromycin", "azithromycin", "", "500mg", "Tablet", "Antibiotic", true],
    ["Cefixime", "cefixime", "", "200mg", "Tablet", "Antibiotic", true],
    ["Flagyl", "metronidazole", "Flagyl", "400mg", "Tablet", "Antibiotic", true],
    ["Ciprofloxacin", "ciprofloxacin", "", "500mg", "Tablet", "Antibiotic", true],
    ["Rigix", "cetirizine", "Rigix", "10mg", "Tablet", "Allergy", false],
    ["Zyrtec", "cetirizine", "Zyrtec", "10mg", "Tablet", "Allergy", false],
    ["Loratadine", "loratadine", "", "10mg", "Tablet", "Allergy", false],
    ["Montelukast", "montelukast", "", "10mg", "Tablet", "Allergy / Respiratory", true],
    ["Risek", "omeprazole", "Risek", "20mg", "Capsule", "Acidity", false],
    ["Nexum", "esomeprazole", "Nexum", "40mg", "Tablet", "Acidity", false],
    ["Gaviscon", "alginate combination", "Gaviscon", "Oral Suspension", "Suspension", "Acidity", false],
    ["Buscopan", "hyoscine butylbromide", "Buscopan", "10mg", "Tablet", "Stomach", false],
    ["ORS", "oral rehydration salts", "ORS", "Sachet", "Powder", "Hydration", false],
    ["Entamizole", "diloxanide / metronidazole", "Entamizole", "Tablet", "Tablet", "Gastrointestinal", true],
    ["Metformin", "metformin", "", "500mg", "Tablet", "Diabetes", true],
    ["Glucophage", "metformin", "Glucophage", "500mg", "Tablet", "Diabetes", true],
    ["Insulin", "insulin", "", "Injection", "Injection", "Diabetes", true],
    ["Amlodipine", "amlodipine", "", "5mg", "Tablet", "Blood Pressure", true],
    ["Losartan", "losartan", "", "50mg", "Tablet", "Blood Pressure", true],
    ["Atorvastatin", "atorvastatin", "", "10mg", "Tablet", "Cholesterol", true],
    ["Aspirin", "acetylsalicylic acid", "", "75mg", "Tablet", "Cardiovascular", true],
    ["Ventolin", "salbutamol", "Ventolin", "Inhaler", "Inhaler", "Respiratory", true],
    ["Seretide", "fluticasone / salmeterol", "Seretide", "Inhaler", "Inhaler", "Respiratory", true],
    ["Hydryllin", "theophylline combination", "Hydryllin", "Syrup", "Syrup", "Cough", true],
    ["Sinecod", "butamirate", "Sinecod", "Syrup", "Syrup", "Cough", false],
    ["Surbex-Z", "vitamin B complex / zinc", "Surbex-Z", "Tablet", "Tablet", "Vitamins", false],
    ["Vitamin D3", "cholecalciferol", "", "200,000 IU", "Capsule", "Supplement", true],
    ["Calcium", "calcium", "", "500mg", "Tablet", "Supplement", false],
    ["Fefol", "iron / folic acid", "Fefol", "Capsule", "Capsule", "Iron / Vitamins", false],
    ["Fucidin", "fusidic acid", "Fucidin", "Cream", "Cream", "Antibiotic", true],
    ["Betnovate", "betamethasone", "Betnovate", "Cream", "Cream", "Skin", true],
    ["Clotrimazole", "clotrimazole", "", "1%", "Cream", "Antifungal", false]
].map(([name, genericName, brandName, strength, dosageForm, category, prescriptionRequired], index) => ({
    id: `MED${String(index + 1).padStart(3, "0")}`,
    name, genericName, brandName: brandName || null, strength, dosageForm, category,
    prescriptionRequired, description: `${name} ${strength} ${dosageForm} listing for demonstration only. Follow qualified professional guidance.`,
    active: true, demoData: true
}));

function validArray(value, label) {
    if (!Array.isArray(value)) throw new Error(`${label} must contain a JSON array.`);
    return value;
}

async function seedDemoData() {
    const [pharmacies, oldMedicineRows, catalog, inventory] = await Promise.all([
        readData("pharmacies.json"), readData("medicines.json"),
        readData("catalog.json"), readData("inventory.json")
    ]);
    [pharmacies, oldMedicineRows, catalog, inventory].forEach((rows, index) =>
        validArray(rows, ["pharmacies.json", "medicines.json", "catalog.json", "inventory.json"][index]));

    const pharmacyById = new Map(pharmacies.map(item => [String(item.id), item]));
    for (const pharmacy of demoPharmacies) {
        const existing = pharmacyById.get(pharmacy.id);
        if (existing && !existing.demoData) throw new Error(`Pharmacy ID ${pharmacy.id} is already used by a non-demo record.`);
        if (existing) Object.assign(existing, pharmacy, { demoIndex: existing.demoIndex ?? pharmacy.demoIndex });
        else { pharmacies.push(pharmacy); pharmacyById.set(pharmacy.id, pharmacy); }
    }

    const catalogById = new Map(catalog.map(item => [String(item.id), item]));
    // Upgrade old per-pharmacy medicine rows without changing their IDs, preserving order references.
    for (const row of oldMedicineRows) {
        if (!row.pharmacyId) continue; // medicines.json already contains the normalized catalog after the first seed.
        const linked = inventory.find(item => String(item.id) === String(row.id));
        if (!linked) {
            const catalogId = `MED-LEGACY-${String(row.id).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
            if (!catalogById.has(catalogId)) {
                const legacyProduct = { id: catalogId, name: row.name, genericName: row.name, brandName: null,
                    strength: row.strength || "", dosageForm: "Unspecified", category: "Other",
                    prescriptionRequired: false, description: "Existing MedConnect listing retained during storage upgrade.", active: true, demoData: false };
                catalog.push(legacyProduct); catalogById.set(catalogId, legacyProduct);
            }
            inventory.push({ id: String(row.id), pharmacyId: String(row.pharmacyId), medicineId: catalogId,
                name: row.name, quantity: Number(row.quantity) || 0, price: Number(row.price) || 0,
                expiryDate: row.expiryDate || "", availabilityStatus: Number(row.quantity) > 0 ? "available" : "out-of-stock",
                lastUpdated: row.createdAt || new Date().toISOString(), demoData: false });
        }
    }

    const catalogIds = new Set(catalog.map(item => String(item.id)));
    for (const product of products) {
        const existingIndex = catalog.findIndex(item => String(item.id) === product.id);
        if (existingIndex < 0) catalog.push(product);
        else {
            if (!catalog[existingIndex].demoData) throw new Error(`Medicine ID ${product.id} is already used by a non-demo catalog record.`);
            catalog[existingIndex] = { ...catalog[existingIndex], ...product };
        }
        catalogIds.add(product.id);
    }

    const baseDay = new Date();
    baseDay.setUTCHours(0, 0, 0, 0);
    const inventoryById = new Map(inventory.map(item => [String(item.id), item]));
    let demoInventoryCreated = 0;
    for (const pharmacy of demoPharmacies) {
        for (const product of products) {
            const medicineNumber = Number(product.id.slice(3));
            const pharmacyNumber = Number(pharmacy.id.slice(2));
            const id = `INV-${pharmacy.id}-${product.id}`;
            const available = (medicineNumber + pharmacyNumber) % 5 !== 0;
            const quantity = available ? ((medicineNumber * 3 + pharmacyNumber * 5) % 25 === 0 ? 2 : 5 + ((medicineNumber * 7 + pharmacyNumber * 11) % 46)) : 0;
            const price = Number((35 + (medicineNumber * 19 % 710) + pharmacyNumber * 7 + (medicineNumber + pharmacyNumber) % 3 * 5).toFixed(2));
            const expiry = new Date(baseDay);
            expiry.setUTCDate(expiry.getUTCDate() + 90 + ((medicineNumber * 37 + pharmacyNumber * 53) % 800));
            const row = {
                id, pharmacyId: pharmacy.id, medicineId: product.id, name: product.name,
                genericName: product.genericName, brandName: product.brandName, strength: product.strength,
                dosageForm: product.dosageForm, category: product.category, quantity, price,
                availabilityStatus: quantity === 0 ? "out-of-stock" : quantity <= 5 ? "low-stock" : "available",
                expiryDate: expiry.toISOString().slice(0, 10), lastUpdated: new Date().toISOString(), demoData: true,
                priceLabel: "DEMO DATA", stockLabel: "DEMO DATA"
            };
            if (inventoryById.has(id)) {
                if (!inventoryById.get(id).demoData) throw new Error(`Inventory ID ${id} is already used by a non-demo record.`);
                Object.assign(inventoryById.get(id), row);
            }
            else { inventory.push(row); inventoryById.set(id, row); demoInventoryCreated++; }
        }
    }

    if (products.some(product => !catalogIds.has(product.id))) throw new Error("Catalog validation failed.");
    const demoInventory = inventory.filter(item => item.demoData && item.pharmacyId.startsWith("PH00"));
    if (demoInventory.length !== 200 || demoInventory.some(item => !catalogIds.has(String(item.medicineId)))) {
        throw new Error("Demo inventory must contain 200 linked pharmacy/medicine records.");
    }

    await saveData("pharmacies.json", pharmacies);
    await saveData("catalog.json", catalog);
    await saveData("inventory.json", inventory);
    // Keep medicines.json as the catalog's legacy compatibility file; its records are now catalog rows.
    await saveData("medicines.json", catalog);
    console.log(`Demo seed complete: ${demoPharmacies.length} demo pharmacies, ${products.length} demo medicines, ${demoInventory.length} demo inventory rows (${demoInventoryCreated} newly created).`);
    return { pharmacies: demoPharmacies.length, medicines: products.length, inventory: demoInventory.length, newlyCreated: demoInventoryCreated };
}

if (require.main === module) {
    seedDemoData().catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { seedDemoData };
