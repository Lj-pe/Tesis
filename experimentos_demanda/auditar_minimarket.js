const path = require("node:path");
const mysql = require("../backend/node_modules/mysql2/promise");
const dotenv = require("../backend/node_modules/dotenv");

const REPOSITORY_ROOT = path.resolve(__dirname, "..");
const EXPECTED_DATABASE = "minimarket_tesis";

const QUERIES = {
  database: `SELECT DATABASE() AS database_name,
    @@session.time_zone AS session_timezone,
    @@system_time_zone AS system_timezone`,
  sales: `SELECT estado, COUNT(*) AS sale_count,
    MIN(DATE_FORMAT(fecha_comercial, '%Y-%m-%d')) AS first_commercial_date,
    MAX(DATE_FORMAT(fecha_comercial, '%Y-%m-%d')) AS last_commercial_date,
    SUM(fecha_comercial IS NULL) AS missing_commercial_date,
    SUM(realizada_en IS NULL) AS missing_event_timestamp
  FROM ventas
  GROUP BY estado
  ORDER BY estado`,
  realized_details: `SELECT COUNT(*) AS detail_rows,
    COUNT(DISTINCT dv.producto_id) AS products,
    COUNT(DISTINCT CONCAT(dv.producto_id, '|', DATE_FORMAT(v.fecha_comercial, '%Y-%m-%d'))) AS observed_product_days,
    SUM(dv.cantidad) AS recorded_units,
    SUM(dv.cantidad IS NULL OR dv.cantidad <= 0) AS invalid_quantities,
    SUM(dv.importe IS NULL OR dv.importe <> ROUND(dv.cantidad * dv.precio_unitario, 2)) AS amount_mismatches,
    SUM(v.id IS NULL OR p.id IS NULL) AS orphan_references
  FROM ventas v
  JOIN detalle_ventas dv ON dv.venta_id = v.id
  LEFT JOIN productos p ON p.id = dv.producto_id
  WHERE v.estado = 'realizada'`,
  product_catalog: `SELECT COUNT(*) AS products,
    SUM(categoria_id IS NULL) AS missing_category,
    SUM(marca IS NULL OR TRIM(marca) = '') AS missing_brand,
    SUM(presentacion IS NULL OR TRIM(presentacion) = '') AS missing_presentation,
    SUM(precio_venta IS NULL) AS missing_current_price,
    SUM(dias_seguridad IS NULL) AS missing_security_days,
    COUNT(DISTINCT DATE_FORMAT(creado_en, '%Y-%m-%d')) AS distinct_catalog_creation_dates,
    MIN(DATE_FORMAT(creado_en, '%Y-%m-%d')) AS first_catalog_creation_date,
    MAX(DATE_FORMAT(creado_en, '%Y-%m-%d')) AS last_catalog_creation_date
  FROM productos`,
  movements: `SELECT tipo, COUNT(*) AS movement_rows,
    COUNT(DISTINCT producto_id) AS products,
    MIN(DATE_FORMAT(fecha_comercial, '%Y-%m-%d')) AS first_commercial_date,
    MAX(DATE_FORMAT(fecha_comercial, '%Y-%m-%d')) AS last_commercial_date,
    SUM(ocurrido_en IS NULL) AS missing_event_timestamp,
    SUM(fecha_comercial IS NULL) AS missing_commercial_date,
    SUM(variacion_unidades) AS net_units
  FROM movimientos_inventario
  GROUP BY tipo
  ORDER BY tipo`,
  movement_reconciliation: `SELECT
    SUM(CASE WHEN m.tipo = 'venta'
      AND (dv.id IS NULL OR v.id IS NULL
        OR v.estado NOT IN ('realizada', 'anulada')
        OR m.variacion_unidades <> -dv.cantidad OR m.ocurrido_en <> v.realizada_en)
      THEN 1 ELSE 0 END) AS invalid_sale_movements,
    SUM(CASE WHEN m.tipo = 'anulacion_venta'
      AND (dv.id IS NULL OR v.id IS NULL OR v.estado <> 'anulada'
        OR m.variacion_unidades <> dv.cantidad OR m.ocurrido_en <> v.anulada_en)
      THEN 1 ELSE 0 END) AS invalid_reversal_movements,
    SUM(CASE WHEN m.tipo = 'recepcion'
      AND (dr.id IS NULL OR m.variacion_unidades <> dr.unidades_recibidas)
      THEN 1 ELSE 0 END) AS invalid_receipt_movements
  FROM movimientos_inventario m
  LEFT JOIN detalle_ventas dv ON dv.id = m.detalle_venta_id
  LEFT JOIN ventas v ON v.id = dv.venta_id
  LEFT JOIN detalle_recepciones dr ON dr.id = m.detalle_recepcion_id
  WHERE m.tipo IN ('venta', 'anulacion_venta', 'recepcion')`,
  opening_adjustments: `SELECT COUNT(*) AS products_with_one_positive_adjustment,
    SUM(opening_count <> 1 OR opening_units <= 0) AS products_with_unexpected_adjustments,
    SUM(opening_units) AS recorded_opening_units
  FROM (
    SELECT p.id,
      COUNT(m.id) AS opening_count,
      COALESCE(SUM(m.variacion_unidades), 0) AS opening_units
    FROM productos p
    LEFT JOIN movimientos_inventario m
      ON m.producto_id = p.id AND m.tipo = 'ajuste'
    GROUP BY p.id
  ) AS product_openings`,
  stock_before_recorded_sales: `WITH ordered_movements AS (
    SELECT m.producto_id, m.tipo, v.estado,
      SUM(variacion_unidades) OVER (
        PARTITION BY m.producto_id
        ORDER BY m.ocurrido_en, m.id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ) AS stock_before
    FROM movimientos_inventario m
    LEFT JOIN detalle_ventas dv ON dv.id = m.detalle_venta_id
    LEFT JOIN ventas v ON v.id = dv.venta_id
  )
  SELECT COUNT(*) AS recorded_sale_events,
    COUNT(DISTINCT producto_id) AS products,
    SUM(stock_before IS NULL OR stock_before <= 0) AS sales_without_positive_stock,
    MIN(stock_before) AS minimum_stock_before_sale,
    MAX(stock_before) AS maximum_stock_before_sale
  FROM ordered_movements
  WHERE tipo = 'venta' AND estado = 'realizada'`,
  tied_inventory_timestamps: `SELECT COUNT(*) AS product_timestamp_groups,
    SUM(tied_event_count > 1) AS groups_with_multiple_events,
    SUM(has_sale AND has_receipt) AS sale_receipt_ties
  FROM (
    SELECT producto_id, ocurrido_en,
      COUNT(*) AS tied_event_count,
      MAX(tipo = 'venta') AS has_sale,
      MAX(tipo = 'recepcion') AS has_receipt
    FROM movimientos_inventario
    GROUP BY producto_id, ocurrido_en
    HAVING COUNT(*) > 1
  ) AS ties`,
  purchases: `SELECT estado, COUNT(*) AS purchase_orders,
    MIN(DATE_FORMAT(fecha_pedido, '%Y-%m-%d')) AS first_order_date,
    MAX(DATE_FORMAT(fecha_pedido, '%Y-%m-%d')) AS last_order_date,
    MIN(DATE_FORMAT(fecha_entrega_prevista, '%Y-%m-%d')) AS first_expected_date,
    MAX(DATE_FORMAT(fecha_entrega_prevista, '%Y-%m-%d')) AS last_expected_date
  FROM compras
  GROUP BY estado
  ORDER BY estado`,
  receipts: `SELECT COUNT(*) AS receipts,
    COUNT(DISTINCT compra_id) AS linked_purchase_orders,
    MIN(DATE_FORMAT(fecha_comercial, '%Y-%m-%d')) AS first_commercial_date,
    MAX(DATE_FORMAT(fecha_comercial, '%Y-%m-%d')) AS last_commercial_date
  FROM recepciones`,
  requested_dates: `SELECT 'sales' AS source,
      DATE_FORMAT(fecha_comercial, '%Y-%m-%d') AS event_date,
      estado AS event_type, COUNT(*) AS records
    FROM ventas
    WHERE fecha_comercial >= '2026-11-07' AND fecha_comercial < '2026-11-09'
    GROUP BY DATE(fecha_comercial), estado
  UNION ALL
  SELECT 'movements',
      DATE_FORMAT(fecha_comercial, '%Y-%m-%d'),
      tipo, COUNT(*)
    FROM movimientos_inventario
    WHERE fecha_comercial >= '2026-11-07' AND fecha_comercial < '2026-11-09'
    GROUP BY DATE(fecha_comercial), tipo
  ORDER BY source, event_date, event_type`,
};

