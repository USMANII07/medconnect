const API_HOST = window.location.hostname || "127.0.0.1";
const API_PROTOCOL = window.location.protocol === "https:" ? "https:" : "http:";
const API_BASE = `${API_PROTOCOL}//${API_HOST}:5000/api`;
const roleDashboard = {
    Customer: "./customer-dashboard.html",
    Pharmacist: "./pharmacist-dashboard.html",
    Admin: "./admin-dashboard.html"
};

document.querySelectorAll("[data-logout]").forEach(button => button.addEventListener("click", async () => {
    try {
        await fetch(API_BASE + "/auth/logout", {
            method: "POST",
            credentials: "include"
        });
    } finally {
        window.location.replace("./login.html");
    }
}));

async function apiRequest(path, options = {}) {
    const { redirectOnUnauthorized = true, ...fetchOptions } = options;
    const requestOptions = { ...fetchOptions, credentials: "include" };
    if (fetchOptions.body && typeof fetchOptions.body !== "string") {
        requestOptions.headers = { "Content-Type": "application/json", ...fetchOptions.headers };
        requestOptions.body = JSON.stringify(fetchOptions.body);
    }
    const response = await fetch(API_BASE + path, requestOptions);
    const result = await response.json().catch(() => ({}));
    if (response.status === 401 && redirectOnUnauthorized) {
        window.location.replace("./login.html");
    }
    if (response.status === 401) {
        const error = new Error(result.message || "Your session expired. Please log in again.");
        error.status = response.status;
        throw error;
    }
    if (!response.ok) {
        const error = new Error(result.message || "The request could not be completed.");
        error.status = response.status;
        throw error;
    }
    return result;
}

function setMessage(element, message, type = "error") {
    if (!element) return;
    element.textContent = message;
    element.className = message ? "form-message dashboard-message " + type : "form-message dashboard-message";
}

function addText(parent, tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    parent.appendChild(node);
    return node;
}

function showEmpty(parent, text) {
    parent.replaceChildren();
    addText(parent, "p", text, "dashboard-empty");
}
function renderCustomerSearchEmpty(container, heading, description) {
    container.replaceChildren();
    const state = document.createElement("div"); state.className = "search-empty-state";
    const illustration = document.createElement("div"); illustration.className = "empty-art"; illustration.setAttribute("aria-hidden", "true");
    illustration.innerHTML = '<svg viewBox="0 0 120 110"><circle cx="60" cy="55" r="48" fill="#eaf6ff"/><rect x="36" y="20" width="49" height="69" rx="10" transform="rotate(-8 60 55)" fill="#fff" stroke="#b5d9ef" stroke-width="3"/><path d="M54 36h14v14h14v14H68v14H54V64H40V50h14z" fill="#39a8e8" transform="rotate(-8 60 55)"/><circle cx="87" cy="29" r="12" fill="#d2f4eb"/><path d="m82 29 4 4 7-8" fill="none" stroke="#19a87b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    state.appendChild(illustration);
    addText(state, "h3", heading);
    addText(state, "p", description);
    container.appendChild(state);
}
let customerSearchHandler = null;
const medicineSearchForm = document.getElementById("medicineSearchForm");
medicineSearchForm?.addEventListener("submit", event => {
    event.preventDefault();
    if (customerSearchHandler) customerSearchHandler();
    else setMessage(document.getElementById("customerMessage"), "The customer dashboard is still loading. Please try again in a moment.", "info");
});
const shoppingCart = new Map();
let customerCartLines, customerCartTotal, checkoutMessage;

async function startDashboard() {
    const expectedRole = document.body.dataset.dashboardRole;
    try {
        const { user } = await apiRequest("/auth/me");
        if (user.role !== expectedRole) {
            window.location.replace(roleDashboard[user.role] || "./login.html");
            return;
        }
        const name = document.getElementById("dashboardUser");
        if (name) name.textContent = user.name;

        if (expectedRole === "Customer") await setupCustomerDashboard(user);
        if (expectedRole === "Pharmacist") await setupPharmacistDashboard();
        if (expectedRole === "Admin") await setupAdminDashboard();
    } catch (error) {
        const message = document.querySelector(".dashboard-message");
        if (message && error.message) setMessage(message, error.message);
    }
}

