--TABLAS
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
  reference_file VARCHAR(255),
  status ENUM('pendiente', 'en_proceso', 'completada', 'rechazada') DEFAULT 'pendiente',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO categories (name, description) VALUES
  ('Figuras', 'Figuras decorativas y coleccionables'),
  ('Llaveros', 'Llaveros personalizados'),
  ('Repuestos', 'Piezas de repuesto funcionales'),
  ('Prototipos', 'Prototipos y maquetas'),
  ('Escritorio', 'Organizadores, soportes y accesorios de trabajo'),
  ('Hogar', 'Macetas, lámparas y artículos decorativos');

-- ROLES
-- 1. Rol de Administrador
CREATE ROLE IF NOT EXISTS 'rol_admin';
GRANT ALL PRIVILEGES ON printlab3d.* TO 'rol_admin';
CREATE USER IF NOT EXISTS 'admin_db'@'%' IDENTIFIED BY 'Admin_S3gur0_2026!';
GRANT 'rol_admin' TO 'admin_db'@'%';
SET DEFAULT ROLE 'rol_admin' FOR 'admin_db'@'%';

-- 2. Rol de Auditor
CREATE ROLE IF NOT EXISTS 'rol_auditor';
GRANT SELECT ON printlab3d.* TO 'rol_auditor';
CREATE USER IF NOT EXISTS 'auditor_db'@'%' IDENTIFIED BY 'Auditor_S3gur0_2026!';
GRANT 'rol_auditor' TO 'auditor_db'@'%';
SET DEFAULT ROLE 'rol_auditor' FOR 'auditor_db'@'%';

-- 3. Rol de Backend
CREATE ROLE IF NOT EXISTS 'rol_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON printlab3d.* TO 'rol_app';
GRANT 'rol_app' TO 'printlab_user'@'%';
SET DEFAULT ROLE 'rol_app' FOR 'printlab_user'@'%';

-- 4. Deshabilitar usuario root
DROP USER IF EXISTS 'root'@'%';
ALTER USER IF EXISTS 'root'@'localhost' ACCOUNT LOCK;

FLUSH PRIVILEGES;
