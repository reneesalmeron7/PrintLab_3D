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
const invoiceDialog = document.querySelector("#invoice");
const money = new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD" });
const fileName = document.querySelector("#fileName");
const carouselPrev = document.querySelector("#carouselPrev");
const carouselNext = document.querySelector("#carouselNext");
const catalogSearch = document.querySelector("#catalogSearch");
const categoryFilter = document.querySelector("#categoryFilter");

const DEFAULT_ARTWORK = [
  ["Llavero geométrico", { material: "PLA", source: "assets/productos/llavero-geometrico.png", classes: "shot teal" }],
  ["Engranaje de repuesto", { material: "PETG", source: "assets/productos/engranaje.png", classes: "shot indigo" }],
  ["Soporte de celular", { material: "PLA", source: "assets/productos/soporte-celular.png", classes: "shot sand" }],
  ["Mini figura articulada", { material: "PLA", source: "assets/productos/figura-articulada.png", classes: "shot coral" }],
  ["Carcasa de prototipo", { material: "ABS", source: "assets/productos/carcasa.png", classes: "shot slate" }],
  ["Maceta hexagonal", { material: "PETG", source: "assets/productos/maceta-hexagonal.png", classes: "shot leaf" }]
];

const catalogArtwork = new Map(DEFAULT_ARTWORK);
[...grid.querySelectorAll(".card")].forEach((card) => {
  const shot = card.querySelector(".shot");
  const art = shot?.querySelector(".product-art");
  if (art) {
    catalogArtwork.set(card.dataset.name, {
      material: card.dataset.material,
      source: art.getAttribute("src"),
      classes: shot.className
    });
  }
});

const CART_KEY = "pl-cart";
function loadSavedCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function saveCart() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {}
}

const cart = loadSavedCart();
const payment = document.querySelector("#payment");
const paymentForm = document.querySelector("#paymentForm");
const paymentMethods = document.querySelector("#paymentMethods");
const paymentDetails = paymentMethods ? paymentMethods.querySelectorAll("[data-payment-details]") : [];
const paymentNotice = document.querySelector("#paymentNotice");
const confirmPayment = document.querySelector("#confirmPayment");
const backToCart = document.querySelector("#backToCart");
const demoPaymentProfiles = {
  tarjeta: { titular: "Cliente Demo", vencimiento: "12/30", numero: "•••• •••• •••• 4242" },
  transferencia: { banco: "Banco Demo", beneficiario: "PrintLab 3D", cuenta: "•••• •••• 5678" }
};
let paying = false;
let catalog = [];
let filter = "todos";
let selectedCategory = "todas";
let searchQuery = "";

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
  grid.hidden = false;
  catalogMessage.hidden = true;
  retryCatalog.hidden = true;
  syncCatalog();
  reconcileCartWithCatalog();
}

function reconcileCartWithCatalog() {
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
  if (changed) renderCart();
  return changed;
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

function isStaffSession() {
  const current = PrintLab.session();
  return Boolean(current && (current.role === "vendedor" || current.role === "admin"));
}

function applyRoleVisibility() {
  const staff = isStaffSession();
  document.body.classList.toggle("role-staff", staff);
  if (staff) {
    if (cartPanel) cartPanel.hidden = true;
    const reqSec = document.querySelector("#myRequestsSection");
    if (reqSec) reqSec.hidden = true;
  }
}

PrintLab.mountSession();
applyRoleVisibility();

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
  card.dataset.category = product.category || "";
  card.dataset.name = product.name;
  card.dataset.description = product.description || "";
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

function populateCategories() {
  if (!categoryFilter) return;
  const previous = categoryFilter.value || "todas";
  const categories = [...new Set(catalog.map((p) => p.category).filter(Boolean))].sort();
  categoryFilter.replaceChildren();
  const allOpt = document.createElement("option");
  allOpt.value = "todas";
  allOpt.textContent = "Todas las categorías";
  categoryFilter.append(allOpt);
  categories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    categoryFilter.append(opt);
  });
  categoryFilter.value = categories.includes(previous) ? previous : "todas";
  selectedCategory = categoryFilter.value;
}