async function setupCustomerDashboard(user) {
    const form = document.getElementById("medicineSearchForm");
    if (!form || form.dataset.dashboardInitialized === "true") return;
    form.dataset.dashboardInitialized = "true";
    const results = document.getElementById("medicineResults");
    const message = document.getElementById("customerMessage");
    cartStorageKey = `medconnect-cart-${user.id}`;

    const initials = String(user.name || "Customer").trim().split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase();
    const avatar = document.getElementById("customerAvatar");
    if (avatar) avatar.textContent = initials || "MC";
    const profileToggle = document.getElementById("profileToggle");
    const profilePopover = document.getElementById("profilePopover");
    profileToggle?.addEventListener("click", () => {
        const open = profilePopover?.hidden;
        if (profilePopover) profilePopover.hidden = !open;
        profileToggle.setAttribute("aria-expanded", String(Boolean(open)));
    });
    const notificationToggle = document.getElementById("notificationToggle");
    const notificationPopover = document.getElementById("notificationPopover");
    notificationToggle?.addEventListener("click", () => {
        const open = notificationPopover?.hidden;
        if (notificationPopover) notificationPopover.hidden = !open;
        notificationToggle.setAttribute("aria-expanded", String(Boolean(open)));
    });
    document.addEventListener("click", event => {
        if (!event.target.closest(".profile-menu-wrap") && profilePopover && !profilePopover.hidden) {
            profilePopover.hidden = true;
            profileToggle?.setAttribute("aria-expanded", "false");
        }
        if (!event.target.closest(".notification-wrap") && notificationPopover && !notificationPopover.hidden) {
            notificationPopover.hidden = true;
            notificationToggle?.setAttribute("aria-expanded", "false");
        }
    });
    const sidebar = document.getElementById("customerSidebar");
    const mobileMenuButton = document.getElementById("mobileMenuButton");
    const pageScrim = document.getElementById("sidebarPageScrim");
    const closeMobileMenu = () => {
        sidebar?.classList.remove("mobile-open");
        pageScrim?.classList.remove("visible");
        mobileMenuButton?.setAttribute("aria-expanded", "false");
    };
    mobileMenuButton?.addEventListener("click", () => {
        const open = !sidebar?.classList.contains("mobile-open");
        sidebar?.classList.toggle("mobile-open", open);
        pageScrim?.classList.toggle("visible", open);
        mobileMenuButton.setAttribute("aria-expanded", String(open));
    });
    pageScrim?.addEventListener("click", closeMobileMenu);
    document.querySelectorAll("[data-customer-nav]").forEach(link => link.addEventListener("click", closeMobileMenu));
    document.querySelectorAll('[data-customer-nav]').forEach(link => {
        link.addEventListener("click", () => {
            document.querySelectorAll('[data-customer-nav]').forEach(item => item.classList.toggle("active", item === link));
        });
    });

    const cartPanel = document.createElement("section");
    cartPanel.className = "dashboard-panel shopping-cart-panel";
    cartPanel.id = "shoppingCart";
    cartPanel.innerHTML = '<div class="cart-heading"><h2>Shopping cart <span class="cart-count" id="cartCount">0 items</span></h2><button class="cart-clear" id="clearCart" type="button">Clear cart</button></div><div class="cart-lines" id="cartLines"></div><div class="cart-summary" id="cartTotal"></div><form id="checkoutForm" class="dashboard-form"><label>Delivery address<input name="address" required maxlength="500" autocomplete="street-address"></label><label>Contact phone<input name="phone" required type="tel" maxlength="40" pattern="\\+?[0-9][0-9 ()-]{7,18}" autocomplete="tel" placeholder="03xx xxxxxxx"></label><button class="dashboard-action" type="submit">Place order</button><p class="form-message full-width" id="checkoutMessage" role="status" aria-live="polite"></p></form>';
    results.closest(".customer-results-section").after(cartPanel);
    customerCartLines = cartPanel.querySelector("#cartLines");
    customerCartTotal = cartPanel.querySelector("#cartTotal");
    checkoutMessage = cartPanel.querySelector("#checkoutMessage");
    cartCount = cartPanel.querySelector("#cartCount");

    const orderPanel = document.createElement("section");
    orderPanel.className = "dashboard-panel customer-data-panel";
    orderPanel.id = "my-orders";
    orderPanel.innerHTML = '<h2>My orders</h2><div class="dashboard-results" id="myOrderList"></div><h2>Medicine reservations</h2><div class="dashboard-results" id="myReservations"></div><h2>Recent medicine searches</h2><div class="dashboard-results" id="recentSearches"></div>';
    cartPanel.after(orderPanel);
    const profilePanel=document.createElement("section");profilePanel.className="dashboard-panel customer-data-panel";profilePanel.id="my-profile";profilePanel.innerHTML='<h2>My profile</h2><p class="profile-panel-intro">Keep your account details up to date.</p><form class="dashboard-form" id="customerProfile"><label>Name<input name="name" required maxlength="100"></label><label>Email<input name="email" type="email" required maxlength="254"></label><button class="dashboard-action" type="submit">Save profile</button><p class="form-message full-width" id="profileMessage" role="status" aria-live="polite"></p></form>';orderPanel.before(profilePanel);profilePanel.querySelector("[name=name]").value=user.name;profilePanel.querySelector("[name=email]").value=user.email;profilePanel.querySelector("form").onsubmit=async e=>{e.preventDefault();try{const update=await apiRequest("/auth/profile",{method:"PATCH",body:Object.fromEntries(new FormData(e.currentTarget))});setMessage(profilePanel.querySelector("#profileMessage"),update.message,"success");}catch(err){setMessage(profilePanel.querySelector("#profileMessage"),err.message);}};

    restoreCart();
    cartPanel.querySelector("#clearCart").addEventListener("click", () => {
        shoppingCart.clear(); persistCart(); renderCart();
        setMessage(checkoutMessage, "Cart cleared.", "success");
    });

    async function refreshOrders() {
        const { orders } = await apiRequest("/customer/orders");
        const box = orderPanel.querySelector("#myOrderList");
        box.replaceChildren();
        if (!orders.length) showEmpty(box, "You have no orders yet.");
        for (const order of orders.slice().reverse()) {
            const card = document.createElement("article"); card.className = "dashboard-card";
            addText(card, "h3", `Order ID: ${order.id}`);
            addText(card, "p", `Status: ${order.status}`);
            addText(card, "p", `Order date: ${new Date(order.createdAt).toLocaleString()}`);
            addText(card, "p", `Pharmacy: ${order.pharmacy?.name || "Unavailable"} | Total: Rs. ${Number(order.total).toFixed(2)} | Payment: ${order.paymentId ? "Paid" : "Not Paid"}`);
            for (const item of order.items || []) addText(card, "p", `${item.name} | Quantity: ${item.quantity} | Unit price: Rs. ${Number(item.unitPrice).toFixed(2)}`);
            if (["Confirmed", "Awaiting Payment"].includes(order.status) && !order.paymentId) {
                const pay = document.createElement("a"); pay.className = "dashboard-action receipt-link"; pay.href = `./payment.html?orderId=${encodeURIComponent(order.id)}`; pay.textContent = "Pay Now"; card.appendChild(pay);
                addText(card, "p", "Demo payment only; no real money is transferred.");
            } else if (order.status === "Pending") addText(card, "p", "Waiting for Pharmacy Confirmation");
            else if (order.status === "Rejected") addText(card, "p", "Order Rejected");
            else if (["Preparing", "Out for Delivery"].includes(order.status)) addText(card, "p", order.status === "Preparing" ? "Order Being Prepared" : "Out for Delivery");
            if (order.paymentId && ["Paid", "Delivered"].includes(order.status)) { const receipt = document.createElement("a"); receipt.className = "dashboard-action receipt-link"; receipt.href = `./receipt.html?orderId=${encodeURIComponent(order.id)}&download=1`; receipt.textContent = "Download Receipt"; card.appendChild(receipt); }
            box.appendChild(card);
        }
        const { reservations } = await apiRequest("/customer/reservations");
        const reservationBox=orderPanel.querySelector("#myReservations");reservationBox.replaceChildren();
        if(!reservations.length)showEmpty(reservationBox,"No reservations yet.");
        reservations.forEach(r=>{const card=document.createElement("article");card.className="dashboard-card";addText(card,"h3",`${r.medicineName} · ${r.status}`);addText(card,"p",`${r.pharmacyName} · Quantity ${r.quantity} · ${new Date(r.createdAt).toLocaleString()}`);if(r.status==="Pending"){const cancel=document.createElement("button");cancel.className="dashboard-action";cancel.textContent="Cancel request";cancel.onclick=async()=>{try{await apiRequest(`/customer/reservations/${encodeURIComponent(r.id)}/cancel`,{method:"PATCH"});await refreshOrders();}catch(e){setMessage(message,e.message);}};card.appendChild(cancel);}reservationBox.appendChild(card);});
        const searchHistory=await apiRequest("/customer/search-history"),searchBox=orderPanel.querySelector("#recentSearches");searchBox.replaceChildren();if(!searchHistory.searches.length)showEmpty(searchBox,"Search for medicines to build your recent-search list.");else searchHistory.searches.forEach(item=>addText(searchBox,"p",`${item.query} · ${item.resultCount} matches · ${new Date(item.searchedAt).toLocaleString()}`));
        const { notifications } = await apiRequest("/notifications");
        const notices = document.getElementById("myNotifications"); notices.replaceChildren();
        if (!notifications.length) addText(notices, "p", "No notifications yet.", "dashboard-muted");
        notifications.forEach(n => addText(notices, "p", `${n.title}: ${n.message}`, "dashboard-muted"));
        const notificationDot = document.getElementById("notificationDot");
        if (notificationDot) notificationDot.hidden = notifications.length === 0;
    }

    cartPanel.querySelector("#checkoutForm").addEventListener("submit", async event => {
        event.preventDefault();
        if (!shoppingCart.size) return setMessage(checkoutMessage, "Your cart is empty.");
        if ([...shoppingCart.values()].some(line => !line.available || line.quantity > Number(line.medicine.quantity))) return setMessage(checkoutMessage, "Update or remove unavailable medicines before placing your order.");
        const button = event.currentTarget.querySelector('button[type="submit"]'); button.disabled = true;
        try {
            const details = Object.fromEntries(new FormData(event.currentTarget));
            const result = await apiRequest("/customer/orders", { method: "POST", body: { ...details, items: [...shoppingCart].map(([medicineId, line]) => ({ medicineId, quantity: line.quantity })) } });
            shoppingCart.clear(); persistCart(); renderCart();
            const orderIds = (result.orders || [result.order]).map(order => order.id).join(", ");
            setMessage(checkoutMessage, `Order placed successfully: ${orderIds}`, "success");
            await refreshOrders();
        } catch (error) { setMessage(checkoutMessage, error.message); }
        finally { button.disabled = false; }
    });

    let searchSequence = 0;
    let searchController = null;
    async function searchMedicines() {
        const sequence = ++searchSequence;
        searchController?.abort();
        searchController = new AbortController();
        setMessage(message, "Searching medicines…", "info"); results.setAttribute("aria-busy", "true");
        results.replaceChildren();
        const loading = document.createElement("div"); loading.className = "loading-state";
        const spinner = document.createElement("span"); spinner.className = "loading-spinner"; spinner.setAttribute("aria-hidden", "true");
        loading.append(spinner, document.createTextNode("Searching pharmacy listings…")); results.appendChild(loading);
        try {
            const query = new URLSearchParams({
                search: form.elements.search.value.trim(),
                availability: document.getElementById("medicineAvailability")?.value || "all",
                category: document.getElementById("medicineCategory")?.value || ""
            });
            const response = await apiRequest("/customer/medicines?" + query, { signal: searchController.signal, redirectOnUnauthorized: false, cache: "no-store" });
            if (response.success === false) throw new Error(response.message || "Medicine search failed.");
            if (!Array.isArray(response.medicines)) throw new Error("Medicine search returned an invalid response.");
            if (sequence !== searchSequence) return;
            renderCustomerMedicines(results, response.medicines);
            if (!response.medicines.length) { renderCustomerSearchEmpty(results, "No medicine found", "Try another search or adjust your filters."); setMessage(message, "No matching medicine listings were found.", "info"); }
            else setMessage(message, `${response.medicines.length} medicine listing${response.medicines.length === 1 ? "" : "s"} found.`, "success");
        } catch (error) {
            if (error.name !== "AbortError" && sequence === searchSequence) {
                const detail = error.status
                    ? `Medicine search failed (HTTP ${error.status}): ${error.message}`
                    : error instanceof TypeError
                        ? "Could not reach the medicine search API. Check that the backend is running and that this website origin is allowed by backend CORS settings."
                        : error.message;
                results.replaceChildren();
                const errorState = document.createElement("div"); errorState.className = "search-empty-state search-error-state";
                addText(errorState, "h3", "Search couldn’t be completed"); addText(errorState, "p", detail); results.appendChild(errorState);
                setMessage(message, detail);
            }
        } finally { if (sequence === searchSequence) results.removeAttribute("aria-busy"); }
    }
    customerSearchHandler = searchMedicines;
    const searchInput=form.elements.search;const suggestions=document.createElement("datalist");suggestions.id="medicineSuggestions";searchInput.setAttribute("list",suggestions.id);searchInput.after(suggestions);let suggestionTimer;let suggestionSequence=0;let suggestionController=null;searchInput.addEventListener("input",()=>{clearTimeout(suggestionTimer);const sequence=++suggestionSequence;const term=searchInput.value.trim();if(term.length<2){suggestions.replaceChildren();suggestionController?.abort();return;}suggestionTimer=setTimeout(async()=>{suggestionController?.abort();suggestionController=new AbortController();try{const found=await apiRequest("/customer/medicines?"+new URLSearchParams({search:term,availability:"available",suggestions:"1"}),{signal:suggestionController.signal,redirectOnUnauthorized:false,cache:"no-store"});if(sequence!==suggestionSequence)return;suggestions.replaceChildren();[...new Set(found.medicines.map(m=>m.name))].slice(0,12).forEach(name=>suggestions.appendChild(new Option(name,name)));}catch(error){if(error.name!=="AbortError"&&sequence===suggestionSequence)suggestions.replaceChildren();}},250);});
    const availabilitySelect=document.getElementById("medicineAvailability");
    availabilitySelect?.addEventListener("change",()=>{if(searchInput.value.trim())searchMedicines();});
    const categorySelect=document.getElementById("medicineCategory");if(categorySelect){const {categories}=await apiRequest("/customer/categories");categories.forEach(category=>categorySelect.add(new Option(category,category)));categorySelect.addEventListener("change",()=>{if(searchInput.value.trim())searchMedicines();});}
    document.getElementById("clearMedicineSearch")?.addEventListener("click",()=>{
        searchController?.abort(); searchSequence++; searchInput.value=""; suggestions.replaceChildren();
        results.removeAttribute("aria-busy"); renderCustomerSearchEmpty(results,"Search for a Medicine","Enter a medicine name above to see availability and compare prices.");
        setMessage(message,""); searchInput.focus();
    });
    document.querySelectorAll("[data-popular-search]").forEach(button=>button.addEventListener("click",()=>{
        searchInput.value=button.dataset.popularSearch; searchMedicines();
    }));
    document.getElementById("nearbyFeatureButton")?.addEventListener("click",()=>document.getElementById("findNearby")?.click());
    renderCustomerSearchEmpty(results,"Search for a Medicine","Enter a medicine name above to see availability and compare prices.");
    await refreshCartStock();
    renderCart();
    setupNearbyPharmacies();
    await refreshOrders();
}

