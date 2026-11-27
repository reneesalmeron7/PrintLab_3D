const InvoiceView = (() => {
  const money = new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD" });

  function render(container, invoice, method) {
    const created = new Date(invoice.createdAt ?? invoice.created);
    const formattedDate = Number.isNaN(created.getTime())
      ? String(invoice.createdAt ?? invoice.created ?? "")
      : created.toLocaleString("es-SV");

    const titleEl = container.querySelector("#invoiceTitle");
    if (titleEl) titleEl.textContent = "Factura #" + invoice.id;

    const detailsEl = container.querySelector("#invoiceDetails");
    if (detailsEl) {
      detailsEl.textContent = invoice.buyer + " · " + formattedDate;
    }

    const buyerEl = container.querySelector("#invoiceBuyer");
    if (buyerEl) buyerEl.textContent = "@" + invoice.buyer;

    const dateEl = container.querySelector("#invoiceDate");
    if (dateEl) dateEl.textContent = formattedDate;

    const methodBox = container.querySelector("#invoiceMethodBox");
    const methodEl = container.querySelector("#invoiceMethod");
    if (methodBox && methodEl && method) {
      methodEl.textContent = method === "transferencia"
        ? "Transferencia bancaria"
        : method === "efectivo"
          ? "Efectivo contra entrega"
          : method;
      methodBox.hidden = false;
    }

    const body = container.querySelector("#invoiceItems");
    body.replaceChildren();
    for (const { name, qty, price } of invoice.items) {
      const row = body.insertRow();
      for (const value of [name, qty, money.format(price), money.format(price * qty)]) {
        row.insertCell().textContent = value;
      }
    }
    container.querySelector("#invoiceTotal").textContent = money.format(invoice.total);
  }

  async function loadReceipt(receipt) {
    const status = document.querySelector("#receiptStatus");
    const params = new URLSearchParams(location.search);
    const id = Number(params.get("id"));
    const method = params.get("metodo") || "";

    if (!Number.isSafeInteger(id) || id < 1) {
      status.textContent = "El número de factura no es válido.";
      return;
    }

    try {
      const response = await fetch("/api/invoices", { credentials: "include", cache: "no-store" });
      if (response.status === 401) {
        const login = document.createElement("a");
        login.href = "acceso.html";
        login.textContent = "Inicia sesión para consultar tu factura.";
        status.replaceChildren(login);
        return;
      }
      if (!response.ok) throw new Error("No se pudo consultar la factura.");

      const { invoices } = await response.json();
      const invoice = invoices.find((item) => Number(item.id) === id);
      if (!invoice) {
        status.textContent = "No encontramos esta factura para tu cuenta.";
        return;
      }

      render(receipt, invoice, method);
      document.title = "Factura #" + invoice.id + " | PrintLab 3D";
      status.hidden = true;
      receipt.hidden = false;

      const print = document.querySelector("#printReceipt");
      print.addEventListener("click", () => window.print());
      print.hidden = false;
    } catch {
      status.textContent = "No se pudo cargar la factura. Recarga la página para reintentar.";
    }
  }

  const receipt = document.querySelector("#receipt");
  if (receipt) loadReceipt(receipt);

  return { render };
})();
