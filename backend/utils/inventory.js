function joinInventory(inventory, catalog, pharmacies) {
    const catalogById = new Map(catalog.map(medicine => [String(medicine.id), medicine]));
    const pharmaciesById = new Map(pharmacies.map(pharmacy => [String(pharmacy.id), pharmacy]));
    return inventory.map(row => {
        const medicine = catalogById.get(String(row.medicineId)) || {};
        const pharmacy = pharmaciesById.get(String(row.pharmacyId)) || {};
        const quantity = Number(row.quantity) || 0;
        const expiryDate = row.expiryDate || "";
        const expired = /^\d{4}-\d{2}-\d{2}$/.test(expiryDate) && expiryDate < new Date().toISOString().slice(0, 10);
        return {
            ...medicine,
            ...row,
            id: String(row.id),
            medicineId: String(row.medicineId || medicine.id || row.id),
            name: medicine.name || row.name,
            genericName: medicine.genericName || row.genericName || "",
            brandName: medicine.brandName || row.brandName || "",
            strength: medicine.strength || row.strength || "",
            dosageForm: medicine.dosageForm || row.dosageForm || "",
            category: medicine.category || row.category || "Other",
            prescriptionRequired: medicine.prescriptionRequired ?? row.prescriptionRequired ?? false,
            active: medicine.active !== false && row.active !== false,
            quantity,
            availabilityStatus: expired ? "expired" : quantity === 0 ? "out-of-stock" : quantity <= 5 ? "low-stock" : "available",
            pharmacy: {
                id: String(pharmacy.id || row.pharmacyId), name: pharmacy.name || "Unavailable pharmacy",
                address: pharmacy.address || "", area: pharmacy.area || "", city: pharmacy.city || "",
                phone: pharmacy.phone || "", location: pharmacy.location || "",
                openingHours: pharmacy.openingHours || "", demoData: Boolean(pharmacy.demoData)
            },
            demoData: Boolean(row.demoData || medicine.demoData || pharmacy.demoData),
            priceLabel: row.demoData || medicine.demoData ? "DEMO DATA" : "",
            stockLabel: row.demoData || medicine.demoData ? "DEMO DATA" : ""
        };
    });
}

module.exports = { joinInventory };