function setupNearbyPharmacies() {
    const findButton = document.getElementById("findNearby");
    const message = document.getElementById("mapMessage");
    if (!findButton || !message) return;

    const mapsSearchUrl = "https://www.google.com/maps/search/?api=1&query=pharmacies%20near%20me";

    findButton.addEventListener("click", () => {
        // Keep window.open synchronous with the click so popup blockers allow it.
        const mapsTab = window.open(mapsSearchUrl, "_blank");
        if (mapsTab) {
            mapsTab.opener = null;
            message.textContent = "Opening Google Maps in a new tab. Google Maps may ask for your location.";
            message.className = "form-message dashboard-message info";
            return;
        }

        message.replaceChildren();
        message.append("Your browser blocked the new tab. ");
        const link = document.createElement("a");
        link.href = mapsSearchUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Open the pharmacy search in Google Maps";
        message.appendChild(link);
        message.className = "form-message dashboard-message warning";
    });
}

function restoreCart() {
    shoppingCart.clear();
    try {
        const saved = JSON.parse(localStorage.getItem(cartStorageKey) || "[]");
        if (Array.isArray(saved)) for (const item of saved) {
            if (item?.medicine?.id && Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0)
                shoppingCart.set(String(item.medicine.id), { medicine: item.medicine, quantity: Number(item.quantity), available: true });
        }
    } catch { localStorage.removeItem(cartStorageKey); }
}
function persistCart() {
    if (cartStorageKey) localStorage.setItem(cartStorageKey, JSON.stringify([...shoppingCart.values()].map(line => ({ medicine: line.medicine, quantity: line.quantity }))));
}
async function refreshCartStock() {
    if (!shoppingCart.size) return;
    try {
        const { medicines } = await apiRequest("/customer/medicines");
        const current = new Map(medicines.map(medicine => [String(medicine.id), medicine]));
        for (const [id, line] of shoppingCart) {
            const latest = current.get(id);
            if (!latest) { line.available = false; continue; }
            line.medicine = latest; line.available = Number(latest.quantity) > 0;
            if (line.available && line.quantity > Number(latest.quantity)) line.quantity = Number(latest.quantity);
        }
        persistCart();
    } catch { /* Keep the saved cart visible if stock refresh is temporarily unavailable. */ }
}
function cartSubtotal() { return [...shoppingCart.values()].reduce((sum, line) => sum + Number(line.medicine.price) * line.quantity, 0); }
function renderCart() {
    if (!customerCartLines) return;
    customerCartLines.replaceChildren();
    let units = 0;
    for (const [medicineId, line] of shoppingCart) {
        units += line.quantity;
        const card = document.createElement("article"); card.className = "cart-item";
        addText(card, "h3", line.medicine.name + (line.medicine.strength ? ` | ${line.medicine.strength}` : ""));
        addText(card, "p", `Pharmacy: ${line.medicine.pharmacy?.name || "Unavailable pharmacy"}`);
        addText(card, "p", `Unit price: Rs. ${Number(line.medicine.price).toFixed(2)}`);
        const controls = document.createElement("div"); controls.className = "cart-controls";
        const minus = document.createElement("button"); minus.type = "button"; minus.textContent = "−"; minus.setAttribute("aria-label", `Decrease ${line.medicine.name} quantity`); minus.disabled = line.quantity <= 1;
        minus.onclick = () => { line.quantity--; persistCart(); renderCart(); };
        const qty = document.createElement("span"); qty.textContent = String(line.quantity);
        const plus = document.createElement("button"); plus.type = "button"; plus.textContent = "+"; plus.setAttribute("aria-label", `Increase ${line.medicine.name} quantity`); plus.disabled = !line.available || line.quantity >= Number(line.medicine.quantity);
        plus.onclick = () => { if (line.quantity < Number(line.medicine.quantity)) { line.quantity++; persistCart(); renderCart(); } };
        controls.append(minus, qty, plus); card.appendChild(controls);
        addText(card, "p", `Item subtotal: Rs. ${(Number(line.medicine.price) * line.quantity).toFixed(2)}`, "cart-line-total");
        if (!line.available) addText(card, "p", "Currently unavailable. Remove this item to continue.", "inventory-alert");
        const remove = document.createElement("button"); remove.type = "button"; remove.className = "cart-remove"; remove.textContent = "Remove";
        remove.onclick = () => { shoppingCart.delete(medicineId); persistCart(); renderCart(); };
        card.appendChild(remove); customerCartLines.appendChild(card);
    }
    if (!shoppingCart.size) showEmpty(customerCartLines, "Your cart is empty. Add a medicine to get started.");
    const subtotal = cartSubtotal();
    const pharmacyIds = new Set([...shoppingCart.values()].map(line => String(line.medicine.pharmacy?.id || "unavailable")));
    const delivery = subtotal ? 100 * pharmacyIds.size : 0;
    customerCartTotal.replaceChildren();
    addText(customerCartTotal, "p", `Items: ${units}`);
    addText(customerCartTotal, "p", `Subtotal: Rs. ${subtotal.toFixed(2)}`);
    addText(customerCartTotal, "p", `Delivery: Rs. ${delivery.toFixed(2)}`);
    addText(customerCartTotal, "p", "Discount: Rs. 0.00");
    addText(customerCartTotal, "strong", `Grand total: Rs. ${Math.max(0, subtotal + delivery).toFixed(2)}`);
    if (cartCount) cartCount.textContent = `${units} ${units === 1 ? "item" : "items"}`;
    const submit = document.querySelector('#checkoutForm button[type="submit"]');
    if (submit) submit.disabled = !shoppingCart.size || [...shoppingCart.values()].some(line => !line.available);
}
function addMedicineToCart(medicine) {
    const medicineId = String(medicine.id); const existing = shoppingCart.get(medicineId);
    if (existing) {
        if (existing.quantity >= Number(medicine.quantity)) return setMessage(document.getElementById("customerMessage"), "The cart already has the maximum available quantity.");
        existing.quantity++; existing.medicine = medicine; existing.available = true;
    } else shoppingCart.set(medicineId, { medicine, quantity: 1, available: Number(medicine.quantity) > 0 });
    persistCart(); renderCart();
    setMessage(document.getElementById("customerMessage"), `${medicine.name} added to your cart.`, "success");
}
function renderCustomerMedicines(container, medicines) {
    if (!medicines.length) return renderCustomerSearchEmpty(container, "No medicine found", "Try another search or adjust your filters.");
    container.replaceChildren();
    const grid = document.createElement("div"); grid.className = "dashboard-results";
    const lowestByMedicine = new Map();
    for (const medicine of medicines) {
        if (Number(medicine.quantity) < 1 || medicine.availabilityStatus === "expired") continue;
        const key = String(medicine.medicineId || medicine.id);
        const current = lowestByMedicine.get(key);
        if (current === undefined || Number(medicine.price) < current) lowestByMedicine.set(key, Number(medicine.price));
    }
    for (const medicine of medicines) {
        const card = document.createElement("article"); card.className = "dashboard-card medicine-result-card";
        const heading = document.createElement("div"); heading.className = "medicine-card-heading";
        const title = document.createElement("div");
        addText(title, "h3", medicine.name);
        if (medicine.strength) addText(title, "span", medicine.strength, "medicine-strength");
        const available = Number(medicine.quantity) > 0 && medicine.availabilityStatus !== "expired";
        const lowest = lowestByMedicine.get(String(medicine.medicineId || medicine.id));
        const isLowest = available && lowest !== undefined && Number(medicine.price) === lowest;
        if (isLowest) addText(heading, "span", "BEST PRICE", "lowest-price-badge");
        heading.prepend(title); card.appendChild(heading);
        const meta = document.createElement("div"); meta.className = "medicine-metadata";
        const details = [medicine.brandName && `Brand: ${medicine.brandName}`, medicine.genericName && `Generic: ${medicine.genericName}`, medicine.dosageForm && `Form: ${medicine.dosageForm}`].filter(Boolean);
        addText(meta, "p", details.join(" · ") || "Medicine details are not available.");
        addText(meta, "span", medicine.category || "General medicine", "medicine-category");
        card.appendChild(meta);
        const priceRow = document.createElement("div"); priceRow.className = "medicine-price-row";
        addText(priceRow, "strong", `${medicine.demoData ? "DEMO " : ""}Rs. ${Number(medicine.price).toFixed(2)}`, "medicine-price");
        addText(priceRow, "span", available ? `${medicine.availabilityStatus === "low-stock" ? "Low stock" : "In stock"} · ${medicine.quantity} available` : medicine.availabilityStatus === "expired" ? "Expired" : "Out of stock", `medicine-stock${available ? "" : " unavailable"}`);
        card.appendChild(priceRow);
        const pharmacy = document.createElement("div"); pharmacy.className = "medicine-pharmacy";
        addText(pharmacy, "strong", medicine.pharmacy?.name || "Unavailable pharmacy");
        addText(pharmacy, "p", [medicine.pharmacy?.area || medicine.pharmacy?.address, medicine.pharmacy?.city].filter(Boolean).join(", ") || "Location not provided");
        if (medicine.pharmacy?.phone) addText(pharmacy, "p", `Contact: ${medicine.pharmacy.phone}`);
        if (medicine.expiryDate) addText(pharmacy, "p", `Expiry: ${medicine.expiryDate}`);
        if (medicine.demoData || medicine.pharmacy?.demoData) addText(pharmacy, "p", "Fictional demo listing", "dashboard-muted");
        card.appendChild(pharmacy);
        const actions = document.createElement("div"); actions.className = "medicine-result-actions";
        const add = document.createElement("button"); add.type = "button"; add.className = "dashboard-action"; add.textContent = "Add to Cart"; add.disabled = !available;
        add.addEventListener("click", () => addMedicineToCart(medicine)); actions.appendChild(add);
        const reserve = document.createElement("button"); reserve.type="button";reserve.className="dashboard-action reserve-action";reserve.textContent="Request reservation";reserve.disabled=!available;reserve.onclick=async()=>{const quantity=Number(prompt(`How many ${medicine.name} would you like to reserve?`,"1"));if(!Number.isInteger(quantity)||quantity<1)return;try{await apiRequest("/customer/reservations",{method:"POST",body:{inventoryId:String(medicine.id),quantity}});setMessage(document.getElementById("customerMessage"),"Reservation request sent.","success");}catch(e){setMessage(document.getElementById("customerMessage"),e.message);}};
        actions.appendChild(reserve); card.appendChild(actions); grid.appendChild(card);
    }
    container.appendChild(grid);
}

