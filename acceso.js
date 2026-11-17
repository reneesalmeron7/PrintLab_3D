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

const active = PrintLab.session();
if (active) location.replace(PrintLab.home(active.role));

document.querySelector("#loginForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const user = PrintLab.login(String(data.get("usuario")).trim(), String(data.get("clave")));
  const note = document.querySelector("#loginNote");
  if (user === "inactive") {
    note.textContent = "Esta cuenta está desactivada.";
    return;
  }
  if (!user) {
    note.textContent = "Usuario o contraseña incorrectos.";
    return;
  }
  location.href = PrintLab.home(user.role);
});

document.querySelector("#registro").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const user = PrintLab.register(
    String(data.get("usuario")).trim(),
    String(data.get("email")).trim(),
    String(data.get("clave"))
  );
  const note = document.querySelector("#registerNote");
  if (!user) {
    note.textContent = "Ese usuario ya existe.";
    return;
  }
  location.href = PrintLab.home(user.role);
});
