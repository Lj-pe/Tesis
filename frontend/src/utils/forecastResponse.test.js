import assert from "node:assert/strict";
import test from "node:test";
import { hasValidForecastHistoryWindow } from "./forecastResponse.js";

function createResponse(overrides = {}) {
  return {
    prediction: {
      demand: 0,
      training_weeks: 0,
      positive_training_weeks: 0,
    },
    last_complete_week: null,
    history_window: null,
    history: [],
    daily_history: [],
    ...overrides,
  };
}

test("acepta una ventana nula de 30 días solo cuando la respuesta confirma que no hay historial", () => {
  assert.equal(hasValidForecastHistoryWindow(createResponse(), 30), true);
});

test("rechaza una ventana nula de 30 días cuando la respuesta contiene datos de historial", () => {
  assert.equal(hasValidForecastHistoryWindow(createResponse({
    history: [{ week_start: "2026-09-28", demand_units: 2 }],
  }), 30), false);
  assert.equal(hasValidForecastHistoryWindow(createResponse({
    daily_history: [{ sale_date: "2026-09-28", demand_units: 2 }],
  }), 30), false);
});

test("rechaza una ventana nula de 30 días si faltan los indicadores de ausencia de historial", () => {
  assert.equal(hasValidForecastHistoryWindow(createResponse({
    prediction: { demand: 1, training_weeks: 0, positive_training_weeks: 0 },
  }), 30), false);
  assert.equal(hasValidForecastHistoryWindow(createResponse({
    last_complete_week: "2026-09-28",
  }), 30), false);
  assert.equal(hasValidForecastHistoryWindow(createResponse({
    prediction: { demand: 0, training_weeks: 1, positive_training_weeks: 0 },
  }), 30), false);
});

test("conserva la validación de ventanas existentes y no exige ventana para 7 o 14 días", () => {
  assert.equal(hasValidForecastHistoryWindow(createResponse({
    history_window: { firstDate: "2026-04-04", lastDate: "2026-10-04" },
  }), 30), true);
  assert.equal(hasValidForecastHistoryWindow(createResponse(), 7), true);
  assert.equal(hasValidForecastHistoryWindow(createResponse(), 14), true);
});
