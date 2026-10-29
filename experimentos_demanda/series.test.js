const assert = require("node:assert/strict");
const test = require("node:test");
const {
  crearSeriesSemanales,
  validarSeriesSemanales,
} = require("./series");

const products = [
  { id_producto: "1" },
  { id_producto: "2" },
];

const sales = [
  { id_venta: "10", fecha_venta: "2026-04-06", estado: "pagada" },
  { id_venta: "11", fecha_venta: "2026-04-12", estado: "pagada" },
  { id_venta: "12", fecha_venta: "2026-04-13", estado: "pagada" },
  { id_venta: "13", fecha_venta: "2026-04-05", estado: "pagada" },
];

const details = [
  { id_detalle_venta: "100", venta_id: "10", producto_id: "1", cantidad: "3" },
  { id_detalle_venta: "101", venta_id: "11", producto_id: "1", cantidad: "2" },
  { id_detalle_venta: "102", venta_id: "12", producto_id: "2", cantidad: "4" },
  { id_detalle_venta: "103", venta_id: "13", producto_id: "1", cantidad: "100" },
];

test("crea 24 semanas ISO completas para cada producto, con ceros y solo ventas dentro del rango", () => {
  const rows = crearSeriesSemanales(products, sales, details);

  assert.equal(rows.length, 48);
  assert.deepEqual(rows.slice(0, 2), [
    {
      producto_id: "1",
      semana_iso: "2026-W15",
      inicio_semana: "2026-04-06",
      fin_semana: "2026-04-12",
      unidades: "5",
    },
    {
      producto_id: "1",
      semana_iso: "2026-W16",
      inicio_semana: "2026-04-13",
      fin_semana: "2026-04-19",
      unidades: "0",
    },
  ]);
  assert.equal(rows.find((row) => row.producto_id === "2" && row.semana_iso === "2026-W15").unidades, "0");
  assert.equal(rows.find((row) => row.producto_id === "2" && row.semana_iso === "2026-W16").unidades, "4");
  assert.equal(rows.at(-1).semana_iso, "2026-W38");
});

test("valida completitud, ausencia de duplicados y totales semanales del CSV fuente", () => {
  const rows = crearSeriesSemanales(products, sales, details);
  const result = validarSeriesSemanales(rows, products, sales, details, 2);

  assert.equal(result.passed, true);
  assert.equal(result.weeks.length, 24);
  assert.equal(result.weeks[0].unidades, "5");
  assert.equal(result.weeks[1].unidades, "4");
  assert.equal(result.weeks.slice(2).every((week) => week.unidades === "0"), true);
});

test("rechaza parejas duplicadas y cantidades negativas o no enteras", () => {
  const rows = crearSeriesSemanales(products, sales, details);

  const duplicateResult = validarSeriesSemanales([...rows, rows[0]], products, sales, details, 2);
  assert.equal(duplicateResult.passed, false);
  assert.equal(duplicateResult.checks.find((check) => check.name === "Sin duplicados por producto-semana").passed, false);

  const invalidQuantity = rows.map((row, index) => (
    index === 0 ? { ...row, unidades: "-1" } : row
  ));
  const quantityResult = validarSeriesSemanales(invalidQuantity, products, sales, details, 2);
  assert.equal(quantityResult.passed, false);
  assert.equal(quantityResult.checks.find((check) => check.name === "Unidades enteras no negativas").passed, false);
});

test("rechaza detalles con una referencia de producto inexistente", () => {
  assert.throws(() => crearSeriesSemanales(products, sales, [
    ...details,
    { id_detalle_venta: "104", venta_id: "10", producto_id: "999", cantidad: "1" },
  ]), /referencias inexistentes/);
});