async function setupPharmacistDashboard() {
    const pharmacyForm = document.getElementById("pharmacyForm");
    const pharmacyDetails = document.getElementById("pharmacyDetails");
    const pharmacyMessage = document.getElementById("pharmacyMessage");
    const inventoryPanel = document.getElementById("inventoryPanel");
    const inventoryListPanel = document.getElementById("inventoryListPanel");
    const inventoryResults = document.getElementById("inventoryResults");
    const inventoryMessage = document.getElementById("inventoryMessage");
    const main = document.querySelector(".dashboard-main");
    let salesPanel;
    const orderPanel=document.createElement("section");orderPanel.className="dashboard-panel";orderPanel.innerHTML='<h2>Incoming and previous orders</h2><div id="pharmacyOrders" class="dashboard-results"></div><h2>Notifications</h2><div id="pharmacyNotices"></div>';document.querySelector(".dashboard-main").appendChild(orderPanel);
    const reservationsPanel=document.createElement("section");reservationsPanel.className="dashboard-panel";reservationsPanel.innerHTML='<h2>Medicine reservations</h2><div id="pharmacyReservations" class="dashboard-results"></div>';document.querySelector(".dashboard-main").appendChild(reservationsPanel);
    async function loadReservations(){const {reservations}=await apiRequest("/pharmacist/reservations");const box=reservationsPanel.querySelector("#pharmacyReservations");box.replaceChildren();if(!reservations.length)showEmpty(box,"No reservation requests yet.");for(const r of reservations){const card=document.createElement("article");card.className="dashboard-card";addText(card,"h3",`${r.medicineName} · ${r.status}`);addText(card,"p",`${r.customerName} requested ${r.quantity} · Rs. ${Number(r.unitPrice).toFixed(2)} each`);if(r.status==="Pending"||r.status==="Accepted"){for(const status of r.status==="Pending"?["Accepted","Rejected"]:["Collected","Rejected"]){const b=document.createElement("button");b.className="dashboard-action";b.style.marginRight="8px";b.textContent=status;b.onclick=async()=>{try{await apiRequest(`/pharmacist/reservations/${encodeURIComponent(r.id)}`,{method:"PATCH",body:{status}});await loadReservations();}catch(e){setMessage(pharmacyMessage,e.message);}};card.appendChild(b);}}box.appendChild(card);}}
    async function loadOrders(){const {orders}=await apiRequest("/pharmacist/orders");const box=orderPanel.querySelector("#pharmacyOrders");box.replaceChildren();if(!orders.length)showEmpty(box,"No pharmacy orders yet.");for(const order of orders.slice().reverse()){const card=document.createElement("article");card.className="dashboard-card";addText(card,"h3",`${order.id} · ${order.status}`);addText(card,"p",`${order.customer.name} · ${order.customer.email} · ${order.customer.phone}`);addText(card,"p",`Delivery: ${order.address}`);addText(card,"p",order.items.map(i=>`${i.name} × ${i.quantity} @ Rs. ${i.unitPrice}`).join(", "));addText(card,"p",`Total Rs. ${order.total}`);const states=order.status==="Pending"?["Confirmed","Rejected"]:(["Confirmed","Awaiting Payment","Paid","Preparing","Out for Delivery"].includes(order.status)?["Preparing","Out for Delivery","Delivered"]:[]);states.forEach(status=>{const b=document.createElement("button");b.className="dashboard-action";b.style.marginRight="8px";b.textContent=status;b.onclick=async()=>{try{await apiRequest(`/pharmacist/orders/${encodeURIComponent(order.id)}`,{method:"PATCH",body:{status}});await loadOrders();}catch(e){setMessage(pharmacyMessage,e.message);}};card.appendChild(b);});box.appendChild(card);}const {notifications}=await apiRequest("/notifications");const nbox=orderPanel.querySelector("#pharmacyNotices");nbox.replaceChildren();if(!notifications.length)addText(nbox,"p","No notifications yet.","dashboard-muted");notifications.forEach(n=>addText(nbox,"p",`${n.title}: ${n.message}`,"dashboard-muted"));}

    let existingPharmacy = null;
    async function loadPharmacyAndInventory() {
        const { pharmacy } = await apiRequest("/pharmacist/pharmacy");
        existingPharmacy = pharmacy;
        if (!pharmacy) {
            pharmacyDetails.textContent = "No pharmacy profile is linked to your account yet.";
            pharmacyForm.hidden = false;
            inventoryPanel.hidden = true;
            inventoryListPanel.hidden = true;
            return;
        }
        pharmacyForm.hidden = true;
        pharmacyDetails.replaceChildren();
        addText(pharmacyDetails, "h3", pharmacy.name);
        addText(pharmacyDetails, "p", [pharmacy.address, pharmacy.city].filter(Boolean).join(", "));
        if (pharmacy.phone) addText(pharmacyDetails, "p", "Phone: " + pharmacy.phone);
        if (pharmacy.location) {
            addText(pharmacyDetails, "p", "Location / Coordinates: " + pharmacy.location);
        } else {
            addText(pharmacyDetails, "p", "Coordinates not set. Edit your pharmacy profile to add latitude and longitude (e.g. 24.8431, 67.0700).", "dashboard-muted");
        }

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "dashboard-action";
        editBtn.style.marginTop = "12px";
        editBtn.textContent = "Edit pharmacy profile";
        editBtn.onclick = () => {
            pharmacyForm.elements.name.value = pharmacy.name || "";
            pharmacyForm.elements.phone.value = pharmacy.phone || "";
            pharmacyForm.elements.address.value = pharmacy.address || "";
            pharmacyForm.elements.city.value = pharmacy.city || "";
            pharmacyForm.elements.location.value = pharmacy.location || "";
            const submitBtn = pharmacyForm.querySelector("button[type='submit']");
            if (submitBtn) submitBtn.textContent = "Save changes";
            pharmacyForm.hidden = false;
            pharmacyForm.scrollIntoView({ behavior: "smooth", block: "start" });
        };
        pharmacyDetails.appendChild(editBtn);

        await loadOrders();
        await loadReservations();
        inventoryPanel.hidden = false;
        inventoryListPanel.hidden = false;
        const { medicines } = await apiRequest("/pharmacist/medicines");
        renderInventory(inventoryResults, medicines, inventoryMessage);
        const stockEvents=await apiRequest("/pharmacist/stock-history");const historyPanel=document.createElement("section");historyPanel.className="dashboard-panel";addText(historyPanel,"h2","Stock update history");renderRows(historyPanel,[["Date","Type","Inventory ID","Change","Before","After","Reference"],...stockEvents.history.map(h=>[new Date(h.createdAt).toLocaleString(),h.type,h.inventoryId,h.quantityChange,h.quantityBefore,h.quantityAfter,h.reference||""])]);inventoryListPanel.appendChild(historyPanel);
        if (!salesPanel) salesPanel = buildSalesPanel(main);
        await salesPanel.load(medicines);
    }

    pharmacyForm.addEventListener("submit", async event => {
        event.preventDefault();
        if (!pharmacyForm.reportValidity()) return;
        const form = new FormData(pharmacyForm);
        try {
            const method = existingPharmacy ? "PATCH" : "POST";
            await apiRequest("/pharmacist/pharmacy", {
                method,
                body: Object.fromEntries(form.entries())
            });
            setMessage(pharmacyMessage, existingPharmacy ? "Pharmacy profile updated." : "Pharmacy profile saved.", "success");
            await loadPharmacyAndInventory();
        } catch (error) {
            setMessage(pharmacyMessage, error.message);
        }
    });

    document.getElementById("medicineAddForm").addEventListener("submit", async event => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const payload = Object.fromEntries(new FormData(form).entries());
        payload.quantity = Number(payload.quantity);
        payload.price = Number(payload.price);
        try {
            await apiRequest("/pharmacist/medicines", { method: "POST", body: payload });
            form.reset();
            setMessage(inventoryMessage, "Medicine added to your inventory.", "success");
            const { medicines } = await apiRequest("/pharmacist/medicines");
            renderInventory(inventoryResults, medicines, inventoryMessage);
        } catch (error) {
            setMessage(inventoryMessage, error.message);
        }
    });

    try {
        await loadPharmacyAndInventory();
    } catch (error) {
        setMessage(pharmacyMessage, error.message);
    }
}

