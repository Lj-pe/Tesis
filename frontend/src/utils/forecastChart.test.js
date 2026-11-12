import assert from "node:assert/strict";
import test from "node:test";
import {
  getForecastDateRange,
  getHistoricalBarHeight,
  getZeroForecastMarker,
  prepareForecastChartData,
} from "./forecastChart.js";

test("calcula las fechas locales inclusivas para los horizontes permitidos", () => {
  const consultationDate = new Date(2026, 9, 9, 23, 45);

  assert.deepEqual(getForecastDateRange(7, consultationDate), {
    startDate: "2026-10-09",
    endDate: "2026-10-15",
    label: "09 oct 2026 – 15 oct 2026",
  });
  assert.equal(getForecastDateRange(14, consultationDate).endDate, "2026-10-22");
  assert.equal(getForecastDateRange(30, consultationDate).endDate, "2026-11-07");
  assert.throws(() => getForecastDateRange(21, consultationDate), RangeError);
});

test("usa cada semana histórica en 7 y 14 días y conserva el total pronosticado", () => {
  const weeklyHistory = [
    { week_start: "2026-08-03", demand_units: 4 },
    { week_start: "2026-08-10", demand_units: 0 },
  ];

  for (const [horizon, forecast] of [[7, 9.2], [14, 18.5]]) {
    const chart = prepareForecastChartData(weeklyHistory, horizon, forecast);
    assert.equal(chart.history.length, 2);
    assert.deepEqual(chart.history.map(({ value }) => value), [4, 0]);
    assert.deepEqual(chart.history.map(({ periodEnd }) => periodEnd), [
      "2026-08-09",
      "2026-08-16",
    ]);
    assert.equal(chart.forecast, forecast);
  }
});

test("agrupa las mismas semanas en seis periodos móviles y separa la predicción", () => {
  const weeklyHistory = [];
  for (
    let weekStart = new Date("2026-04-06T00:00:00Z");
    weekStart <= new Date("2026-09-28T00:00:00Z");
    weekStart.setUTCDate(weekStart.getUTCDate() + 7)
  ) {
    const week_start = weekStart.toISOString().slice(0, 10);
    weeklyHistory.push({
      week_start,
      demand_units: ["2026-06-08", "2026-06-15", "2026-06-22", "2026-06-29"]
        .includes(week_start)
        ? 0
        : week_start === "2026-06-01"
          ? 5
          : week_start === "2026-09-28"
            ? 4
            : 1,
    });
  }
  const forecast = 39.6;
  const chart = prepareForecastChartData(weeklyHistory, 30, forecast, {
    firstDate: "2026-04-04",
    lastDate: "2026-10-04",
  }, [
    { sale_date: "2026-04-04", demand_units: 1 },
    { sale_date: "2026-05-03", demand_units: 3 },
    { sale_date: "2026-05-04", demand_units: 2 },
    { sale_date: "2026-06-03", demand_units: 7 },
    { sale_date: "2026-07-04", demand_units: 5 },
    { sale_date: "2026-08-04", demand_units: 4 },
    { sale_date: "2026-09-04", demand_units: 3 },
    { sale_date: "2026-10-04", demand_units: 4 },
  ]);

  assert.equal(chart.history.length, 6);
  assert.deepEqual(chart.history.map(({ periodStart }) => periodStart), [
    "2026-04-04",
    "2026-05-04",
    "2026-06-04",
    "2026-07-04",
    "2026-08-04",
    "2026-09-04",
  ]);
  assert.deepEqual(chart.history.map(({ value }) => value), [4, 9, 0, 5, 4, 7]);
  assert.deepEqual(chart.history.map(({ periodEnd }) => periodEnd), [
    "2026-05-03",
    "2026-06-03",
    "2026-07-03",
    "2026-08-03",
    "2026-09-03",
    "2026-10-04",
  ]);
  assert.equal(chart.forecast, forecast);
  assert.equal(chart.history.reduce((sum, period) => sum + period.value, 0), 29);
  assert.equal(chart.history.length <= 6, true);
});

