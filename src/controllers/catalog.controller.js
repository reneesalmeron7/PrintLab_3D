const pool = require("../config/db");

const MATERIALS = ["PLA", "PETG", "ABS"];

const SEED_PRODUCTS = [
  ["Llavero geométrico", "Anillo hueco con argolla. Ligero y rígido, pensado para el día a día.", 85, 5, "PLA", "45 min", "Llaveros"],
  ["Engranaje de repuesto", "32 dientes, eje de 8 mm. PETG para que aguante uso mecánico.", 160, 5, "PETG", "2 h", "Repuestos"],
  ["Soporte de celular", "Ángulo de 65° y canal para el cable. Estable sobre mesa.", 140, 5, "PLA", "1.5 h", "Escritorio"],
  ["Mini figura articulada", "Seis puntos de giro. Se imprime en una sola pieza, sin ensamble.", 240, 5, "PLA", "3 h", "Figuras"],
  ["Carcasa de prototipo", "Caja de 80×50×24 mm con postes para PCB y tapa a presión.", 320, 5, "ABS", "4 h", "Prototipos"],
  ["Maceta hexagonal", "Pared de 2 mm y drenaje en la base. Cabe en un alféizar.", 180, 5, "PETG", "2.5 h", "Hogar"]
];

function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

function publicProduct(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    price: money(row.price),
    stock: row.stock,
    material: row.material,
    time: row.print_time || "",
    category: row.category_name || "",
    image: row.image_path || ""
  };
}

async function ensureImageColumn() {
  const [columns] = await pool.query("SHOW COLUMNS FROM products LIKE 'image_path'");
  const column = columns[0];
  if (!column || String(column.Type).toLowerCase().includes("text")) return;
  await pool.query("ALTER TABLE products MODIFY image_path MEDIUMTEXT NULL");
}

async function categoryId(name, connection) {
  const label = String(name || "").trim().slice(0, 80);
  if (!label) return null;
  const db = connection || pool;
  const [found] = await db.execute("SELECT id FROM categories WHERE name = ? LIMIT 1", [label]);
  if (found[0]) return found[0].id;
  const [created] = await db.execute(
    "INSERT INTO categories (name, description) VALUES (?, '')",
    [label]
  );
  return created.insertId;
}

