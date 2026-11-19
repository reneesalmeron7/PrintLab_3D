const nav = document.querySelector("#nav");
const grid = document.querySelector("#grid");
const empty = document.querySelector("#empty");
const catalogMessage = document.querySelector("#catalogMessage");
const retryCatalog = document.querySelector("#retryCatalog");
const chips = document.querySelectorAll(".chip");
const toast = document.querySelector("#toast");
const cartCount = document.querySelector("#cartCount");
const cartList = document.querySelector("#cartList");
const cartTotal = document.querySelector("#cartTotal");
const cartPanel = document.querySelector("#cartPanel");
const cartBtn = document.querySelector("#cartBtn");
const checkout = document.querySelector("#checkout");
const cartNotice = document.querySelector("#cartNotice");
const payment = document.querySelector("#payment");
const paymentForm = document.querySelector("#paymentForm");
const paymentMethods = document.querySelector("#paymentMethods");
const paymentDetails = paymentMethods.querySelectorAll("[data-payment-details]");
const paymentNotice = document.querySelector("#paymentNotice");
const confirmPayment = document.querySelector("#confirmPayment");
const backToCart = document.querySelector("#backToCart");
const invoiceDialog = document.querySelector("#invoice");
const money = new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD" });
const fileName = document.querySelector("#fileName");

const catalogArtwork = new Map(
  [...grid.querySelectorAll(".card")].map((card) => {
    const shot = card.querySelector(".shot");
    return [card.dataset.name, {
      material: card.dataset.material,
      source: shot.querySelector(".product-art").getAttribute("src"),
      classes: shot.className
    }];
  })
);

const cart = [];
const cartBeforeLogin = "pl-cart-before-login";
const demoPaymentProfiles = {
  tarjeta: { titular: "Cliente Demo", vencimiento: "12/30", numero: "•••• •••• •••• 4242" },
  transferencia: { banco: "Banco Demo", beneficiario: "PrintLab 3D", cuenta: "•••• •••• 5678" }
};
let paying = false;
let catalog = [];
let filter = "todos";

function asProduct(product) {
  return {
    id: String(product.id),
    name: product.name,
    category: product.category || "",
    material: product.material,
    time: product.time || "",
    price: Number(product.price),
    stock: Number(product.stock),
    image: product.image || "",
    description: product.description || ""
  };
}

let catalogToken = 0;

async function loadCatalog() {
  const token = ++catalogToken;
  const response = await fetch("/api/products", { cache: "no-store" });
  if (!response.ok) throw new Error("No se pudo cargar el catálogo.");
  const data = await response.json();
  if (token !== catalogToken) return;
  catalog = (data.products || []).map(asProduct);
  if (grid.hidden) restoreCartAfterLogin();
  grid.hidden = false;
  catalogMessage.hidden = true;
  retryCatalog.hidden = true;
  syncCatalog();
}

async function showCatalog() {
  catalogMessage.textContent = "Cargando catálogo…";
  retryCatalog.disabled = true;
  try {
    await loadCatalog();
  } catch {
    catalogMessage.textContent = "No se pudo cargar el catálogo.";
    retryCatalog.hidden = false;
  } finally {
    retryCatalog.disabled = false;
  }
}

retryCatalog.addEventListener("click", async () => {
  await showCatalog();
  if (retryCatalog.hidden) document.querySelector(".chip.on").focus();
});

PrintLab.mountSession();

const myRequestsSection = document.querySelector("#mis-solicitudes");
const myRequests = document.querySelector("#myRequests");
const requestStates = {
  pendiente: "Pendiente",
  cotizada: "Cotizada",
  imprimiendo: "Imprimiendo",
  lista: "Lista",
  en_proceso: "En proceso",
  completada: "Completada",
  rechazada: "Rechazada"
};

function isBuyer() {
  const current = PrintLab.session();
  return !!current && (current.role === "comprador" || current.role === "cliente");
}

