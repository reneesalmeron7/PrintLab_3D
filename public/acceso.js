const loginPanel = document.querySelector("#loginPanel");
const registerPanel = document.querySelector("#registerPanel");
const showLogin = document.querySelector("#showLogin");
const showRegister = document.querySelector("#showRegister");

function showAuth(mode) {
  const register = mode === "register";
  loginPanel.hidden = register;
  registerPanel.hidden = !register;
  showLogin.tabIndex = register ? -1 : 0;
  showRegister.tabIndex = register ? 0 : -1;
  showLogin.classList.toggle("on", !register);
  showRegister.classList.toggle("on", register);
  showLogin.setAttribute("aria-selected", String(!register));
  showRegister.setAttribute("aria-selected", String(register));
}

showLogin.addEventListener("click", () => showAuth("login"));
showRegister.addEventListener("click", () => showAuth("register"));

document.querySelectorAll(".password-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const field = btn.closest(".password-field");
    const input = field ? field.querySelector("input") : null;
    if (!input) return;
    const showing = input.type === "password";
    input.type = showing ? "text" : "password";
    btn.setAttribute("aria-pressed", String(showing));
    btn.setAttribute("aria-label", showing ? "Ocultar contraseña" : "Mostrar contraseña");
    const eye = btn.querySelector(".icon-eye");
    const eyeOff = btn.querySelector(".icon-eye-off");
    if (eye) eye.hidden = showing;
    if (eyeOff) eyeOff.hidden = !showing;
  });
});

document.querySelector(".switch").addEventListener("keydown", (event) => {
  const { key, target } = event;
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) return;
  event.preventDefault();
  const register = key === "End" || (key !== "Home" && target === showLogin);
  showAuth(register ? "register" : "login");
  (register ? showRegister : showLogin).focus();
});
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

const registerPassword = document.querySelector("#registerPassword");
const passwordRules = document.querySelector("#passwordRules");

function evaluatePassword(value) {
  return {
    len: value.length >= 12,
    upper: /[A-ZÁÉÍÓÚÑÜ]/.test(value),
    symbol: /[^A-Za-z0-9ÁÉÍÓÚÑÜáéíóúñü\s]/.test(value)
  };
}

function updatePasswordChecklist(value) {
  if (!passwordRules) return;
  const checks = evaluatePassword(value);
  passwordRules.querySelectorAll("li[data-rule]").forEach((li) => {
    li.classList.toggle("ok", Boolean(checks[li.dataset.rule]));
  });
}

if (registerPassword) {
  registerPassword.addEventListener("input", () => updatePasswordChecklist(registerPassword.value));
}

document.querySelector("#registro").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const note = document.querySelector("#registerNote");
  note.textContent = "";
  const password = String(data.get("clave") || "");
  const checks = evaluatePassword(password);
  if (!checks.len || !checks.upper || !checks.symbol) {
    note.textContent = "La contraseña debe tener mínimo 12 caracteres, una mayúscula y un signo.";
    if (registerPassword) registerPassword.focus();
    return;
  }
  try {
    const result = await postAuth("/api/auth/register", {
      username: String(data.get("usuario")).trim(),
      email: String(data.get("email")).trim(),
      password
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
