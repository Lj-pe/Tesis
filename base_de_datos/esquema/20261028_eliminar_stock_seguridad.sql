-- OBSOLETE: the project decision is to retain stock_seguridad.
-- The historical SQL below is retained for reference and intentionally disabled.
-- Do not remove this comment wrapper or execute/uncomment the migration.
/*
USE boutique_libreria_bazar_alanis;

-- Run during a maintenance window with writes to inventarios stopped.
-- Inspect SHOW CREATE TABLE and dependent objects with a sufficiently
-- privileged account before setting this acknowledgement to 1.
SET @migration_20261028_dependencies_verified = 0;

DROP PROCEDURE IF EXISTS migration_20261028_eliminar_stock_seguridad;

DELIMITER //

CREATE PROCEDURE migration_20261028_eliminar_stock_seguridad()
SQL SECURITY INVOKER
BEGIN
    DECLARE v_database_ok INT DEFAULT 0;
    DECLARE v_mariadb_version_ok INT DEFAULT 0;
    DECLARE v_table_exists INT DEFAULT 0;
    DECLARE v_table_engine_ok INT DEFAULT 0;
    DECLARE v_column_exists INT DEFAULT 0;
    DECLARE v_column_definition_ok INT DEFAULT 0;
    DECLARE v_target_check_exists INT DEFAULT 0;
    DECLARE v_target_check_definition_ok INT DEFAULT 0;
    DECLARE v_minimum_check_exists INT DEFAULT 0;
    DECLARE v_minimum_check_definition_ok INT DEFAULT 0;
    DECLARE v_maximum_check_exists INT DEFAULT 0;
    DECLARE v_maximum_check_definition_ok INT DEFAULT 0;
    DECLARE v_backup_exists INT DEFAULT 0;
    DECLARE v_backup_engine_ok INT DEFAULT 0;
    DECLARE v_backup_column_count INT DEFAULT 0;
    DECLARE v_backup_id_definition_ok INT DEFAULT 0;
    DECLARE v_backup_value_definition_ok INT DEFAULT 0;
    DECLARE v_backup_primary_key_ok INT DEFAULT 0;
    DECLARE v_backup_index_count INT DEFAULT 0;
    DECLARE v_backup_constraint_count INT DEFAULT 0;
    DECLARE v_backup_trigger_count INT DEFAULT 0;
    DECLARE v_backup_values_valid INT DEFAULT 0;
    DECLARE v_snapshot_mismatch BIGINT DEFAULT 0;
    DECLARE v_index_dependencies INT DEFAULT 0;
    DECLARE v_foreign_key_dependencies INT DEFAULT 0;
    DECLARE v_check_dependencies INT DEFAULT 0;
    DECLARE v_generated_column_dependencies INT DEFAULT 0;
    DECLARE v_trigger_dependencies INT DEFAULT 0;
    DECLARE v_view_dependencies INT DEFAULT 0;
    DECLARE v_routine_dependencies INT DEFAULT 0;
    DECLARE v_event_dependencies INT DEFAULT 0;

    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Migration disabled: stock_seguridad must be retained';

    SET v_database_ok = DATABASE() = 'boutique_libreria_bazar_alanis';
    SET v_mariadb_version_ok = VERSION() LIKE '10.4.32-MariaDB%';

    SELECT COUNT(*)
    INTO v_table_exists
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventarios';

    SELECT COUNT(*)
    INTO v_table_engine_ok
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventarios'
      AND ENGINE = 'InnoDB';

    SELECT COUNT(*)
    INTO v_column_exists
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventarios'
      AND COLUMN_NAME = 'stock_seguridad';

    SELECT COUNT(*)
    INTO v_column_definition_ok
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventarios'
      AND COLUMN_NAME = 'stock_seguridad'
      AND DATA_TYPE = 'int'
      AND IS_NULLABLE = 'YES'
      AND COLUMN_DEFAULT = '0';

    SELECT COUNT(*)
    INTO v_target_check_exists
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventarios'
      AND CONSTRAINT_NAME = 'chk_inventarios_stock_seguridad'
      AND CONSTRAINT_TYPE = 'CHECK';

    SELECT COUNT(*)
    INTO v_target_check_definition_ok
    FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
    INNER JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA
     AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
    WHERE cc.CONSTRAINT_SCHEMA = DATABASE()
      AND cc.CONSTRAINT_NAME = 'chk_inventarios_stock_seguridad'
      AND tc.TABLE_NAME = 'inventarios'
      AND tc.CONSTRAINT_TYPE = 'CHECK'
      AND REPLACE(
            REPLACE(
                REPLACE(
                    REPLACE(LOWER(cc.CHECK_CLAUSE), '`', ''),
                    ' ',
                    ''
                ),
                '(',
                ''
            ),
            ')',
            ''
          ) = 'stock_seguridadisnullorstock_seguridad>=0';

    SELECT COUNT(*)
    INTO v_minimum_check_exists
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventarios'
      AND CONSTRAINT_NAME = 'chk_inventarios_stock_minimo'
      AND CONSTRAINT_TYPE = 'CHECK';

    SELECT COUNT(*)
    INTO v_minimum_check_definition_ok
    FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
    INNER JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA
     AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
    WHERE cc.CONSTRAINT_SCHEMA = DATABASE()
      AND cc.CONSTRAINT_NAME = 'chk_inventarios_stock_minimo'
      AND tc.TABLE_NAME = 'inventarios'
      AND tc.CONSTRAINT_TYPE = 'CHECK'
      AND REPLACE(
            REPLACE(
                REPLACE(
                    REPLACE(LOWER(cc.CHECK_CLAUSE), '`', ''),
                    ' ',
                    ''
                ),
                '(',
                ''
            ),
            ')',
            ''
          ) = 'stock_minimo>=0';

    SELECT COUNT(*)
    INTO v_maximum_check_exists
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventarios'
      AND CONSTRAINT_NAME = 'chk_inventarios_stock_maximo'
      AND CONSTRAINT_TYPE = 'CHECK';

    SELECT COUNT(*)
    INTO v_maximum_check_definition_ok
    FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
    INNER JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA
     AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
    WHERE cc.CONSTRAINT_SCHEMA = DATABASE()
      AND cc.CONSTRAINT_NAME = 'chk_inventarios_stock_maximo'
      AND tc.TABLE_NAME = 'inventarios'
      AND tc.CONSTRAINT_TYPE = 'CHECK'
      AND REPLACE(
            REPLACE(
                REPLACE(
                    REPLACE(LOWER(cc.CHECK_CLAUSE), '`', ''),
                    ' ',
                    ''
                ),
                '(',
                ''
            ),
            ')',
            ''
          ) = 'stock_maximoisnullorstock_maximo>=stock_minimo';

    SELECT COUNT(*)
    INTO v_backup_exists
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventarios_stock_seguridad_20261028_backup';

    IF v_database_ok <> 1
       OR v_mariadb_version_ok <> 1
       OR v_table_exists <> 1
       OR v_table_engine_ok <> 1
       OR v_minimum_check_exists <> 1
       OR v_minimum_check_definition_ok <> 1
       OR v_maximum_check_exists <> 1
       OR v_maximum_check_definition_ok <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Migration stopped: database, MariaDB version, table, or retained CHECK precondition failed';
    END IF;

    IF v_column_exists = 1 AND v_target_check_exists <> 1
       AND v_backup_exists <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Migration stopped: security column exists without its expected CHECK and backup';
    ELSEIF v_column_exists = 0 AND v_target_check_exists = 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Migration stopped: security CHECK exists but its column is missing';
    ELSEIF v_column_exists = 0 AND v_target_check_exists = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Migration stopped: column is already absent; the existing backup cannot be verified against its source';
    END IF;

    IF v_column_exists = 1
       AND v_target_check_exists = 1
       AND v_target_check_definition_ok <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Migration stopped: security CHECK definition differs from expected expression';
    END IF;

    IF v_column_exists = 1 AND v_column_definition_ok <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Migration stopped: security column definition differs from expected INT NULL DEFAULT 0';
    END IF;

    IF COALESCE(@migration_20261028_dependencies_verified, 0) <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Migration stopped: inspect dependencies with a privileged account and set the acknowledgement to 1';
    END IF;

    SELECT COUNT(*)
    INTO v_index_dependencies
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventarios'
      AND COLUMN_NAME = 'stock_seguridad';

    SELECT COUNT(*)
    INTO v_foreign_key_dependencies
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE (
            TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'inventarios'
            AND COLUMN_NAME = 'stock_seguridad'
          )
       OR (
            REFERENCED_TABLE_SCHEMA = DATABASE()
            AND REFERENCED_TABLE_NAME = 'inventarios'
            AND REFERENCED_COLUMN_NAME = 'stock_seguridad'
          );

    SELECT COUNT(*)
    INTO v_check_dependencies
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
    INNER JOIN INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
      ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
     AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
    WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
      AND tc.TABLE_NAME = 'inventarios'
      AND tc.CONSTRAINT_TYPE = 'CHECK'
      AND tc.CONSTRAINT_NAME <> 'chk_inventarios_stock_seguridad'
      AND LOWER(cc.CHECK_CLAUSE) LIKE '%stock_seguridad%';

    SELECT COUNT(*)
    INTO v_generated_column_dependencies
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventarios'
      AND EXTRA LIKE '%GENERATED%'
      AND (
            GENERATION_EXPRESSION IS NULL
            OR LOWER(GENERATION_EXPRESSION) LIKE '%stock_seguridad%'
          );

    SELECT COUNT(*)
    INTO v_trigger_dependencies
    FROM INFORMATION_SCHEMA.TRIGGERS
    WHERE ACTION_STATEMENT IS NULL
       OR LOWER(ACTION_STATEMENT) LIKE '%stock_seguridad%';

    SELECT COUNT(*)
    INTO v_view_dependencies
    FROM INFORMATION_SCHEMA.VIEWS
    WHERE VIEW_DEFINITION IS NULL
       OR LOWER(VIEW_DEFINITION) LIKE '%stock_seguridad%';

    SELECT COUNT(*)
    INTO v_routine_dependencies
    FROM INFORMATION_SCHEMA.ROUTINES
    WHERE NOT (
            ROUTINE_SCHEMA = DATABASE()
            AND ROUTINE_NAME = 'migration_20261028_eliminar_stock_seguridad'
          )
      AND (
            ROUTINE_DEFINITION IS NULL
            OR LOWER(ROUTINE_DEFINITION) LIKE '%stock_seguridad%'
          );

    SELECT COUNT(*)
    INTO v_event_dependencies
    FROM INFORMATION_SCHEMA.EVENTS
    WHERE EVENT_DEFINITION IS NULL
       OR LOWER(EVENT_DEFINITION) LIKE '%stock_seguridad%';

    IF v_index_dependencies <> 0
       OR v_foreign_key_dependencies <> 0
       OR v_check_dependencies <> 0
       OR v_generated_column_dependencies <> 0
       OR v_trigger_dependencies <> 0
       OR v_view_dependencies <> 0
       OR v_routine_dependencies <> 0
       OR v_event_dependencies <> 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Migration stopped: another schema object references stock_seguridad';
    END IF;

    IF v_backup_exists = 0 THEN
        CREATE TABLE inventarios_stock_seguridad_20261028_backup (
            id_inventario INT NOT NULL,
            stock_seguridad INT NULL,
            PRIMARY KEY (id_inventario)
        ) ENGINE=InnoDB;

        INSERT INTO inventarios_stock_seguridad_20261028_backup (
            id_inventario,
            stock_seguridad
        )
        SELECT id_inventario, stock_seguridad
        FROM inventarios;
    END IF;

    SELECT COUNT(*)
    INTO v_backup_engine_ok
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventarios_stock_seguridad_20261028_backup'
      AND ENGINE = 'InnoDB';

    SELECT COUNT(*)
    INTO v_backup_column_count
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventarios_stock_seguridad_20261028_backup';

    SELECT COUNT(*)
    INTO v_backup_id_definition_ok
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventarios_stock_seguridad_20261028_backup'
      AND COLUMN_NAME = 'id_inventario'
      AND DATA_TYPE = 'int'
      AND IS_NULLABLE = 'NO';

    SELECT COUNT(*)
    INTO v_backup_value_definition_ok
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventarios_stock_seguridad_20261028_backup'
      AND COLUMN_NAME = 'stock_seguridad'
      AND DATA_TYPE = 'int'
      AND IS_NULLABLE = 'YES';

    SELECT COUNT(*)
    INTO v_backup_primary_key_ok
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventarios_stock_seguridad_20261028_backup'
      AND CONSTRAINT_NAME = 'PRIMARY'
      AND COLUMN_NAME = 'id_inventario'
      AND ORDINAL_POSITION = 1;

    IF v_backup_primary_key_ok = 1 THEN
        SELECT COUNT(*)
        INTO v_backup_primary_key_ok
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'inventarios_stock_seguridad_20261028_backup'
          AND CONSTRAINT_NAME = 'PRIMARY';
    END IF;

    SELECT COUNT(DISTINCT INDEX_NAME)
    INTO v_backup_index_count
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventarios_stock_seguridad_20261028_backup';

    SELECT COUNT(*)
    INTO v_backup_constraint_count
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventarios_stock_seguridad_20261028_backup';

    SELECT COUNT(*)
    INTO v_backup_trigger_count
    FROM INFORMATION_SCHEMA.TRIGGERS
    WHERE TRIGGER_SCHEMA = DATABASE()
      AND EVENT_OBJECT_TABLE = 'inventarios_stock_seguridad_20261028_backup';

    SELECT COUNT(*)
    INTO v_backup_values_valid
    FROM inventarios_stock_seguridad_20261028_backup
    WHERE stock_seguridad IS NOT NULL
      AND stock_seguridad < 0;

    IF v_backup_engine_ok <> 1
       OR v_backup_column_count <> 2
       OR v_backup_id_definition_ok <> 1
       OR v_backup_value_definition_ok <> 1
       OR v_backup_primary_key_ok <> 1
       OR v_backup_index_count <> 1
       OR v_backup_constraint_count <> 1
       OR v_backup_trigger_count <> 0
       OR v_backup_values_valid <> 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Migration stopped: backup table structure is unexpected';
    END IF;

    IF v_column_exists = 1 THEN
        SELECT COUNT(*)
        INTO v_snapshot_mismatch
        FROM (
            SELECT i.id_inventario
            FROM inventarios i
            LEFT JOIN inventarios_stock_seguridad_20261028_backup b
              ON b.id_inventario = i.id_inventario
            WHERE b.id_inventario IS NULL
               OR NOT (b.stock_seguridad <=> i.stock_seguridad)
            UNION ALL
            SELECT b.id_inventario
            FROM inventarios_stock_seguridad_20261028_backup b
            LEFT JOIN inventarios i
              ON i.id_inventario = b.id_inventario
            WHERE i.id_inventario IS NULL
        ) AS snapshot_mismatches;

        IF v_snapshot_mismatch <> 0 THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Migration stopped: backup differs from live data; stop writes and inspect it';
        END IF;
    END IF;

    IF v_target_check_exists = 1 THEN
        ALTER TABLE inventarios
            DROP CONSTRAINT chk_inventarios_stock_seguridad;
    END IF;

    IF v_column_exists = 1 THEN
        ALTER TABLE inventarios
            DROP COLUMN stock_seguridad;
    END IF;

    SELECT COUNT(*)
    INTO v_column_exists
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventarios'
      AND COLUMN_NAME = 'stock_seguridad';

    SELECT COUNT(*)
    INTO v_target_check_exists
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventarios'
      AND CONSTRAINT_NAME = 'chk_inventarios_stock_seguridad'
      AND CONSTRAINT_TYPE = 'CHECK';

    SELECT COUNT(*)
    INTO v_minimum_check_exists
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventarios'
      AND CONSTRAINT_NAME = 'chk_inventarios_stock_minimo'
      AND CONSTRAINT_TYPE = 'CHECK';

    SELECT COUNT(*)
    INTO v_maximum_check_exists
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventarios'
      AND CONSTRAINT_NAME = 'chk_inventarios_stock_maximo'
      AND CONSTRAINT_TYPE = 'CHECK';

    SELECT COUNT(*)
    INTO v_minimum_check_definition_ok
    FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
    INNER JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA
     AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
    WHERE cc.CONSTRAINT_SCHEMA = DATABASE()
      AND cc.CONSTRAINT_NAME = 'chk_inventarios_stock_minimo'
      AND tc.TABLE_NAME = 'inventarios'
      AND tc.CONSTRAINT_TYPE = 'CHECK'
      AND REPLACE(
            REPLACE(
                REPLACE(
                    REPLACE(LOWER(cc.CHECK_CLAUSE), '`', ''),
                    ' ',
                    ''
                ),
                '(',
                ''
            ),
            ')',
            ''
          ) = 'stock_minimo>=0';

    SELECT COUNT(*)
    INTO v_maximum_check_definition_ok
    FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
    INNER JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA
     AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
    WHERE cc.CONSTRAINT_SCHEMA = DATABASE()
      AND cc.CONSTRAINT_NAME = 'chk_inventarios_stock_maximo'
      AND tc.TABLE_NAME = 'inventarios'
      AND tc.CONSTRAINT_TYPE = 'CHECK'
      AND REPLACE(
            REPLACE(
                REPLACE(
                    REPLACE(LOWER(cc.CHECK_CLAUSE), '`', ''),
                    ' ',
                    ''
                ),
                '(',
                ''
            ),
            ')',
            ''
          ) = 'stock_maximoisnullorstock_maximo>=stock_minimo';

    IF v_column_exists <> 0
       OR v_target_check_exists <> 0
       OR v_minimum_check_exists <> 1
       OR v_minimum_check_definition_ok <> 1
       OR v_maximum_check_exists <> 1
       OR v_maximum_check_definition_ok <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Migration failed post-check: required columns or CHECK constraints remain';
    END IF;
END//

DELIMITER ;

CALL migration_20261028_eliminar_stock_seguridad();

DROP PROCEDURE migration_20261028_eliminar_stock_seguridad;

-- Reversion manual, únicamente si se decide restaurar el campo:
-- ALTER TABLE inventarios
--     ADD COLUMN stock_seguridad INT NULL DEFAULT 0;
-- UPDATE inventarios i
-- INNER JOIN inventarios_stock_seguridad_20261028_backup b
--     ON b.id_inventario = i.id_inventario
-- SET i.stock_seguridad = b.stock_seguridad;
-- ALTER TABLE inventarios
--     ADD CONSTRAINT chk_inventarios_stock_seguridad
--     CHECK (stock_seguridad IS NULL OR stock_seguridad >= 0);
*/