test("30 días agrupa ventas por sus fechas y no por semanas que cruzan límites", () => {
  const chart = prepareForecastChartData(
    [{ week_start: "2026-03-30", demand_units: 999 }],
    30,
    20,
    { firstDate: "2026-04-04", lastDate: "2026-10-04" },
    [
      { sale_date: "2026-04-03", demand_units: 100 },
      { sale_date: "2026-04-04", demand_units: 2 },
      { sale_date: "2026-05-03", demand_units: 3 },
      { sale_date: "2026-05-04", demand_units: 5 },
      { sale_date: "2026-06-03", demand_units: 7 },
      { sale_date: "2026-06-04", demand_units: 11 },
      { sale_date: "2026-07-03", demand_units: 13 },
      { sale_date: "2026-07-04", demand_units: 17 },
      { sale_date: "2026-08-03", demand_units: 19 },
      { sale_date: "2026-08-04", demand_units: 23 },
      { sale_date: "2026-09-03", demand_units: 29 },
      { sale_date: "2026-09-04", demand_units: 31 },
      { sale_date: "2026-10-04", demand_units: 37 },
      { sale_date: "2026-10-05", demand_units: 41 },
    ]
  );

  assert.deepEqual(chart.history.map(({ periodStart, periodEnd, value }) => [
    periodStart,
    periodEnd,
    value,
  ]), [
    ["2026-04-04", "2026-05-03", 5],
    ["2026-05-04", "2026-06-03", 12],
    ["2026-06-04", "2026-07-03", 24],
    ["2026-07-04", "2026-08-03", 36],
    ["2026-08-04", "2026-09-03", 52],
    ["2026-09-04", "2026-10-04", 68],
  ]);
  assert.equal(chart.history.reduce((sum, period) => sum + period.value, 0), 197);
});

test("mantiene intacto el gráfico semanal de 7 y 14 días", () => {
  const trainingHistory = [{ week_start: "2026-08-03", demand_units: 4 }];
  for (const horizon of [7, 14]) {
    const chart = prepareForecastChartData(trainingHistory, horizon, 10, {
      firstDate: "2026-04-01",
      lastDate: "2026-10-04",
    });
    assert.deepEqual(chart.history.map(({ periodStart, value }) => [periodStart, value]), [
      ["2026-08-03", 4],
    ]);
  }
});

test("muestra los seis periodos en cero si no hay ventas registradas en la ventana", () => {
  const chart = prepareForecastChartData([], 30, 12, {
    firstDate: "2026-04-04",
    lastDate: "2026-10-04",
  });
  assert.equal(chart.history.length, 6);
  assert.deepEqual(chart.history.map(({ value }) => value), [0, 0, 0, 0, 0, 0]);
  assert.equal(chart.forecast, 12);
});

test("no representa un periodo parcial como ventas cero cuando la cobertura es explícita", () => {
  const dailyHistory = [];
  for (
    let date = new Date("2026-05-06T00:00:00Z");
    date <= new Date("2026-06-05T00:00:00Z");
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const sale_date = date.toISOString().slice(0, 10);
    if (sale_date !== "2026-05-20") {
      dailyHistory.push({
        sale_date,
        demand_units: 0,
        observability_checked: true,
      });
    }
  }

  const chart = prepareForecastChartData(
    [],
    30,
    12,
    {
      firstDate: "2026-05-06",
      lastDate: "2026-11-06",
      require_complete_periods: true,
    },
    dailyHistory
  );

  assert.deepEqual(chart.history, []);
});

test("un pronóstico cero tiene marcador visible y etiqueta accesible", () => {
  assert.deepEqual(getZeroForecastMarker(0, 500, 143), {
    cx: 500,
    cy: 143,
    ariaLabel: "Pronóstico: 0 unidades",
  });
});

test("un pronóstico positivo se representa como barra, no como marcador de cero", () => {
  assert.equal(getZeroForecastMarker(1, 500, 143), null);
});

test("las ventas semanales positivas siguen visibles en la escala del total de 30 días", () => {
  const chartHeight = 125;
  const scaleMax = 1000;

  assert.equal(getHistoricalBarHeight(0, scaleMax, chartHeight), 0);
  assert.equal(getHistoricalBarHeight(1, scaleMax, chartHeight), 2);
  assert.equal(getHistoricalBarHeight(100, scaleMax, chartHeight), 12.5);
});

test("incluye ventas registradas hasta el día de corte del último periodo", () => {
  const chart = prepareForecastChartData(
    [
      { week_start: "2026-08-24", demand_units: 6 },
      { week_start: "2026-09-28", demand_units: 8 },
    ],
    30,
    20,
    { firstDate: "2026-04-04", lastDate: "2026-10-04" },
    [{ sale_date: "2026-09-28", demand_units: 8 }]
  );
  assert.equal(chart.history.length, 6);
  assert.equal(chart.history.at(-1).value, 8);
  assert.equal(chart.history.at(-1).periodEnd, "2026-10-04");
});
