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
  const requestFilters = document.querySelector("#requestFilters");
  const requestsSummary = document.querySelector("#requestsSummary");
  let allRequests = [];
  let activeRequestFilter = "todos";
  let requestFeedback = "";

  const statusLabels = {
    pendiente: "Pendiente",
    cotizada: "Cotizada",
    en_cola: "En cola de pedidos",
    imprimiendo: "Imprimiendo",
    lista: "Lista",
    cancelada: "Cancelada",
    rechazada: "Rechazada"
  };
  const moneyFmt = new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD" });

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

  if (requestFilters) {
    requestFilters.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        activeRequestFilter = chip.dataset.status || "todos";
        requestFeedback = "";
        requestFilters.querySelectorAll(".chip").forEach((btn) => {
          const active = btn === chip;
          btn.classList.toggle("on", active);
          btn.setAttribute("aria-pressed", String(active));
        });
        renderRequests();
      });
    });
  }

  function formatDate(value) {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString("es-SV");
  }

  function renderRequests(errorMessage) {
    requestList.replaceChildren();

    if (errorMessage) {
      const err = document.createElement("p");
      err.className = "form-note";
      err.textContent = errorMessage;
      requestList.append(err);
      if (requestsSummary) requestsSummary.textContent = "";
      return;
    }

    const filtered = activeRequestFilter === "todos"
      ? allRequests
      : allRequests.filter((item) => item.status === activeRequestFilter);

    if (requestsSummary) {
      const countText = activeRequestFilter === "todos"
        ? `${allRequests.length} solicitud(es) en total`
        : `Mostrando ${filtered.length} de ${allRequests.length} (filtro: ${statusLabels[activeRequestFilter] || activeRequestFilter})`;
      requestsSummary.textContent = requestFeedback ? `${countText} · ${requestFeedback}` : countText;
    }

    if (filtered.length === 0) {
      const empty = document.createElement("p");
      empty.className = "form-note";
      empty.textContent = activeRequestFilter === "todos"
        ? "No hay solicitudes registradas."
        : `No hay solicitudes en estado "${statusLabels[activeRequestFilter] || activeRequestFilter}".`;
      requestList.append(empty);
      return;
    }

    filtered.forEach((request) => {
      const card = document.createElement("article");
      card.className = "request-card";

      const head = document.createElement("div");
      head.className = "request-card-head";
      const title = document.createElement("strong");
      title.textContent = `#${request.id} · ${request.piece}`;
      const badge = document.createElement("span");
      badge.className = `status-badge status-${request.status}`;
      badge.textContent = statusLabels[request.status] || request.status;
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
        when.textContent = "Recibida: " + formatDate(request.createdAt);
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
          muted.textContent = "Archivo de referencia: " + request.fileName;
          fileWrap.append(muted);
        }
        card.append(fileWrap);
      }

      // Último movimiento visible en la tarjeta
      const history = Array.isArray(request.history) ? request.history : [];
      const latestEntry = history[0] || null;
      const previousEntries = history.slice(1);

      if (request.quotePrice !== null || request.sellerNote || request.notifiedAt) {
        const latestBox = document.createElement("div");
        latestBox.className = "request-latest";

        const latestTop = document.createElement("div");
        latestTop.className = "request-latest-head";
        if (request.quotePrice !== null) {
          const pricePill = document.createElement("span");
          pricePill.className = "price-pill";
          pricePill.textContent = "Cotización: " + moneyFmt.format(request.quotePrice);
          latestTop.append(pricePill);
        }
        if (request.notifiedAt) {
          const updatedMeta = document.createElement("span");
          updatedMeta.className = "request-latest-date";
          const who = latestEntry && latestEntry.changedBy ? ` por @${latestEntry.changedBy}` : "";
          updatedMeta.textContent = `Último cambio${who} · ${formatDate(request.notifiedAt)}`;
          latestTop.append(updatedMeta);
        }
        if (latestTop.childNodes.length > 0) latestBox.append(latestTop);

        if (request.sellerNote) {
          const latestComment = document.createElement("p");
          latestComment.className = "request-latest-comment";
          latestComment.textContent = request.sellerNote;
          latestBox.append(latestComment);
        }
        card.append(latestBox);
      }

      // Enlace tipo texto "Historial del pedido" que despliega lo anterior
      const historyBlock = document.createElement("div");
      historyBlock.className = "history-block";

      const historyToggle = document.createElement("button");
      historyToggle.type = "button";
      historyToggle.className = "history-toggle";
      historyToggle.setAttribute("aria-expanded", "false");
      const prevCountLabel = previousEntries.length > 0 ? ` (${previousEntries.length})` : "";
      historyToggle.textContent = `▸ Historial del pedido${prevCountLabel}`;

      const historyList = document.createElement("ul");
      historyList.className = "history-list";
      historyList.hidden = true;

      if (previousEntries.length === 0) {
        const emptyHist = document.createElement("li");
        emptyHist.className = "history-empty";
        emptyHist.textContent = "No hay movimientos anteriores.";
        historyList.append(emptyHist);
      } else {
        previousEntries.forEach((entry) => {
          const li = document.createElement("li");
          li.className = "history-item";
          const line = document.createElement("div");
          line.className = "history-item-head";

          const st = document.createElement("span");
          st.className = `status-badge status-${entry.status}`;
          st.textContent = statusLabels[entry.status] || entry.status;
          line.append(st);

          if (entry.quotePrice !== null) {
            const pr = document.createElement("strong");
            pr.textContent = moneyFmt.format(entry.quotePrice);
            line.append(pr);
          }

          const info = document.createElement("span");
          info.className = "history-item-meta";
          info.textContent = `@${entry.changedBy} · ${formatDate(entry.createdAt)}`;
          line.append(info);
          li.append(line);

          if (entry.comment) {
            const c = document.createElement("p");
            c.className = "history-item-comment";
            c.textContent = entry.comment;
            li.append(c);
          }
          historyList.append(li);
        });
      }

      historyToggle.addEventListener("click", () => {
        const opening = historyList.hidden;
        historyList.hidden = !opening;
        historyToggle.setAttribute("aria-expanded", String(opening));
        historyToggle.textContent = `${opening ? "▾" : "▸"} Historial del pedido${prevCountLabel}`;
      });

      historyBlock.append(historyToggle, historyList);
      card.append(historyBlock);

      // Aviso de estado respecto a confirmación/cancelación del cliente
      if (request.status === "cotizada") {
        const waitBanner = document.createElement("p");
        waitBanner.className = "request-banner waiting";
        waitBanner.textContent = `⏳ Esperando aceptación de @${request.username}: después de enviar la cotización, el cliente debe aceptarla antes de iniciar la impresión.`;
        card.append(waitBanner);
      } else if (request.status === "en_cola") {
        const okBanner = document.createElement("p");
        okBanner.className = "request-banner accepted";
        okBanner.textContent = `✓ Cotización aceptada por @${request.username} · El pedido está en cola de pedidos y ya puedes pasarlo a Imprimiendo.`;
        card.append(okBanner);
      } else if (request.status === "cancelada") {
        const cancelBanner = document.createElement("p");
        cancelBanner.className = "request-banner cancelled";
        cancelBanner.textContent = `✕ Esta solicitud fue cancelada por @${request.username}.`;
        card.append(cancelBanner);
        requestList.append(card);
        return;
      }

      // Controles de edición
      const controlsWrap = document.createElement("div");
      controlsWrap.className = "request-controls-wrap";

      const controls = document.createElement("div");
      controls.className = "request-controls";

      const states = (page === "admin" ? adminStates : vendorStates).slice();
      if (states.indexOf(request.status) === -1) states.unshift(request.status);

      const waitingClientAcceptance = request.status === "cotizada";

      const select = document.createElement("select");
      select.setAttribute("aria-label", "Estado de " + request.piece);
      states.forEach((state) => {
        const option = document.createElement("option");
        option.value = state;
        const blockedUntilAccept = waitingClientAcceptance && (state === "imprimiendo" || state === "lista");
        option.textContent = blockedUntilAccept
          ? `${statusLabels[state] || state} (esperando aceptación)`
          : (statusLabels[state] || state);
        if (blockedUntilAccept) option.disabled = true;
        if (state === request.status) option.selected = true;
        select.append(option);
      });

      // Campo numérico de precio (visible cuando el estado es "cotizada")
      const priceWrap = document.createElement("label");
      priceWrap.className = "price-field";
      priceWrap.hidden = select.value !== "cotizada";
      const priceSymbol = document.createElement("span");
      priceSymbol.textContent = "$";
      const priceInput = document.createElement("input");
      priceInput.type = "number";
      priceInput.min = "0";
      priceInput.step = "0.01";
      priceInput.inputMode = "decimal";
      priceInput.placeholder = "Precio de cotización";
      priceInput.setAttribute("aria-label", "Precio de cotización para " + request.piece);
      if (request.quotePrice !== null) priceInput.value = String(request.quotePrice);
      priceWrap.append(priceSymbol, priceInput);

      // Toggle de comentario opcional ("Añadir comentario")
      const commentToggle = document.createElement("button");
      commentToggle.type = "button";
      commentToggle.className = "comment-toggle";
      commentToggle.textContent = "+ Añadir comentario";

      const commentBox = document.createElement("div");
      commentBox.className = "comment-box";
      commentBox.hidden = true;
      const noteInput = document.createElement("textarea");
      noteInput.rows = 2;
      noteInput.className = "request-note-input";
      noteInput.maxLength = 500;
      noteInput.placeholder = "Escribe un comentario opcional para @" + request.username + "...";
      noteInput.setAttribute("aria-label", "Comentario opcional para " + request.username);
      commentBox.append(noteInput);

      commentToggle.addEventListener("click", () => {
        const opening = commentBox.hidden;
        commentBox.hidden = !opening;
        commentToggle.textContent = opening ? "− Ocultar comentario" : "+ Añadir comentario";
        if (opening) noteInput.focus();
      });

      select.addEventListener("change", () => {
        const isQuote = select.value === "cotizada";
        priceWrap.hidden = !isQuote;
        if (isQuote) priceInput.focus();
      });

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "solid save-request-btn";
      saveBtn.textContent = "Guardar";

      const feedback = document.createElement("p");
      feedback.className = "request-saved-note";
      feedback.setAttribute("role", "status");

      saveBtn.addEventListener("click", async () => {
        feedback.classList.remove("error");
        feedback.textContent = "";

        const payload = {
          status: select.value,
          sellerNote: commentBox.hidden ? "" : noteInput.value.trim()
        };

        if (select.value === "cotizada") {
          const raw = priceInput.value.trim();
          const num = Number(raw);
          if (!raw || !Number.isFinite(num) || num < 0) {
            feedback.classList.add("error");
            feedback.textContent = "Ingresa un precio numérico válido para la cotización.";
            priceInput.focus();
            return;
          }
          payload.quotePrice = num;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = "Guardando…";

        try {
          const response = await fetch(`/api/requests/${request.id}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            feedback.classList.add("error");
            feedback.textContent = data.error || "No se pudo guardar la solicitud.";
            return;
          }

          const idx = allRequests.findIndex((item) => item.id === request.id);
          if (idx !== -1 && data.request) {
            allRequests[idx] = data.request;
          }
          requestFeedback = `Solicitud #${request.id} guardada y enviada a @${request.username}`;
          renderRequests();
        } catch {
          feedback.classList.add("error");
          feedback.textContent = "Error de conexión al guardar.";
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = "Guardar";
        }
      });

      controls.append(select, priceWrap, commentToggle, saveBtn);
      controlsWrap.append(controls, commentBox, feedback);
      card.append(controlsWrap);

      requestList.append(card);
    });
  }

  async function paintRequests() {
    try {
      const response = await fetch("/api/requests", {
        credentials: "include",
        cache: "no-store"
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      allRequests = data.requests || [];
      renderRequests();
    } catch {
      renderRequests("No se pudieron cargar las solicitudes del servidor.");
    }
  }

  async function paintInvoices() {
    const list = document.querySelector("#invoiceList");
    if (!list) return;
    const localInvoices = PrintLab.invoices();
    let items = localInvoices;
    let notice = "";
    try {
      const response = await fetch("/api/invoices", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json();
      items = [...data.invoices, ...localInvoices];
    } catch {
      notice = "No se pudieron cargar las facturas del servidor.";
    }
    list.replaceChildren();
    if (notice) {
      const warning = document.createElement("p");
      warning.className = "form-note";
      warning.textContent = notice;
      list.append(warning);
    }
    if (items.length === 0 && !notice) {
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
      when.textContent = typeof invoice.id === "number"
        ? new Date(invoice.created).toLocaleString("es-SV") : invoice.created;
      copy.append(title, when);
      (invoice.items || []).forEach((item) => {
        const line = document.createElement("p");
        line.textContent = item.qty + " × " + item.name + " · $" + (item.price * item.qty).toFixed(2);
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
