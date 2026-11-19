const menuBtn = document.querySelector("#menuBtn");
const menu = document.querySelector("#menu");
const nav = document.querySelector("#nav");
const grid = document.querySelector("#grid");
const empty = document.querySelector("#empty");
const toast = document.querySelector("#toast");
const cartCount = document.querySelector("#cartCount");
const cartList = document.querySelector("#cartList");
const cartTotal = document.querySelector("#cartTotal");
const cartPanel = document.querySelector("#cartPanel");
const fileName = document.querySelector("#fileName");

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
  const data = await response.json();
  if (token !== catalogToken) return;
  catalog = (data.products || []).map(asProduct);
  syncCatalog();
}

PrintLab.mountSession();

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function applyImage(shot, image) {
  let img = shot.querySelector("img.photo");
  if (!image) {
    if (img) img.remove();
    return;
  }
  if (!img) {
    img = document.createElement("img");
    img.className = "photo";
    img.alt = "";
    shot.prepend(img);
  }
  img.src = image;
}

function updateCard(card, product) {
  card.dataset.id = product.id;
  card.dataset.material = product.material;
  card.dataset.name = product.name;
  card.dataset.price = String(product.price);
  card.dataset.stock = String(product.stock);
  const tone = product.material === "ABS" ? "slate" : product.material === "PETG" ? "indigo" : "teal";
  const shot = card.querySelector(".shot");
  shot.className = "shot " + tone;
  const badge = shot.querySelector("span");
  if (badge) badge.textContent = product.material;
  applyImage(shot, product.image);
  card.querySelector(".meta").textContent = product.category + " · " + product.time;
  card.querySelector("h3").textContent = product.name;
  card.querySelector(".card-body > p:not(.meta)").textContent = product.description;
  card.querySelector("strong").textContent = "$" + product.price;
}

function cardFrom(product) {
  const article = document.createElement("article");
  article.className = "card";
  article.dataset.id = product.id;
  article.dataset.material = product.material;
  article.dataset.name = product.name;
  article.dataset.price = String(product.price);
  article.dataset.stock = String(product.stock);
  const tone = product.material === "ABS" ? "slate" : product.material === "PETG" ? "indigo" : "teal";
  const shot = document.createElement("div");
  shot.className = "shot " + tone;
  const badge = document.createElement("span");
  badge.textContent = product.material;
  shot.append(badge);
  const body = document.createElement("div");
  body.className = "card-body";
  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = product.category + " · " + product.time;
  const title = document.createElement("h3");
  title.textContent = product.name;
  const text = document.createElement("p");
  text.textContent = product.description;
  const footer = document.createElement("footer");
  const price = document.createElement("strong");
  price.textContent = "$" + product.price;
  const add = document.createElement("button");
  add.type = "button";
  add.className = "add";
  add.textContent = "Agregar";
  footer.append(price, add);
  body.append(meta, title, text, footer);
  article.append(shot, body);
  applyImage(shot, product.image);
  return article;
}

function applyFilter() {
  let visible = 0;
  grid.querySelectorAll(".card").forEach((card) => {
    const show = filter === "todos" || card.dataset.material === filter;
    card.classList.toggle("hide", !show);
    if (show) visible += 1;
  });
  empty.hidden = visible !== 0;
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

menuBtn.addEventListener("click", () => {
  const open = menu.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", String(open));
});

menu.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    menu.classList.remove("open");
    menuBtn.setAttribute("aria-expanded", "false");
  }
});

window.addEventListener("scroll", () => {
  nav.classList.toggle("scrolled", window.scrollY > 8);
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((item) => item.classList.remove("on"));
    chip.classList.add("on");
    filter = chip.dataset.filter;
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
  renderCart();
  showToast(product.name + " entró al carrito");
});

document.querySelector("#cartBtn").addEventListener("click", () => {
  cartPanel.hidden = !cartPanel.hidden;
});

document.querySelector("#closeCart").addEventListener("click", () => {
  cartPanel.hidden = true;
});

document.querySelector("#checkout").addEventListener("click", async () => {
  if (cart.length === 0) {
    showToast("El carrito está vacío.");
    return;
  }
  const current = PrintLab.session();
  if (!current) {
    showToast("Entra para generar la factura.");
    return;
  }
  const ready = cart.every((line) => {
    const product = catalog.find((item) => item.id === line.id);
    return product && product.stock >= line.qty;
  });
  if (!ready) {
    await loadCatalog();
    showToast("El stock cambió. Revisa el carrito.");
    return;
  }
  try {
    for (const line of cart) {
      const response = await fetch("/api/products/" + line.id + "/consume", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: line.qty })
      });
      if (!response.ok) {
        await loadCatalog();
        showToast("El stock cambió. Revisa el carrito.");
        return;
      }
    }
  } catch (err) {
    showToast("No se pudo contactar al servidor.");
    return;
  }
  const invoice = PrintLab.recordInvoice(current.username, cart);
  cart.splice(0, cart.length);
  renderCart();
  await loadCatalog();
  showToast("Factura " + invoice.id + " por $" + invoice.total);
});

function renderCart() {
  const pieces = cart.reduce((sum, item) => sum + item.qty, 0);
  cartCount.textContent = String(pieces);
  cartList.replaceChildren();
  let total = 0;
  cart.forEach((item) => {
    total += item.price * item.qty;
    const li = document.createElement("li");
    li.textContent = item.qty + " × " + item.name;
    const price = document.createElement("span");
    price.textContent = "$" + item.price * item.qty;
    li.append(price);
    cartList.append(li);
  });
  if (cart.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Todavía no hay piezas.";
    cartList.append(li);
  }
  cartTotal.textContent = "$" + total;
}

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

loadCatalog();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") loadCatalog();
});
renderCart();