async function loadMyRequests() {
  if (!myRequestsSection || !isBuyer()) {
    if (myRequestsSection) myRequestsSection.hidden = true;
    return;
  }
  myRequestsSection.hidden = false;
  const response = await fetch("/api/requests/mine", { cache: "no-store", credentials: "include" });
  const data = await response.json().catch(() => ({}));
  myRequests.replaceChildren();
  if (!response.ok) {
    const note = document.createElement("p");
    note.className = "form-note";
    note.textContent = response.status === 401
      ? "Entra de nuevo para ver tus solicitudes."
      : "No se pudieron cargar tus solicitudes.";
    myRequests.append(note);
    return;
  }
  const items = data.requests || [];
  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "form-note";
    empty.textContent = "Todavía no has enviado solicitudes.";
    myRequests.append(empty);
    return;
  }
  for (const item of items) {
    const row = document.createElement("article");
    row.className = "row";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.pieza;
    copy.append(title);
    const detail = [item.material, item.archivo].filter(Boolean).join(" · ");
    if (detail) {
      const meta = document.createElement("p");
      meta.textContent = detail;
      copy.append(meta);
    }
    const state = document.createElement("span");
    state.className = "request-state";
    const label = requestStates[item.estado] || item.estado;
    state.textContent = item.precio == null ? label : label + " · " + money.format(item.precio);
    row.append(copy, state);
    myRequests.append(row);
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function applyImage(shot, photo, artwork) {
  const source = photo || artwork?.source;
  let img = shot.querySelector("img");
  if (!source) {
    img?.remove();
    return;
  }

  if (!img) {
    img = document.createElement("img");
    img.alt = "";
    shot.prepend(img);
  }
  img.className = photo ? "photo" : "product-art";
  if (img.getAttribute("src") !== source) img.src = source;
}

function updateCard(card, product) {
  card.dataset.id = product.id;
  card.dataset.material = product.material;
  card.dataset.name = product.name;
  card.dataset.price = String(product.price);
  card.dataset.stock = String(product.stock);
  const tone = product.material === "ABS" ? "slate" : product.material === "PETG" ? "indigo" : "teal";
  const shot = card.querySelector(".shot");
  const original = catalogArtwork.get(product.name);
  const artwork = original?.material === product.material ? original : undefined;
  shot.className = artwork?.classes || ("shot " + tone);
  const badge = shot.querySelector("span");
  if (badge) badge.textContent = product.material;
  applyImage(shot, product.image, artwork);
  card.querySelector(".meta").textContent = product.category + " · " + product.time;
  card.querySelector("h3").textContent = product.name;
  card.querySelector(".card-body > p:not(.meta)").textContent = product.description;
  card.querySelector("strong").textContent = money.format(product.price);
}

function cardFrom(product) {
  const article = document.createElement("article");
  article.className = "card";
  const shot = document.createElement("div");
  shot.className = "shot";
  const badge = document.createElement("span");
  shot.append(badge);
  const body = document.createElement("div");
  body.className = "card-body";
  const meta = document.createElement("p");
  meta.className = "meta";
  const title = document.createElement("h3");
  const text = document.createElement("p");
  const footer = document.createElement("footer");
  const price = document.createElement("strong");
  const add = document.createElement("button");
  add.type = "button";
  add.className = "add";
  add.textContent = "Agregar";
  footer.append(price, add);
  body.append(meta, title, text, footer);
  article.append(shot, body);
  updateCard(article, product);
  return article;
}

function applyFilter() {
  let visible = 0;
  grid.querySelectorAll(".card").forEach((card) => {
    const show = filter === "todos" || card.dataset.material === filter;
    card.classList.toggle("hide", !show);
    if (show) visible += 1;
  });
  empty.hidden = grid.hidden || visible !== 0;
  empty.textContent = empty.hidden ? "" : filter === "todos"
    ? "No hay piezas disponibles en este momento."
    : "No hay piezas disponibles en " + filter + ".";
}

function syncCatalog() {
  const available = catalog.filter((product) => product.stock > 0);
  const ids = new Set(available.map((product) => product.id));
  grid.querySelectorAll(".card").forEach((card) => {
    if (!ids.has(card.dataset.id)) card.remove();
  });
  available.forEach((product) => {
    const card = Array.from(grid.querySelectorAll(".card")).find((item) => item.dataset.id === product.id);
    if (card) updateCard(card, product);
    else grid.append(cardFrom(product));
  });
  applyFilter();
}

window.addEventListener("scroll", () => {
  nav.classList.toggle("scrolled", window.scrollY > 8);
});

chips.forEach((chip) => {
  chip.addEventListener("click", () => {
    filter = chip.dataset.filter;
    chips.forEach((item) => {
      const active = item === chip;
      item.classList.toggle("on", active);
      item.setAttribute("aria-pressed", String(active));
    });
    applyFilter();
  });
});

grid.addEventListener("click", (event) => {
  const button = event.target.closest(".add");
  if (!button) return;
  const card = button.closest(".card");
  const product = catalog.find((item) => item.id === card.dataset.id);
  if (!product || product.stock < 1) {
    showToast("Esa pieza está agotada.");
    syncCatalog();
    return;
  }
  const line = cart.find((item) => item.id === product.id);
  const qty = line ? line.qty : 0;
  if (qty + 1 > product.stock) {
    showToast("No hay más stock de " + product.name);
    return;
  }
  if (line) line.qty += 1;
  else cart.push({ id: product.id, name: product.name, price: product.price, qty: 1 });
  cartNotice.textContent = "";
  renderCart();
  showToast(product.name + " entró al carrito");
});

function setCartOpen(open) {
  cartPanel.hidden = !open;
  cartBtn.setAttribute("aria-expanded", String(open));
  if (open) document.querySelector("#closeCart").focus();
  else cartBtn.focus();
}

cartBtn.addEventListener("click", () => setCartOpen(cartPanel.hidden));
document.querySelector("#closeCart").addEventListener("click", () => setCartOpen(false));
cartPanel.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setCartOpen(false);
});

