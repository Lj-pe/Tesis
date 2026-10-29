const fs = require("node:fs/promises");
const path = require("node:path");
const {
  esFechaIso,
  obtenerSemanaIso,
  parsearCsv,
  sha256,
} = require("./lib");

const QUERY_VERSION = "paid-sales-catalog-v1";
const REPOSITORY_ROOT = path.resolve(__dirname, "..");
const AUDIT_REFERENCE = {
  paid_sales: 70,
  paid_detail_rows: 384,
  catalog_products: 55,
  paid_units: 1389,
  first_paid_sale: "2026-04-04",
  last_paid_sale: "2026-09-26",
  complete_iso_week_range: "2026-W15..2026-W38",
  full_week_sales: 67,
};
const REQUIRED_COLUMNS = {
  "ventas.csv": ["id_venta", "fecha_venta", "estado"],
  "detalles.csv": ["id_detalle_venta", "venta_id", "producto_id", "cantidad"],
  "productos.csv": ["id_producto", "categoria_id", "codigo_sku", "nombre", "estado"],
};

function estaDentroDeDirectorio(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function idPositivo(value) {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function sumarValores(values) {
  return values.reduce((total, value) => total + BigInt(value), 0n);
}

async function main() {
  const runDirectory = path.resolve(process.argv[2] || "");
  if (!process.argv[2] || estaDentroDeDirectorio(REPOSITORY_ROOT, runDirectory)) {
    throw new Error("Indique la carpeta de extracto situada fuera del repositorio Git.");
  }

  const metadata = JSON.parse(await fs.readFile(path.join(runDirectory, "metadata.json"), "utf8"));
  const failures = [];
  const warnings = [];
  const checks = [];
  const check = (label, passed, detail = "") => {
    checks.push({ label, status: passed ? "OK" : "FALLO", detail });
    if (!passed) failures.push(label);
  };
  const compareAudit = (label, actual, expected) => {
    const passed = actual === expected;
    checks.push({
      label,
      status: passed ? "OK" : "AVISO",
      detail: passed ? "" : `referencia de auditoría=${expected}; extracto=${actual}`,
    });
    if (!passed) warnings.push(label);
  };

  check("Versión de formato reconocida", metadata.format_version === 1);
  check("Versión de consultas reconocida", metadata.query_version === QUERY_VERSION);
  check("Fecha UTC de extracción válida", typeof metadata.extracted_at_utc === "string"
    && !Number.isNaN(Date.parse(metadata.extracted_at_utc)));
  check("Versión/hash de las tres consultas", ["ventas", "detalles", "productos"].every((key) => (
    typeof metadata.queries?.[key]?.sql === "string"
    && metadata.queries[key].sha256 === sha256(metadata.queries[key].sql)
  )));

  const datasets = {};
  for (const fileName of Object.keys(REQUIRED_COLUMNS)) {
    const content = await fs.readFile(path.join(runDirectory, fileName));
    const fileMetadata = metadata.files?.[fileName];
    check(`${fileName}: hash SHA-256`, Boolean(fileMetadata)
      && fileMetadata.sha256 === sha256(content));

    const parsed = parsearCsv(content.toString("utf8"));
    const expectedColumns = REQUIRED_COLUMNS[fileName];
    check(`${fileName}: columnas`, JSON.stringify(parsed.columns) === JSON.stringify(expectedColumns));
    check(`${fileName}: filas según metadatos`, parsed.records.length === fileMetadata?.rows);
    datasets[fileName] = parsed.records;
  }

  const sales = datasets["ventas.csv"] || [];
  const details = datasets["detalles.csv"] || [];
  const products = datasets["productos.csv"] || [];

  check("IDs de venta únicos y positivos",
    sales.every((sale) => idPositivo(sale.id_venta))
      && new Set(sales.map((sale) => sale.id_venta)).size === sales.length);
  check("Solo se exportaron ventas pagadas", sales.every((sale) => sale.estado === "pagada"));
  check("Fechas de venta válidas", sales.every((sale) => esFechaIso(sale.fecha_venta)));
  check("IDs de producto únicos y positivos",
    products.every((product) => idPositivo(product.id_producto))
      && new Set(products.map((product) => product.id_producto)).size === products.length);

  const salesById = new Map(sales.map((sale) => [sale.id_venta, sale]));
  const productIds = new Set(products.map((product) => product.id_producto));
  check("Claves de detalle únicas y positivas",
    details.every((detail) => idPositivo(detail.id_detalle_venta))
      && new Set(details.map((detail) => detail.id_detalle_venta)).size === details.length);
  check("Claves de venta de detalles existentes",
    details.every((detail) => salesById.has(detail.venta_id)));
  check("Claves de producto de detalles existentes",
    details.every((detail) => productIds.has(detail.producto_id)));
  check("Cantidades enteras positivas",
    details.every((detail) => /^\d+$/.test(detail.cantidad) && Number(detail.cantidad) > 0));
  check("Cada venta exportada tiene detalles",
    sales.every((sale) => details.some((detail) => detail.venta_id === sale.id_venta)));

  const sortedDates = sales.map((sale) => sale.fecha_venta).sort();
  const firstDate = sortedDates[0] || "";
  const lastDate = sortedDates[sortedDates.length - 1] || "";
  const unitTotal = details.length > 0
    && details.every((detail) => /^\d+$/.test(detail.cantidad))
    ? sumarValores(details.map((detail) => detail.cantidad)).toString()
    : "invalid";
  compareAudit("Conteo de ventas pagadas", sales.length, AUDIT_REFERENCE.paid_sales);
  compareAudit("Conteo de líneas de detalle pagadas", details.length, AUDIT_REFERENCE.paid_detail_rows);
  compareAudit("Conteo de productos del catálogo", products.length, AUDIT_REFERENCE.catalog_products);
  compareAudit("Total de unidades pagadas", unitTotal, String(AUDIT_REFERENCE.paid_units));
  compareAudit("Primera fecha pagada", firstDate, AUDIT_REFERENCE.first_paid_sale);
  compareAudit("Última fecha pagada", lastDate, AUDIT_REFERENCE.last_paid_sale);

  const fullPeriodSales = sales.filter((sale) => (
    sale.fecha_venta >= "2026-04-06" && sale.fecha_venta <= "2026-09-20"
  ));
  const fullPeriodUnits = details
    .filter((detail) => {
      const sale = salesById.get(detail.venta_id);
      return sale && sale.fecha_venta >= "2026-04-06" && sale.fecha_venta <= "2026-09-20";
    })
    .map((detail) => detail.cantidad);
  const weekCounts = new Map();
  fullPeriodSales.forEach((sale) => {
    const week = obtenerSemanaIso(sale.fecha_venta);
    weekCounts.set(week, (weekCounts.get(week) || 0) + 1);
  });
  const expectedWeeks = Array.from({ length: 24 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 3, 6 + index * 7));
    return obtenerSemanaIso(date.toISOString().slice(0, 10));
  });
  const missingWeeks = expectedWeeks.filter((week) => !weekCounts.has(week));
  const allWeeksPresent = missingWeeks.length === 0;
  check("W15–W38: rango de 24 semanas ISO", expectedWeeks[0] === "2026-W15"
    && expectedWeeks[expectedWeeks.length - 1] === "2026-W38"
    && expectedWeeks.length === 24);
  check("W15–W38: hay ventas registradas en las 24 semanas", allWeeksPresent,
    missingWeeks.length > 0 ? `semanas sin ventas registradas: ${missingWeeks.join(", ")}` : "");
  compareAudit("W15–W38: conteo de ventas", fullPeriodSales.length, AUDIT_REFERENCE.full_week_sales);

  const datesOutOfAuditRange = sales.filter((sale) => (
    sale.fecha_venta < AUDIT_REFERENCE.first_paid_sale
    || sale.fecha_venta > AUDIT_REFERENCE.last_paid_sale
  ));
  check("Todas las ventas dentro del rango auditado",
    datesOutOfAuditRange.length === 0);

  console.log(`Ejecución: ${metadata.run_id}`);
  console.log(`Extraído: ${metadata.extracted_at_utc}`);
  console.log(`Filas: ventas=${sales.length}, detalles=${details.length}, productos=${products.length}`);
  console.log(`Unidades pagadas: ${unitTotal}`);
  console.log(`W15–W38: ${fullPeriodSales.length} ventas, ${fullPeriodUnits.length > 0 ? sumarValores(fullPeriodUnits).toString() : "0"} unidades, ${weekCounts.size}/24 semanas con ventas`);
  for (const result of checks) {
    console.log(`${result.status}: ${result.label}${result.detail ? ` — ${result.detail}` : ""}`);
  }
  console.log("AVISO: que una semana o fecha no tenga ventas registradas no demuestra que la captura diaria esté completa.");
  if (warnings.length > 0) {
    console.log(`AVISOS de comparación con auditoría anterior: ${warnings.length}. Confirme si el origen cambió antes de aceptar un nuevo baseline.`);
  }
  if (failures.length > 0) {
    console.error(`Validación fallida: ${failures.length} comprobación(es) de integridad.`);
    process.exitCode = 1;
  } else {
    console.log("Validación estructural completada; las diferencias de conteos de referencia se reportan como avisos.");
  }
}

main().catch((error) => {
  console.error(`No se pudo validar el extracto: ${error.message}`);
  process.exitCode = 1;
});
