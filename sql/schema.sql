CREATE DATABASE IF NOT EXISTS printlab3d
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE printlab3d;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  role ENUM('comprador', 'vendedor', 'admin') NOT NULL DEFAULT 'comprador',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  description TEXT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  seller_id INT NOT NULL,
  category_id INT,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  material ENUM('PLA', 'PETG', 'ABS') NOT NULL,
  print_time VARCHAR(50),
  image_path VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  buyer_id INT NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS invoice_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS custom_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  description TEXT NOT NULL,
  title VARCHAR(120) NULL,
  material VARCHAR(20) NULL,
  reference_file VARCHAR(255),
  status ENUM('pendiente', 'cotizada', 'imprimiendo', 'lista', 'en_proceso', 'completada', 'rechazada') NOT NULL DEFAULT 'pendiente',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS login_failures (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  forwarded_for VARCHAR(255) NULL,
  user_agent VARCHAR(255) NULL,
  reason ENUM('usuario_inexistente', 'contrasena_incorrecta', 'cuenta_desactivada', 'exitoso') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO categories (name, description) VALUES
  ('Figuras', 'Figuras decorativas y coleccionables'),
  ('Llaveros', 'Llaveros personalizados'),
  ('Repuestos', 'Piezas de repuesto funcionales'),
  ('Prototipos', 'Prototipos y maquetas');