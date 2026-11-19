const pool = require("../config/db");

const MAX_TOTAL_CENTS = 9999999999;

async function createInvoice(req, res) {
  const items = req.body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Agrega al menos un producto." });
  }

  const itemsById = new Map();
  for (const item of items) {
    const { id, qty } = item || {};
    if (!Number.isInteger(id) || id < 1 || id > 2147483647
      || !Number.isInteger(qty) || qty < 1 || qty > 2147483647
      || itemsById.has(id)) {
      return res.status(400).json({ error: "Revisa los productos y cantidades." });
    }
    itemsById.set(id, qty);
  }

  const buyer = req.session.user;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const lines = [];
    let totalCents = 0;

    // Lock products in the same order for every purchase.
    for (const id of [...itemsById.keys()].sort((a, b) => a - b)) {
      const qty = itemsById.get(id);
      const [[product]] = await connection.execute(
        "SELECT name, price, stock FROM products WHERE id = ? FOR UPDATE", [id]
      );
      if (!product || product.stock < qty) {
        await connection.rollback();
        return res.status(409).json({ error: "El stock cambió. Revisa el carrito." });
      }

      const unitCents = Math.round(Number(product.price) * 100);
      totalCents += unitCents * qty;
      if (totalCents > MAX_TOTAL_CENTS) {
        await connection.rollback();
        return res.status(422).json({ error: "La compra supera el monto máximo." });
      }
      lines.push({ id, name: product.name, price: product.price, qty });
    }

    const total = (totalCents / 100).toFixed(2);
    const [result] = await connection.execute(
      "INSERT INTO invoices (buyer_id, total) VALUES (?, ?)", [buyer.id, total]
    );
    for (const line of lines) {
      await connection.execute(
        "INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)",
        [result.insertId, line.id, line.qty, line.price]
      );
      await connection.execute(
        "UPDATE products SET stock = stock - ? WHERE id = ?", [line.qty, line.id]
      );
    }
    const [[invoice]] = await connection.execute(
      "SELECT created_at AS created FROM invoices WHERE id = ?", [result.insertId]
    );
    await connection.commit();
    return res.status(201).json({
      invoice: { id: result.insertId, buyer: buyer.username, created: invoice.created, items: lines, total }
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listInvoices(req, res) {
  const [rows] = await pool.execute(`
    SELECT i.id, u.username AS buyer, i.created_at AS created, i.total,
           p.name, d.quantity AS qty, d.unit_price AS price
    FROM invoices i
    JOIN users u ON u.id = i.buyer_id
    LEFT JOIN invoice_items d ON d.invoice_id = i.id
    LEFT JOIN products p ON p.id = d.product_id
    ORDER BY i.id DESC, d.id
  `);
  const invoices = new Map();
  for (const row of rows) {
    if (!invoices.has(row.id)) {
      invoices.set(row.id, {
        id: row.id, buyer: row.buyer, created: row.created, total: row.total, items: []
      });
    }
    if (row.qty !== null) {
      invoices.get(row.id).items.push({ name: row.name, qty: row.qty, price: row.price });
    }
  }
  res.json({ invoices: [...invoices.values()] });
}

module.exports = { createInvoice, listInvoices };