async function seedCatalog() {
  const [count] = await pool.query("SELECT COUNT(*) AS total FROM products");
  if (Number(count[0].total) > 0) return;
  const [sellers] = await pool.execute("SELECT id FROM users WHERE username = 'vendedor' LIMIT 1");
  if (sellers.length === 0) return;
  for (const [name, description, price, stock, material, time, category] of SEED_PRODUCTS) {
    const categoryKey = await categoryId(category);
    await pool.execute(
      `INSERT INTO products
        (seller_id, category_id, name, description, price, stock, material, print_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [sellers[0].id, categoryKey, name, description, price, stock, material, time]
    );
  }
  console.log("Catálogo de prueba insertado.");
}

async function productById(id) {
  const [rows] = await pool.execute(
    `SELECT p.id, p.category_id, p.name, p.description, p.price, p.stock, p.material, p.print_time, p.image_path,
            c.name AS category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

function readProduct(body, { partial }) {
  const product = {};
  if (!partial || body.name !== undefined) {
    product.name = String(body.name || "").trim();
    if (!product.name || product.name.length > 120) return { error: "El nombre es obligatorio." };
  }
  if (!partial || body.description !== undefined) {
    product.description = String(body.description || "").trim();
  }
  if (!partial || body.price !== undefined) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) return { error: "El precio no es válido." };
    product.price = money(price);
  }
  if (!partial || body.stock !== undefined) {
    const stock = Number(body.stock);
    if (!Number.isInteger(stock) || stock < 0) return { error: "El stock no es válido." };
    product.stock = stock;
  }
  if (!partial || body.material !== undefined) {
    product.material = String(body.material || "");
    if (!MATERIALS.includes(product.material)) return { error: "El material no es válido." };
  }
  if (!partial || body.time !== undefined) {
    product.time = String(body.time || "").trim().slice(0, 50);
  }
  if (body.category !== undefined) product.category = String(body.category || "").trim();
  if (body.image !== undefined) {
    const image = String(body.image || "");
    if (image && !image.startsWith("data:image/")) return { error: "La foto no es válida." };
    if (image.length > 1500000) return { error: "La foto es demasiado grande." };
    product.image = image;
  }
  return { product };
}

async function listCategories(req, res) {
  const [rows] = await pool.query("SELECT id, name, description FROM categories ORDER BY name ASC");
  res.set("Cache-Control", "no-store");
  res.json({ categories: rows });
}

async function createCategory(req, res) {
  const name = String(req.body?.name || "").trim();
  const description = String(req.body?.description || "").trim().slice(0, 240);
  if (!name || name.length < 2 || name.length > 80) {
    return res.status(400).json({ error: "El nombre de la categoría debe tener entre 2 y 80 caracteres." });
  }
  const [existing] = await pool.execute(
    "SELECT id, name, description FROM categories WHERE LOWER(name) = LOWER(?) LIMIT 1",
    [name]
  );
  if (existing.length > 0) {
    return res.status(409).json({ error: "Esa categoría ya existe." });
  }
  const [created] = await pool.execute(
    "INSERT INTO categories (name, description) VALUES (?, ?)",
    [name, description]
  );
  res.status(201).json({
    category: { id: created.insertId, name, description }
  });
}

async function listProducts(req, res) {
  const [rows] = await pool.query(
    `SELECT p.id, p.name, p.description, p.price, p.stock, p.material, p.print_time, p.image_path,
            c.name AS category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     ORDER BY p.id`
  );
  res.set("Cache-Control", "no-store");
  res.json({ products: rows.map(publicProduct) });
}

async function createProduct(req, res) {
  const parsed = readProduct(req.body || {}, { partial: false });
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const product = parsed.product;
  const categoryKey = await categoryId(product.category);
  const [created] = await pool.execute(
    `INSERT INTO products
      (seller_id, category_id, name, description, price, stock, material, print_time, image_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.session.user.id,
      categoryKey,
      product.name,
      product.description || "",
      product.price,
      product.stock,
      product.material,
      product.time || "",
      product.image || null
    ]
  );
  res.status(201).json({ product: publicProduct(await productById(created.insertId)) });
}

async function updateProduct(req, res) {
  const current = await productById(Number(req.params.id));
  if (!current) return res.status(404).json({ error: "Pieza no encontrada." });
  const parsed = readProduct(req.body || {}, { partial: true });
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const product = parsed.product;
  const categoryKey = product.category !== undefined
    ? await categoryId(product.category)
    : current.category_id;
  await pool.execute(
    `UPDATE products
     SET category_id = ?, name = ?, description = ?, price = ?, stock = ?, material = ?, print_time = ?, image_path = ?
     WHERE id = ?`,
    [
      categoryKey,
      product.name !== undefined ? product.name : current.name,
      product.description !== undefined ? product.description : (current.description || ""),
      product.price !== undefined ? product.price : current.price,
      product.stock !== undefined ? product.stock : current.stock,
      product.material !== undefined ? product.material : current.material,
      product.time !== undefined ? product.time : (current.print_time || ""),
      product.image !== undefined ? (product.image || null) : current.image_path,
      current.id
    ]
  );
  res.json({ product: publicProduct(await productById(current.id)) });
}

async function removeProduct(req, res) {
  const [result] = await pool.execute("DELETE FROM products WHERE id = ?", [Number(req.params.id)]);
  if (result.affectedRows === 0) return res.status(404).json({ error: "Pieza no encontrada." });
  res.json({ ok: true });
}

async function consumeStock(req, res) {
  const quantity = Number(req.body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({ error: "La cantidad no es válida." });
  }
  const [result] = await pool.execute(
    "UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?",
    [quantity, Number(req.params.id), quantity]
  );
  if (result.affectedRows === 0) {
    return res.status(409).json({ error: "No hay stock suficiente." });
  }
  res.json({ product: publicProduct(await productById(Number(req.params.id))) });
}

module.exports = {
  ensureImageColumn,
  seedCatalog,
  listCategories,
  createCategory,
  listProducts,
  createProduct,
  updateProduct,
  removeProduct,
  consumeStock
};
