const API_HOST = window.location.hostname || "127.0.0.1";
const API_PROTOCOL = window.location.protocol === "https:" ? "https:" : "http:";
const API = `${API_PROTOCOL}//${API_HOST}:5000/api`;
const message = document.getElementById("receiptMessage");
const sheet = document.getElementById("receipt");
const CODE128 = [
    "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"
];

function add(parent, tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text ?? "";
    if (className) node.className = className;
    parent.appendChild(node);
    return node;
}

async function loadReceipt() {
    const orderId = new URLSearchParams(location.search).get("orderId");
    if (!orderId) return showError("This receipt link does not include an order number.");
    try {
        const response = await fetch(`${API}/customer/orders/${encodeURIComponent(orderId)}/receipt`, { credentials: "include" });
        const result = await response.json().catch(() => ({}));
        if (response.status === 401) return location.replace("./login.html");
        if (!response.ok) return showError(result.message || "Receipt is unavailable.");
        renderReceipt(result.order, result.payment);
        if (new URLSearchParams(location.search).get("download") === "1") downloadReceiptPdf(result.order, result.payment);
    } catch {
        showError("Could not connect to MedConnect. Make sure the backend is running and try again.");
    }
}

function showError(text) {
    message.textContent = text;
    message.className = "form-message dashboard-message error";
}

function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { date: "Unavailable", time: "Unavailable" };
    return { date: date.toLocaleDateString(), time: date.toLocaleTimeString() };
}

function money(value) { return `Rs. ${Number(value || 0).toFixed(2)}`; }
function printable(value) {
    return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[•·]/g, "|").replace(/[×✕]/g, "x").replace(/[—–]/g, "-")
        .replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/₹/g, "Rs.")
        .replace(/[^\x20-\x7E]/g, "");
}

function code128Values(value) {
    const text = String(value);
    if (!text || [...text].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) > 127)) throw new Error("Receipt barcode data must contain printable ASCII characters.");
    const values = [104, ...[...text].map(char => char.charCodeAt(0) - 32)];
    const checksum = values.reduce((sum, code, index) => sum + (index === 0 ? code : code * index), 0) % 103;
    values.push(checksum, 106);
    return values;
}

function barcodeRuns(value) {
    let black = true;
    const runs = [];
    for (const code of code128Values(value)) {
        for (const width of CODE128[code]) {
            runs.push({ black, width: Number(width) });
            black = !black;
        }
    }
    return runs;
}

