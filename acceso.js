const menuBtn = document.querySelector("#menuBtn");
const menu = document.querySelector("#menu");

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

const loginForm = document.querySelector("#loginForm");
const registerForm = document.querySelector("#registro");
const showLogin = document.querySelector("#showLogin");
const showRegister = document.querySelector("#showRegister");

function showAuth(mode) {
  const register = mode === "register";
  loginForm.hidden = register;
  registerForm.hidden = !register;
  showLogin.classList.toggle("on", !register);
  showRegister.classList.toggle("on", register);
  showLogin.setAttribute("aria-selected", String(!register));
  showRegister.setAttribute("aria-selected", String(register));
}

showLogin.addEventListener("click", () => showAuth("login"));
showRegister.addEventListener("click", () => showAuth("register"));
window.addEventListener("hashchange", () => {
  showAuth(location.hash === "#registro" ? "register" : "login");
});
showAuth(location.hash === "#registro" ? "register" : "login");

fetch("/api/auth/me", { credentials: "include" })
  .then((response) => (response.ok ? response.json() : null))
  .then((data) => {
    if (!data || !data.user) return;
    PrintLab.saveSession(data.user);
    location.replace(PrintLab.home(data.user.role));
  })
  .catch(() => {});

async function postAuth(path, body) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, data };
}

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const note = document.querySelector("#loginNote");
  note.textContent = "";
  try {
    const result = await postAuth("/api/auth/login", {
      username: String(data.get("usuario")).trim(),
      password: String(data.get("clave"))
    });
    if (!result.ok || !result.data.user) {
      note.textContent = result.data.error || "Usuario o contraseña incorrectos.";
      return;
    }
    PrintLab.saveSession(result.data.user);
    location.href = PrintLab.home(result.data.user.role);
  } catch (err) {
    note.textContent = "No se pudo contactar al servidor.";
  }
});

document.querySelector("#registro").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const note = document.querySelector("#registerNote");
  note.textContent = "";
  try {
    const result = await postAuth("/api/auth/register", {
      username: String(data.get("usuario")).trim(),
      email: String(data.get("email")).trim(),
      password: String(data.get("clave"))
    });
    if (!result.ok || !result.data.user) {
      note.textContent = result.data.error || "Ese usuario ya existe.";
      return;
    }
    PrintLab.saveSession(result.data.user);
    location.href = PrintLab.home(result.data.user.role);
  } catch (err) {
    note.textContent = "No se pudo contactar al servidor.";
  }
});