function changeQuantity(item, delta) {
  const product = catalog.find((entry) => entry.id === item.id);
  if (delta > 0 && (!product || item.qty >= product.stock)) {
    cartNotice.textContent = "No hay más stock de " + item.name + ".";
    return;
  }
  item.qty += delta;
  if (item.qty === 0) cart.splice(cart.indexOf(item), 1);
  cartNotice.textContent = "";
  renderCart();
}

function quantityButton(item, text, label, delta) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ghost";
  button.textContent = text;
  button.setAttribute("aria-label", label + " " + item.name);
  button.addEventListener("click", () => changeQuantity(item, delta));
  return button;
}

function renderCart() {
  const focused = document.activeElement;
  cartCount.textContent = String(cart.reduce((sum, item) => sum + item.qty, 0));
  cartList.replaceChildren();
  for (const item of cart) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = item.qty + " × " + item.name;
    const price = document.createElement("strong");
    price.textContent = money.format(item.price * item.qty);
    const controls = document.createElement("div");
    controls.className = "cart-quantity";
    controls.append(quantityButton(item, "−", "Quitar una unidad de", -1));
    controls.append(quantityButton(item, "+", "Agregar una unidad de", 1));
    li.append(name, price, controls);
    cartList.append(li);
  }
  if (cart.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Todavía no hay piezas.";
    cartList.append(li);
  }
  cartTotal.textContent = money.format(cartAmount());
  checkout.disabled = cart.length === 0;
  if (focused.closest(".cart-quantity")) {
    const corresponding = [...cartList.querySelectorAll("button")]
      .find((button) => button.getAttribute("aria-label") === focused.getAttribute("aria-label"));
    (corresponding || document.querySelector("#closeCart")).focus();
  }
}

function cartAmount() {
  return cart.reduce((sum, { price, qty }) => sum + price * qty, 0);
}

function restoreCartAfterLogin() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(cartBeforeLogin) || "[]");
    sessionStorage.removeItem(cartBeforeLogin);
    for (const item of saved) {
      const product = catalog.find(({ id }) => id === item.id);
      if (!product || product.stock < 1 || !Number.isInteger(item.qty) || item.qty < 1) continue;
      cart.push({
        id: product.id, name: product.name, price: product.price, qty: Math.min(item.qty, product.stock)
      });
    }
    if (cart.length) {
      renderCart();
      setCartOpen(true);
    }
  } catch {
    // The cart still works when browser storage is unavailable.
  }
}

function showInvoice(invoice, method) {
  InvoiceView.render(invoiceDialog, invoice);
  document.querySelector("#invoicePayment").textContent = "Pago simulado con " + method + ".";
  document.querySelector("#printInvoice").href = "factura.html?id=" + encodeURIComponent(invoice.id);
  invoiceDialog.showModal();
}

async function refreshCart() {
  await loadCatalog();
  let changed = false;
  for (const item of cart.slice()) {
    const product = catalog.find((entry) => entry.id === item.id);
    if (!product || product.stock < 1) {
      cart.splice(cart.indexOf(item), 1);
      changed = true;
      continue;
    }

    const qty = Math.min(item.qty, product.stock);
    if (qty !== item.qty || product.price !== item.price || product.name !== item.name) {
      Object.assign(item, { qty, name: product.name, price: product.price });
      changed = true;
    }
  }
  return changed;
}

function renderPaymentSummary() {
  const list = document.querySelector("#paymentItems");
  list.replaceChildren();
  for (const { name, qty, price } of cart) {
    const row = document.createElement("li");
    const item = document.createElement("span");
    const subtotal = document.createElement("strong");
    item.textContent = qty + " × " + name;
    subtotal.textContent = money.format(price * qty);
    row.append(item, subtotal);
    list.append(row);
  }
  document.querySelector("#paymentTotal").textContent = money.format(cartAmount());
  updatePaymentMethod();
}

function selectedPaymentMethod() {
  return paymentForm.querySelector('input[name="method"]:checked')?.value;
}

function updatePaymentMethod() {
  const method = selectedPaymentMethod();
  let filled = false;
  for (const details of paymentDetails) {
    details.hidden = details.dataset.paymentDetails !== method;
    if (!details.hidden) {
      filled = [...details.querySelectorAll("[data-payment-field]")].every((field) => field.value);
    }
  }
  confirmPayment.disabled = paying || cart.length === 0 || !filled;
}

