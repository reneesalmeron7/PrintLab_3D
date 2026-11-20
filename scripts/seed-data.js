const bcrypt = require("bcrypt");
const pool = require("../src/config/db");

async function seed() {
  console.log("Iniciando carga de datos de prueba...");

  // 1. Categorías adicionales
  const categories = [
    ["Figuras", "Modelos coleccionables, bustos y piezas de exhibición"],
    ["Llaveros", "Llaveros temáticos, utilitarios y personalizados"],
    ["Repuestos", "Piezas mecánicas funcionales, engranajes y reemplazos"],
    ["Prototipos", "Carcasas electrónicas, cajas a medida y maquetas"],
    ["Escritorio", "Organizadores de cables, soportes y accesorios de trabajo"],
    ["Hogar", "Macetas, lámparas y artículos de decoración para el hogar"]
  ];

  for (const [name, desc] of categories) {
    const [rows] = await pool.execute("SELECT id FROM categories WHERE name = ?", [name]);
    if (rows.length === 0) {
      await pool.execute("INSERT INTO categories (name, description) VALUES (?, ?)", [name, desc]);
    }
  }

  // 2. Usuarios de prueba
  const users = [
    ["cliente", "cliente123", "cliente@printlab.local", "comprador", 1],
    ["vendedor", "vendedor123", "vendedor@printlab.local", "vendedor", 1],
    ["admin", "admin123", "admin@printlab.local", "admin", 1],
    ["sofia_maker", "sofia123", "sofia@printlab.local", "vendedor", 1],
    ["marcos_dev", "marcos123", "marcos@printlab.local", "comprador", 1],
    ["lucia_art", "lucia123", "lucia@printlab.local", "comprador", 1],
    ["carlos_hacker", "carlos123", "carlos@printlab.local", "comprador", 0] // Desactivado
  ];

  const userIds = {};

  for (const [username, pass, email, role, active] of users) {
    const [existing] = await pool.execute("SELECT id FROM users WHERE username = ?", [username]);
    if (existing.length === 0) {
      const hash = await bcrypt.hash(pass, 10);
      const [res] = await pool.execute(
        "INSERT INTO users (username, password_hash, email, role, active) VALUES (?, ?, ?, ?, ?)",
        [username, hash, email, role, active]
      );
      userIds[username] = res.insertId;
    } else {
      userIds[username] = existing[0].id;
    }
  }

  // 3. Obtener categorías con sus IDs
  const [catRows] = await pool.query("SELECT id, name FROM categories");
  const catMap = {};
  catRows.forEach(c => { catMap[c.name] = c.id; });

  const sellerId = userIds["vendedor"];
  const sofiaId = userIds["sofia_maker"] || sellerId;

  // 4. Productos de muestra adicionales
  const extraProducts = [
    ["Organizador de Cables Modular", "Set de 4 clips magnéticos para borde de mesa. Evita que caigan los cables USB-C y HDMI.", 95.00, 15, "PLA", "1 h 15 min", catMap["Escritorio"], sellerId],
    ["Soporte Antivibración para Ventilador", "Pies desacopladores de 120 mm para gabinetes de servidor o impresoras 3D.", 110.00, 10, "PETG", "45 min", catMap["Repuestos"], sellerId],
    ["Carcasa Raspberry Pi 4 con Fan", "Diseño ventilado con rejilla superior y soporte para ventilador de 30 mm y disipadores.", 260.00, 8, "ABS", "2.5 h", catMap["Prototipos"], sellerId],
    ["Lámpara Luna Geométrica", "Esfera poliedro de 12 cm de diámetro preparada para socket LED E27. Efecto difuminado cálido.", 350.00, 5, "PLA", "6 h", catMap["Hogar"], sofiaId],
    ["Busto Low-Poly Lobo", "Diseño poligonal estilizado de 14 cm de altura. No necesita soportes de impresión.", 280.00, 6, "PLA", "4 h", catMap["Figuras"], sofiaId],
    ["Guía de Filamento para Impresora", "Brazo guía con rodamiento para carrete de 1 kg. Reduce fricción en el extrusor.", 75.00, 20, "PETG", "30 min", catMap["Repuestos"], sellerId],
    ["Soporte de Auriculares Bajo Mesa", "Gancho rígido con dos orificios avellanados para tornillos M4. Aguanta diademas pesadas.", 175.00, 12, "PETG", "2 h", catMap["Escritorio"], sellerId],
    ["Caja de Herramientas Miniatura", "Maletín con bisagra viva y cierre a presión para boquillas, llaves allen y pinzas.", 190.00, 7, "PLA", "3 h", catMap["Escritorio"], sofiaId]
  ];

  for (const [name, desc, price, stock, mat, time, catId, sId] of extraProducts) {
    const [found] = await pool.execute("SELECT id FROM products WHERE name = ?", [name]);
    if (found.length === 0) {
      await pool.execute(
        `INSERT INTO products (seller_id, category_id, name, description, price, stock, material, print_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [sId, catId, name, desc, price, stock, mat, time]
      );
    }
  }

  // 5. Facturas de prueba históricas
  const [currentInvoices] = await pool.query("SELECT COUNT(*) AS total FROM invoices");
  if (Number(currentInvoices[0].total) === 0) {
    const [allProducts] = await pool.query("SELECT id, name, price FROM products LIMIT 6");
    if (allProducts.length >= 3) {
      const p1 = allProducts[0];
      const p2 = allProducts[1];
      const p3 = allProducts[2];

      const invData = [
        {
          buyerId: userIds["cliente"],
          total: Number(p1.price) + Number(p2.price) * 2,
          date: new Date(Date.now() - 86400000 * 3), // hace 3 días
          items: [
            { id: p1.id, qty: 1, price: p1.price },
            { id: p2.id, qty: 2, price: p2.price }
          ]
        },
        {
          buyerId: userIds["marcos_dev"] || userIds["cliente"],
          total: Number(p3.price) * 3,
          date: new Date(Date.now() - 86400000 * 1), // ayer
          items: [
            { id: p3.id, qty: 3, price: p3.price }
          ]
        },
        {
          buyerId: userIds["lucia_art"] || userIds["cliente"],
          total: Number(p1.price) * 2 + Number(p3.price),
          date: new Date(),
          items: [
            { id: p1.id, qty: 2, price: p1.price },
            { id: p3.id, qty: 1, price: p3.price }
          ]
        }
      ];

      for (const inv of invData) {
        const [res] = await pool.execute(
          "INSERT INTO invoices (buyer_id, total, created_at) VALUES (?, ?, ?)",
          [inv.buyerId, inv.total, inv.date]
        );
        for (const item of inv.items) {
          await pool.execute(
            "INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)",
            [res.insertId, item.id, item.qty, item.price]
          );
        }
      }
      console.log("Facturas de prueba insertadas.");
    }
  }

  // 6. Solicitudes personalizadas (custom_requests)
  const [currentReqs] = await pool.query("SELECT COUNT(*) AS total FROM custom_requests");
  if (Number(currentReqs[0].total) === 0) {
    const sampleReqs = [
      [userIds["cliente"], "Soporte para micrófono HyperX", "PETG", "Soporte personalizado para micrófono HyperX con agarre de 35mm para escritorio.", "soporte_mic.stl", "imprimiendo", "Cotización aprobada ($16.00). Imprimiendo en PETG negro."],
      [userIds["marcos_dev"] || userIds["cliente"], "Adaptador riel DIN ESP32", "ABS", "Adaptador de riel DIN para módulo ESP32 con terminales expuestos.", "din_esp32.obj", "lista", "Tu pieza ya está lista para retirar en el taller."],
      [userIds["lucia_art"] || userIds["cliente"], "Molde geométrico corazón", "PLA", "Molde geométrico en forma de corazón para vaciado de velas aromáticas.", "molde_corazon.3mf", "pendiente", null],
      [userIds["cliente"], "Engranaje helicoidal 48 dientes", "ABS", "Engranaje helicoidal de 48 dientes con chaveta de 4 mm para máquina de coser.", "engranaje_48d.stl", "cotizada", "Cotización: $14.50 en ABS reforzado. Tiempo estimado: 2 h."]
    ];

    for (const [uId, piece, material, desc, file, status, note] of sampleReqs) {
      await pool.execute(
        "INSERT INTO custom_requests (user_id, piece_name, material, description, reference_file, status, seller_note, notified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [uId, piece, material, desc, file, status, note, note ? new Date() : null]
      );
    }
    console.log("Solicitudes de impresión insertadas.");
  }

  // 7. Registro de intentos de inicio de sesión (Auditoría de ciberseguridad / fuerza bruta)
  const [currentFailures] = await pool.query("SELECT COUNT(*) AS total FROM login_failures");
  if (Number(currentFailures[0].total) === 0) {
    const auditLogs = [
      ["admin", "192.168.1.150", null, "Hydra/9.5 (Linux)", "contrasena_incorrecta", new Date(Date.now() - 3600000 * 2)],
      ["admin", "192.168.1.150", null, "Hydra/9.5 (Linux)", "contrasena_incorrecta", new Date(Date.now() - 3600000 * 2 + 1000)],
      ["admin", "192.168.1.150", null, "Hydra/9.5 (Linux)", "contrasena_incorrecta", new Date(Date.now() - 3600000 * 2 + 2000)],
      ["root", "192.168.1.150", null, "Hydra/9.5 (Linux)", "usuario_inexistente", new Date(Date.now() - 3600000 * 2 + 3000)],
      ["carlos_hacker", "192.168.1.88", null, "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "cuenta_desactivada", new Date(Date.now() - 3600000)],
      ["cliente", "192.168.1.25", null, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "exitoso", new Date(Date.now() - 1800000)],
      ["admin", "192.168.1.10", null, "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "exitoso", new Date(Date.now() - 900000)]
    ];

    for (const [user, ip, fwd, ua, reason, date] of auditLogs) {
      await pool.execute(
        "INSERT INTO login_failures (username, ip_address, forwarded_for, user_agent, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [user, ip, fwd, ua, reason, date]
      );
    }
    console.log("Registros de auditoría (logs de inicio de sesión) insertados.");
  }

  console.log("¡Carga de datos completada con éxito!");
  process.exit(0);
}

seed().catch(err => {
  console.error("Error al poblar la base:", err);
  process.exit(1);
});
