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
  if (focused.closest(".cart-quantity")) {
    const corresponding = [...cartList.querySelectorAll("button")]
      .find((button) => button.getAttribute("aria-label") === focused.getAttribute("aria-label"));
    (corresponding || document.querySelector("#closeCart")).focus();
  }
}

function showInvoice(invoice) {
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
  invoiceDialog.showModal();
}

document.querySelector("#printInvoice").addEventListener("click", () => window.print());

async function refreshCart() {
  await loadCatalog();
  for (const item of cart.slice()) {
    const product = catalog.find((entry) => entry.id === item.id);
    if (!product || product.stock === 0) cart.splice(cart.indexOf(item), 1);
    else Object.assign(item, { qty: Math.min(item.qty, product.stock), name: product.name, price: product.price });
  }
}

checkout.addEventListener("click", async () => {
  if (cart.length === 0 || checkout.disabled) return;
  checkout.disabled = true;
  cartList.querySelectorAll("button").forEach((button) => { button.disabled = true; });
  cartPanel.setAttribute("aria-busy", "true");
  cartNotice.textContent = "Generando factura…";

  try {
    const response = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cart.map(({ id, qty }) => ({ id: Number(id), qty })) })
    });
    const data = await response.json();
    if (!response.ok) {
      if ([404, 409].includes(response.status)) await refreshCart().catch(() => {});
      if (response.status === 401) {
        const link = document.createElement("a");
        link.href = "acceso.html";
        link.textContent = "Inicia sesión para generar tu factura.";
        cartNotice.replaceChildren(link);
      } else {
        cartNotice.textContent = data.error || "No se pudo generar la factura.";
      }
      return;
    }

    cart.length = 0;
    cartNotice.textContent = "";
    setCartOpen(false);
    showInvoice(data.invoice);
    loadCatalog().catch(() => showToast("No se pudo actualizar el catálogo."));
  } catch {
    cartNotice.textContent = "No se pudo confirmar la compra. Revisa tu conexión.";
  } finally {
    cartPanel.setAttribute("aria-busy", "false");
    renderCart();
  }
});

const authRequestDialog = document.querySelector("#authRequestDialog");
const closeAuthDialog = document.querySelector("#closeAuthDialog");
if (closeAuthDialog) closeAuthDialog.addEventListener("click", () => authRequestDialog.close());

// Bloquear cualquier campo del formulario si el usuario no tiene sesión
const requestFormFields = document.querySelectorAll("#requestForm input, #requestForm textarea, #requestForm select, #requestForm button[type='submit']");
requestFormFields.forEach(field => {
  field.addEventListener("focus", interceptIfGuest, true);
  field.addEventListener("mousedown", interceptIfGuest, true);
});

function interceptIfGuest(event) {
  if (!PrintLab.session()) {
    event.preventDefault();
    event.stopPropagation();
    authRequestDialog.showModal();
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
  imprimiendo: "Imprimiendo",
  lista: "Lista",
  rechazada: "Rechazada"
};

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
  if (!current) {
    myRequestsSection.hidden = true;
    return;
  }

  try {
    const response = await fetch("/api/requests", {
      credentials: "include",
      cache: "no-store"
    });
    if (response.status === 401) {
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

      if (request.sellerNote || request.notifiedAt) {
        const reply = document.createElement("div");
        reply.className = "seller-reply";
        const heading = document.createElement("strong");
        const updatedLabel = request.notifiedAt
          ? " · " + new Date(request.notifiedAt).toLocaleString("es-SV")
          : "";
        heading.textContent = `Actualización del taller (${requestStatusLabels[request.status] || request.status})${updatedLabel}`;
        const body = document.createElement("p");
        body.textContent = request.sellerNote || `Tu solicitud cambió a estado "${requestStatusLabels[request.status] || request.status}".`;
        reply.append(heading, body);
        card.append(reply);
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

document.querySelector("#requestForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const current = PrintLab.session();
  if (!current) {
    authRequestDialog.showModal();
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
      authRequestDialog.showModal();
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

document.querySelector("#again").addEventListener("click", () => {
  document.querySelector("#requestForm").reset();
  if (requestNotice) requestNotice.textContent = "";
  fileName.textContent = "Ningún archivo elegido";
  document.querySelector("#thanks").hidden = true;
  document.querySelector("#formFields").hidden = false;
});

document.querySelector('input[name="referencia"]').addEventListener("change", (event) => {
  const file = event.target.files[0];
  fileName.textContent = file ? file.name : "Ningún archivo elegido";
});

showCatalog();
loadMyRequests();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !grid.hidden) {
    loadCatalog().catch(() => showToast("No se pudo actualizar el catálogo."));
    loadMyRequests();
  }
});
renderCart();