paymentMethods.addEventListener("change", updatePaymentMethod);

for (const details of paymentDetails) {
  details.querySelector("button").addEventListener("click", () => {
    const profile = demoPaymentProfiles[details.dataset.paymentDetails];
    for (const field of details.querySelectorAll("[data-payment-field]")) {
      field.value = profile[field.dataset.paymentField];
    }
    paymentNotice.textContent = "Se cargaron los datos guardados de la demostración.";
    updatePaymentMethod();
  });
}

function offerLogin() {
  const link = document.createElement("a");
  link.href = "acceso.html";
  link.textContent = "Inicia sesión como comprador para continuar.";
  link.addEventListener("click", () => {
    try {
      sessionStorage.setItem(cartBeforeLogin, JSON.stringify(cart.map(({ id, qty }) => ({ id, qty }))));
    } catch {
      // The login link remains usable without browser storage.
    }
  });
  paymentNotice.replaceChildren(link);
}

checkout.addEventListener("click", () => {
  if (cart.length === 0) return;
  paymentForm.reset();
  paymentNotice.textContent = "";
  renderPaymentSummary();
  payment.showModal();
});

backToCart.addEventListener("click", () => payment.close());
payment.addEventListener("cancel", (event) => {
  if (paying) event.preventDefault();
});

paymentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (confirmPayment.disabled) return;
  const method = selectedPaymentMethod();
  paying = true;
  paymentMethods.disabled = true;
  backToCart.disabled = true;
  confirmPayment.disabled = true;
  paymentNotice.textContent = "Verificando tu compra…";

  try {
    if (await refreshCart()) {
      paymentNotice.textContent = cart.length
        ? "El carrito cambió. Revisa el total antes de confirmar de nuevo."
        : "Las piezas ya no están disponibles. Vuelve al carrito para elegir otras.";
      return;
    }

    const response = await fetch("/api/invoices", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cart.map(({ id, qty }) => ({ id: Number(id), qty })) })
    });
    const data = await response.json();
    if (!response.ok) {
      if ([404, 409].includes(response.status)) await refreshCart().catch(() => {});
      if (response.status === 401) offerLogin();
      else paymentNotice.textContent = data.error || "No se pudo confirmar la compra.";
      return;
    }

    cart.length = 0;
    cartNotice.textContent = "";
    payment.close();
    setCartOpen(false);
    showInvoice(data.invoice, method);
    loadCatalog().catch(() => showToast("No se pudo actualizar el catálogo."));
  } catch {
    paymentNotice.textContent = "No se pudo confirmar la compra. Revisa tu conexión.";
  } finally {
    paying = false;
    paymentMethods.disabled = false;
    backToCart.disabled = false;
    renderCart();
    if (payment.open) renderPaymentSummary();
  }
});

document.querySelector("#requestForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const pieza = String(data.get("pieza")).trim();
  const material = data.get("material");
  const archivo = data.get("referencia");
  let response;
  try {
    response = await fetch("/api/requests", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pieza,
        material,
        descripcion: String(data.get("descripcion")).trim(),
        archivo: archivo && archivo.name ? archivo.name : ""
      })
    });
  } catch (err) {
    showToast("No se pudo contactar al servidor.");
    return;
  }
  const saved = await response.json().catch(() => ({}));
  if (response.status === 401) {
    showToast("Entra para enviar la solicitud.");
    return;
  }
  if (!response.ok) {
    showToast(saved.error || "No se pudo registrar la solicitud.");
    return;
  }
  document.querySelector("#thanksTitle").textContent = pieza;
  document.querySelector("#thanksText").textContent =
    "La solicitud quedó registrada con filamento " + material + ". Un impresor la revisa antes de cotizar.";
  document.querySelector("#formFields").hidden = true;
  document.querySelector("#thanks").hidden = false;
  loadMyRequests().catch(() => {});
});

document.querySelector("#again").addEventListener("click", () => {
  document.querySelector("#requestForm").reset();
  fileName.textContent = "Ningún archivo elegido";
  document.querySelector("#thanks").hidden = true;
  document.querySelector("#formFields").hidden = false;
});

document.querySelector('input[name="referencia"]').addEventListener("change", (event) => {
  const file = event.target.files[0];
  fileName.textContent = file ? file.name : "Ningún archivo elegido";
});

showCatalog();
loadMyRequests().catch(() => {});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (!grid.hidden) loadCatalog().catch(() => showToast("No se pudo actualizar el catálogo."));
  if (myRequestsSection && !myRequestsSection.hidden) loadMyRequests().catch(() => {});
});
renderCart();
