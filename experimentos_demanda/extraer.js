const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const mysql = require("../backend/node_modules/mysql2/promise");
const dotenv = require("../backend/node_modules/dotenv");
const { serializarCsv, sha256 } = require("./lib");

const QUERY_VERSION = "paid-sales-catalog-v1";
const REPOSITORY_ROOT = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_ROOT = path.join(
  process.env.LOCALAPPDATA || process.env.XDG_CACHE_HOME || os.tmpdir(),
  "Tesis",
  "experimentos_demanda",
  "extractos"
);

const QUERIES = {
  ventas: `SELECT id_venta, DATE_FORMAT(fecha_venta, '%Y-%m-%d') AS fecha_venta, estado
FROM ventas
WHERE estado = 'pagada'
ORDER BY fecha_venta, id_venta`,
  detalles: `SELECT dv.id_detalle_venta, dv.venta_id, dv.producto_id, dv.cantidad
FROM detalle_ventas AS dv
INNER JOIN ventas AS v ON v.id_venta = dv.venta_id
WHERE v.estado = 'pagada'
ORDER BY v.fecha_venta, dv.venta_id, dv.id_detalle_venta`,
  productos: `SELECT id_producto, categoria_id, codigo_sku, nombre, estado
FROM productos
ORDER BY id_producto`,
};

const COLUMNS = {
  ventas: ["id_venta", "fecha_venta", "estado"],
  detalles: ["id_detalle_venta", "venta_id", "producto_id", "cantidad"],
  productos: ["id_producto", "categoria_id", "codigo_sku", "nombre", "estado"],
};

function estaDentroDeDirectorio(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function crearIdEjecucion() {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${timestamp}-${crypto.randomUUID().slice(0, 8)}`;
}

async function main() {
  const outputRoot = path.resolve(process.argv[2] || DEFAULT_OUTPUT_ROOT);
  if (estaDentroDeDirectorio(REPOSITORY_ROOT, outputRoot)) {
    throw new Error("La carpeta de extractos debe estar fuera del repositorio Git.");
  }

  const envPath = path.join(REPOSITORY_ROOT, "backend", ".env");
  dotenv.config({ path: envPath, quiet: true });

  const required = ["DB_HOST", "DB_USER", "DB_NAME"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Faltan variables de configuración: ${missing.join(", ")}.`);
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

    const extracted = {};
    for (const [key, query] of Object.entries(QUERIES)) {
      const [rows] = await connection.query(query);
      extracted[key] = rows;
    }

    await connection.rollback();
    transactionOpen = false;

    const runId = crearIdEjecucion();
    const runDirectory = path.join(outputRoot, runId);
    await fs.mkdir(outputRoot, { recursive: true });
    await fs.mkdir(runDirectory, { recursive: false });

    const files = {};
    for (const [key, rows] of Object.entries(extracted)) {
      const fileName = `${key}.csv`;
      const content = Buffer.from(serializarCsv(rows, COLUMNS[key]), "utf8");
      await fs.writeFile(path.join(runDirectory, fileName), content, { flag: "wx" });
      files[fileName] = {
        rows: rows.length,
        sha256: sha256(content),
      };
    }

    const metadata = {
      format_version: 1,
      query_version: QUERY_VERSION,
      run_id: runId,
      extracted_at_utc: new Date().toISOString(),
      source: "MySQL oficial; instantánea transaccional de solo lectura",
      included_data: "Ventas pagadas, detalles vinculados a ventas pagadas y catálogo completo de productos",
      excluded_data: ["credenciales", "usuarios", "datos personales"],
      audit_reference: {
        paid_sales: 70,
        paid_detail_rows: 384,
        catalog_products: 55,
        paid_units: 1389,
        first_paid_sale: "2026-04-04",
        last_paid_sale: "2026-09-26",
        complete_iso_week_range: "2026-W15..2026-W38",
      },
      queries: Object.fromEntries(Object.entries(QUERIES).map(([key, query]) => [
        key,
        { sql: query, sha256: sha256(query) },
      ])),
      files,
    };
    const metadataContent = `${JSON.stringify(metadata, null, 2)}\n`;
    await fs.writeFile(path.join(runDirectory, "metadata.json"), metadataContent, { flag: "wx" });

    console.log(`Extracto creado: ${runDirectory}`);
    console.log(`Filas: ventas=${files["ventas.csv"].rows}, detalles=${files["detalles.csv"].rows}, productos=${files["productos.csv"].rows}`);
    console.log("Metadatos y hashes SHA-256 guardados; ninguna credencial ni dato personal fue exportado.");
  } finally {
    if (transactionOpen) {
      await connection.rollback();
    }
    await connection.end();
  }
}

main().catch((error) => {
  const code = error.code ? ` (${error.code})` : "";
  console.error(`No se pudo crear el extracto${code}. Revise la configuración local y el acceso a MySQL.`);
  process.exitCode = 1;
});