function updateCarouselButtons() {
  if (!carouselPrev || !carouselNext) return;
  const hideArrows = grid.hidden || grid.scrollWidth <= grid.clientWidth + 4;
  carouselPrev.hidden = hideArrows;
  carouselNext.hidden = hideArrows;
}

function applyFilter() {
  let visible = 0;
  const query = searchQuery.trim().toLowerCase();
  grid.querySelectorAll(".card").forEach((card) => {
    const matchMat = filter === "todos" || card.dataset.material === filter;
    const matchCat = selectedCategory === "todas" || (card.dataset.category || "") === selectedCategory;
    const haystack = `${card.dataset.name || ""} ${card.dataset.description || ""} ${card.dataset.category || ""}`.toLowerCase();
    const matchQuery = !query || haystack.includes(query);
    const show = matchMat && matchCat && matchQuery;
    card.classList.toggle("hide", !show);
    if (show) visible += 1;
  });
  empty.hidden = grid.hidden || visible !== 0;
  empty.textContent = empty.hidden ? "" : (query || selectedCategory !== "todas")
    ? "No encontramos piezas con esos filtros."
    : filter === "todos"
      ? "No hay piezas disponibles en este momento."
      : "No hay piezas disponibles en " + filter + ".";
  if (grid.classList.contains("carousel-track")) {
    grid.scrollLeft = 0;
    requestAnimationFrame(updateCarouselButtons);
  }
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
  populateCategories();
  applyFilter();
}

if (carouselPrev && carouselNext) {
  function scrollCarousel(direction) {
    const card = grid.querySelector(".card:not(.hide)");
    const step = card ? (card.getBoundingClientRect().width + 18) : 320;
    const maxScroll = Math.max(0, grid.scrollWidth - grid.clientWidth);
    if (direction > 0 && grid.scrollLeft >= maxScroll - 8) {
      grid.scrollTo({ left: 0, behavior: "smooth" });
    } else if (direction < 0 && grid.scrollLeft <= 8) {
      grid.scrollTo({ left: maxScroll, behavior: "smooth" });
    } else {
      grid.scrollBy({ left: direction * step, behavior: "smooth" });
    }
  }
  carouselPrev.addEventListener("click", () => scrollCarousel(-1));
  carouselNext.addEventListener("click", () => scrollCarousel(1));
  window.addEventListener("resize", updateCarouselButtons);
}

if (catalogSearch) {
  catalogSearch.addEventListener("input", () => {
    searchQuery = catalogSearch.value;
    applyFilter();
  });
}

