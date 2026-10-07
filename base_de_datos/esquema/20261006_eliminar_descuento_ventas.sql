USE boutique_libreria_bazar_alanis;

SET @migration_20261006_ventas_descuento_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ventas'
      AND COLUMN_NAME = 'descuento'
);

SET @migration_20261006_detalle_ventas_descuento_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'detalle_ventas'
      AND COLUMN_NAME = 'descuento'
);

SET @migration_20261006_ventas_descuento_nonzero = NULL;
SET @migration_20261006_detalle_ventas_descuento_nonzero = NULL;

SET @migration_20261006_descuento_check_sql = CASE
    WHEN @migration_20261006_ventas_descuento_exists = 1
         AND @migration_20261006_detalle_ventas_descuento_exists = 1
        THEN 'SELECT COUNT(*) INTO @migration_20261006_ventas_descuento_nonzero FROM ventas WHERE descuento IS NULL OR descuento <> 0.00'
    ELSE 'INVALID MIGRATION: expected descuento columns are missing'
END;

PREPARE migration_20261006_descuento_check_stmt
FROM @migration_20261006_descuento_check_sql;
EXECUTE migration_20261006_descuento_check_stmt;
DEALLOCATE PREPARE migration_20261006_descuento_check_stmt;

SET @migration_20261006_descuento_check_sql = CASE
    WHEN @migration_20261006_ventas_descuento_exists = 1
         AND @migration_20261006_detalle_ventas_descuento_exists = 1
        THEN 'SELECT COUNT(*) INTO @migration_20261006_detalle_ventas_descuento_nonzero FROM detalle_ventas WHERE descuento IS NULL OR descuento <> 0.00'
    ELSE 'INVALID MIGRATION: expected descuento columns are missing'
END;

PREPARE migration_20261006_descuento_check_stmt
FROM @migration_20261006_descuento_check_sql;
EXECUTE migration_20261006_descuento_check_stmt;
DEALLOCATE PREPARE migration_20261006_descuento_check_stmt;

SET @migration_20261006_descuento_preconditions_ok = (
    @migration_20261006_ventas_descuento_exists = 1
    AND @migration_20261006_detalle_ventas_descuento_exists = 1
    AND @migration_20261006_ventas_descuento_nonzero = 0
    AND @migration_20261006_detalle_ventas_descuento_nonzero = 0
);

SET @migration_20261006_descuento_alter_ventas_sql = CASE
    WHEN @migration_20261006_descuento_preconditions_ok
        THEN 'ALTER TABLE ventas DROP COLUMN descuento'
    ELSE 'INVALID MIGRATION: descuento columns must exist and contain only zero values'
END;

PREPARE migration_20261006_descuento_alter_stmt
FROM @migration_20261006_descuento_alter_ventas_sql;
EXECUTE migration_20261006_descuento_alter_stmt;
DEALLOCATE PREPARE migration_20261006_descuento_alter_stmt;

SET @migration_20261006_descuento_alter_detalle_ventas_sql = CASE
    WHEN @migration_20261006_descuento_preconditions_ok
        THEN 'ALTER TABLE detalle_ventas DROP COLUMN descuento'
    ELSE 'INVALID MIGRATION: descuento columns must exist and contain only zero values'
END;

PREPARE migration_20261006_descuento_alter_stmt
FROM @migration_20261006_descuento_alter_detalle_ventas_sql;
EXECUTE migration_20261006_descuento_alter_stmt;
DEALLOCATE PREPARE migration_20261006_descuento_alter_stmt;

SET @migration_20261006_ventas_descuento_remaining = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ventas'
      AND COLUMN_NAME = 'descuento'
);

SET @migration_20261006_detalle_ventas_descuento_remaining = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'detalle_ventas'
      AND COLUMN_NAME = 'descuento'
);

SET @migration_20261006_descuento_final_sql = CASE
    WHEN @migration_20261006_descuento_preconditions_ok
         AND @migration_20261006_ventas_descuento_remaining = 0
         AND @migration_20261006_detalle_ventas_descuento_remaining = 0
        THEN 'SELECT 1 AS descuento_eliminado_de_ventas_y_detalle_ventas'
    ELSE 'INVALID MIGRATION: final descuento column verification failed'
END;

PREPARE migration_20261006_descuento_final_stmt
FROM @migration_20261006_descuento_final_sql;
EXECUTE migration_20261006_descuento_final_stmt;
DEALLOCATE PREPARE migration_20261006_descuento_final_stmt;