function renderBarcode(value) {
    const runs = barcodeRuns(value);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    const units = runs.reduce((sum, run) => sum + run.width, 0);
    const quiet = 12;
    svg.setAttribute("viewBox", `0 0 ${units + quiet * 2} 52`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Code 128 barcode for ${value}`);
    svg.classList.add("receipt-barcode");
    let x = quiet;
    for (const run of runs) {
        if (run.black) {
            const rect = document.createElementNS(ns, "rect");
            rect.setAttribute("x", String(x)); rect.setAttribute("y", "0");
            rect.setAttribute("width", String(run.width)); rect.setAttribute("height", "40"); rect.setAttribute("fill", "#000");
            svg.appendChild(rect);
        }
        x += run.width;
    }
    return svg;
}

function logoSvg() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 100 100"); svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = '<circle cx="50" cy="50" r="46" fill="white" stroke="#333" stroke-width="2"/><g transform="rotate(-45 50 50)" fill="white" stroke="#222" stroke-width="4"><rect x="39" y="24" width="22" height="52" rx="11"/><path d="M39 50h22"/></g>';
    return svg;
}

function sectionRule(parent) { const hr = document.createElement("hr"); hr.className = "receipt-rule"; parent.appendChild(hr); }
function receiptRow(parent, label, value, className = "") {
    const row = document.createElement("div"); row.className = `thermal-row ${className}`.trim();
    add(row, "span", label); add(row, "span", value);
    parent.appendChild(row); return row;
}

function renderReceipt(order, payment) {
    if (!order?.paymentId || payment?.status !== "PAID (DEMO)" || payment.orderId !== order.id || payment.customerId !== String(order.customerId)) return showError("A paid receipt is unavailable for this order.");
    message.hidden = true; sheet.hidden = false; sheet.replaceChildren();
    const header = document.createElement("header"); header.className = "thermal-header";
    header.appendChild(logoSvg());
    add(header, "h1", order.pharmacy?.name || "MEDCONNECT PHARMACY");
    add(header, "p", order.pharmacy?.address || "Address not provided");
    if (order.pharmacy?.city) add(header, "p", order.pharmacy.city);
    if (order.pharmacy?.phone) add(header, "p", order.pharmacy.phone);
    sheet.appendChild(header);

    const orderDate = formatDateTime(order.createdAt), paymentDate = formatDateTime(payment.createdAt);
    sectionRule(sheet);
    receiptRow(sheet, "DATE", orderDate.date);
    receiptRow(sheet, "TIME", orderDate.time);
    receiptRow(sheet, "ORDER ID", order.id);
    receiptRow(sheet, "RECEIPT #", payment.receiptNumber || `RCPT-${order.id}`);
    receiptRow(sheet, "CUSTOMER", order.customer?.name || "Not provided");
    receiptRow(sheet, "PHONE", order.customer?.phone || "Not provided");
    add(sheet, "p", `DELIVERY: ${order.address || "Not provided"}`, "thermal-address");

    sectionRule(sheet);
    for (const item of order.items || []) {
        const name = `${item.name || "Medicine"}${item.strength ? ` ${item.strength}` : ""} x${item.quantity}`.toUpperCase();
        receiptRow(sheet, name, money(item.lineTotal ?? Number(item.unitPrice) * Number(item.quantity)), "thermal-medicine");
        add(sheet, "p", `${money(item.unitPrice)} each`, "thermal-unit-price");
    }
    sectionRule(sheet);
    receiptRow(sheet, "SUBTOTAL", money(order.subtotal));
    receiptRow(sheet, "DELIVERY", money(order.deliveryCharge));
    receiptRow(sheet, "DISCOUNT", money(order.discount));
    sectionRule(sheet);
    receiptRow(sheet, "TOTAL", money(order.total), "thermal-total");
    sectionRule(sheet);
    receiptRow(sheet, "PAYMENT", String(payment.method || "").toUpperCase());
    receiptRow(sheet, "PAYMENT REF", payment.reference || "Unavailable");
    receiptRow(sheet, "PAYMENT DATE", paymentDate.date);
    receiptRow(sheet, "AMOUNT", money(payment.amount));
    receiptRow(sheet, "STATUS", "PAID (DEMO)", "thermal-paid");
    add(sheet, "p", "NO REAL MONEY WAS TRANSFERRED", "thermal-demo");

    const barcodeValue = payment.receiptNumber || order.id;
    const barcodeWrap = document.createElement("div"); barcodeWrap.className = "thermal-barcode-wrap";
    try { barcodeWrap.appendChild(renderBarcode(barcodeValue)); }
    catch { add(barcodeWrap, "p", "Barcode unavailable"); }
    add(barcodeWrap, "p", barcodeValue, "thermal-barcode-text");
    sheet.appendChild(barcodeWrap);
    add(sheet, "p", "THANK YOU FOR CHOOSING MEDCONNECT!", "thermal-thanks");

    const actions = document.createElement("div"); actions.className = "receipt-actions no-print";
    const download = add(actions, "button", "Download Receipt"); download.type = "button"; download.onclick = () => downloadReceiptPdf(order, payment);
    const print = add(actions, "button", "Print Receipt"); print.type = "button"; print.onclick = () => window.print();
    const back = document.createElement("a"); back.className = "dashboard-action receipt-link"; back.href = "./customer-dashboard.html#myOrders"; back.textContent = "Back to My Orders";
    actions.appendChild(back); sheet.appendChild(actions);
}

function pdfEscape(text) { return printable(text).replace(/([\\()])/g, "\\$1"); }
function createReceiptPdf(order, payment) {
    const width = 226.77, margin = 14, fontSize = 8.5, leading = 12;
    const barcodeValue = payment.receiptNumber || order.id;
    const lines = [];
    const textLine = (text, style = "regular", align = "left") => lines.push({ type: "text", text: printable(text), style, align });
    const rule = () => lines.push({ type: "rule" });
    const row = (label, value, style = "regular") => lines.push({ type: "row", label: printable(label), value: printable(value), style });
    const date = formatDateTime(order.createdAt), paid = formatDateTime(payment.createdAt);
    textLine(order.pharmacy?.name || "MEDCONNECT PHARMACY", "bold", "center");
    textLine("MEDCONNECT", "regular", "center");
    textLine(order.pharmacy?.address || "Address not provided", "regular", "center");
    if (order.pharmacy?.city) textLine(order.pharmacy.city, "regular", "center");
    if (order.pharmacy?.phone) textLine(order.pharmacy.phone, "regular", "center");
    rule(); row("DATE", date.date); row("TIME", date.time); row("ORDER ID", order.id); row("RECEIPT #", payment.receiptNumber || `RCPT-${order.id}`);
    row("CUSTOMER", order.customer?.name || "Not provided"); row("PHONE", order.customer?.phone || "Not provided");
    textLine(`DELIVERY: ${order.address || "Not provided"}`);
    rule();
    for (const item of order.items || []) {
        const itemName = `${item.name || "Medicine"}${item.strength ? ` ${item.strength}` : ""} x${item.quantity}`.toUpperCase();
        row(itemName, money(item.lineTotal ?? Number(item.unitPrice) * Number(item.quantity)), "bold");
        textLine(`${money(item.unitPrice)} each`);
    }
    rule(); row("SUBTOTAL", money(order.subtotal)); row("DELIVERY", money(order.deliveryCharge)); row("DISCOUNT", money(order.discount)); rule(); row("TOTAL", money(order.total), "bold"); rule();
    row("PAYMENT", String(payment.method || "").toUpperCase()); row("PAYMENT REF", payment.reference || "Unavailable"); row("PAID ON", paid.date); row("AMOUNT", money(payment.amount)); row("STATUS", "PAID (DEMO)", "bold"); textLine("NO REAL MONEY TRANSFERRED", "bold", "center");
    rule();

    const barcode = barcodeRuns(barcodeValue), barModules = barcode.reduce((sum, run) => sum + run.width, 0);
    const barcodeModule = Math.min(0.72, (width - margin * 2 - 16) / barModules);
    const barcodeHeight = 36;
    const maxChars = Math.max(16, Math.floor((width - margin * 2) / (fontSize * 0.6)));
    const renderedLines = [];
    for (const line of lines) {
        if (line.type === "rule") { renderedLines.push(line); continue; }
        if (line.type === "text") {
            for (let offset = 0; offset < line.text.length; offset += maxChars) renderedLines.push({ ...line, text: line.text.slice(offset, offset + maxChars) });
            if (!line.text.length) renderedLines.push(line);
            continue;
        }
        const valueChars = line.value.length;
        const leftCapacity = Math.max(1, maxChars - valueChars - 1);
        if (line.label.length <= leftCapacity) {
            renderedLines.push({ type: "text", text: line.label + " ".repeat(Math.max(1, maxChars - line.label.length - valueChars)) + line.value, style: line.style, align: "left" });
        } else {
            for (let offset = 0; offset < line.label.length; offset += maxChars) renderedLines.push({ type: "text", text: line.label.slice(offset, offset + maxChars), style: line.style, align: "left" });
            renderedLines.push({ type: "text", text: line.value, style: line.style, align: "right" });
        }
    }
    const bodyHeight = renderedLines.reduce((sum, line) => sum + (line.type === "rule" ? 10 : leading), 0);
    const height = Math.max(350, 22 + 88 + bodyHeight + 7 + barcodeHeight + 5 + leading * 3 + 14);
    const ops = [];
    let y = 22;
    // Pharmacy capsule emblem: circle and a diagonally split pill.
    const cx = width / 2, cy = height - y - 43, radius = 36;
    const k = 0.55228475;
    ops.push(`0.8 w ${cx + radius} ${cy} m ${cx + radius} ${cy + k * radius} ${cx + k * radius} ${cy + radius} ${cx} ${cy + radius} c ${cx - k * radius} ${cy + radius} ${cx - radius} ${cy + k * radius} ${cx - radius} ${cy} c ${cx - radius} ${cy - k * radius} ${cx - k * radius} ${cy - radius} ${cx} ${cy - radius} c ${cx + k * radius} ${cy - radius} ${cx + radius} ${cy - k * radius} ${cx + radius} ${cy} c S`);
    // A tilted capsule outline built from straight sides and rounded end caps.
    const ux = 0.7071, uy = 0.7071, px = -0.7071, py = 0.7071, half = 10, cap = 6;
    const ax = cx - ux * half, ay = cy - uy * half, bx = cx + ux * half, by = cy + uy * half;
    const leftX = ax + px * cap, leftY = ay + py * cap, rightX = bx + px * cap, rightY = by + py * cap;
    const rightLowX = bx - px * cap, rightLowY = by - py * cap, leftLowX = ax - px * cap, leftLowY = ay - py * cap;
    const c1x = bx + ux * cap * 0.5523 + px * cap, c1y = by + uy * cap * 0.5523 + py * cap;
    const c2x = bx + ux * cap * 0.5523 - px * cap, c2y = by + uy * cap * 0.5523 - py * cap;
    const d1x = ax - ux * cap * 0.5523 - px * cap, d1y = ay - uy * cap * 0.5523 - py * cap;
    const d2x = ax - ux * cap * 0.5523 + px * cap, d2y = ay - uy * cap * 0.5523 + py * cap;
    ops.push(`2 w ${leftX} ${leftY} m ${rightX} ${rightY} l ${c1x} ${c1y} ${c2x} ${c2y} ${rightLowX} ${rightLowY} c ${leftLowX} ${leftLowY} l ${d1x} ${d1y} ${d2x} ${d2y} ${leftX} ${leftY} c S`);
    ops.push(`1 w ${cx + px * cap} ${cy + py * cap} m ${cx - px * cap} ${cy - py * cap} l S`);
    y += 88;
    const putText = (text, style = "regular", align = "left", xLeft = margin, xRight = width - margin) => {
        const safe = printable(text);
        const chunks = [];
        const maxChars = Math.max(16, Math.floor((width - margin * 2) / (fontSize * 0.6)));
        for (let index = 0; index < safe.length; index += maxChars) chunks.push(safe.slice(index, index + maxChars));
        if (!chunks.length) chunks.push("");
        for (const chunk of chunks) {
            const font = style === "bold" ? "/F2" : "/F1";
            const estimated = chunk.length * fontSize * 0.6;
            const x = align === "center" ? (width - estimated) / 2 : align === "right" ? xRight - estimated : xLeft;
            ops.push(`BT ${font} ${fontSize} Tf ${x.toFixed(2)} ${(height - y - fontSize).toFixed(2)} Td (${pdfEscape(chunk)}) Tj ET`);
            y += leading;
        }
    };
    for (const line of renderedLines) {
        if (line.type === "rule") { y += 4; ops.push(`[3 2] 0 d ${margin} ${(height - y).toFixed(2)} m ${width - margin} ${(height - y).toFixed(2)} l S [] 0 d`); y += 6; }
        else putText(line.text, line.style, line.align);
    }
    y += 7;
    const barcodeWidth = barModules * barcodeModule;
    let barcodeX = (width - barcodeWidth) / 2;
    const barcodeTop = y;
    for (const run of barcode) {
        if (run.black) ops.push(`${barcodeX.toFixed(3)} ${(height - barcodeTop - barcodeHeight).toFixed(2)} ${(run.width * barcodeModule).toFixed(3)} ${barcodeHeight} re f`);
        barcodeX += run.width * barcodeModule;
    }
    y += barcodeHeight + 5;
    putText(barcodeValue, "regular", "center");
    putText("THANK YOU FOR CHOOSING", "bold", "center");
    putText("MEDCONNECT!", "bold", "center");
    const actualHeight = y + 14;
    const content = `q 0 G 0 g 1 J 1 j ${ops.join("\n")} Q`;
    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${actualHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>",
        `<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}\nendstream`
    ];
    let pdf = "%PDF-1.4\n%MedConnect Thermal Receipt\n";
    const offsets = [0];
    objects.forEach((object, index) => { offsets.push(new TextEncoder().encode(pdf).length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const xrefOffset = new TextEncoder().encode(pdf).length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return new Blob([new TextEncoder().encode(pdf)], { type: "application/pdf" });
}

function downloadReceiptPdf(order, payment) {
    const blob = createReceiptPdf(order, payment);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `MedConnect-${order.id}.pdf`;
    link.style.display = "none";
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 30000);
}

window.downloadMedConnectReceiptPdf = downloadReceiptPdf;
if (message && sheet) loadReceipt();
