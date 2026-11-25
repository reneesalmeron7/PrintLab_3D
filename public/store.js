const PrintLab = (function () {
  const USERS = "pl-users";
  const PRODUCTS = "pl-products";
  const REQUESTS = "pl-requests";
  const INVOICES = "pl-invoices";
  const SESSION = "pl-session";

  const seedUsers = [
    { username: "cliente", password: "cliente123", role: "cliente" },
    { username: "vendedor", password: "vendedor123", role: "vendedor" },
    { username: "admin", password: "admin123", role: "admin" }
  ];

  const seedProducts = [
    { id: "p1", name: "Llavero geométrico", category: "Llaveros", material: "PLA", time: "45 min", price: 85, stock: 5, image: "", description: "Anillo hueco con argolla. Ligero y rígido, pensado para el día a día." },
    { id: "p2", name: "Engranaje de repuesto", category: "Repuestos", material: "PETG", time: "2 h", price: 160, stock: 5, image: "", description: "32 dientes, eje de 8 mm. PETG para que aguante uso mecánico." },
    { id: "p3", name: "Soporte de celular", category: "Escritorio", material: "PLA", time: "1.5 h", price: 140, stock: 5, image: "", description: "Ángulo de 65° y canal para el cable. Estable sobre mesa." },
    { id: "p4", name: "Mini figura articulada", category: "Figuras", material: "PLA", time: "3 h", price: 240, stock: 5, image: "", description: "Seis puntos de giro. Se imprime en una sola pieza, sin ensamble." },
    { id: "p5", name: "Carcasa de prototipo", category: "Prototipos", material: "ABS", time: "4 h", price: 320, stock: 5, image: "", description: "Caja de 80×50×24 mm con postes para PCB y tapa a presión." },
    { id: "p6", name: "Maceta hexagonal", category: "Hogar", material: "PETG", time: "2.5 h", price: 180, stock: 5, image: "", description: "Pared de 2 mm y drenaje en la base. Cabe en un alféizar." }
  ];

  const seedRequests = [
    {
      id: "s1",
      pieza: "Soporte para audífonos",
      material: "PLA",
      descripcion: "Gancho de 8 cm para el borde del escritorio.",
      usuario: "cliente",
      archivo: "",
      estado: "pendiente"
    }
  ];

  function read(key, seed) {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(seed));
      return seed.map((item) => Object.assign({}, item));
    }
    return JSON.parse(raw);
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function users() {
    const list = read(USERS, seedUsers);
    let changed = false;
    seedUsers.forEach((seed) => {
      if (!list.some((user) => user.username === seed.username)) {
        list.push(Object.assign({ active: true }, seed));
        changed = true;
      }
    });
    list.forEach((user) => {
      if (typeof user.active !== "boolean") {
        user.active = true;
        changed = true;
      }
    });
    if (changed) write(USERS, list);
    return list;
  }

  function products() {
    const list = read(PRODUCTS, seedProducts);
    let changed = false;
    list.forEach((product) => {
      if (typeof product.stock !== "number") {
        product.stock = 5;
        changed = true;
      }
      if (typeof product.image !== "string") {
        product.image = "";
        changed = true;
      }
    });
    if (changed) write(PRODUCTS, list);
    return list;
  }

  function requests() {
    const list = read(REQUESTS, seedRequests);
    let changed = false;
    list.forEach((request) => {
      if (!request.estado) {
        request.estado = "pendiente";
        changed = true;
      }
    });
    if (changed) write(REQUESTS, list);
    return list;
  }

  function invoices() {
    return read(INVOICES, []);
  }

  function session() {
    const raw = localStorage.getItem(SESSION);
    return raw ? JSON.parse(raw) : null;
  }

  function home(role) {
    if (role === "admin") return "admin.html";
    if (role === "vendedor") return "vendedor.html";
    return "index.html";
  }

  function saveSession(user) {
    const current = { username: user.username, role: user.role };
    write(SESSION, current);
    return current;
  }

  function clearSession() {
    localStorage.removeItem(SESSION);
  }

  function login(username, password) {
    const found = users().find((user) => user.username === username && user.password === password);
    if (!found) return null;
    if (found.active === false) return "inactive";
    const current = { username: found.username, role: found.role };
    write(SESSION, current);
    return current;
  }

  function logout() {
    localStorage.removeItem(SESSION);
    return fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
  }

  function register(username, email, password) {
    const list = users();
    if (list.some((user) => user.username === username)) return null;
    list.push({ username: username, email: email, password: password, role: "cliente", active: true });
    write(USERS, list);
    return login(username, password);
  }

  function addProduct(product) {
    const list = products();
    list.push(product);
    write(PRODUCTS, list);
    return product;
  }

  function updateProduct(id, changes) {
    const list = products();
    const product = list.find((item) => item.id === id);
    if (!product) return null;
    Object.assign(product, changes);
    write(PRODUCTS, list);
    return product;
  }

  function removeProduct(id) {
    write(PRODUCTS, products().filter((product) => product.id !== id));
  }

  function setRequestStatus(id, estado) {
    const list = requests();
    const request = list.find((item) => item.id === id);
    if (!request) return;
    request.estado = estado;
    write(REQUESTS, list);
  }

  function updateUser(username, changes) {
    const list = users();
    const user = list.find((item) => item.username === username);
    if (!user) return null;
    Object.assign(user, changes);
    write(USERS, list);
    const current = session();
    if (current && current.username === username && changes.role) {
      current.role = changes.role;
      write(SESSION, current);
    }
    return user;
  }

  function recordInvoice(buyer, lines) {
    const saved = invoices();
    const invoice = {
      id: "f" + Date.now(),
      buyer: buyer,
      created: new Date().toLocaleString("es-MX"),
      items: lines.map((line) => ({
        name: line.name,
        price: line.price,
        qty: line.qty
      })),
      total: lines.reduce((sum, line) => sum + line.price * line.qty, 0)
    };
    saved.unshift(invoice);
    write(INVOICES, saved);
    return invoice;
  }

  function checkout(buyer, lines) {
    const list = products();
    const ok = lines.every((line) => {
      const product = list.find((item) => item.id === line.id);
      return product && product.stock >= line.qty;
    });
    if (!ok) return null;
    lines.forEach((line) => {
      const product = list.find((item) => item.id === line.id);
      product.stock -= line.qty;
    });
    write(PRODUCTS, list);
    const saved = invoices();
    const invoice = {
      id: "f" + Date.now(),
      buyer: buyer,
      created: new Date().toLocaleString("es-MX"),
      items: lines.map((line) => ({
        name: line.name,
        price: line.price,
        qty: line.qty
      })),
      total: lines.reduce((sum, line) => sum + line.price * line.qty, 0)
    };
    saved.unshift(invoice);
    write(INVOICES, saved);
    return invoice;
  }

  function addRequest(request) {
    const list = requests();
    list.unshift(request);
    write(REQUESTS, list);
  }

  function guard(allowed) {
    const current = session();
    if (!current || allowed.indexOf(current.role) === -1) {
      location.replace("acceso.html");
      return null;
    }
    return current;
  }

  function mountSession() {
    const slot = document.querySelector("#sessionSlot");
    const enter = document.querySelector("#enterLink");
    const registerLink = document.querySelector("#registerLink");
    if (!slot) return;
    const current = session();
    slot.replaceChildren();
    if (!current) {
      if (enter) enter.hidden = false;
      if (registerLink) registerLink.hidden = false;
      const mineLink = document.querySelector("#myRequestsLink");
      if (mineLink) mineLink.hidden = true;
      return;
    }
    if (enter) enter.hidden = true;
    if (registerLink) registerLink.hidden = true;
    const mineLink = document.querySelector("#myRequestsLink");
    if (mineLink) mineLink.hidden = current.role !== "comprador" && current.role !== "cliente";
    if (current.role === "vendedor" || current.role === "admin") {
      const panel = document.createElement("a");
      panel.href = home(current.role);
      panel.textContent = "Panel";
      slot.append(panel);
    }
    const name = document.createElement("span");
    name.className = "who";
    name.textContent = current.username;
    const out = document.createElement("button");
    out.type = "button";
    out.className = "ghost";
    out.textContent = "Salir";
    out.addEventListener("click", () => {
      logout().finally(() => {
        const here = location.pathname.endsWith("/index.html") || location.pathname.endsWith("/");
        if (here) {
          location.reload();
          return;
        }
        location.href = "index.html";
      });
    });
    slot.append(name, out);
  }

  return {
    users: users,
    products: products,
    requests: requests,
    invoices: invoices,
    session: session,
    home: home,
    saveSession: saveSession,
    clearSession: clearSession,
    login: login,
    logout: logout,
    register: register,
    addProduct: addProduct,
    updateProduct: updateProduct,
    removeProduct: removeProduct,
    addRequest: addRequest,
    setRequestStatus: setRequestStatus,
    updateUser: updateUser,
    recordInvoice: recordInvoice,
    checkout: checkout,
    guard: guard,
    mountSession: mountSession
  };
})();
