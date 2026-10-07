USE boutique_libreria_bazar_alanis;

CREATE TABLE permisos_acciones_roles (
    id_permiso_accion INT NOT NULL AUTO_INCREMENT,
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
    accion VARCHAR(50) NOT NULL,
    acceso BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NULL,
    PRIMARY KEY (id_permiso_accion),
    UNIQUE KEY uk_permisos_acciones_roles_rol_modulo_accion (rol_id, modulo, accion),
    CONSTRAINT fk_permisos_acciones_roles_rol_modulo
        FOREIGN KEY (rol_id, modulo) REFERENCES permisos_roles(rol_id, modulo)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_permisos_acciones_roles_rol
        FOREIGN KEY (rol_id) REFERENCES roles(id_rol)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
