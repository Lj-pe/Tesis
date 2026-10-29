const demandaModel = require('../models/demanda.model');
const {
  buildCompleteWeeklyHistory,
  calculateStockMetrics,
  forecastDemand,
  getHistoryWindow,
  selectRecentCompleteWeeklyHistory,
} = require('../services/demandaForecast.service');

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

    if (![7, 14, 30].includes(horizonDays)) {
      return res.status(400).json({ message: 'Horizonte permitido: 7, 14 o 30 días.' });
    }

    try {
      const data = await model.getOperationalProductData(productId);
      if (!data) {
        return res.status(404).json({ message: 'Producto activo no encontrado.' });
      }

      const completeHistory = buildCompleteWeeklyHistory(
        data.firstCompleteWeek,
        data.lastCompleteWeek,
        data.salesByWeek
      );
      const historyWindow = getHistoryWindow(horizonDays, data.lastCompleteWeek);
      const trainingHistory = selectRecentCompleteWeeklyHistory(
        completeHistory,
        horizonDays,
        data.lastCompleteWeek,
        historyWindow
      );
      const forecast = forecastDemand(
        trainingHistory.map(({ demand_units: demand }) => demand),
        horizonDays
      );
      const stockMetrics = calculateStockMetrics(forecast.demand, data.inventory);
      const dailyHistory = horizonDays === 30 && historyWindow
        ? await model.getOperationalDailySales(
            productId,
            historyWindow.firstDate,
            historyWindow.lastDate
          )
        : [];

      return res.status(200).json({
        product: data.product,
        horizon_days: horizonDays,
        prediction: {
          demand: forecast.demand,
          selected_method: forecast.selectedMethod,
          positive_training_weeks: forecast.positiveTrainingWeeks,
          training_weeks: forecast.trainingWeeks,
          history_insufficient: forecast.positiveTrainingWeeks < 8,
        },
        inventory: data.inventory,
        last_complete_week: data.lastCompleteWeek,
        history_window: historyWindow,
        risk: stockMetrics.risk,
        suggested_replenishment: stockMetrics.replenishment,
        history: trainingHistory,
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