function buildSalesPanel(parent) {
    const panel = document.createElement("section"); panel.className = "dashboard-panel";
    panel.innerHTML = '<h2>Sales &amp; Billing</h2><p class="dashboard-muted">Create a sale from your current pharmacy inventory. Stock is deducted when the sale is saved.</p><div id="salesAnalytics" class="dashboard-results"></div><div class="dashboard-form" id="posForm"><label>Medicine<select id="posMedicine"><option value="">Select medicine</option></select></label><label>Quantity<input id="posQuantity" type="number" min="1" step="1" value="1"></label><button class="dashboard-action" id="posAdd" type="button">Add item</button></div><div class="dashboard-results" id="posLines"></div><form class="dashboard-form" id="saleForm"><label>Customer name (optional)<input name="customerName" maxlength="120"></label><label>Customer phone (optional)<input name="customerPhone" maxlength="40"></label><label>Discount (Rs.)<input name="discount" type="number" min="0" step="0.01" value="0"></label><button class="dashboard-action" type="submit">Confirm and save sale</button></form><p class="form-message dashboard-message" id="saleMessage" role="status" aria-live="polite"></p><h2>Sales history</h2><div class="dashboard-form"><label>Search invoice or customer<input id="salesSearch" type="search"></label><label>Medicine<input id="salesMedicine" type="search"></label><label>From<input id="salesFrom" type="date"></label><label>To<input id="salesTo" type="date"></label><button class="dashboard-action" id="exportSales" type="button">Export filtered CSV</button><button class="dashboard-action" id="printSales" type="button">Print filtered report</button></div><div id="salesHistory" class="dashboard-results"></div>';
    parent.appendChild(panel);
    const select = panel.querySelector("#posMedicine"), quantity = panel.querySelector("#posQuantity"), linesBox = panel.querySelector("#posLines"), form = panel.querySelector("#saleForm"), message = panel.querySelector("#saleMessage"), historyBox = panel.querySelector("#salesHistory");
    const cart = new Map(); let medicines = [], sales = [];
    function drawCart() {
        linesBox.replaceChildren(); let total = 0;
        for (const [inventoryId, line] of cart) { total += line.price * line.quantity; const row = document.createElement("article"); row.className = "dashboard-card"; addText(row,"p",`${line.name} × ${line.quantity} · Rs. ${(line.price * line.quantity).toFixed(2)}`); const remove=document.createElement("button");remove.type="button";remove.className="dashboard-action";remove.textContent="Remove";remove.onclick=()=>{cart.delete(inventoryId);drawCart();};row.appendChild(remove);linesBox.appendChild(row); }
        if (!cart.size) showEmpty(linesBox,"No items in this sale yet."); else addText(linesBox,"strong",`Subtotal: Rs. ${total.toFixed(2)}`);
    }
    function drawHistory() {
        historyBox.replaceChildren(); const q=panel.querySelector("#salesSearch").value.toLowerCase(), med=panel.querySelector("#salesMedicine").value.toLowerCase(), from=panel.querySelector("#salesFrom").value, to=panel.querySelector("#salesTo").value;
        const filtered=sales.filter(s=>`${s.invoiceNumber} ${s.customerName}`.toLowerCase().includes(q)&&(!med||s.items.some(i=>i.name.toLowerCase().includes(med)))&&(!from||s.createdAt.slice(0,10)>=from)&&(!to||s.createdAt.slice(0,10)<=to));
        if (!filtered.length) return showEmpty(historyBox,"No sales match these filters.");
        for (const sale of filtered) { const card=document.createElement("article");card.className="dashboard-card";addText(card,"h3",sale.invoiceNumber);addText(card,"p",`${new Date(sale.createdAt).toLocaleString()} · ${sale.customerName||"Walk-in customer"} · ${sale.totalQuantity} units`);addText(card,"p",`${sale.items.map(i=>`${i.name} × ${i.quantity}`).join(", ")} · Subtotal Rs. ${sale.subtotal.toFixed(2)} · Discount Rs. ${sale.discount.toFixed(2)} · Total Rs. ${sale.total.toFixed(2)}`);const print=document.createElement("button");print.type="button";print.className="dashboard-action";print.textContent="Print invoice";print.onclick=()=>printSale(sale);card.appendChild(print);historyBox.appendChild(card); }
    }
    panel.querySelector("#posAdd").onclick=()=>{const item=medicines.find(m=>String(m.id)===select.value), qty=Number(quantity.value);if(!item||!Number.isInteger(qty)||qty<1)return setMessage(message,"Choose an item and a positive whole quantity.");const prior=cart.get(String(item.id))?.quantity||0;if(prior+qty>Number(item.quantity))return setMessage(message,"Quantity exceeds available stock.");cart.set(String(item.id),{name:item.name,price:Number(item.price),quantity:prior+qty});drawCart();setMessage(message,"");};
    form.onsubmit=async e=>{e.preventDefault();if(!cart.size)return setMessage(message,"Add at least one medicine.");const details=Object.fromEntries(new FormData(form));try{const result=await apiRequest("/pharmacist/sales",{method:"POST",body:{...details,discount:Number(details.discount),items:[...cart].map(([inventoryId,line])=>({inventoryId,quantity:line.quantity}))}});cart.clear();form.reset();form.elements.discount.value="0";drawCart();setMessage(message,`Sale ${result.sale.invoiceNumber} saved.`,"success");await refresh();}catch(err){setMessage(message,err.message);}};
    async function refresh(){const [latest,records]=await Promise.all([apiRequest("/pharmacist/medicines"),apiRequest("/pharmacist/sales")]);medicines=latest.medicines;sales=records.sales;select.replaceChildren(new Option("Select medicine",""));medicines.filter(m=>Number(m.quantity)>0&&m.availabilityStatus!=="expired").forEach(m=>select.add(new Option(`${m.name}${m.strength?` · ${m.strength}`:""} · ${m.quantity} in stock · Rs. ${m.price}`,String(m.id))));drawHistory();drawSalesAnalytics(panel.querySelector("#salesAnalytics"),sales);}
    panel.querySelectorAll("#salesSearch,#salesMedicine,#salesFrom,#salesTo").forEach(el=>el.addEventListener(el.type==="search"?"input":"change",drawHistory));
    panel.querySelector("#exportSales").onclick=()=>{const q=panel.querySelector("#salesSearch").value.toLowerCase(),med=panel.querySelector("#salesMedicine").value.toLowerCase(),from=panel.querySelector("#salesFrom").value,to=panel.querySelector("#salesTo").value;const records=sales.filter(s=>`${s.invoiceNumber} ${s.customerName}`.toLowerCase().includes(q)&&(!med||s.items.some(i=>i.name.toLowerCase().includes(med)))&&(!from||s.createdAt.slice(0,10)>=from)&&(!to||s.createdAt.slice(0,10)<=to));downloadCsv("sales.csv",[["Invoice","Date","Customer","Phone","Items","Quantity","Subtotal","Discount","Total"],...records.map(s=>[s.invoiceNumber,s.createdAt,s.customerName,s.customerPhone,s.items.map(i=>`${i.name} x${i.quantity}`).join("; "),s.totalQuantity,s.subtotal,s.discount,s.total])]);};
    panel.querySelector("#printSales").onclick=()=>{const content=historyBox.innerHTML,win=window.open("","_blank","width=900,height=700");if(!win)return;win.document.write(`<title>Sales report</title><h1>Sales report</h1>${content}`);win.document.close();win.print();};
    drawCart(); return {load: async current=>{medicines=current;await refresh();}};
}

