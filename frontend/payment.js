const API_HOST = window.location.hostname || "127.0.0.1";
const API_PROTOCOL = window.location.protocol === "https:" ? "https:" : "http:";
const API = `${API_PROTOCOL}//${API_HOST}:5000/api`;
const params = new URLSearchParams(location.search);
const orderId = params.get("orderId");
const message = document.getElementById("paymentMessage");
const panel = document.getElementById("paymentPanel");

function showMessage(text, kind = "error") { message.hidden = false; message.className = `form-message dashboard-message ${kind}`; message.textContent = text; }
function add(parent, tag, text, className) { const node = document.createElement(tag); node.textContent = text ?? ""; if (className) node.className = className; parent.appendChild(node); return node; }
async function request(path, options = {}) {
    const response = await fetch(API + path, { ...options, credentials: "include", headers: options.body ? { "Content-Type": "application/json" } : undefined });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { location.replace("./login.html"); throw new Error("Please log in to continue."); }
    if (!response.ok) throw new Error(data.message || "Unable to load payment.");
    return data;
}
function renderOrder(order) {
    const root = document.getElementById("paymentOrder"); root.replaceChildren();
    add(root, "h2", `Order ${order.id}`);
    add(root, "p", `Pharmacy: ${order.pharmacy?.name || "Unavailable"}`);
    add(root, "p", `Customer: ${order.customer?.name || ""}`);
    const table = document.createElement("div"); table.className = "table-wrap";
    for (const item of order.items || []) add(table, "p", `${item.name} | Quantity: ${item.quantity} | Unit price: Rs. ${Number(item.unitPrice).toFixed(2)} | Line total: Rs. ${Number(item.lineTotal ?? item.unitPrice * item.quantity).toFixed(2)}`);
    root.appendChild(table);
    const summary = document.getElementById("paymentSummary"); summary.replaceChildren();
    [["Subtotal", order.subtotal], ["Delivery charges", order.deliveryCharge], ["Discount", order.discount], ["Final payable amount", order.total]].forEach(([label, value]) => add(summary, "p", `${label}: Rs. ${Number(value || 0).toFixed(2)}`));
}
async function init() {
    if (!orderId) return showMessage("This payment link does not include an order number.");
    try {
        const { orders } = await request("/customer/orders");
        const order = orders.find(item => item.id === orderId);
        if (!order) return showMessage("Order not found in your account.");
        if (order.status === "Rejected") return showMessage("Rejected orders cannot be paid.");
        if (order.paymentId || order.status === "Paid") return location.replace(`./receipt.html?orderId=${encodeURIComponent(order.id)}`);
        if (!["Confirmed", "Awaiting Payment"].includes(order.status)) return showMessage("Payment is available after the pharmacy confirms your order.");
        renderOrder(order); panel.hidden = false; message.hidden = true;
        document.getElementById("paymentForm").addEventListener("submit", async event => {
            event.preventDefault(); const button = document.getElementById("confirmDemoPayment"); button.disabled = true;
            showMessage("Processing demo payment…", "success");
            try {
                const method = new FormData(event.currentTarget).get("method");
                const completed = await request(`/customer/orders/${encodeURIComponent(order.id)}/pay`, { method: "POST", body: JSON.stringify({ method }) });
                if (!completed.payment?.reference || completed.order?.status !== "Paid") throw new Error("The backend did not confirm this payment.");
                const savedReceipt = await request(`/customer/orders/${encodeURIComponent(order.id)}/receipt`);
                if (typeof window.downloadMedConnectReceiptPdf !== "function") throw new Error("Receipt PDF generation is unavailable in this browser session.");
                window.downloadMedConnectReceiptPdf(savedReceipt.order, savedReceipt.payment);
                location.replace(`./receipt.html?orderId=${encodeURIComponent(order.id)}`);
            } catch (error) { showMessage(error.message); button.disabled = false; }
        });
    } catch (error) { showMessage(error.message); }
}
init();