if (categoryFilter) {
  categoryFilter.addEventListener("change", () => {
    selectedCategory = categoryFilter.value;
    applyFilter();
  });
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
  if (isStaffSession()) return;
  const button = event.target.closest(".add");
  if (!button || cartPanel.getAttribute("aria-busy") === "true") return;
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
  saveCart();
  const focused = document.activeElement;
  cartCount.textContent = String(cart.reduce((sum, item) => sum + item.qty, 0));
  cartList.replaceChildren();
  let total = 0;
  for (const item of cart) {
    total += item.price * item.qty;
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
  cartTotal.textContent = money.format(total);
  checkout.disabled = cart.length === 0;
  if (focused && focused.closest && focused.closest(".cart-quantity")) {
    const corresponding = [...cartList.querySelectorAll("button")]
      .find((button) => button.getAttribute("aria-label") === focused.getAttribute("aria-label"));
    (corresponding || document.querySelector("#closeCart")).focus();
  }
}

function cartAmount() {
  return cart.reduce((sum, { price, qty }) => sum + price * qty, 0);
}

function showInvoice(invoice, method) {
  if (typeof InvoiceView !== "undefined" && InvoiceView.render) {
    InvoiceView.render(invoiceDialog, invoice);
  } else {
    document.querySelector("#invoiceTitle").textContent = "Factura #" + invoice.id;
    document.querySelector("#invoiceDetails").textContent =
      invoice.buyer + " · " + new Date(invoice.createdAt).toLocaleString("es-SV");
    const body = document.querySelector("#invoiceItems");
    body.replaceChildren();
    for (const item of invoice.items) {
      const row = body.insertRow();
      for (const value of [item.name, item.qty, money.format(item.price), money.format(item.price * item.qty)]) {
        row.insertCell().textContent = value;
      }
    }
    document.querySelector("#invoiceTotal").textContent = money.format(invoice.total);
  }
  const invoicePayment = document.querySelector("#invoicePayment");
  if (invoicePayment) {
    invoicePayment.textContent = method ? ("Pago simulado con " + method + ".") : "";
  }
  const printLink = document.querySelector("#printInvoice");
  if (printLink && printLink.tagName === "A") {
    printLink.href = "factura.html?id=" + encodeURIComponent(invoice.id);
  }
  invoiceDialog.showModal();
}

async function refreshCart() {
  const snapshot = cart.map((i) => ({ ...i }));
  await loadCatalog();
  if (cart.length !== snapshot.length) return true;
  return cart.some((item, idx) =>
    item.id !== snapshot[idx].id || item.qty !== snapshot[idx].qty || item.price !== snapshot[idx].price
  );
}

function renderPaymentSummary() {
  const list = document.querySelector("#paymentItems");
  if (!list) return;
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
  const paymentTotal = document.querySelector("#paymentTotal");
  if (paymentTotal) paymentTotal.textContent = money.format(cartAmount());
  updatePaymentMethod();
}

function selectedPaymentMethod() {
  return paymentForm ? paymentForm.querySelector('input[name="method"]:checked')?.value : "";
}

function updatePaymentMethod() {
  if (!confirmPayment) return;
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

if (paymentMethods) {
  paymentMethods.addEventListener("change", updatePaymentMethod);
}

for (const details of paymentDetails) {
  const fillBtn = details.querySelector("button");
  if (fillBtn) {
    fillBtn.addEventListener("click", () => {
      const profile = demoPaymentProfiles[details.dataset.paymentDetails];
      if (!profile) return;
      for (const field of details.querySelectorAll("[data-payment-field]")) {
        field.value = profile[field.dataset.paymentField] || "";
      }
      if (paymentNotice) paymentNotice.textContent = "Se cargaron los datos guardados de la demostración.";
      updatePaymentMethod();
    });
  }
}

function offerLogin(target) {
  const link = document.createElement("a");
  link.href = "acceso.html";
  link.textContent = "Inicia sesión como comprador para continuar.";
  (target || paymentNotice || cartNotice).replaceChildren(link);
}

checkout.addEventListener("click", () => {
  if (cart.length === 0 || checkout.disabled) return;
  if (payment && paymentForm) {
    paymentForm.reset();
    if (paymentNotice) paymentNotice.textContent = "";
    renderPaymentSummary();
    payment.showModal();
  }
});

if (backToCart && payment) {
  backToCart.addEventListener("click", () => payment.close());
  payment.addEventListener("cancel", (event) => {
    if (paying) event.preventDefault();
  });
}

if (paymentForm) {
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
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if ([404, 409].includes(response.status)) await refreshCart().catch(() => {});
        if (response.status === 401) {
          PrintLab.clearSession();
          PrintLab.mountSession();
applyRoleVisibility();
          offerLogin(paymentNotice);
        } else if (response.status === 403) {
          paymentNotice.textContent = "Solo las cuentas con rol comprador pueden realizar compras.";
        } else {
          paymentNotice.textContent = data.error || "No se pudo confirmar la compra.";
        }
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
}

const authRequestDialog = document.querySelector("#authRequestDialog");
const closeAuthDialog = document.querySelector("#closeAuthDialog");
const requestForm = document.querySelector("#requestForm");

function openAuthRequestDialog() {
  if (!authRequestDialog) return;
  if (!authRequestDialog.open) {
    authRequestDialog.showModal();
  }
}

if (closeAuthDialog) {
  closeAuthDialog.addEventListener("click", () => {
    if (authRequestDialog && authRequestDialog.open) authRequestDialog.close();
  });
}

if (authRequestDialog) {
  authRequestDialog.addEventListener("click", (event) => {
    if (event.target === authRequestDialog && authRequestDialog.open) {
      authRequestDialog.close();
    }
  });
}

// Bloquear cualquier campo, etiqueta o botón del formulario si el usuario no tiene sesión
function interceptIfGuest(event) {
  if (PrintLab.session()) return;
  if (event.type === "keydown" && (event.key === "Tab" || event.key === "Escape")) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.target && typeof event.target.blur === "function") {
    event.target.blur();
  }
  openAuthRequestDialog();
}

if (requestForm) {
  ["pointerdown", "mousedown", "click", "focusin", "keydown"].forEach((evt) => {
    requestForm.addEventListener(evt, interceptIfGuest, true);
  });
}

async function syncServerSession() {
  try {
    const response = await fetch("/api/auth/me", {
      credentials: "include",
      cache: "no-store"
    });
    if (response.ok) {
      const data = await response.json().catch(() => null);
      if (data && data.user) {
        PrintLab.saveSession(data.user);
        PrintLab.mountSession();
applyRoleVisibility();
        loadMyRequests();
        return;
      }
    }
    if (response.status === 401) {
      PrintLab.clearSession();
      PrintLab.mountSession();
applyRoleVisibility();
      if (myRequestsSection) myRequestsSection.hidden = true;
    }
  } catch {
    // Si no hay conexión, mantener estado actual
  }
}

const requestNotice = document.querySelector("#requestNotice");
const requestSubmit = document.querySelector("#requestSubmit");
const myRequestsSection = document.querySelector("#myRequestsSection");
const myRequestsList = document.querySelector("#myRequestsList");
const refreshMyRequests = document.querySelector("#refreshMyRequests");

const requestStatusLabels = {
  pendiente: "Pendiente",
  cotizada: "Cotizada",
  en_cola: "En cola de pedidos",
  imprimiendo: "Imprimiendo",
  lista: "Lista",
  cancelada: "Cancelada",
  rechazada: "Rechazada"
};

const confirmActionDialog = document.querySelector("#confirmActionDialog");
const confirmActionTitle = document.querySelector("#confirmActionTitle");
const confirmActionText = document.querySelector("#confirmActionText");
const cancelConfirmAction = document.querySelector("#cancelConfirmAction");
const okConfirmAction = document.querySelector("#okConfirmAction");

function askConfirmAction({ title, message, confirmLabel }) {
  if (!confirmActionDialog) {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    confirmActionTitle.textContent = title;
    confirmActionText.textContent = message;
    okConfirmAction.textContent = confirmLabel || "Confirmar";

    function cleanup(result) {
      okConfirmAction.removeEventListener("click", onOk);
      cancelConfirmAction.removeEventListener("click", onCancel);
      confirmActionDialog.removeEventListener("cancel", onCancel);
      if (confirmActionDialog.open) confirmActionDialog.close();
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }

    okConfirmAction.addEventListener("click", onOk);
    cancelConfirmAction.addEventListener("click", onCancel);
    confirmActionDialog.addEventListener("cancel", onCancel);
    confirmActionDialog.showModal();
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

async function loadMyRequests() {
  if (!myRequestsSection || !myRequestsList) return;
  const current = PrintLab.session();
  if (!current || isStaffSession()) {
    myRequestsSection.hidden = true;
    return;
  }

  try {
    const response = await fetch("/api/requests", {
      credentials: "include",
      cache: "no-store"
    });
    if (response.status === 401) {
      PrintLab.clearSession();
      PrintLab.mountSession();
applyRoleVisibility();
      myRequestsSection.hidden = true;
      return;
    }
    if (!response.ok) throw new Error();
    const data = await response.json();
    const mine = (data.requests || []).filter((item) => item.username === current.username);

    myRequestsSection.hidden = false;
    myRequestsList.replaceChildren();

    if (mine.length === 0) {
      const emptyNote = document.createElement("p");
      emptyNote.className = "form-note";
      emptyNote.textContent = "Todavía no has enviado solicitudes personalizadas.";
      myRequestsList.append(emptyNote);
      return;
    }

    mine.forEach((request) => {
      const card = document.createElement("article");
      card.className = "request-card";

      const head = document.createElement("div");
      head.className = "request-card-head";
      const title = document.createElement("strong");
      title.textContent = `#${request.id} · ${request.piece}`;
      const badge = document.createElement("span");
      badge.className = `status-badge status-${request.status}`;
      badge.textContent = requestStatusLabels[request.status] || request.status;
      head.append(title, badge);

      const meta = document.createElement("div");
      meta.className = "request-meta";
      const userPill = document.createElement("span");
      userPill.className = "user-pill";
      userPill.textContent = "Usuario: @" + request.username;
      const mat = document.createElement("span");
      mat.textContent = "Material: " + request.material;
      meta.append(userPill, mat);
      if (request.createdAt) {
        const when = document.createElement("span");
        when.textContent = "Enviada: " + new Date(request.createdAt).toLocaleString("es-SV");
        meta.append(when);
      }

      const desc = document.createElement("p");
      desc.className = "request-desc";
      desc.textContent = request.description;

      card.append(head, meta, desc);

      if (request.fileName) {
        const fileWrap = document.createElement("div");
        fileWrap.className = "request-file";
        if (request.hasFile) {
          const link = document.createElement("a");
          link.className = "ghost file-download";
          link.href = `/api/requests/${request.id}/file`;
          link.setAttribute("download", request.fileName);
          link.textContent = "⬇ Descargar archivo: " + request.fileName;
          fileWrap.append(link);
        } else {
          const muted = document.createElement("span");
          muted.className = "request-file-muted";
          muted.textContent = "Archivo: " + request.fileName;
          fileWrap.append(muted);
        }
        card.append(fileWrap);
      }

      if (request.quotePrice !== null || request.sellerNote || request.notifiedAt) {
        const reply = document.createElement("div");
        reply.className = "seller-reply";
        const heading = document.createElement("strong");
        const updatedLabel = request.notifiedAt
          ? " · " + new Date(request.notifiedAt).toLocaleString("es-SV")
          : "";
        heading.textContent = `Actualización del taller (${requestStatusLabels[request.status] || request.status})${updatedLabel}`;
        reply.append(heading);
        if (request.quotePrice !== null) {
          const priceLine = document.createElement("p");
          priceLine.style.fontWeight = "800";
          priceLine.textContent = "Precio cotizado: " + money.format(request.quotePrice);
          reply.append(priceLine);
        }
        if (request.sellerNote) {
          const body = document.createElement("p");
          body.textContent = request.sellerNote;
          reply.append(body);
        } else if (request.status === "en_cola") {
          const body = document.createElement("p");
          body.textContent = "✓ Cotización aceptada. Tu pedido ya está en cola de pedidos y pronto pasará a impresión.";
          reply.append(body);
        } else if (request.status === "cancelada") {
          const body = document.createElement("p");
          body.textContent = "Cancelaste esta solicitud.";
          reply.append(body);
        } else if (request.quotePrice === null) {
          const body = document.createElement("p");
          body.textContent = `Tu solicitud cambió a estado "${requestStatusLabels[request.status] || request.status}".`;
          reply.append(body);
        }
        card.append(reply);
      }

      // Acciones del cliente: aceptar cotización y/o cancelar solicitud
      if (request.status === "pendiente" || request.status === "cotizada") {
        const actionsWrap = document.createElement("div");
        actionsWrap.className = "client-actions";
        const actionNote = document.createElement("p");
        actionNote.className = "request-saved-note error";
        actionNote.setAttribute("role", "status");

        async function sendClientAction(action, triggerBtn, loadingLabel) {
          actionNote.textContent = "";
          const buttons = actionsWrap.querySelectorAll("button");
          buttons.forEach((b) => { b.disabled = true; });
          const originalText = triggerBtn.textContent;
          triggerBtn.textContent = loadingLabel;
          try {
            const res = await fetch(`/api/requests/${request.id}/respond`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              actionNote.textContent = data.error || "No se pudo completar la acción.";
              buttons.forEach((b) => { b.disabled = false; });
              triggerBtn.textContent = originalText;
              return;
            }
            actionsWrap.remove();
            showToast(action === "accept" ? "Cotización aceptada · En cola de pedidos" : "Solicitud cancelada");
            await loadMyRequests();
          } catch {
            actionNote.textContent = "No se pudo conectar con el servidor.";
            buttons.forEach((b) => { b.disabled = false; });
            triggerBtn.textContent = originalText;
          }
        }

        if (request.status === "cotizada") {
          const acceptBtn = document.createElement("button");
          acceptBtn.type = "button";
          acceptBtn.className = "solid";
          acceptBtn.textContent = request.quotePrice !== null
            ? `Aceptar cotización (${money.format(request.quotePrice)})`
            : "Aceptar cotización";
          acceptBtn.addEventListener("click", async () => {
            const priceText = request.quotePrice !== null ? ` de ${money.format(request.quotePrice)}` : "";
            const confirmed = await askConfirmAction({
              title: "Confirmar aceptación",
              message: `¿Confirmas aceptar la cotización${priceText} para "${request.piece}"? Tu pedido pasará a cola de pedidos y el taller podrá iniciar la impresión.`,
              confirmLabel: "Sí, aceptar cotización"
            });
            if (!confirmed) return;
            sendClientAction("accept", acceptBtn, "Aceptando…");
          });
          actionsWrap.append(acceptBtn);
        }

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "cancel-text-btn";
        cancelBtn.textContent = "Cancelar solicitud";
        cancelBtn.addEventListener("click", async () => {
          const confirmed = await askConfirmAction({
            title: "Cancelar solicitud",
            message: `¿Seguro que deseas cancelar la solicitud "${request.piece}"? Esta acción no se puede deshacer.`,
            confirmLabel: "Sí, cancelar solicitud"
          });
          if (!confirmed) return;
          sendClientAction("cancel", cancelBtn, "Cancelando…");
        });
        actionsWrap.append(cancelBtn);

        card.append(actionsWrap, actionNote);
      }

      const history = Array.isArray(request.history) ? request.history : [];
      const previousEntries = history.slice(1);
      if (previousEntries.length > 0) {
        const historyBlock = document.createElement("div");
        historyBlock.className = "history-block";

        const historyToggle = document.createElement("button");
        historyToggle.type = "button";
        historyToggle.className = "history-toggle";
        historyToggle.setAttribute("aria-expanded", "false");
        historyToggle.textContent = `▸ Historial del pedido (${previousEntries.length})`;

        const historyList = document.createElement("ul");
        historyList.className = "history-list";
        historyList.hidden = true;

        previousEntries.forEach((entry) => {
          const li = document.createElement("li");
          li.className = "history-item";
          const line = document.createElement("div");
          line.className = "history-item-head";

          const st = document.createElement("span");
          st.className = `status-badge status-${entry.status}`;
          st.textContent = requestStatusLabels[entry.status] || entry.status;
          line.append(st);

          if (entry.quotePrice !== null) {
            const pr = document.createElement("strong");
            pr.textContent = money.format(entry.quotePrice);
            line.append(pr);
          }

          const info = document.createElement("span");
          info.className = "history-item-meta";
          info.textContent = new Date(entry.createdAt).toLocaleString("es-SV");
          line.append(info);
          li.append(line);

          if (entry.comment) {
            const c = document.createElement("p");
            c.className = "history-item-comment";
            c.textContent = entry.comment;
            li.append(c);
          }
          historyList.append(li);
        });

        historyToggle.addEventListener("click", () => {
          const opening = historyList.hidden;
          historyList.hidden = !opening;
          historyToggle.setAttribute("aria-expanded", String(opening));
          historyToggle.textContent = `${opening ? "▾" : "▸"} Historial del pedido (${previousEntries.length})`;
        });

        historyBlock.append(historyToggle, historyList);
        card.append(historyBlock);
      }

      myRequestsList.append(card);
    });
  } catch {
    myRequestsSection.hidden = false;
    myRequestsList.replaceChildren();
    const err = document.createElement("p");
    err.className = "form-note";
    err.textContent = "No se pudieron cargar tus solicitudes.";
    myRequestsList.append(err);
  }
}

if (refreshMyRequests) {
  refreshMyRequests.addEventListener("click", () => loadMyRequests());
}

if (requestForm) {
  requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const current = PrintLab.session();
    if (!current) {
      openAuthRequestDialog();
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);
    const piece = String(data.get("pieza") || "").trim();
    const material = String(data.get("material") || "").trim();
    const description = String(data.get("descripcion") || "").trim();
    const fileInput = form.querySelector('input[name="referencia"]');
    const selectedFile = fileInput && fileInput.files ? fileInput.files[0] : null;

    if (requestNotice) requestNotice.textContent = "";

    let filePayload = null;
    if (selectedFile) {
      if (selectedFile.size > 10 * 1024 * 1024) {
        if (requestNotice) requestNotice.textContent = "El archivo supera el límite máximo de 10 MB.";
        return;
      }
      try {
        const encoded = await readFileAsDataUrl(selectedFile);
        filePayload = { name: selectedFile.name, data: encoded };
      } catch {
        if (requestNotice) requestNotice.textContent = "No se pudo leer el archivo seleccionado.";
        return;
      }
    }

    if (requestSubmit) {
      requestSubmit.disabled = true;
      requestSubmit.textContent = "Enviando…";
    }

    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          piece,
          material,
          description,
          file: filePayload
        })
      });
      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        PrintLab.clearSession();
        PrintLab.mountSession();