function downloadCsv(filename, rows) { const escape=value=>`"${String(value??"").replace(/"/g,'""')}"`;const blob=new Blob([rows.map(row=>row.map(escape).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=filename;link.click();URL.revokeObjectURL(link.href); }
function drawSalesAnalytics(container,sales){container.replaceChildren();const dayKey=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;const today=new Date(),todayKey=dayKey(today),yesterday=new Date(today);yesterday.setDate(today.getDate()-1);const weekStart=new Date(today);weekStart.setDate(today.getDate()-((today.getDay()+6)%7));weekStart.setHours(0,0,0,0);const monthKey=todayKey.slice(0,7);const onDate=s=>new Date(s.createdAt);const sum=list=>list.reduce((n,s)=>n+Number(s.total||0),0);const todaySales=sales.filter(s=>dayKey(onDate(s))===todayKey),yesterdaySales=sales.filter(s=>dayKey(onDate(s))===dayKey(yesterday)),weekSales=sales.filter(s=>onDate(s)>=weekStart),monthSales=sales.filter(s=>dayKey(onDate(s)).slice(0,7)===monthKey);for(const [label,value] of [["Today",sum(todaySales)],["Yesterday",sum(yesterdaySales)],["This week",sum(weekSales)],["This month",sum(monthSales)],["Transactions",sales.length],["Average sale",sales.length?sum(sales)/sales.length:0]]){const card=document.createElement("article");card.className="dashboard-card";addText(card,"p",label);addText(card,"h3",`Rs. ${Number(value).toFixed(2)}`);container.appendChild(card);}const costsKnown=sales.every(s=>s.items.every(i=>i.purchaseCost!==null&&Number.isFinite(Number(i.purchaseCost))));if(sales.length&&costsKnown){const cogs=sales.reduce((n,s)=>n+s.items.reduce((m,i)=>m+Number(i.purchaseCost)*Number(i.quantity),0),0);const card=document.createElement("article");card.className="dashboard-card";addText(card,"p","Gross profit (recorded purchase cost)");addText(card,"h3",`Rs. ${(sum(sales)-cogs).toFixed(2)}`);container.appendChild(card);}const chart=document.createElement("article");chart.className="dashboard-card sales-chart";addText(chart,"h3","Daily sales · last 7 days");const days=[];for(let offset=6;offset>=0;offset--){const d=new Date(today);d.setDate(today.getDate()-offset);const key=dayKey(d);days.push({key,label:d.toLocaleDateString(undefined,{weekday:"short"}),total:sum(sales.filter(s=>dayKey(onDate(s))===key))});}const max=Math.max(1,...days.map(d=>d.total));for(const day of days){const row=document.createElement("div");row.style.display="grid";row.style.gridTemplateColumns="42px 1fr 90px";row.style.gap="8px";row.style.alignItems="center";addText(row,"span",day.label);const track=document.createElement("div");track.style.background="#e8eef5";track.style.height="12px";const bar=document.createElement("div");bar.style.background="#2463a6";bar.style.height="100%";bar.style.width=`${day.total/max*100}%`;track.appendChild(bar);row.appendChild(track);addText(row,"span",`Rs. ${day.total.toFixed(0)}`);chart.appendChild(row);}container.appendChild(chart);const best=new Map();sales.forEach(s=>s.items.forEach(i=>best.set(i.name,(best.get(i.name)||0)+Number(i.quantity))));const bestCard=document.createElement("article");bestCard.className="dashboard-card";addText(bestCard,"h3","Best-selling medicines");const top=[...best].sort((a,b)=>b[1]-a[1]).slice(0,5);if(!top.length)addText(bestCard,"p","No completed sales recorded yet.");top.forEach(([name,qty])=>addText(bestCard,"p",`${name} · ${qty} sold`));container.appendChild(bestCard);}
function printSale(sale) { const win=window.open("","_blank","width=700,height=700");if(!win)return;const rows=sale.items.map(i=>`<tr><td>${escapeHtml(i.name)} ${escapeHtml(i.strength)}</td><td>${i.quantity}</td><td>Rs. ${Number(i.unitPrice).toFixed(2)}</td><td>Rs. ${Number(i.lineTotal).toFixed(2)}</td></tr>`).join("");win.document.write(`<!doctype html><title>Invoice ${escapeHtml(sale.invoiceNumber)}</title><h1>MedConnect Pharmacy</h1><p>Invoice: ${escapeHtml(sale.invoiceNumber)}</p><p>${new Date(sale.createdAt).toLocaleString()}</p><p>Customer: ${escapeHtml(sale.customerName||"Walk-in customer")}</p><table border="1" cellspacing="0" cellpadding="8"><tr><th>Medicine</th><th>Qty</th><th>Price</th><th>Total</th></tr>${rows}</table><p>Subtotal Rs. ${sale.subtotal.toFixed(2)}</p><p>Discount Rs. ${sale.discount.toFixed(2)}</p><h2>Total Rs. ${sale.total.toFixed(2)}</h2><script>window.onload=()=>window.print()<\/script>`);win.document.close(); }
function escapeHtml(value) { return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char])); }

function renderInventory(container, medicines, message) {
    if (!medicines.length) return showEmpty(container, "No medicines have been added to this pharmacy yet.");
    container.replaceChildren();
    for (const medicine of medicines) {
        const card = document.createElement("article");
        card.className = "dashboard-card";
        addText(card, "h3", medicine.name + (medicine.strength ? " · " + medicine.strength : ""));
        const expiry = medicine.expiryDate ? new Date(medicine.expiryDate + "T00:00:00") : null;
        if (Number(medicine.quantity) <= 10) addText(card, "p", "Low stock alert", "inventory-alert");
        if (expiry && !Number.isNaN(expiry.getTime()) && expiry <= new Date()) {
            addText(card, "p", "Expired medicine", "inventory-alert");
        }

        const form = document.createElement("form");
        const fields = [
            ["quantity", "Quantity", "number", medicine.quantity, "0"],
            ["price", "Price (Rs.)", "number", medicine.price, "0.01"],
            ["expiryDate", "Expiry date", "date", medicine.expiryDate, null]
        ];
        for (const [name, labelText, type, value, step] of fields) {
            const label = document.createElement("label");
            label.textContent = labelText;
            const input = document.createElement("input");
            input.name = name;
            input.type = type;
            input.value = value;
            input.required = true;
            input.min = "0";
            if (step) input.step = step;
            label.appendChild(input);
            form.appendChild(label);
        }
        for (const [name,labelText,value,type] of [["batchNumber","Batch number",medicine.batchNumber||"","text"],["purchaseCost","Purchase cost per unit (Rs.)",medicine.purchaseCost??"","number"]]) { const label=document.createElement("label");label.textContent=labelText;const input=document.createElement("input");input.name=name;input.type=type;input.value=value;if(name==="batchNumber")input.maxLength=80;if(name==="purchaseCost"){input.min="0";input.step="0.01";}label.appendChild(input);form.appendChild(label); }
        const button = document.createElement("button");
        button.className = "dashboard-action";
        button.type = "submit";
        button.textContent = "Save changes";
        form.appendChild(button);
        form.addEventListener("submit", async event => {
            event.preventDefault();
            const body = Object.fromEntries(new FormData(form).entries());
            body.quantity = Number(body.quantity);
            body.price = Number(body.price);
            body.purchaseCost = body.purchaseCost === "" ? null : Number(body.purchaseCost);
            button.disabled = true;
            try {
                await apiRequest("/pharmacist/medicines/" + encodeURIComponent(medicine.id), {
                    method: "PUT",
                    body
                });
                setMessage(message, "Inventory updated.", "success");
                const { medicines: latest } = await apiRequest("/pharmacist/medicines");
                renderInventory(container, latest, message);
            } catch (error) {
                setMessage(message, error.message);
                button.disabled = false;
            }
        });
        card.appendChild(form);
        const remove=document.createElement("button");remove.type="button";remove.className="dashboard-action";remove.textContent="Delete inventory record";remove.onclick=async()=>{if(!confirm(`Delete ${medicine.name} from this pharmacy inventory?`))return;try{await apiRequest(`/pharmacist/medicines/${encodeURIComponent(medicine.id)}`,{method:"DELETE"});const {medicines:latest}=await apiRequest("/pharmacist/medicines");renderInventory(container,latest,message);}catch(error){setMessage(message,error.message);}};card.appendChild(remove);
        container.appendChild(card);
    }
}

