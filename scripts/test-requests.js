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

async function login(username, password) {
  return request("/api/auth/login", {
    method: "POST",
    body: { username, password }
  });
}

async function main() {
  const anon = await request("/api/requests", {
    method: "POST",
    body: { pieza: "Clip", material: "PLA", descripcion: "Prueba" }
  });
  check("solicitud sin sesión", anon.status === 401);

  const buyer = await login("cliente", "cliente123");
  const pieza = "Clip de prueba " + Date.now();
  const created = await request("/api/requests", {
    method: "POST",
    cookie: buyer.cookie,
    body: { pieza, material: "PETG", descripcion: "Gancho de 4 cm", archivo: "clip.stl" }
  });
  const item = created.data.request;
  check(
    "comprador registra la solicitud",
    created.status === 201 && item && item.estado === "pendiente" && item.usuario === "cliente" && item.archivo === "clip.stl"
  );

  const hidden = await request("/api/requests", { cookie: buyer.cookie });
  check("comprador no lista las solicitudes", hidden.status === 403);

  const seller = await login("vendedor", "vendedor123");
  const listed = await request("/api/requests", { cookie: seller.cookie });
  const found = (listed.data.requests || []).find((row) => row.id === item.id);
  check("vendedor ve la solicitud", listed.status === 200 && found && found.pieza === pieza);

  const rejected = await request("/api/requests/" + item.id, {
    method: "PATCH",
    cookie: seller.cookie,
    body: { estado: "rechazada" }
  });
  check("vendedor no rechaza", rejected.status === 400);

  const quoted = await request("/api/requests/" + item.id, {
    method: "PATCH",
    cookie: seller.cookie,
    body: { estado: "cotizada" }
  });
  check("vendedor marca cotizada", quoted.status === 200 && quoted.data.estado === "cotizada");

  const admin = await login("admin", "admin123");
  const closed = await request("/api/requests/" + item.id, {
    method: "PATCH",
    cookie: admin.cookie,
    body: { estado: "rechazada" }
  });
  check("admin rechaza", closed.status === 200 && closed.data.estado === "rechazada");

  if (process.exitCode) {
    console.error("Hay pruebas fallidas.");
    return;
  }
  console.log("Solicitudes en orden.");
}

main().catch((err) => {
  console.error("No se pudo probar las solicitudes:", err.message);
  process.exitCode = 1;
});
