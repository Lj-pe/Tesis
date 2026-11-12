const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const mysql = require("../backend/node_modules/mysql2/promise");
const dotenv = require("../backend/node_modules/dotenv");
const { serializarCsv, sha256 } = require("./lib");

const REPOSITORY_ROOT = path.resolve(__dirname, "..");
const EXPECTED_DATABASE = "minimarket_tesis";
const DEFAULT_OUTPUT_ROOT = path.join(
  process.env.LOCALAPPDATA || process.env.XDG_CACHE_HOME || os.tmpdir(),
  "Tesis",
  "experimentos_demanda",
  "minimarket_experimentos"
);

const EXPORTS = {
  productos: {
    query: `SELECT id AS producto_id, codigo, categoria_id, nombre, marca,
        presentacion, precio_venta, dias_seguridad, activo,
        DATE_FORMAT(creado_en, '%Y-%m-%d %H:%i:%s') AS creado_en,
        DATE_FORMAT(actualizado_en, '%Y-%m-%d %H:%i:%s') AS actualizado_en
      FROM productos
      ORDER BY id`,
    columns: [
      "producto_id", "codigo", "categoria_id", "nombre", "marca",
      "presentacion", "precio_venta", "dias_seguridad", "activo",
      "creado_en", "actualizado_en",
    ],
  },
  ventas_diarias: {
    query: `SELECT dv.producto_id,
        DATE_FORMAT(v.fecha_comercial, '%Y-%m-%d') AS fecha_comercial,
        COUNT(DISTINCT v.id) AS operaciones,
        SUM(dv.cantidad) AS unidades,
        SUM(dv.importe) AS importe,
        SUM(dv.importe) / NULLIF(SUM(dv.cantidad), 0) AS precio_unitario_ponderado
      FROM ventas v
      INNER JOIN detalle_ventas dv ON dv.venta_id = v.id
      WHERE v.estado = 'realizada'
        AND v.fecha_comercial >= '2025-10-01'
        AND v.fecha_comercial < '2026-11-07'
      GROUP BY dv.producto_id, DATE(v.fecha_comercial)
      ORDER BY dv.producto_id, DATE(v.fecha_comercial)`,
    columns: [
      "producto_id", "fecha_comercial", "operaciones", "unidades",
      "importe", "precio_unitario_ponderado",
    ],
  },
  movimientos: {
    query: `SELECT id AS movimiento_id, producto_id, tipo, variacion_unidades,
        DATE_FORMAT(ocurrido_en, '%Y-%m-%d %H:%i:%s') AS ocurrido_en,
        DATE_FORMAT(fecha_comercial, '%Y-%m-%d') AS fecha_comercial,
        detalle_venta_id, detalle_recepcion_id
      FROM movimientos_inventario
      WHERE fecha_comercial >= '2025-10-01'
        AND fecha_comercial < '2026-11-07'
      ORDER BY producto_id, fecha_comercial, ocurrido_en, id`,
    columns: [
      "movimiento_id", "producto_id", "tipo", "variacion_unidades",
      "ocurrido_en", "fecha_comercial", "detalle_venta_id",
      "detalle_recepcion_id",
    ],
  },
  compras: {
    query: `SELECT c.id AS compra_id, c.proveedor_id,
        DATE_FORMAT(c.creada_en, '%Y-%m-%d %H:%i:%s') AS creada_en,
        DATE_FORMAT(c.fecha_pedido, '%Y-%m-%d') AS fecha_pedido,
        DATE_FORMAT(c.fecha_entrega_prevista, '%Y-%m-%d') AS fecha_entrega_prevista,
        c.plazo_entrega_dias,
        dc.producto_id, dc.unidades_pedidas, dc.importe
      FROM compras c
      INNER JOIN detalle_compras dc ON dc.compra_id = c.id
      WHERE c.fecha_pedido < '2026-11-07'
      ORDER BY c.id, dc.producto_id, dc.id`,
    columns: [
      "compra_id", "proveedor_id", "creada_en", "fecha_pedido",
      "fecha_entrega_prevista", "plazo_entrega_dias", "producto_id",
      "unidades_pedidas", "importe",
    ],
  },
  recepciones: {
    query: `SELECT dr.compra_id, dr.producto_id,
        DATE_FORMAT(r.recibida_en, '%Y-%m-%d %H:%i:%s') AS recibida_en,
        DATE_FORMAT(r.fecha_comercial, '%Y-%m-%d') AS fecha_comercial,
        dr.unidades_recibidas
      FROM detalle_recepciones dr
      INNER JOIN recepciones r ON r.id = dr.recepcion_id
      WHERE r.fecha_comercial < '2026-11-07'
      ORDER BY dr.compra_id, dr.producto_id, dr.id`,
    columns: [
      "compra_id", "producto_id", "recibida_en", "fecha_comercial",
      "unidades_recibidas",
    ],
  },
};

