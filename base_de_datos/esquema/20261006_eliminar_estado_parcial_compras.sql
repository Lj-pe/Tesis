USE boutique_libreria_bazar_alanis;

SET @migration_20261006_compras_estado = (
    SELECT COLUMN_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'compras'
      AND COLUMN_NAME = 'estado'
);

SET @migration_20261006_compras_parciales = (
    SELECT COUNT(*)
    FROM compras
    WHERE estado = 'parcial'
);

SET @migration_20261006_compras_sql = CASE
    WHEN @migration_20261006_compras_estado = 'enum(''pendiente'',''recibida'',''anulada'',''parcial'')'
         AND @migration_20261006_compras_parciales = 0
        THEN 'ALTER TABLE compras MODIFY COLUMN estado ENUM(''pendiente'', ''recibida'', ''anulada'') NOT NULL DEFAULT ''pendiente'''
    WHEN @migration_20261006_compras_estado = 'enum(''pendiente'',''recibida'',''anulada'')'
        THEN 'SELECT 1'
    ELSE 'THIS MIGRATION REQUIRES AN EXPECTED ENUM AND NO PARCIAL PURCHASES'
END;

PREPARE migration_20261006_compras_stmt
FROM @migration_20261006_compras_sql;
EXECUTE migration_20261006_compras_stmt;
DEALLOCATE PREPARE migration_20261006_compras_stmt;

SET @migration_20261006_compras_estado = NULL;
SET @migration_20261006_compras_parciales = NULL;
SET @migration_20261006_compras_sql = NULL;
