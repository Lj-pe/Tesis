USE boutique_libreria_bazar_alanis;

CREATE TABLE permisos_roles (
    id_permiso INT NOT NULL AUTO_INCREMENT,
    rol_id INT NOT NULL,
    modulo ENUM(
        'Dashboard',
        'Productos',
        'Categorías',
        'Inventario',
        'Movimientos',
        'Ventas',
        'Compras',
        'Proveedores',
        'Usuarios',
        'Roles',
        'Reportes',
        'Predicción'
    ) NOT NULL,
    acceso BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NULL,
    PRIMARY KEY (id_permiso),
    UNIQUE KEY uk_permisos_roles_rol_modulo (rol_id, modulo),
    CONSTRAINT fk_permisos_roles_roles
        FOREIGN KEY (rol_id) REFERENCES roles(id_rol)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
