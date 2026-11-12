const demandaModel = require('../models/demanda.model');
const {
  LAST_VALIDATED_DATE,
  MODEL_VERSION,
  buildDailyPanel,
  forecastProduct,
} = require('../services/demandaPolicy.service');

const ALLOWED_HORIZONS = [7, 14, 30];
const HISTORY_MONTHS = 6;
const HISTORY_WEEKS = 8;

function subtractCalendarMonths(dateText, months) {
  const [year, month, day] = dateText.split('-').map(Number);
  const targetMonth = new Date(Date.UTC(year, month - 1 - months, 1));
  const lastDay = new Date(Date.UTC(
    targetMonth.getUTCFullYear(),
    targetMonth.getUTCMonth() + 1,
    0
  )).getUTCDate();
  return new Date(Date.UTC(
    targetMonth.getUTCFullYear(),
    targetMonth.getUTCMonth(),
    Math.min(day, lastDay)
  )).toISOString().slice(0, 10);
}

function getWeeklyHistory(panel, productId) {
  const series = panel.products.get(Number(productId));
  const lastDate = new Date(`${LAST_VALIDATED_DATE}T00:00:00Z`);
  const lastSunday = new Date(lastDate);
  lastSunday.setUTCDate(lastSunday.getUTCDate() - lastSunday.getUTCDay());
  const weeks = [];

  for (let offset = HISTORY_WEEKS - 1; offset >= 0; offset -= 1) {
    const weekEnd = new Date(lastSunday);
    weekEnd.setUTCDate(weekEnd.getUTCDate() - offset * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);
    const startText = weekStart.toISOString().slice(0, 10);
    const endText = weekEnd.toISOString().slice(0, 10);
    const startIndex = panel.dateIndex.get(startText);
    const endIndex = panel.dateIndex.get(endText);
    if (startIndex === undefined || endIndex === undefined) continue;
    const values = series.values.slice(startIndex, endIndex + 1);
    if (values.length !== 7 || values.some((value) => value === null)) continue;
    weeks.push({
      week_start: startText,
      demand_units: values.reduce((sum, value) => sum + value, 0),
    });
  }
  return weeks;
}

function getDailyHistory(panel, productId, historyWindow) {
  const series = panel.products.get(Number(productId));
  const startIndex = panel.dateIndex.get(historyWindow.firstDate);
  const endIndex = panel.dateIndex.get(historyWindow.lastDate);
  if (startIndex === undefined || endIndex === undefined) return [];
  const history = [];
  for (let index = startIndex; index <= endIndex; index += 1) {
    const units = series.values[index];
    if (units !== null) {
      history.push({
        sale_date: panel.dates[index],
        demand_units: units,
        observability_checked: true,
      });
    }
  }
  return history;
}

function createDemandaPrediccionController(model = demandaModel) {
  async function getCatalog(req, res) {
    try {
      const catalog = await model.getPredictionCatalog();
      return res.status(200).json(catalog);
    } catch (error) {
      console.error('Error al cargar el catálogo para predicción:', error);
      return res.status(500).json({ message: 'No se pudo cargar el catálogo para predicción.' });
    }
  }

  async function getProductForecast(req, res) {
    const productId = Number(req.params.productId);
    const horizonDays = Number(req.query.horizonte_dias);
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      return res.status(400).json({ message: 'El identificador de producto no es válido.' });
    }
    if (!ALLOWED_HORIZONS.includes(horizonDays)) {
      return res.status(400).json({ message: 'Horizonte permitido: 7, 14 o 30 días.' });
    }

    try {
      const dataset = await model.getForecastDataset();
      const product = dataset.products.find(
        (row) => Number(row.id_producto) === productId
      );
      if (!product || Number(product.activo) !== 1) {
        return res.status(404).json({ message: 'Producto activo no encontrado.' });
      }

      const panel = buildDailyPanel(dataset, LAST_VALIDATED_DATE);
      const forecast = forecastProduct(panel, productId, horizonDays);
      if (!forecast) {
        return res.status(404).json({ message: 'Producto activo no encontrado.' });
      }
      if (!forecast.available) {
        return res.status(422).json({
          message: 'No se puede calcular un pronóstico con el historial observable disponible.',
          reason: forecast.reason,
          cutoff_date: LAST_VALIDATED_DATE,
          segment: forecast.segment,
        });
      }

      const historyWindow = {
        firstDate: subtractCalendarMonths(LAST_VALIDATED_DATE, HISTORY_MONTHS),
        lastDate: LAST_VALIDATED_DATE,
        require_complete_periods: true,
      };
      const inventory = product.stock_actual === null
        ? null
        : { stock_actual: product.stock_actual };
      const weeklyHistory = getWeeklyHistory(panel, productId);
      const dailyHistory = horizonDays === 30
        ? getDailyHistory(panel, productId, historyWindow)
        : [];
      const observedDays = panel.products.get(productId).values
        .filter((value) => value !== null).length;
      const unknownDays = panel.dates.length - observedDays;

      return res.status(200).json({
        product: {
          id_producto: product.id_producto,
          categoria_id: product.categoria_id,
          codigo_sku: product.codigo_sku,
          nombre: product.nombre,
        },
        horizon_days: horizonDays,
        prediction: {
          demand: forecast.demand,
          selected_method: forecast.model,
          segment: forecast.segment,
          model_version: MODEL_VERSION,
          configuration: forecast.configuration,
          observed_days: forecast.observedDays,
          history_weeks: weeklyHistory.length,
          positive_history_weeks: weeklyHistory.filter(
            ({ demand_units: units }) => units > 0
          ).length,
          mode: 'shadow',
        },
        inventory,
        last_complete_week: '2026-10-26',
        cutoff_date: forecast.cutoffDate,
        target_range: {
          firstDate: forecast.targetStart,
          lastDate: forecast.targetEnd,
        },
        history_window: historyWindow,
        risk: null,
        suggested_replenishment: null,
        replenishment_unavailable_reason:
          'La política de reposición y la disponibilidad física no están aprobadas.',
        observability: {
          observed_days: observedDays,
          unknown_days: unknownDays,
          censored_days: panel.products.get(productId).statuses.filter(
            (status) => status === 'censored_or_unavailable'
              || status === 'censored_with_recorded_sales'
          ).length,
          zero_days: panel.products.get(productId).values.filter(
            (value) => value === 0
          ).length,
          status: 'historical_cutoff_only',
        },
        history: weeklyHistory,
        daily_history: dailyHistory,
        monthly_history: [],
      });
    } catch (error) {
      console.error('Error al calcular la predicción de demanda:', error);
      return res.status(500).json({ message: 'No se pudo calcular la predicción de demanda.' });
    }
  }

  return { getCatalog, getProductForecast };
}

module.exports = {
  ...createDemandaPrediccionController(),
  createDemandaPrediccionController,
};
