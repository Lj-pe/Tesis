CREATE DATABASE IF NOT EXISTS boutique_libreria_bazar_alanis
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE boutique_libreria_bazar_alanis;

-- ==========================================
-- 1. roles
-- ==========================================
CREATE TABLE roles (
    id_rol INT NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT NULL,
    estado ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo',
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NULL,
    PRIMARY KEY (id_rol),
    UNIQUE KEY uk_roles_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 2. usuarios
-- ==========================================
CREATE TABLE usuarios (
    id_usuario INT NOT NULL AUTO_INCREMENT,
    rol_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    estado ENUM('activo', 'inactivo', 'bloqueado') NOT NULL DEFAULT 'activo',
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ultimo_acceso DATETIME NULL,
    fecha_actualizacion DATETIME NULL,
    PRIMARY KEY (id_usuario),
    UNIQUE KEY uk_usuarios_username (username),
    UNIQUE KEY uk_usuarios_email (email),
    CONSTRAINT fk_usuarios_roles
        FOREIGN KEY (rol_id) REFERENCES roles(id_rol)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 3. categorias
-- ==========================================
CREATE TABLE categorias (
    id_categoria INT NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT NULL,
    estado ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo',
    fecha_inactivacion DATETIME NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NULL,
    PRIMARY KEY (id_categoria),
    UNIQUE KEY uk_categorias_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 4. productos
-- ==========================================
CREATE TABLE productos (
    id_producto INT NOT NULL AUTO_INCREMENT,
    categoria_id INT NOT NULL,
    codigo_sku VARCHAR(100) NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT NULL,
    estado ENUM('activo', 'inactivo', 'suspendido') NOT NULL DEFAULT 'activo',
    fecha_inactivacion DATETIME NULL,
    unidad_medida VARCHAR(50) NOT NULL,
    precio_venta_actual DECIMAL(12,2) NOT NULL,
    costo_promedio_actual DECIMAL(12,2) NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NULL,
    PRIMARY KEY (id_producto),
    UNIQUE KEY uk_productos_codigo_sku (codigo_sku),
    CONSTRAINT fk_productos_categorias
        FOREIGN KEY (categoria_id) REFERENCES categorias(id_categoria)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 5. inventarios
-- ==========================================
CREATE TABLE inventarios (
    id_inventario INT NOT NULL AUTO_INCREMENT,
    producto_id INT NOT NULL,
    stock_actual INT NOT NULL DEFAULT 0,
    stock_minimo INT NOT NULL DEFAULT 0,
    stock_seguridad INT NULL DEFAULT 0,
    stock_maximo INT NULL,
    estado_inventario ENUM('normal', 'bajo', 'agotado', 'bloqueado') NOT NULL DEFAULT 'normal',
    fecha_ultima_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NULL,
    PRIMARY KEY (id_inventario),
    UNIQUE KEY uk_inventarios_producto (producto_id),
    CONSTRAINT chk_inventarios_stock_actual CHECK (stock_actual >= 0),
    CONSTRAINT chk_inventarios_stock_minimo CHECK (stock_minimo >= 0),
    CONSTRAINT chk_inventarios_stock_seguridad CHECK (stock_seguridad IS NULL OR stock_seguridad >= 0),
    CONSTRAINT chk_inventarios_stock_maximo CHECK (stock_maximo IS NULL OR stock_maximo >= stock_minimo),
    CONSTRAINT fk_inventarios_productos
        FOREIGN KEY (producto_id) REFERENCES productos(id_producto)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 6. proveedores
-- ==========================================
CREATE TABLE proveedores (
    id_proveedor INT NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(150) NOT NULL,
    contacto VARCHAR(150) NULL,
    telefono VARCHAR(50) NULL,
    email VARCHAR(150) NULL,
    direccion TEXT NULL,
    documento_identidad VARCHAR(100) NULL,
    estado ENUM('activo', 'inactivo', 'suspendido') NOT NULL DEFAULT 'activo',
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NULL,
    PRIMARY KEY (id_proveedor),
    UNIQUE KEY uk_proveedores_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 7. compras
-- ==========================================
CREATE TABLE compras (
    id_compra INT NOT NULL AUTO_INCREMENT,
    proveedor_id INT NOT NULL,
    usuario_id INT NOT NULL,
    numero_factura VARCHAR(100) NULL,
    fecha_compra DATE NOT NULL,
    fecha_recepcion DATE NULL,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    estado ENUM('pendiente', 'recibida', 'anulada') NOT NULL DEFAULT 'pendiente',
    observaciones TEXT NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NULL,
    PRIMARY KEY (id_compra),
    UNIQUE KEY uk_compras_numero_factura (numero_factura),
    CONSTRAINT fk_compras_proveedores
        FOREIGN KEY (proveedor_id) REFERENCES proveedores(id_proveedor)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_compras_usuarios
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 8. ventas
-- ==========================================
CREATE TABLE ventas (
    id_venta INT NOT NULL AUTO_INCREMENT,
    usuario_id INT NOT NULL,
    numero_factura VARCHAR(100) NULL,
    fecha_venta DATE NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    descuento DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    estado ENUM('pendiente', 'pagada', 'anulada', 'cancelada') NOT NULL DEFAULT 'pendiente',
    observaciones TEXT NULL,
    forma_pago VARCHAR(50) NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NULL,
    PRIMARY KEY (id_venta),
    UNIQUE KEY uk_ventas_numero_factura (numero_factura),
    CONSTRAINT fk_ventas_usuarios
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 9. movimientos_inventario
-- ==========================================
CREATE TABLE movimientos_inventario (
    id_movimiento INT NOT NULL AUTO_INCREMENT,
    inventario_id INT NOT NULL,
    tipo_movimiento ENUM('entrada', 'salida', 'ajuste', 'devolucion', 'perdida') NOT NULL,
    cantidad INT NOT NULL,
    motivo VARCHAR(255) NULL,
    compra_id INT NULL,
    venta_id INT NULL,
    usuario_id INT NOT NULL,
    fecha_movimiento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado ENUM('confirmado', 'anulado') NOT NULL DEFAULT 'confirmado',
    observaciones TEXT NULL,
    PRIMARY KEY (id_movimiento),
    CONSTRAINT chk_movimientos_inventario_cantidad CHECK (cantidad > 0),
    CONSTRAINT fk_movimientos_inventario_inventarios
        FOREIGN KEY (inventario_id) REFERENCES inventarios(id_inventario)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_movimientos_inventario_compras
        FOREIGN KEY (compra_id) REFERENCES compras(id_compra)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_movimientos_inventario_ventas
        FOREIGN KEY (venta_id) REFERENCES ventas(id_venta)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_movimientos_inventario_usuarios
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 10. detalle_compras
-- ==========================================
CREATE TABLE detalle_compras (
    id_detalle_compra INT NOT NULL AUTO_INCREMENT,
    compra_id INT NOT NULL,
    producto_id INT NOT NULL,
    cantidad INT NOT NULL,
    costo_unitario DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_linea DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    observaciones TEXT NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_detalle_compra),
    CONSTRAINT chk_detalle_compras_cantidad CHECK (cantidad > 0),
    CONSTRAINT fk_detalle_compras_compras
        FOREIGN KEY (compra_id) REFERENCES compras(id_compra)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_detalle_compras_productos
        FOREIGN KEY (producto_id) REFERENCES productos(id_producto)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 11. detalle_ventas
-- ==========================================
CREATE TABLE detalle_ventas (
    id_detalle_venta INT NOT NULL AUTO_INCREMENT,
    venta_id INT NOT NULL,
    producto_id INT NOT NULL,
    cantidad INT NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    descuento DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_linea DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_detalle_venta),
    CONSTRAINT chk_detalle_ventas_cantidad CHECK (cantidad > 0),
    CONSTRAINT fk_detalle_ventas_ventas
        FOREIGN KEY (venta_id) REFERENCES ventas(id_venta)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_detalle_ventas_productos
        FOREIGN KEY (producto_id) REFERENCES productos(id_producto)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 12. predicciones
-- ==========================================
CREATE TABLE predicciones (
    id_prediccion INT NOT NULL AUTO_INCREMENT,
    producto_id INT NOT NULL,
    periodo_inicio DATE NOT NULL,
    periodo_fin DATE NOT NULL,
    metodo_prediccion VARCHAR(100) NOT NULL,
    valor_predicho DECIMAL(12,2) NOT NULL,
    intervalo_confianza DECIMAL(12,2) NULL,
    estado ENUM('generada', 'aprobada', 'descartada') NOT NULL DEFAULT 'generada',
    fecha_generacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_aplicacion DATETIME NULL,
    observaciones TEXT NULL,
    PRIMARY KEY (id_prediccion),
    CONSTRAINT fk_predicciones_productos
        FOREIGN KEY (producto_id) REFERENCES productos(id_producto)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- Relaciones y restricciones clave
-- ==========================================
-- roles -> usuarios
-- categorias -> productos
-- productos -> inventarios (1:1)
-- inventarios -> movimientos_inventario
-- proveedores -> compras
-- compras -> detalle_compras
-- ventas -> detalle_ventas
-- productos -> detalle_compras
-- productos -> detalle_ventas
-- productos -> predicciones
-- usuarios -> compras
-- usuarios -> ventas
-- usuarios -> movimientos_inventario
-- compras -> movimientos_inventario (opcional)
-- ventas -> movimientos_inventario (opcional)

-- Nota:
-- La estructura anterior mantiene una relación clara y sin dependencias circulares innecesarias.
-- Los movimientos de inventario quedan vinculados a inventarios y, opcionalmente, a compras o ventas,
-- sin depender de una tabla que a su vez dependa de movimientos.
