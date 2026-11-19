const pool = require("../config/db");

async function createInvoice(req, res) {
  const items = req.body.items;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "El carrito está vacío." });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let total = 0;
    const validatedItems = [];

    for (const item of items) {
      const productId = Number(item.id);
      const qty = Number(item.qty || item.quantity);

      if (!productId || !Number.isInteger(qty) || qty < 1) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ error: "Datos de producto no válidos." });
      }

      const [rows] = await conn.execute(
        "SELECT id, name, price, stock FROM products WHERE id = ? FOR UPDATE",
        [productId]
      );
      const product = rows[0];

      if (!product) {
        await conn.rollback();
        conn.release();
        return res.status(404).json({ error: `La pieza #${productId} no existe.` });
      }

      if (product.stock < qty) {
        await conn.rollback();
        conn.release();
        return res.status(409).json({
          error: `Stock insuficiente para "${product.name}". Disponible: ${product.stock}, solicitado: ${qty}.`
        });
      }

      const unitPrice = Number(product.price);
      total += unitPrice * qty;
      validatedItems.push({
        productId: product.id,
        name: product.name,
        price: unitPrice,
        qty
      });
    }

    const roundedTotal = Math.round(total * 100) / 100;
    const [invResult] = await conn.execute(
      "INSERT INTO invoices (buyer_id, total) VALUES (?, ?)",
      [req.session.user.id, roundedTotal]
    );
    const invoiceId = invResult.insertId;

    for (const line of validatedItems) {
      await conn.execute(
        "UPDATE products SET stock = stock - ? WHERE id = ?",
        [line.qty, line.productId]
      );
      await conn.execute(
        "INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)",
        [invoiceId, line.productId, line.qty, line.price]
      );
    }

    await conn.commit();
    conn.release();

    res.status(201).json({
      invoice: {
        id: invoiceId,
        buyer: req.session.user.username,
        total: roundedTotal,
        items: validatedItems,
        createdAt: new Date()
      }
    });
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {}
    conn.release();
    console.error("Error al generar factura:", err);
    res.status(500).json({ error: "No se pudo procesar la compra." });
  }
}

async function listInvoices(req, res) {
  try {
    const isAdmin = req.session.user.role === "admin";
    let query = `
      SELECT i.id, i.buyer_id, u.username AS buyer, i.total, i.created_at,
             ii.product_id, p.name AS product_name, ii.quantity, ii.unit_price
      FROM invoices i
      JOIN users u ON u.id = i.buyer_id
      LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
      LEFT JOIN products p ON p.id = ii.product_id
    `;
    const params = [];

    if (!isAdmin) {
      query += " WHERE i.buyer_id = ?";
      params.push(req.session.user.id);
    }

    query += " ORDER BY i.id DESC";

    const [rows] = await pool.execute(query, params);

    const invoicesMap = new Map();
    for (const row of rows) {
      if (!invoicesMap.has(row.id)) {
        invoicesMap.set(row.id, {
          id: row.id,
          buyer: row.buyer,
          total: Number(row.total),
          created: row.created_at,
          items: []
        });
      }
      if (row.product_id) {
        invoicesMap.get(row.id).items.push({
          id: row.product_id,
          name: row.product_name,
          price: Number(row.unit_price),
          qty: row.quantity
        });
      }
    }

    res.json({ invoices: Array.from(invoicesMap.values()) });
  } catch (err) {
    console.error("Error al listar facturas:", err);
    res.status(500).json({ error: "Error al obtener facturas." });
  }
}

module.exports = {
  createInvoice,
  listInvoices
};
