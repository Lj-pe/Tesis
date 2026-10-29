const {
  esFechaIso,
  obtenerSemanaIso,
} = require("./lib");

const WEEK_START = "2026-04-06";
const WEEK_COUNT = 24;
const WEEKLY_COLUMNS = [
  "producto_id",
  "semana_iso",
  "inicio_semana",
  "fin_semana",
  "unidades",
];

function idPositivo(value) {
  return /^\d+$/.test(String(value))
    && Number.isSafeInteger(Number(value))
    && Number(value) > 0;
}

function weeksInRange() {
  const firstMonday = new Date(`${WEEK_START}T00:00:00.000Z`);
  return Array.from({ length: WEEK_COUNT }, (_, index) => {
    const start = new Date(firstMonday);
    start.setUTCDate(start.getUTCDate() + index * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    return {
      isoWeek: obtenerSemanaIso(startDate),
      startDate,
      endDate,
    };
  });
}

function validarFuentes(products, sales, details) {
  const productIds = new Set();
  for (const product of products) {
    if (!idPositivo(product.id_producto) || productIds.has(product.id_producto)) {
      throw new Error("El catálogo contiene IDs de producto inválidos o duplicados.");
    }
    productIds.add(product.id_producto);
  }

  const salesById = new Map();
  for (const sale of sales) {
    if (!idPositivo(sale.id_venta) || salesById.has(sale.id_venta)) {
      throw new Error("Las ventas contienen IDs inválidos o duplicados.");
    }
    if (sale.estado !== "pagada" || !esFechaIso(sale.fecha_venta)) {
      throw new Error("Las fuentes deben contener únicamente ventas pagadas con fecha ISO válida.");
    }
    salesById.set(sale.id_venta, sale);
  }

  const detailIds = new Set();
  for (const detail of details) {
    if (!idPositivo(detail.id_detalle_venta) || detailIds.has(detail.id_detalle_venta)) {
      throw new Error("Los detalles contienen IDs inválidos o duplicados.");
    }
    if (!salesById.has(detail.venta_id) || !productIds.has(detail.producto_id)) {
      throw new Error("Hay detalles con referencias inexistentes a ventas o productos.");
    }
    if (!/^\d+$/.test(String(detail.cantidad)) || BigInt(detail.cantidad) <= 0n) {
      throw new Error("Los detalles deben tener cantidades enteras positivas.");
    }
    detailIds.add(detail.id_detalle_venta);
  }

  return { productIds, salesById };
}

function crearSeriesSemanales(products, sales, details) {
  const { salesById } = validarFuentes(products, sales, details);
  const weeks = weeksInRange();
  const weekByIso = new Map(weeks.map((week) => [week.isoWeek, week]));
  const sums = new Map();

  for (const detail of details) {
    const sale = salesById.get(detail.venta_id);
    const isoWeek = obtenerSemanaIso(sale.fecha_venta);
    if (!weekByIso.has(isoWeek)) continue;
    const key = `${detail.producto_id}\u0000${isoWeek}`;
    sums.set(key, (sums.get(key) || 0n) + BigInt(detail.cantidad));
  }

  return products.flatMap((product) => weeks.map((week) => ({
    producto_id: product.id_producto,
    semana_iso: week.isoWeek,
    inicio_semana: week.startDate,
    fin_semana: week.endDate,
    unidades: (sums.get(`${product.id_producto}\u0000${week.isoWeek}`) || 0n).toString(),
  })));
}

function validarSeriesSemanales(rows, products, sales, details, expectedProductCount = 55) {
  const checks = [];
  const check = (name, passed, detail = "") => checks.push({
    name,
    passed,
    detail,
  });
  const weeks = weeksInRange();
  const weekByIso = new Map(weeks.map((week) => [week.isoWeek, week]));
  const expectedPairs = new Set(
    products.flatMap((product) => weeks.map((week) => `${product.id_producto}\u0000${week.isoWeek}`))
  );
  const seenPairs = new Set();
  let validQuantities = true;
  let validWeeks = true;
  let allPairsExpected = true;
  const totalsByWeek = new Map(weeks.map((week) => [week.isoWeek, 0n]));

  for (const row of rows) {
    const pair = `${row.producto_id}\u0000${row.semana_iso}`;
    if (seenPairs.has(pair)) allPairsExpected = false;
    seenPairs.add(pair);

    const week = weekByIso.get(row.semana_iso);
    if (!week || row.inicio_semana !== week.startDate || row.fin_semana !== week.endDate) {
      validWeeks = false;
    }
    if (!expectedPairs.has(pair)) allPairsExpected = false;

    if (!/^\d+$/.test(String(row.unidades))) {
      validQuantities = false;
    } else if (week) {
      totalsByWeek.set(week.isoWeek, totalsByWeek.get(week.isoWeek) + BigInt(row.unidades));
    }
  }

  check("Número de productos del catálogo", products.length === expectedProductCount,
    `esperados=${expectedProductCount}; observados=${products.length}`);
  check("Filas producto-semana", rows.length === expectedProductCount * WEEK_COUNT,
    `esperadas=${expectedProductCount * WEEK_COUNT}; observadas=${rows.length}`);
  check("Sin duplicados por producto-semana", seenPairs.size === rows.length);
  check("Pares producto-semana completos", allPairsExpected && seenPairs.size === expectedPairs.size);
  check("Semanas ISO W15–W38 de lunes a domingo", validWeeks
    && weeks[0].isoWeek === "2026-W15"
    && weeks[WEEK_COUNT - 1].isoWeek === "2026-W38");
  check("Unidades enteras no negativas", validQuantities);

  let validSourceTotals = true;
  const sourceTotals = new Map(weeks.map((week) => [week.isoWeek, 0n]));
  const salesById = new Map(sales.map((sale) => [sale.id_venta, sale]));
  for (const detail of details) {
    const sale = salesById.get(detail.venta_id);
    if (!sale || sale.estado !== "pagada") continue;
    const isoWeek = obtenerSemanaIso(sale.fecha_venta);
    if (sourceTotals.has(isoWeek)) {
      sourceTotals.set(isoWeek, sourceTotals.get(isoWeek) + BigInt(detail.cantidad));
    }
  }
  for (const week of weeks) {
    if (sourceTotals.get(week.isoWeek) !== totalsByWeek.get(week.isoWeek)) {
      validSourceTotals = false;
      break;
    }
  }
  check("Totales semanales coinciden con CSV fuente", validSourceTotals);

  return {
    passed: checks.every((result) => result.passed),
    checks,
    weeks: weeks.map((week) => ({
      semana_iso: week.isoWeek,
      inicio_semana: week.startDate,
      fin_semana: week.endDate,
      unidades: (totalsByWeek.get(week.isoWeek) || 0n).toString(),
    })),
  };
}

module.exports = {
  WEEKLY_COLUMNS,
  crearSeriesSemanales,
  validarSeriesSemanales,
};
