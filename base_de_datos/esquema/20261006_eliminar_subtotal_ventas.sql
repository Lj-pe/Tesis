USE boutique_libreria_bazar_alanis;

SET @migration_20261006_ventas_subtotal_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ventas'
      AND COLUMN_NAME = 'subtotal'
);

SET @migration_20261006_detalle_ventas_subtotal_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'detalle_ventas'
      AND COLUMN_NAME = 'subtotal'
);

SET @migration_20261006_ventas_total_mismatch = NULL;
SET @migration_20261006_detalle_ventas_total_mismatch = NULL;

SET @migration_20261006_subtotal_check_sql = CASE
    WHEN @migration_20261006_ventas_subtotal_exists = 1
         AND @migration_20261006_detalle_ventas_subtotal_exists = 1
        THEN 'SELECT COUNT(*) INTO @migration_20261006_ventas_total_mismatch FROM (SELECT v.id_venta FROM ventas v LEFT JOIN detalle_ventas dv ON dv.venta_id = v.id_venta GROUP BY v.id_venta, v.total HAVING v.total <> COALESCE(SUM(dv.total_linea), 0.00)) AS ventas_inconsistentes'
    ELSE 'INVALID MIGRATION: expected subtotal columns are missing'
END;

PREPARE migration_20261006_subtotal_check_stmt
FROM @migration_20261006_subtotal_check_sql;
EXECUTE migration_20261006_subtotal_check_stmt;
DEALLOCATE PREPARE migration_20261006_subtotal_check_stmt;

SET @migration_20261006_subtotal_check_sql = CASE
    WHEN @migration_20261006_ventas_subtotal_exists = 1
         AND @migration_20261006_detalle_ventas_subtotal_exists = 1
        THEN 'SELECT COUNT(*) INTO @migration_20261006_detalle_ventas_total_mismatch FROM detalle_ventas WHERE total_linea <> cantidad * precio_unitario'
    ELSE 'INVALID MIGRATION: expected subtotal columns are missing'
END;

PREPARE migration_20261006_subtotal_check_stmt
FROM @migration_20261006_subtotal_check_sql;
EXECUTE migration_20261006_subtotal_check_stmt;
DEALLOCATE PREPARE migration_20261006_subtotal_check_stmt;

SET @migration_20261006_subtotal_preconditions_ok = (
    @migration_20261006_ventas_subtotal_exists = 1
    AND @migration_20261006_detalle_ventas_subtotal_exists = 1
    AND @migration_20261006_ventas_total_mismatch = 0
    AND @migration_20261006_detalle_ventas_total_mismatch = 0
);

SET @migration_20261006_subtotal_alter_ventas_sql = CASE
    WHEN @migration_20261006_subtotal_preconditions_ok
        THEN 'ALTER TABLE ventas DROP COLUMN subtotal'
    ELSE 'INVALID MIGRATION: subtotal columns must exist and totals must match details'
END;

PREPARE migration_20261006_subtotal_alter_stmt
FROM @migration_20261006_subtotal_alter_ventas_sql;
EXECUTE migration_20261006_subtotal_alter_stmt;
DEALLOCATE PREPARE migration_20261006_subtotal_alter_stmt;

SET @migration_20261006_subtotal_alter_detalle_ventas_sql = CASE
    WHEN @migration_20261006_subtotal_preconditions_ok
        THEN 'ALTER TABLE detalle_ventas DROP COLUMN subtotal'
    ELSE 'INVALID MIGRATION: subtotal columns must exist and totals must match details'
END;

PREPARE migration_20261006_subtotal_alter_stmt
FROM @migration_20261006_subtotal_alter_detalle_ventas_sql;
EXECUTE migration_20261006_subtotal_alter_stmt;
DEALLOCATE PREPARE migration_20261006_subtotal_alter_stmt;

SET @migration_20261006_ventas_subtotal_remaining = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ventas'
      AND COLUMN_NAME = 'subtotal'
);

SET @migration_20261006_detalle_ventas_subtotal_remaining = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'detalle_ventas'
      AND COLUMN_NAME = 'subtotal'
);

SET @migration_20261006_subtotal_final_sql = CASE
    WHEN @migration_20261006_subtotal_preconditions_ok
         AND @migration_20261006_ventas_subtotal_remaining = 0
         AND @migration_20261006_detalle_ventas_subtotal_remaining = 0
        THEN 'SELECT 1 AS subtotal_eliminado_de_ventas_y_detalle_ventas'
    ELSE 'INVALID MIGRATION: final subtotal column verification failed'
END;

PREPARE migration_20261006_subtotal_final_stmt
FROM @migration_20261006_subtotal_final_sql;
EXECUTE migration_20261006_subtotal_final_stmt;
DEALLOCATE PREPARE migration_20261006_subtotal_final_stmt;
