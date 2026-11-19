const base = process.env.AUTH_URL || "http://127.0.0.1:3000";

function cookieFrom(response, previous) {
  const setCookie = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [];
  if (setCookie.length === 0) return previous || "";
  return setCookie.map((item) => item.split(";")[0]).join("; ");
}

async function request(path, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      data = { raw: text };
    }
  }
  return { status: response.status, data, cookie: cookieFrom(response, cookie) };
}

function check(name, condition) {
  if (!condition) {
    console.error("FALLO:", name);
    process.exitCode = 1;
    return;
  }
  console.log("ok:", name);
}

async function checkInvoiceGuards({ product, otherProduct, seller, buyer }) {
  const admin = await request("/api/auth/login", {
    method: "POST",
    body: { username: "admin", password: "admin123" }
  });
  check("administrador inicia sesión para verificar las facturas", admin.status === 200 && !!admin.cookie);

  const postInvoice = (items, cookie) => request("/api/invoices", {
    method: "POST",
    body: { items },
    cookie
  });
  const items = [{ id: product.id, qty: 1 }];
  check("la compra requiere sesión", (await postInvoice(items)).status === 401);
  check("la sesión de vendedor no puede comprar", (await postInvoice(items, seller.cookie)).status === 403);
  check("el listado de facturas requiere sesión", (await request("/api/invoices")).status === 401);
  const ownInvoices = await request("/api/invoices", { cookie: buyer.cookie });
  check("el comprador solo puede listar sus propias facturas",
    ownInvoices.status === 200 && Array.isArray(ownInvoices.data.invoices)
      && ownInvoices.data.invoices.every((invoice) => invoice.buyer === buyer.data.user.username));
  check("la compra requiere al menos un producto", (await postInvoice([], buyer.cookie)).status === 400);
  check("la compra se rechaza si una pieza no tiene stock suficiente",
    (await postInvoice([...items, { id: otherProduct.id, qty: otherProduct.stock + 1 }], buyer.cookie)).status === 409);

  const { data } = await request("/api/products");
  for (const fixture of [product, otherProduct]) {
    const item = data.products.find(({ id }) => id === fixture.id);
    check("el stock permanece igual tras rechazar la compra: " + fixture.name, item?.stock === fixture.stock);
  }

  const invoices = await request("/api/invoices", { cookie: admin.cookie });
  check("las compras rechazadas no dejan facturas",
    invoices.status === 200 && Array.isArray(invoices.data.invoices)
      && !invoices.data.invoices.some((invoice) => invoice.items.some(
        (item) => item.name === product.name || item.name === otherProduct.name
      )));
}

async function main() {
  const stamp = Date.now();
  const name = "Pieza de prueba " + stamp;
  const catalog = await request("/api/products");
  check("el catálogo es público", catalog.status === 200 && Array.isArray(catalog.data.products));

  const anon = await request("/api/products", {
    method: "POST",
    body: { name, description: "Prueba", price: 10, stock: 2, material: "PLA", time: "10 min", category: "Figuras" }
  });
  check("crear sin sesión", anon.status === 401);

  const seller = await request("/api/auth/login", {
    method: "POST",
    body: { username: "vendedor", password: "vendedor123" }
  });
  const created = await request("/api/products", {
    method: "POST",
    cookie: seller.cookie,
    body: { name, description: "Prueba", price: 10, stock: 2, material: "PLA", time: "10 min", category: "Figuras" }
  });
  const product = created.data.product;
  check("vendedor crea la pieza", created.status === 201 && product && product.name === name && product.category === "Figuras");

  const buyer = await request("/api/auth/login", {
    method: "POST",
    body: { username: "cliente", password: "cliente123" }
  });
  const forbidden = await request("/api/products", {
    method: "POST",
    cookie: buyer.cookie,
    body: { name: "Otra", description: "No", price: 1, stock: 1, material: "PLA" }
  });
  check("comprador no crea piezas", forbidden.status === 403);

  const limited = await request("/api/products", {
    method: "POST",
    cookie: seller.cookie,
    body: { name: name + " (stock limitado)", price: 10, stock: 1, material: "PLA" }
  });
  const otherProduct = limited.data.product;
  check("se crea una segunda pieza con stock limitado", limited.status === 201 && otherProduct?.stock === 1);
  try {
    if (otherProduct) await checkInvoiceGuards({ product, otherProduct, seller, buyer });
  } finally {
    if (otherProduct) {
      const cleanup = await request("/api/products/" + otherProduct.id, {
        method: "DELETE",
        cookie: seller.cookie
      });
      check("se elimina la pieza temporal de stock limitado", cleanup.status === 200);
    }
  }

  const consumed = await request("/api/products/" + product.id + "/consume", {
    method: "POST",
    cookie: buyer.cookie,
    body: { quantity: 1 }
  });
  check("la compra descuenta stock", consumed.status === 200 && consumed.data.product && consumed.data.product.stock === 1);

  const removed = await request("/api/products/" + product.id, {
    method: "DELETE",
    cookie: seller.cookie
  });
  const after = await request("/api/products");
  check(
    "vendedor quita la pieza",
    removed.status === 200 && !after.data.products.some((item) => item.id === product.id)
  );

  if (process.exitCode) {
    console.error("Hay pruebas fallidas.");
    return;
  }
  console.log("Catálogo en orden.");
}

main().catch((err) => {
  console.error("No se pudo probar el catálogo:", err.message);
  process.exitCode = 1;
});