applyRoleVisibility();
        openAuthRequestDialog();
        return;
      }
      if (!response.ok) {
        if (requestNotice) requestNotice.textContent = result.error || "No se pudo enviar la solicitud.";
        return;
      }

      document.querySelector("#thanksTitle").textContent = piece;
      document.querySelector("#thanksText").textContent =
        "La solicitud quedó registrada con filamento " + material + ". Un impresor la revisa antes de cotizar.";
      document.querySelector("#formFields").hidden = true;
      document.querySelector("#thanks").hidden = false;
      loadMyRequests();
    } catch {
      if (requestNotice) requestNotice.textContent = "No se pudo conectar con el servidor.";
    } finally {
      if (requestSubmit) {
        requestSubmit.disabled = false;
        requestSubmit.textContent = "Enviar solicitud";
      }
    }
  });
}

const againBtn = document.querySelector("#again");
const fileDrop = document.querySelector("#fileDrop");

function updateFileDropUI(file) {
  if (!fileName) return;
  if (!file) {
    fileName.textContent = "Ningún archivo elegido";
    if (fileDrop) fileDrop.classList.remove("has-file");
    return;
  }
  const mb = file.size >= 1024 * 1024
    ? (file.size / (1024 * 1024)).toFixed(1) + " MB"
    : Math.max(1, Math.round(file.size / 1024)) + " KB";
  fileName.textContent = `✓ ${file.name} (${mb})`;
  if (fileDrop) fileDrop.classList.add("has-file");
}

