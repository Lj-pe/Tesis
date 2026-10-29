const fs = require("node:fs/promises");
const path = require("node:path");
const {
  parsearCsv,
  serializarCsv,
  sha256,
} = require("./lib");
const {
  WEEKLY_COLUMNS,
  crearSeriesSemanales,
  validarSeriesSemanales,
} = require("./series");

const REPOSITORY_ROOT = path.resolve(__dirname, "..");
const REQUIRED_COLUMNS = {
  "ventas.csv": ["id_venta", "fecha_venta", "estado"],
  "detalles.csv": ["id_detalle_venta", "venta_id", "producto_id", "cantidad"],
  "productos.csv": ["id_producto", "categoria_id", "codigo_sku", "nombre", "estado"],
};
const OUTPUT_CSV = "series_semanales.csv";
const OUTPUT_SUMMARY = "validacion_series_semanales.json";

function estaDentroDeDirectorio(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".."
    && !path.isAbsolute(relative));
}

async function cargarCsv(runDirectory, metadata, fileName, columns) {
  const content = await fs.readFile(path.join(runDirectory, fileName));
  const fileMetadata = metadata.files?.[fileName];
  if (!fileMetadata || fileMetadata.sha256 !== sha256(content)) {
    throw new Error(`El hash de entrada no coincide: ${fileName}.`);
  }
  const parsed = parsearCsv(content.toString("utf8"));
  if (JSON.stringify(parsed.columns) !== JSON.stringify(columns)) {
    throw new Error(`Las columnas de ${fileName} no coinciden con el formato esperado.`);
  }
  if (parsed.records.length !== fileMetadata.rows) {
    throw new Error(`El conteo de filas de ${fileName} no coincide con metadata.json.`);
  }
  return {
    records: parsed.records,
    sha256: sha256(content),
  };
}

async function main() {
  const runDirectory = path.resolve(process.argv[2] || "");
  if (!process.argv[2] || estaDentroDeDirectorio(REPOSITORY_ROOT, runDirectory)) {
    throw new Error("Indique una carpeta de extracto situada fuera del repositorio Git.");
  }

  const metadata = JSON.parse(await fs.readFile(path.join(runDirectory, "metadata.json"), "utf8"));
  const inputs = {};
  const datasets = {};
  for (const [fileName, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const loaded = await cargarCsv(runDirectory, metadata, fileName, columns);
    datasets[fileName] = loaded.records;
    inputs[fileName] = loaded.sha256;
  }

  if (datasets["productos.csv"].length !== 55) {
    throw new Error(`Se esperaban 55 productos en el catálogo; se encontraron ${datasets["productos.csv"].length}.`);
  }

  const products = datasets["productos.csv"];
  const sales = datasets["ventas.csv"];
  const details = datasets["detalles.csv"];
  const rows = crearSeriesSemanales(products, sales, details);
  const validation = validarSeriesSemanales(rows, products, sales, details);
  const csvContent = Buffer.from(serializarCsv(rows, WEEKLY_COLUMNS), "utf8");
  const summary = {
    format_version: 1,
    prepared_at_utc: new Date().toISOString(),
    source_run_id: metadata.run_id,
    source_extracted_at_utc: metadata.extracted_at_utc,
    methodology: {
      identifier: "weekly-paid-units-per-product-v1",
      product_key: "productos.id_producto",
      aggregation: "Suma de detalle_ventas.cantidad por producto y semana ISO de ventas.fecha_venta, exclusivamente ventas con estado pagada.",
      interval: {
        first_week: "2026-W15",
        last_week: "2026-W38",
        start_date: "2026-04-06",
        end_date: "2026-09-20",
        week_definition: "Semanas ISO completas, lunes a domingo.",
      },
      missing_sales: "Se conserva cada pareja producto-semana; sin detalles pagados dentro de la semana se asigna 0. Esto no demuestra cobertura diaria completa.",
    },
    inputs,
    outputs: {
      [OUTPUT_CSV]: {
        rows: rows.length,
        sha256: sha256(csvContent),
      },
    },
    validation,
  };

  await fs.writeFile(path.join(runDirectory, OUTPUT_CSV), csvContent, { flag: "wx" });
  await fs.writeFile(path.join(runDirectory, OUTPUT_SUMMARY), `${JSON.stringify(summary, null, 2)}\n`, { flag: "wx" });

  console.log(`Serie preparada: ${path.join(runDirectory, OUTPUT_CSV)}`);
  console.log(`Resumen: ${path.join(runDirectory, OUTPUT_SUMMARY)}`);
  console.log(`Filas: ${rows.length}; semanas: 2026-W15–W38; productos: ${products.length}`);
  for (const result of validation.checks) {
    console.log(`${result.passed ? "OK" : "FALLO"}: ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
  }
  console.log("AVISO: semanas sin ventas se representan con cero; esto no demuestra cobertura diaria completa.");
  if (!validation.passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`No se pudieron preparar las series: ${error.message}`);
  process.exitCode = 1;
});
