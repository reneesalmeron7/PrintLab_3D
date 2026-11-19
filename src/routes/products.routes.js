const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET /api/products
// Lista todos los productos. Si hay ?search=, filtra por nombre.
router.get('/', async (req, res) => {
  const { search } = req.query;
  try {
    let query = 'SELECT * FROM products';
    const params = [];

    if (search) {
      query += ' WHERE name LIKE ?';
      params.push(`%${search}%`);
    }

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/:id
// Devuelve un producto por ID.
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM products WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products
// Crea un producto nuevo (vendedor/admin).
router.post('/', async (req, res) => {
  const {
    seller_id,
    category_id,
    name,
    description,
    price,
    stock,
    material,
    print_time,
    image_path
  } = req.body;

  try {
    const [result] = await db.query(
      `INSERT INTO products
       (seller_id, category_id, name, description, price, stock, material, print_time, image_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [seller_id, category_id, name, description, price, stock, material, print_time, image_path]
    );
    res.status(201).json({ id: result.insertId, message: 'Producto creado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/products/:id
// Actualiza un producto (vendedor/admin).
router.put('/:id', async (req, res) => {
  const {
    category_id,
    name,
    description,
    price,
    stock,
    material,
    print_time,
    image_path
  } = req.body;

  try {
    const [result] = await db.query(
      `UPDATE products
       SET category_id = ?, name = ?, description = ?, price = ?, stock = ?,
           material = ?, print_time = ?, image_path = ?
       WHERE id = ?`,
      [category_id, name, description, price, stock, material, print_time, image_path, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.json({ message: 'Producto actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/products/:id
// Elimina un producto (admin).
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM products WHERE id = ?',
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.json({ message: 'Producto eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;