async function setupAdminDashboard() {
    const container = document.getElementById("adminOverview");
    try {
        const data=await apiRequest("/admin/data");container.replaceChildren();
        const nav=document.createElement("nav");nav.className="admin-nav";const sections=["Dashboard","Customers","Pharmacists","Pharmacies","Medicines","Inventory","Orders","Sales","Payments","Reports","Notifications"];const body=document.createElement("div");container.append(nav,body);
        function show(section){body.replaceChildren();for(const tab of nav.children)tab.classList.toggle("active",tab.textContent===section);const metric=(label,value)=>{const c=document.createElement("article");c.className="dashboard-card";addText(c,"p",label);addText(c,"h3",String(value));body.appendChild(c);};
          if(section==="Dashboard"){const grid=document.createElement("div");grid.className="dashboard-results";body.appendChild(grid);for(const [label,value] of Object.entries({Customers:data.counts.customers,Pharmacists:data.counts.pharmacists,"Registered pharmacies":data.counts.pharmacies,"Pending pharmacy approvals":data.counts.pendingPharmacyApprovals||0,"Active pharmacies":data.counts.activePharmacies||0,Medicines:data.counts.medicines,Orders:data.counts.orders,"Pending orders":data.counts.pending,"Low stock records":data.counts.lowStock||0,"Expired stock records":data.counts.expiredInventory||0,"Delivered orders":data.counts.completed,"Demo payments":data.counts.payments,"Recorded sales":data.counts.sales||0,"Sales revenue (Rs.)":Number(data.counts.salesRevenue||0).toFixed(2)})){const c=document.createElement("article");c.className="dashboard-card";addText(c,"p",label);addText(c,"h3",String(value));grid.appendChild(c);}addText(body,"h2","Recent orders");renderRows(body,data.orders.slice(-8).reverse().map(o=>[o.id,o.customer?.name,o.pharmacy?.name,o.status,`Rs. ${o.total}`]));}
          if(section==="Customers"||section==="Pharmacists"){const users=data.users.filter(u=>u.role===(section==="Customers"?"Customer":"Pharmacist"));const search=document.createElement("input");search.placeholder=`Search ${section.toLowerCase()}`;body.appendChild(search);const list=document.createElement("div");list.className="dashboard-results";body.appendChild(list);const draw=()=>{list.replaceChildren();users.filter(u=>(u.name+u.email).toLowerCase().includes(search.value.toLowerCase())).forEach(u=>{const c=document.createElement("article");c.className="dashboard-card";addText(c,"h3",u.name);addText(c,"p",`${u.email} · ${u.role} · ${u.active===false?"Inactive":"Active"}`);if(u.pharmacyId){const p=data.pharmacies.find(x=>String(x.id)===String(u.pharmacyId));addText(c,"p",`Pharmacy: ${p?.name||"Not assigned"}`);}const b=document.createElement("button");b.className="dashboard-action";b.textContent=u.active===false?"Activate":"Deactivate";b.onclick=async()=>{await apiRequest(`/admin/users/${encodeURIComponent(u.id)}`,{method:"PATCH",body:{active:u.active===false}});u.active=u.active===false;draw();};c.appendChild(b);list.appendChild(c);});};search.oninput=draw;draw();}
          if(section==="Pharmacies"){const list=document.createElement("div");list.className="dashboard-results";body.appendChild(list);data.pharmacies.forEach(p=>{const card=document.createElement("article");card.className="dashboard-card";addText(card,"h3",`${p.name}${p.demoData?" · FICTIONAL DEMO":""}`);addText(card,"p",`Approval: ${p.approvalStatus|| (p.active===false?"Inactive":"Approved")} · ${p.address||""} · ${p.city||""}`);if(p.area||p.openingHours)addText(card,"p",`${p.area||p.address||""} · ${p.openingHours||"Hours not set"}`);if(p.approvalStatus==="Pending"){for(const status of ["Approved","Rejected"]){const decision=document.createElement("button");decision.type="button";decision.className="dashboard-action";decision.style.marginRight="8px";decision.textContent=status;decision.onclick=async()=>{await apiRequest(`/admin/pharmacies/${encodeURIComponent(p.id)}`,{method:"PATCH",body:{approvalStatus:status}});p.approvalStatus=status;p.active=status==="Approved";show("Pharmacies");};card.appendChild(decision);}}const form=adminForm([["name","Pharmacy name"],["address","Address"],["city","City"],["phone","Phone"],["location","Location"]]);form.elements.phone.required=false;form.elements.location.required=false;for(const [key,value] of Object.entries({name:p.name,address:p.address,city:p.city,phone:p.phone||"",location:p.location||""}))form.elements[key].value=value;const save=form.querySelector("button");save.textContent="Save pharmacy";form.onsubmit=async e=>{e.preventDefault();await apiRequest(`/admin/pharmacies/${encodeURIComponent(p.id)}`,{method:"PATCH",body:Object.fromEntries(new FormData(form))});location.reload();};card.appendChild(form);const active=document.createElement("button");active.className="dashboard-action";active.textContent=p.active===false?"Activate":"Deactivate";active.onclick=async()=>{await apiRequest(`/admin/pharmacies/${encodeURIComponent(p.id)}`,{method:"PATCH",body:{active:p.active===false}});location.reload();};card.appendChild(active);list.appendChild(card);});const form=adminForm([["name","Pharmacy name"],["address","Address"],["city","City"],["phone","Phone"],["location","Location"]]);form.elements.phone.required=false;form.elements.location.required=false;body.appendChild(form);form.onsubmit=async e=>{e.preventDefault();await apiRequest("/admin/pharmacies",{method:"POST",body:Object.fromEntries(new FormData(form))});location.reload();};}
          if(section==="Medicines"){addText(body,"p","Search current medicine listings and compare pharmacy stock. Catalog records and inventory prices remain managed separately.","dashboard-muted");const searchForm=document.createElement("form");searchForm.className="dashboard-form";searchForm.id="adminMedicineSearchForm";searchForm.onsubmit=e=>e.preventDefault();const label=document.createElement("label");label.className="full-width";label.textContent="Search medicine, generic name, or brand";const input=document.createElement("input");input.name="search";input.type="search";input.placeholder="e.g. Panadol or paracetamol";label.appendChild(input);const button=document.createElement("button");button.type="submit";button.className="dashboard-action";button.textContent="Search medicines";searchForm.append(label,button);body.appendChild(searchForm);const results=document.createElement("div");results.className="dashboard-results";results.setAttribute("aria-live","polite");body.appendChild(results);let version=0,controller=null;searchForm.addEventListener("submit",async e=>{e.preventDefault();const current=++version;controller?.abort();controller=new AbortController();results.setAttribute("aria-busy","true");setMessage(document.getElementById("adminMessage"),"Searching medicines…","info");try{const q=new URLSearchParams({search:input.value.trim(),availability:"all"});const response=await apiRequest("/customer/medicines?"+q,{signal:controller.signal,redirectOnUnauthorized:false,cache:"no-store"});if(response.success===false)throw new Error(response.message||"Medicine search failed");if(!Array.isArray(response.medicines))throw new Error("Medicine search returned an invalid response");if(current!==version)return;const rows=response.medicines.map(m=>[m.name,m.genericName||"",m.brandName||"",[m.strength,m.dosageForm].filter(Boolean).join(" "),m.category,m.pharmacy?.name||"Unavailable",m.availabilityStatus,m.quantity,`Rs. ${Number(m.price).toFixed(2)}`,m.expiryDate||""]);if(rows.length)renderRows(results,[["Medicine","Generic","Brand","Strength / Form","Category","Pharmacy","Availability","Stock","Price","Expiry"],...rows]);else showEmpty(results,"No medicine listings matched that search.");setMessage(document.getElementById("adminMessage"),`${rows.length} listing${rows.length===1?"":"s"} found.`,rows.length?"success":"info");}catch(error){if(error.name!=="AbortError"&&current===version)setMessage(document.getElementById("adminMessage"),error.message);}finally{if(current===version)results.removeAttribute("aria-busy");}});const rows=(data.catalog||data.medicines).map(m=>[m.id,m.name,m.genericName||"",m.brandName||"",[m.strength,m.dosageForm].filter(Boolean).join(" "),m.category,m.prescriptionRequired?"Yes":"No",m.active===false?"Inactive":"Active",m.demoData?"DEMO":"Existing"]);addText(body,"h3","Central medicine catalog");renderRows(body,[["Medicine ID","Medicine","Generic","Brand","Strength / Form","Category","Prescription field","Status","Record type"],...rows]);}
          if(section==="Inventory"){const list=document.createElement("div");list.className="dashboard-results";body.appendChild(list);(data.inventory||[]).forEach(m=>{const card=document.createElement("article");card.className="dashboard-card";addText(card,"h3",`${m.name}${m.strength?` ? ${m.strength}`:""}`);addText(card,"p",`Pharmacy: ${m.pharmacy?.name||"Unknown"} ? ${m.pharmacyId} ? Medicine ID ${m.medicineId}`);addText(card,"p",`${m.demoData?"DEMO DATA":"Saved data"} ? ${m.availabilityStatus} ? Expiry ${m.expiryDate||"not set"}`);const form=adminForm([["quantity","Quantity"],["price","Price"],["expiryDate","Expiry date"]]);for(const [key,value] of Object.entries({quantity:m.quantity,price:m.price,expiryDate:m.expiryDate||""}))form.elements[key].value=value;form.querySelector("button").textContent="Save inventory";form.onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(form));b.quantity=Number(b.quantity);b.price=Number(b.price);await apiRequest(`/admin/medicines/${encodeURIComponent(m.id)}`,{method:"PATCH",body:b});location.reload();};card.appendChild(form);const del=document.createElement("button");del.className="dashboard-action";del.textContent="Delete inventory record";del.onclick=async()=>{if(confirm(`Delete ${m.name} at ${m.pharmacy?.name||"this pharmacy"}?`)){await apiRequest(`/admin/medicines/${encodeURIComponent(m.id)}`,{method:"DELETE"});location.reload();}};card.appendChild(del);list.appendChild(card);});const form=adminForm([["name","Medicine name"],["strength","Strength"],["pharmacyId","Pharmacy ID"],["quantity","Quantity"],["price","Price"],["expiryDate","Expiry date"]]);body.appendChild(form);form.onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(form));b.quantity=Number(b.quantity);b.price=Number(b.price);await apiRequest("/admin/medicines",{method:"POST",body:b});location.reload();};}
          if(section==="Orders"){const search=document.createElement("input");search.placeholder="Search order ID or customer";const status=document.createElement("select");["All statuses","Pending","Confirmed","Awaiting Payment","Paid","Rejected","Preparing","Out for Delivery","Delivered","Cancelled"].forEach(v=>{const o=document.createElement("option");o.value=v==="All statuses"?"":v;o.textContent=v;status.appendChild(o);});const from=document.createElement("input");from.type="date";from.setAttribute("aria-label","Orders from date");const to=document.createElement("input");to.type="date";to.setAttribute("aria-label","Orders to date");body.append(search,status,from,to);const list=document.createElement("div");body.appendChild(list);const draw=()=>{list.replaceChildren();renderRows(list,data.orders.slice().reverse().filter(o=>`${o.id} ${o.customer?.name||""}`.toLowerCase().includes(search.value.toLowerCase())&&(!status.value||o.status===status.value)&&(!from.value||(o.createdAt||"").slice(0,10)>=from.value)&&(!to.value||(o.createdAt||"").slice(0,10)<=to.value)).map(o=>[o.id,o.customer?.name,o.pharmacy?.name,o.status,`Rs. ${o.total}`,o.createdAt]));};search.oninput=draw;status.onchange=draw;from.onchange=draw;to.onchange=draw;draw();}
          if(section==="Sales"){const search=document.createElement("input");search.placeholder="Search invoice or customer";const from=document.createElement("input");from.type="date";from.setAttribute("aria-label","Sales from date");const to=document.createElement("input");to.type="date";to.setAttribute("aria-label","Sales to date");const exportBtn=document.createElement("button");exportBtn.className="dashboard-action";exportBtn.textContent="Export CSV";body.append(search,from,to,exportBtn);const list=document.createElement("div");body.appendChild(list);const draw=()=>{const rows=(data.sales||[]).filter(s=>`${s.invoiceNumber} ${s.customerName} ${s.pharmacyId}`.toLowerCase().includes(search.value.toLowerCase())&&(!from.value||s.createdAt.slice(0,10)>=from.value)&&(!to.value||s.createdAt.slice(0,10)<=to.value));renderRows(list,[["Invoice","Pharmacy","Customer","Items","Quantity","Subtotal","Discount","Total","Date"],...rows.map(s=>[s.invoiceNumber,s.pharmacyId,s.customerName||"Walk-in",s.items.map(i=>`${i.name} x${i.quantity}`).join("; "),s.totalQuantity,`Rs. ${s.subtotal}`,`Rs. ${s.discount}`,`Rs. ${s.total}`,s.createdAt])]);};search.oninput=draw;from.onchange=draw;to.onchange=draw;exportBtn.onclick=()=>{const rows=(data.sales||[]).filter(s=>`${s.invoiceNumber} ${s.customerName} ${s.pharmacyId}`.toLowerCase().includes(search.value.toLowerCase())&&(!from.value||s.createdAt.slice(0,10)>=from.value)&&(!to.value||s.createdAt.slice(0,10)<=to.value));downloadCsv("system-sales.csv",[["Invoice","Pharmacy","Customer","Phone","Quantity","Subtotal","Discount","Total","Date"],...rows.map(s=>[s.invoiceNumber,s.pharmacyId,s.customerName,s.customerPhone,s.totalQuantity,s.subtotal,s.discount,s.total,s.createdAt])]);};draw();}
          if(section==="Payments")renderRows(body,data.payments.slice().reverse().map(p=>["DEMO",p.reference,p.orderId,p.method,`Rs. ${p.amount}`,p.status,p.createdAt]));
          if(section==="Notifications")renderRows(body,data.notifications.slice().reverse().map(n=>[n.title,n.message,n.createdAt]));
          if(section==="Reports"){metric("Total orders",data.orders.length);metric("Delivered",data.orders.filter(o=>o.status==="Delivered").length);metric("Demo payment total",`Rs. ${data.payments.reduce((s,p)=>s+Number(p.amount||0),0).toFixed(2)}`);const frequency={};data.orders.forEach(o=>o.items.forEach(i=>frequency[i.name]=(frequency[i.name]||0)+i.quantity));addText(body,"h3","Most ordered medicines");renderRows(body,Object.entries(frequency).sort((a,b)=>b[1]-a[1]).slice(0,10));addText(body,"h3","Order status totals");const statusCounts={};data.orders.forEach(o=>statusCounts[o.status]=(statusCounts[o.status]||0)+1);renderRows(body,Object.entries(statusCounts));addText(body,"h3","Customer registrations by month");const months={};data.users.filter(u=>u.role==="Customer").forEach(u=>{const month=(u.createdAt||"").slice(0,7)||"Unknown";months[month]=(months[month]||0)+1;});renderRows(body,Object.entries(months).sort((a,b)=>a[0].localeCompare(b[0])));}
        }
        sections.forEach(s=>{const b=document.createElement("button");b.type="button";b.textContent=s;b.onclick=()=>show(s);nav.appendChild(b);});show("Dashboard");
    } catch (error) {
        setMessage(document.getElementById("adminMessage"), error.message);
    }
}

function renderRows(parent,rows){if(!rows.length)return addText(parent,"p","No records yet.","dashboard-empty");const wrap=document.createElement("div");wrap.className="table-wrap";const table=document.createElement("table");rows.forEach((row,index)=>{const tr=document.createElement("tr");row.forEach(value=>{const cell=document.createElement(index===0?"th":"td");cell.textContent=value??"";tr.appendChild(cell);});table.appendChild(tr);});wrap.appendChild(table);parent.appendChild(wrap);}
function adminForm(fields){const form=document.createElement("form");form.className="dashboard-form admin-form";fields.forEach(([name,label])=>{const l=document.createElement("label");l.textContent=label;const i=document.createElement("input");i.name=name;i.required=true;if(name==="quantity")i.type="number";if(name==="price")i.type="number";if(name==="expiryDate")i.type="date";l.appendChild(i);form.appendChild(l);});const b=document.createElement("button");b.className="dashboard-action";b.textContent="Add";form.appendChild(b);return form;}

startDashboard();
