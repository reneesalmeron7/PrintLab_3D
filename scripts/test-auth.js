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

async function main() {
  const stamp = Date.now();
  const username = "prueba" + stamp;
  const registered = await request("/api/auth/register", {
    method: "POST",
    body: {
      username,
      email: username + "@printlab.local",
      password: "prueba123"
    }
  });
  check("registro crea comprador", registered.status === 201 && registered.data.user && registered.data.user.role === "comprador");

  const me = await request("/api/auth/me", { cookie: registered.cookie });
  check("me con sesión", me.status === 200 && me.data.user && me.data.user.username === username);

  const anon = await request("/api/auth/me");
  check("me sin sesión", anon.status === 401);

  const loggedOut = await request("/api/auth/logout", { method: "POST", cookie: registered.cookie });
  const afterLogout = await request("/api/auth/me", { cookie: loggedOut.cookie });
  check("logout cierra la sesión", loggedOut.status === 200 && afterLogout.status === 401);

  const login = await request("/api/auth/login", {
    method: "POST",
    body: { username: "cliente", password: "cliente123" }
  });
  check("login de cliente", login.status === 200 && login.data.user && login.data.user.role === "comprador");

  const seller = await request("/api/auth/login", {
    method: "POST",
    body: { username: "vendedor", password: "vendedor123" }
  });
  check("login de vendedor", seller.status === 200 && seller.data.user && seller.data.user.role === "vendedor");

  const admin = await request("/api/auth/login", {
    method: "POST",
    body: { username: "admin", password: "admin123" }
  });
  check("login de admin", admin.status === 200 && admin.data.user && admin.data.user.role === "admin");

  let blocked = false;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const wrong = await request("/api/auth/login", {
      method: "POST",
      body: { username: "admin", password: "incorrecta-" + attempt }
    });
    if (wrong.status === 429) blocked = true;
    check("intento incorrecto " + attempt + " sigue en 401", wrong.status === 401);
  }
  check("el login no limita intentos", blocked === false);

  const failures = await request("/api/auth/login-failures", { cookie: admin.cookie });
  const recorded = (failures.data.failures || []).filter((item) => {
    return item.username === "admin" && item.reason === "contrasena_incorrecta";
  });
  check(
    "el fallo queda con fecha e ip",
    failures.status === 200 && recorded.length >= 5 && recorded[0].ip && recorded[0].createdAt
  );

  if (process.exitCode) {
    console.error("Hay pruebas fallidas.");
    return;
  }
  console.log("Rutas de autenticación en orden.");
}

main().catch((err) => {
  console.error("No se pudo probar el servidor:", err.message);
  process.exitCode = 1;
});