if (againBtn && requestForm) {
  againBtn.addEventListener("click", () => {
    requestForm.reset();
    if (requestNotice) requestNotice.textContent = "";
    updateFileDropUI(null);
    document.querySelector("#thanks").hidden = true;
    document.querySelector("#formFields").hidden = false;
  });
}

const refFileInput = document.querySelector('input[name="referencia"]');
if (refFileInput) {
  refFileInput.addEventListener("change", (event) => {
    updateFileDropUI(event.target.files[0] || null);
  });
}

if (fileDrop && refFileInput) {
  ["dragenter", "dragover"].forEach((evt) => {
    fileDrop.addEventListener(evt, (event) => {
      event.preventDefault();
      if (!PrintLab.session()) return;
      fileDrop.classList.add("dragging");
    });
  });
  ["dragleave", "dragend", "drop"].forEach((evt) => {
    fileDrop.addEventListener(evt, () => fileDrop.classList.remove("dragging"));
  });
  fileDrop.addEventListener("drop", (event) => {
    event.preventDefault();
    if (!PrintLab.session()) {
      openAuthRequestDialog();
      return;
    }
    const dropped = event.dataTransfer?.files?.[0];
    if (!dropped) return;
    try {
      const dt = new DataTransfer();
      dt.items.add(dropped);
      refFileInput.files = dt.files;
    } catch {}
    updateFileDropUI(dropped);
  });
}

showCatalog();
syncServerSession();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !grid.hidden) {
    loadCatalog().catch(() => showToast("No se pudo actualizar el catálogo."));
    syncServerSession();
  }
});
renderCart();
