const page = document.body.dataset.page;
const session = PrintLab.guard(page === "admin" ? ["admin"] : ["vendedor", "admin"]);

fetch("/api/auth/me", { credentials: "include" })
  .then((res) => (res.ok ? res.json() : null))
  .then((data) => {
    if (!data || !data.user) {
      location.replace("acceso.html");
      return;
    }
    const role = data.user.role;
    if (page === "admin" && role !== "admin") {
      location.replace("acceso.html");
      return;
    }
    if (page === "vendedor" && !["vendedor", "admin"].includes(role)) {
      location.replace("acceso.html");
      return;
    }
  })
  .catch(() => {});

if (session) {
  PrintLab.mountSession();

  const productList = document.querySelector("#productList");
  const requestList = document.querySelector("#requestList");
  const productForm = document.querySelector("#productForm");
  const productNote = document.querySelector("#productNote");
  const formTitle = document.querySelector("#formTitle");
  const productSubmit = document.querySelector("#productSubmit");
  const cancelEdit = document.querySelector("#cancelEdit");
  const photoInput = productForm.querySelector('input[name="foto"]');
  const photoPreview = document.querySelector("#photoPreview");
  const vendorStates = ["pendiente", "cotizada", "imprimiendo", "lista"];
  const adminStates = vendorStates.concat("rechazada");

  function readPhoto(file) {
    return new Promise((resolve) => {
      if (!file) {
        resolve("");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 480;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.72));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function resetForm() {
    productForm.reset();
    productForm.elements.id.value = "";
    formTitle.textContent = "Agregar pieza";
    productSubmit.textContent = "Agregar al catálogo";
    cancelEdit.hidden = true;
    photoPreview.hidden = true;
    photoPreview.removeAttribute("src");
  }

  let productToken = 0;

  async function loadProducts() {
    const response = await fetch("/api/products", { cache: "no-store" });
    const data = await response.json();
    return data.products || [];
  }

  async function paintProducts() {
    const token = ++productToken;
    const items = await loadProducts();
    if (token !== productToken) return;
    productList.replaceChildren();
    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "form-note";
      empty.textContent = "El catálogo está vacío.";
      productList.append(empty);
      return;
    }
    items.forEach((product) => {
      const row = document.createElement("article");
      row.className = "row";
      const copy = document.createElement("div");
      copy.className = "row-copy";
      if (product.image) {
        const thumb = document.createElement("img");
        thumb.className = "thumb";
        thumb.alt = "";
        thumb.src = product.image;
        copy.append(thumb);
      }
      const text = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = product.name;
      const meta = document.createElement("p");
      const stockLabel = product.stock > 0 ? "stock " + product.stock : "agotada";
      meta.textContent = product.material + " · " + product.time + " · $" + product.price + " · " + stockLabel;
      text.append(title, meta);
      copy.append(text);
      const actions = document.createElement("div");
      actions.className = "row-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "text-link";
      edit.textContent = "Editar";
      edit.addEventListener("click", () => {
        productForm.elements.id.value = String(product.id);
        productForm.elements.nombre.value = product.name;
        productForm.elements.descripcion.value = product.description;
        productForm.elements.precio.value = product.price;
        productForm.elements.material.value = product.material;
        productForm.elements.tiempo.value = product.time;
        productForm.elements.stock.value = product.stock;
        formTitle.textContent = "Editar pieza";
        productSubmit.textContent = "Guardar cambios";
        cancelEdit.hidden = false;
        productNote.textContent = "";
        if (product.image) {
          photoPreview.src = product.image;
          photoPreview.hidden = false;
        } else {
          photoPreview.hidden = true;
          photoPreview.removeAttribute("src");
        }
        productForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger";
      remove.textContent = "Quitar";
      remove.addEventListener("click", async () => {
        await fetch("/api/products/" + product.id, { method: "DELETE", credentials: "include" });
        if (String(productForm.elements.id.value) === String(product.id)) resetForm();
        paintProducts();
      });
      actions.append(edit, remove);
      row.append(copy, actions);
      productList.append(row);
    });
  }

  function paintRequests() {
    const items = PrintLab.requests();
    requestList.replaceChildren();
    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "form-note";
      empty.textContent = "No hay solicitudes.";
      requestList.append(empty);
      return;
    }
    items.forEach((request) => {
      const row = document.createElement("article");
      row.className = "row";
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = request.pieza;
      const meta = document.createElement("p");
      meta.textContent = request.material + " · pedido por " + request.usuario;
      const text = document.createElement("p");
      text.textContent = request.descripcion;
      copy.append(title, meta, text);
      if (request.archivo) {
        const file = document.createElement("p");
        file.textContent = "Archivo: " + request.archivo;
        copy.append(file);
      }
      const states = (page === "admin" ? adminStates : vendorStates).slice();
      if (states.indexOf(request.estado) === -1) states.push(request.estado);
      const select = document.createElement("select");
      select.setAttribute("aria-label", "Estado de " + request.pieza);
      states.forEach((state) => {
        const option = document.createElement("option");
        option.value = state;
        option.textContent = state;
        if (state === request.estado) option.selected = true;
        select.append(option);
      });
      select.addEventListener("change", () => {
        PrintLab.setRequestStatus(request.id, select.value);
      });
      row.append(copy, select);
      requestList.append(row);
    });
  }

  async function paintInvoices() {
    const list = document.querySelector("#invoiceList");
    if (!list) return;
    const response = await fetch("/api/invoices", { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    const items = data.invoices || [];
    list.replaceChildren();
    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "form-note";
      empty.textContent = "Todavía no hay facturas.";
      list.append(empty);
      return;
    }
    items.forEach((invoice) => {
      const row = document.createElement("article");
      row.className = "row";
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = "Factura #" + invoice.id + " · " + invoice.buyer;
      const when = document.createElement("p");
      when.textContent = new Date(invoice.created).toLocaleString("es-MX");
      copy.append(title, when);
      (invoice.items || []).forEach((item) => {
        const line = document.createElement("p");
        line.textContent = item.qty + " × " + item.name + " · $" + (Number(item.price) * item.qty).toFixed(2);
        copy.append(line);
      });
      const total = document.createElement("p");
      total.style.fontWeight = "bold";
      total.textContent = "Total $" + Number(invoice.total).toFixed(2);
      copy.append(total);
      row.append(copy);
      list.append(row);
    });
  }

  async function paintUsers() {
    const userTable = document.querySelector("#userTable");
    if (!userTable) return;
    const body = userTable.querySelector("tbody");
    const response = await fetch("/api/auth/users", { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    body.replaceChildren();
    (data.users || []).forEach((user) => {
      const tr = document.createElement("tr");
      const name = document.createElement("td");
      name.textContent = user.username;
      const access = document.createElement("td");
      const role = document.createElement("select");
      role.setAttribute("aria-label", "Acceso de " + user.username);
      ["comprador", "vendedor", "admin"].forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        if (value === user.role) option.selected = true;
        role.append(option);
      });
      role.addEventListener("change", async () => {
        const result = await fetch("/api/auth/users/" + user.id, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: role.value })
        });
        if (!result.ok) return;
        if (user.username === session.username && role.value !== "admin") {
          PrintLab.saveSession({ username: user.username, role: role.value });
          location.href = PrintLab.home(role.value);
        }
      });
      access.append(role);
      const state = document.createElement("td");
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = user.active === false ? "text-link" : "danger";
      toggle.textContent = user.active === false ? "Activar" : "Desactivar";
      toggle.addEventListener("click", async () => {
        if (user.username === session.username) {
          productNote.textContent = "No puedes desactivar la cuenta con la que entraste.";
          return;
        }
        await fetch("/api/auth/users/" + user.id, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: user.active === false })
        });
        paintUsers();
      });
      state.append(toggle);

      const actions = document.createElement("td");
      if (user.username !== session.username) {
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "danger";
        deleteBtn.textContent = "Eliminar";
        deleteBtn.addEventListener("click", async () => {
          if (confirm(`¿Eliminar la cuenta de ${user.username}?`)) {
            const res = await fetch("/api/auth/users/" + user.id, {
              method: "DELETE",
              credentials: "include"
            });
            if (res.ok) paintUsers();
            else alert("No se pudo eliminar el usuario.");
          }
        });
        actions.append(deleteBtn);
      }
      tr.append(name, access, state, actions);
      body.append(tr);
    });
  }

  const newUserForm = document.querySelector("#newUserForm");
  const openNewUserBtn = document.querySelector("#openNewUserBtn");
  const cancelNewUserBtn = document.querySelector("#cancelNewUserBtn");
  const newUserNote = document.querySelector("#newUserNote");

  if (openNewUserBtn && newUserForm) {
    openNewUserBtn.addEventListener("click", () => {
      newUserForm.hidden = false;
      openNewUserBtn.hidden = true;
    });
    cancelNewUserBtn.addEventListener("click", () => {
      newUserForm.reset();
      newUserForm.hidden = true;
      openNewUserBtn.hidden = false;
      newUserNote.textContent = "";
    });
    newUserForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      newUserNote.textContent = "";
      const formData = new FormData(newUserForm);
      const body = {
        username: String(formData.get("username")).trim(),
        email: String(formData.get("email")).trim(),
        password: String(formData.get("password")),
        role: formData.get("role")
      };
      const res = await fetch("/api/auth/users", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        newUserNote.textContent = data.error || "Error al crear usuario.";
        return;
      }
      newUserForm.reset();
      newUserForm.hidden = true;
      openNewUserBtn.hidden = false;
      paintUsers();
    });
  }

  photoInput.addEventListener("change", () => {
    const file = photoInput.files[0];
    if (!file) return;
    readPhoto(file).then((url) => {
      photoPreview.src = url;
      photoPreview.hidden = false;
    });
  });

  cancelEdit.addEventListener("click", () => {
    productNote.textContent = "";
    resetForm();
  });

  productForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(productForm);
    const id = String(data.get("id") || "");
    const file = photoInput.files[0];
    readPhoto(file).then(async (image) => {
      const changes = {
        name: String(data.get("nombre")).trim(),
        material: data.get("material"),
        time: String(data.get("tiempo")).trim(),
        price: Number(data.get("precio")),
        stock: Number(data.get("stock")),
        description: String(data.get("descripcion")).trim()
      };
      if (image) changes.image = image;
      if (!id) changes.category = "Catálogo";
      const response = await fetch(id ? "/api/products/" + id : "/api/products", {
        method: id ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes)
      });
      const saved = await response.json().catch(() => ({}));
      if (response.status === 401) {
        productNote.textContent = "La sesión expiró. Entra de nuevo para guardar.";
        return;
      }
      if (!response.ok) {
        productNote.textContent = saved.error || "No se pudo guardar la pieza.";
        return;
      }
      productNote.textContent = id ? "Cambios guardados." : "La pieza ya está en el catálogo.";
      resetForm();
      paintProducts();
    });
  });

  paintProducts();
  paintRequests();
  paintInvoices();
  paintUsers();
}
