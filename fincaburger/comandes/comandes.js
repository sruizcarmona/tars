/* Finca Burger — Order pad (waiter-facing). Cart persists in localStorage.
 * Menu items come from ../menu-data.js (single source of truth — updating
 * the menu there updates this pad automatically).
 */
(function () {
  "use strict";

  // ── CONFIG ─────────────────────────────────────────────
  // Kitchen WhatsApp number (international format, no "+").
  // Currently same as the bookings number — change if the kitchen has its own.
  const KITCHEN_WA = "34613081091";
  const STORAGE_KEY = "fincaburger_cart_v1";
  const IMG_BASE = "../"; // we live in /comandes/, assets are one level up

  // ── STATE ──────────────────────────────────────────────
  // cart = { items: { id: qty }, table: "3" }
  let cart = loadCart();

  function loadCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && parsed.items) return parsed;
      }
    } catch (e) { /* storage unavailable — fall through to empty */ }
    return { items: {}, table: "" };
  }

  function saveCart() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); } catch (e) {}
  }

  // ── HELPERS ────────────────────────────────────────────
  function findItem(id) {
    const b = FINCA_MENU.burgers.find((x) => x.id === id);
    if (b) return { ...b, cat: "burger" };
    const s = FINCA_MENU.starters && FINCA_MENU.starters.find((x) => x.id === id);
    if (s) return { ...s, cat: "starter" };
    const d = FINCA_MENU.drinks.find((x) => x.id === id);
    if (d) return { ...d, cat: "drink" };
    return null;
  }

  function cartCount() {
    return Object.values(cart.items).reduce((a, b) => a + b, 0);
  }

  function cartTotal() {
    let t = 0;
    for (const [id, qty] of Object.entries(cart.items)) {
      const item = findItem(id);
      if (item) t += item.price * qty;
    }
    return t;
  }

  // ── RENDER MENU ────────────────────────────────────────
  function renderMenu() {
    const grid = document.getElementById("burger-grid");
    FINCA_MENU.burgers.forEach((b) => {
      const card = document.createElement("div");
      card.className = "item-card";
      card.dataset.id = b.id;

      const badge = document.createElement("span");
      badge.className = "item-qty-badge";
      badge.id = "qty-" + b.id;

      const img = document.createElement("img");
      img.src = IMG_BASE + "assets/" + b.img;
      img.alt = b.name;
      img.loading = "lazy";

      const body = document.createElement("div");
      body.className = "item-card-body";
      const h3 = document.createElement("h3");
      h3.textContent = b.name;
      const price = document.createElement("div");
      price.className = "price";
      price.textContent = formatPrice(b.price);
      body.appendChild(h3);
      body.appendChild(price);

      card.appendChild(badge);
      card.appendChild(img);
      card.appendChild(body);
      card.addEventListener("click", () => addItem(b.id));
      grid.appendChild(card);
    });

    const list = document.getElementById("drink-list");
    FINCA_MENU.drinks.forEach((d) => {
      const row = document.createElement("div");
      row.className = "item-row";
      row.dataset.id = d.id;

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = d.name;
      const price = document.createElement("span");
      price.className = "price";
      price.textContent = formatPrice(d.price);

      row.appendChild(name);
      row.appendChild(price);
      row.addEventListener("click", () => addItem(d.id));
      list.appendChild(row);
    });

    // starters (if the menu has them)
    const starterList = document.getElementById("starter-list");
    if (starterList && FINCA_MENU.starters) {
      FINCA_MENU.starters.forEach((s) => {
        const row = document.createElement("div");
        row.className = "item-row";
        row.dataset.id = s.id;

        const name = document.createElement("span");
        name.className = "name";
        name.textContent = s.name;
        const price = document.createElement("span");
        price.className = "price";
        price.textContent = formatPrice(s.price);

        row.appendChild(name);
        row.appendChild(price);
        row.addEventListener("click", () => addItem(s.id));
        starterList.appendChild(row);
      });
    }
  }

  // ── CART ACTIONS ───────────────────────────────────────
  function addItem(id) {
    cart.items[id] = (cart.items[id] || 0) + 1;
    saveCart();
    refresh();
  }

  function setQty(id, qty) {
    if (qty <= 0) delete cart.items[id];
    else cart.items[id] = qty;
    saveCart();
    refresh();
  }

  function clearCart() {
    cart.items = {};
    saveCart();
    refresh();
  }

  // ── RENDER STATE ───────────────────────────────────────
  function refresh() {
    // qty badges on menu cards/rows
    document.querySelectorAll(".item-card, .item-row").forEach((el) => {
      const id = el.dataset.id;
      const qty = cart.items[id] || 0;
      el.classList.toggle("selected", qty > 0);
      const badge = el.querySelector(".item-qty-badge");
      if (badge) {
        badge.textContent = qty;
        badge.classList.toggle("show", qty > 0);
      }
    });

    // cart bar
    const count = cartCount();
    document.getElementById("cart-count").textContent = count;
    document.getElementById("cart-total").textContent = formatPrice(cartTotal());
    document.getElementById("drawer-total").textContent = formatPrice(cartTotal());

    // drawer item list
    renderCartItems();

    // send button state
    document.getElementById("send-order").disabled = count === 0;
  }

  function renderCartItems() {
    const container = document.getElementById("cart-items");
    container.innerHTML = "";
    const ids = Object.keys(cart.items);
    if (ids.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-cart";
      empty.textContent = "La comanda és buida. Toca un producte per començar.";
      container.appendChild(empty);
      return;
    }
    ids.forEach((id) => {
      const item = findItem(id);
      if (!item) return;
      const qty = cart.items[id];

      const row = document.createElement("div");
      row.className = "cart-item";

      const name = document.createElement("span");
      name.className = "ci-name";
      name.textContent = item.name;

      const controls = document.createElement("div");
      controls.className = "qty-control";
      const minus = document.createElement("button");
      minus.className = "minus";
      minus.textContent = "−";
      minus.addEventListener("click", () => setQty(id, qty - 1));
      const qtyEl = document.createElement("span");
      qtyEl.className = "qty";
      qtyEl.textContent = qty;
      const plus = document.createElement("button");
      plus.textContent = "+";
      plus.addEventListener("click", () => setQty(id, qty + 1));
      controls.appendChild(minus);
      controls.appendChild(qtyEl);
      controls.appendChild(plus);

      const price = document.createElement("span");
      price.className = "ci-price";
      price.textContent = formatPrice(item.price * qty);

      const remove = document.createElement("button");
      remove.className = "ci-remove";
      remove.textContent = "🗑";
      remove.title = "Elimina";
      remove.addEventListener("click", () => setQty(id, 0));

      row.appendChild(name);
      row.appendChild(controls);
      row.appendChild(price);
      row.appendChild(remove);
      container.appendChild(row);
    });
  }

  // ── DRAWER ─────────────────────────────────────────────
  function openDrawer() {
    renderCartItems();
    document.getElementById("drawer").classList.add("open");
    document.getElementById("drawer-overlay").classList.add("open");
  }

  function closeDrawer() {
    document.getElementById("drawer").classList.remove("open");
    document.getElementById("drawer-overlay").classList.remove("open");
  }

  // ── SEND TO KITCHEN ────────────────────────────────────
  function buildOrderMessage() {
    const lines = ["🍔 COMANDA FINCA BURGER"];
    if (cart.table) lines.push("🪑 Taula: " + cart.table);
    lines.push("");
    for (const [id, qty] of Object.entries(cart.items)) {
      const item = findItem(id);
      if (item) lines.push(qty + "× " + item.name + " — " + formatPrice(item.price * qty));
    }
    lines.push("");
    lines.push("💰 TOTAL: " + formatPrice(cartTotal()));
    return lines.join("\n");
  }

  function sendOrder() {
    if (cartCount() === 0) {
      showToast("La comanda és buida");
      return;
    }
    const msg = buildOrderMessage();
    const url = "https://wa.me/" + KITCHEN_WA + "?text=" + encodeURIComponent(msg);

    // 1) open WhatsApp with the order pre-filled
    window.open(url, "_blank");

    // 2) also copy to clipboard as a fallback
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(msg).catch(() => {});
    }

    showToast("Comanda enviada a la cuina ✅");
    // order handed off — start fresh for the next table
    clearCart();
    closeDrawer();
  }

  // ── TOAST ──────────────────────────────────────────────
  let toastTimer = null;
  function showToast(text) {
    const toast = document.getElementById("toast");
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  // ── INIT ───────────────────────────────────────────────
  function init() {
    renderMenu();
    refresh();

    // table number
    const tableInput = document.getElementById("table-input");
    tableInput.value = cart.table || "";
    tableInput.addEventListener("input", () => {
      cart.table = tableInput.value.trim();
      saveCart();
    });

    document.getElementById("open-cart").addEventListener("click", openDrawer);
    document.getElementById("close-cart").addEventListener("click", closeDrawer);
    document.getElementById("drawer-overlay").addEventListener("click", closeDrawer);
    document.getElementById("send-order").addEventListener("click", sendOrder);
    document.getElementById("clear-order").addEventListener("click", () => {
      if (cartCount() > 0 && confirm("Segur que vols buidar la comanda?")) clearCart();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