async function main() {
  dotenv.config({ path: path.join(REPOSITORY_ROOT, "backend", ".env"), quiet: true });

  const required = ["DB_HOST", "DB_USER", "DB_NAME"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Faltan variables locales de conexión: ${missing.join(", ")}.`);
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  let transactionOpen = false;
  try {
    await connection.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
    transactionOpen = true;

    const [databaseRows] = await connection.query(QUERIES.database);
    if (databaseRows[0]?.database_name !== EXPECTED_DATABASE) {
      throw new Error(`La base conectada no es ${EXPECTED_DATABASE}; auditoría cancelada.`);
    }

    const results = {};
    for (const [name, query] of Object.entries(QUERIES)) {
      if (name === "database") {
        results[name] = databaseRows;
      } else {
        const [rows] = await connection.query(query);
        results[name] = rows;
      }
    }

    await connection.rollback();
    transactionOpen = false;
    console.log(JSON.stringify({
      audit: "minimarket-demand-readonly-v1",
      database: EXPECTED_DATABASE,
      generated_at_utc: new Date().toISOString(),
      coverage_warning: "Una ausencia de ventas no se clasifica como demanda cero ni como cierre.",
      results,
    }, null, 2));
  } finally {
    if (transactionOpen) {
      await connection.rollback();
    }
    await connection.end();
  }
}

main().catch((error) => {
  const code = error.code ? ` (${error.code})` : "";
  console.error(`Falló la auditoría de solo lectura${code}: ${error.message}`);
  process.exitCode = 1;
});
