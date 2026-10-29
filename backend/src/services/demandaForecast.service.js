const CROSTON_ALPHA = 0.1;
const CROSTON_MINIMUM_POSITIVE_WEEKS = 8;
const ALLOWED_HORIZONS = [7, 14, 30];
const HISTORY_MONTHS_BY_HORIZON = {
  7: 2,
  14: 3,
  30: 6,
};

function forecastDemand(history, horizonDays) {
  if (!Array.isArray(history) || history.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new TypeError('El historial debe contener demandas semanales no negativas.');
  }
  if (!ALLOWED_HORIZONS.includes(horizonDays)) {
    throw new RangeError('Horizonte permitido: 7, 14 o 30 días.');
  }

  const positiveWeeks = history.filter((value) => value > 0).length;
  const useCrostonSba = horizonDays === 30
    && positiveWeeks >= CROSTON_MINIMUM_POSITIVE_WEEKS;
  const weeklyDemand = useCrostonSba
    ? forecastCrostonSba(history)
    : history.length > 0
      ? history.slice(-4).reduce((total, value) => total + value, 0)
        / Math.min(history.length, 4)
      : 0;
  const completeWeeks = Math.floor(horizonDays / 7);
  const remainderDays = horizonDays % 7;
  const forecast = weeklyDemand * (completeWeeks + remainderDays / 7);

  return {
    demand: Math.max(0, forecast),
    selectedMethod: useCrostonSba
      ? 'croston_sba'
      : 'promedio_movil_4',
    positiveTrainingWeeks: positiveWeeks,
    trainingWeeks: history.length,
  };
}

function forecastCrostonSba(history) {
  const events = history
    .map((demand, index) => ({ demand, index }))
    .filter(({ demand }) => demand > 0);
  const firstEvent = events[0];
  let demandSize = firstEvent.demand;
  let interval = firstEvent.index + 1;
  let previousIndex = firstEvent.index;

  events.slice(1).forEach(({ demand, index }) => {
    const gap = index - previousIndex;
    demandSize += CROSTON_ALPHA * (demand - demandSize);
    interval += CROSTON_ALPHA * (gap - interval);
    previousIndex = index;
  });

  return Math.max(0, (1 - CROSTON_ALPHA / 2) * demandSize / interval);
}

function calculateStockMetrics(demand, inventory) {
  if (!inventory || inventory.stock_actual === null || inventory.stock_minimo === null) {
    return { risk: null, replenishment: null };
  }

  const currentStock = Number(inventory.stock_actual);
  const minimumStock = Number(inventory.stock_minimo);
  const maximumStock = inventory.stock_maximo === null
    ? null
    : Number(inventory.stock_maximo);

  if (
    !Number.isFinite(currentStock)
    || !Number.isFinite(minimumStock)
    || (maximumStock !== null && !Number.isFinite(maximumStock))
    || currentStock < 0
    || minimumStock < 0
    || (maximumStock !== null && maximumStock < 0)
  ) {
    throw new TypeError('Los datos de inventario no son válidos para calcular el riesgo.');
  }

  const targetStock = demand + minimumStock;
  let replenishment = Math.ceil(Math.max(0, targetStock - currentStock));
  if (maximumStock !== null) {
    replenishment = Math.min(replenishment, Math.max(0, maximumStock - currentStock));
  }

  return {
    risk: currentStock <= targetStock,
    replenishment,
  };
}

function buildCompleteWeeklyHistory(firstWeek, lastWeek, salesByWeek) {
  if (!firstWeek || !lastWeek || firstWeek > lastWeek) {
    return [];
  }

  const sales = new Map(
    salesByWeek.map(({ week_start, demand_units }) => [
      week_start,
      Number(demand_units),
    ])
  );
  const history = [];

  for (
    let cursor = parseIsoDate(firstWeek);
    cursor <= parseIsoDate(lastWeek);
    cursor = addUtcDays(cursor, 7)
  ) {
    const weekStart = formatIsoDate(cursor);
    history.push({
      week_start: weekStart,
      demand_units: sales.get(weekStart) || 0,
    });
  }

  return history;
}

function getHistoryWindow(horizonDays, lastCompleteWeek) {
  const monthCount = HISTORY_MONTHS_BY_HORIZON[horizonDays];
  if (!monthCount) {
    throw new RangeError('Horizonte permitido: 7, 14 o 30 días.');
  }
  if (!lastCompleteWeek) {
    return null;
  }

  const lastWeekEnd = addUtcDays(parseIsoDate(lastCompleteWeek), 6);
  const firstDate = subtractUtcMonthsClamped(lastWeekEnd, monthCount);

  return {
    firstDate: formatIsoDate(firstDate),
    lastDate: formatIsoDate(lastWeekEnd),
  };
}

function selectRecentCompleteWeeklyHistory(
  history,
  horizonDays,
  lastCompleteWeek,
  window = getHistoryWindow(horizonDays, lastCompleteWeek)
) {
  if (!window) {
    return [];
  }

  return history.filter(({ week_start }) =>
    week_start >= window.firstDate && week_start <= lastCompleteWeek
  );
}

function buildCompleteMonthlyHistory(firstMonth, lastMonth, lastDate, salesByMonth) {
  if (!firstMonth || !lastMonth || firstMonth > lastMonth) {
    return [];
  }

  const sales = new Map(
    salesByMonth.map(({ month_start, demand_units }) => [
      month_start,
      Number(demand_units),
    ])
  );
  const history = [];

  for (
    let cursor = parseIsoDate(firstMonth);
    cursor <= parseIsoDate(lastMonth);
    cursor = addUtcMonths(cursor, 1)
  ) {
    const monthStart = formatIsoDate(cursor);
    const nextMonth = addUtcMonths(cursor, 1);
    const monthEnd = addUtcDays(nextMonth, -1);
    const periodEnd = lastDate && lastDate < formatIsoDate(monthEnd)
      ? lastDate
      : formatIsoDate(monthEnd);
    history.push({
      month_start: monthStart,
      period_end: periodEnd,
      demand_units: sales.get(monthStart) || 0,
    });
  }

  return history;
}

function parseIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new TypeError('Las fechas semanales deben usar el formato YYYY-MM-DD.');
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function addUtcDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addUtcMonths(date, months) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + months,
    date.getUTCDate()
  ));
}

function subtractUtcMonthsClamped(date, months) {
  const targetMonth = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() - months,
    1
  ));
  const lastDayOfTargetMonth = new Date(Date.UTC(
    targetMonth.getUTCFullYear(),
    targetMonth.getUTCMonth() + 1,
    0
  )).getUTCDate();

  return new Date(Date.UTC(
    targetMonth.getUTCFullYear(),
    targetMonth.getUTCMonth(),
    Math.min(date.getUTCDate(), lastDayOfTargetMonth)
  ));
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

module.exports = {
  buildCompleteWeeklyHistory,
  buildCompleteMonthlyHistory,
  calculateStockMetrics,
  forecastDemand,
  getHistoryWindow,
  selectRecentCompleteWeeklyHistory,
};