function createRunId() {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${timestamp}-${crypto.randomUUID().slice(0, 8)}`;
}

function assertOutsideRepository(candidate) {
  const relative = path.relative(REPOSITORY_ROOT, candidate);
  if (
    relative === ""
    || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  ) {
    throw new Error("Los extractos deben guardarse fuera del repositorio Git.");
  }
}

async function main() {
  const outputRoot = path.resolve(process.argv[2] || DEFAULT_OUTPUT_ROOT);
  assertOutsideRepository(outputRoot);

  dotenv.config({ path: path.join(REPOSITORY_ROOT, "backend", ".env"), quiet: true });
  const missing = ["DB_HOST", "DB_USER", "DB_NAME"].filter((key) => !process.env[key]);
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

    const [databaseRows] = await connection.query("SELECT DATABASE() AS database_name");
    if (databaseRows[0]?.database_name !== EXPECTED_DATABASE) {
      throw new Error(`La base conectada no es ${EXPECTED_DATABASE}; extracción cancelada.`);
    }

    const extracted = {};
    for (const [name, definition] of Object.entries(EXPORTS)) {
      const [rows] = await connection.query(definition.query);
      extracted[name] = rows;
    }

    await connection.rollback();
    transactionOpen = false;

    await fs.mkdir(outputRoot, { recursive: true });
    const runDirectory = path.join(outputRoot, createRunId());
    await fs.mkdir(runDirectory, { recursive: false });
    const files = {};
    for (const [name, definition] of Object.entries(EXPORTS)) {
      const filename = `${name}.csv`;
      const content = Buffer.from(
        serializarCsv(extracted[name], definition.columns),
        "utf8"
      );
      await fs.writeFile(path.join(runDirectory, filename), content, { flag: "wx" });
      files[filename] = {
        rows: extracted[name].length,
        sha256: sha256(content),
      };
    }

    const metadata = {
      format_version: 1,
      run_id: path.basename(runDirectory),
      extracted_at_utc: new Date().toISOString(),
      database: EXPECTED_DATABASE,
      interval: {
        first_commercial_date_inclusive: "2025-10-01",
        last_commercial_date_inclusive: "2026-11-06",
        excluded_dates: ["2026-11-07", "2026-11-08"],
      },
      observation_policy: {
        realized_sales_only: true,
        missing_product_days: "unknown until availability is reconstructed",
        product_day_zero: "allowed only when recorded stock remains positive for the whole commercial day",
        first_day: "2025-10-01 excluded from availability labels because no pre-period opening balance is available",
      },
      timezone_note: "Dates are formatted in the MySQL session timezone; preserve these strings as business dates.",
      queries: Object.fromEntries(Object.entries(EXPORTS).map(([name, definition]) => [
        name,
        { sql: definition.query, sha256: sha256(definition.query) },
      ])),
      files,
    };
    const metadataContent = `${JSON.stringify(metadata, null, 2)}\n`;
    await fs.writeFile(path.join(runDirectory, "metadata.json"), metadataContent, { flag: "wx" });

    console.log(JSON.stringify({
      run_directory: runDirectory,
      database: EXPECTED_DATABASE,
      files,
      metadata_sha256: sha256(metadataContent),
      notice: "No credentials or personal data exported; output folder is unique and never overwritten.",
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
  console.error(`No se pudo crear el extracto de solo lectura${code}: ${error.message}`);
  process.exitCode = 1;
});
