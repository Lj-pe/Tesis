const FIRST_COMMERCIAL_DATE = '2025-10-01';
const LABEL_START_DATE = '2025-10-02';
const LAST_VALIDATED_DATE = '2026-11-06';
const SEGMENT_WINDOW_DAYS = 56;
const MODEL_VERSION = 'v6-no-category-shadow-1';
const RIDGE_DEVELOPMENT_ORIGIN_START = '2025-12-01';
const RIDGE_DEVELOPMENT_ORIGIN_END = '2026-07-27';
const RIDGE_HOLDOUT_ORIGIN_START = '2026-09-07';
const RIDGE_HOLDOUT_ORIGIN_END = '2026-10-05';

const POLICIES = {
  7: {
    frequent: { model: 'ridge_history', windowDays: 90, alpha: 100 },
    intermittent: { model: 'adida_weighted', halfLifeDays: 90, alpha: 0.3 },
    low: { model: 'moving_average', windowDays: 45, strategy: 'rolling' },
  },
  14: {
    frequent: { model: 'ridge_history', windowDays: 60, alpha: 100 },
    intermittent: { model: 'adida_weighted', halfLifeDays: 150, alpha: 0.3 },
    low: { model: 'moving_average', windowDays: 56, strategy: 'rolling' },
  },
  30: {
    frequent: { model: 'ridge_history', windowDays: 90, alpha: 100 },
    intermittent: { model: 'adida_weighted', halfLifeDays: 210, alpha: 0.3 },
    low: { model: 'moving_average', windowDays: 90, strategy: 'weighted_full_history' },
  },
};

function parseIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError('Las fechas comerciales deben usar YYYY-MM-DD.');
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.toISOString().slice(0, 10) !== value) {
    throw new TypeError('La fecha comercial no es válida.');
  }
  return parsed;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function dateRange(firstDate, lastDate) {
  const first = parseIsoDate(firstDate);
  const last = parseIsoDate(lastDate);
  const dates = [];
  for (let cursor = first; cursor <= last; cursor = addDays(cursor, 1)) {
    dates.push(formatDate(cursor));
  }
  return dates;
}

function getRidgeTrainingOrigins(horizon, cutoffDate) {
  if (![7, 14, 30].includes(horizon)) {
    throw new RangeError('Horizonte permitido: 7, 14 o 30 días.');
  }
  parseIsoDate(cutoffDate);
  const origins = [
    ...dateRange(RIDGE_DEVELOPMENT_ORIGIN_START, RIDGE_DEVELOPMENT_ORIGIN_END),
    ...dateRange(RIDGE_HOLDOUT_ORIGIN_START, RIDGE_HOLDOUT_ORIGIN_END),
  ].filter((date) => parseIsoDate(date).getUTCDay() === 1);
  return origins.filter((date) =>
    formatDate(addDays(parseIsoDate(date), horizon)) < cutoffDate
  );
}

function buildDailyPanel(dataset, lastDate = LAST_VALIDATED_DATE) {
  const dates = dateRange(LABEL_START_DATE, lastDate);
  const dateIndex = new Map(dates.map((day, index) => [day, index]));
  const products = new Map();
  for (const product of dataset.products) {
    const id = Number(product.id_producto);
    if (!Number.isSafeInteger(id) || id <= 0 || products.has(id)) {
      throw new TypeError('El catálogo contiene un identificador de producto inválido o duplicado.');
    }
    products.set(id, {
      product,
      values: Array(dates.length).fill(null),
      statuses: Array(dates.length).fill('unknown_initial_balance'),
      closingStock: Array(dates.length).fill(null),
    });
  }

  const sales = new Map();
  for (const sale of dataset.sales) {
    const id = Number(sale.product_id);
    const quantity = Number(sale.units);
    if (!products.has(id) || !Number.isFinite(quantity) || quantity <= 0) {
      throw new TypeError('La extracción contiene ventas inválidas o fuera del catálogo.');
    }
    const day = sale.commercial_date;
    if (day < LABEL_START_DATE || day > lastDate) continue;
    const key = `${id}|${day}`;
    sales.set(key, (sales.get(key) || 0) + quantity);
  }

  const movementsByProductDay = new Map();
  for (const movement of dataset.movements) {
    const id = Number(movement.product_id);
    const day = movement.commercial_date;
    if (!products.has(id) || day < FIRST_COMMERCIAL_DATE || day > lastDate) {
      throw new TypeError('La extracción contiene movimientos fuera del período o del catálogo.');
    }
    const key = `${id}|${day}`;
    const rows = movementsByProductDay.get(key) || [];
    rows.push(movement);
    movementsByProductDay.set(key, rows);
  }

  for (const [productId, series] of products) {
    let stock = 0;
    const initialMovements = movementsByProductDay.get(`${productId}|${FIRST_COMMERCIAL_DATE}`) || [];
    for (const movement of initialMovements) {
      stock += Number(movement.delta_units);
    }
    if (!Number.isFinite(stock) || stock < 0) {
      throw new TypeError(`El saldo inicial reconstruido de ${productId} no es válido.`);
    }

    for (let index = 0; index < dates.length; index += 1) {
      const day = dates[index];
      const openingStock = stock;
      const movements = movementsByProductDay.get(`${productId}|${day}`) || [];
      movements.sort((left, right) =>
        String(left.occurred_at).localeCompare(String(right.occurred_at))
        || Number(left.movement_id) - Number(right.movement_id)
      );
      let minimumStock = openingStock;
      for (const movement of movements) {
        const delta = Number(movement.delta_units);
        if (!Number.isFinite(delta)) {
          throw new TypeError('La extracción contiene una variación de inventario inválida.');
        }
        stock += delta;
        minimumStock = Math.min(minimumStock, stock);
      }
      if (!Number.isFinite(stock) || stock < 0) {
        throw new TypeError(`El saldo reconstruido de ${productId} en ${day} es negativo.`);
      }

      const key = `${productId}|${day}`;
      const hasSale = sales.has(key);
      if (openingStock > 0 && minimumStock > 0 && stock > 0) {
        series.statuses[index] = 'observed_available';
        series.values[index] = sales.get(key) || 0;
      } else {
        series.statuses[index] = hasSale
          ? 'censored_with_recorded_sales'
          : 'censored_or_unavailable';
      }
      series.closingStock[index] = stock;
    }
  }

  return { dates, dateIndex, products };
}

function classifySegment(values) {
  if (values.length !== SEGMENT_WINDOW_DAYS || values.some((value) => value === null)) {
    return 'unknown';
  }
  const salePositions = [];
  let units = 0;
  values.forEach((value, index) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new TypeError('El historial para segmentación contiene valores inválidos.');
    }
    units += numeric;
    if (numeric > 0) salePositions.push(index);
  });

  const intervals = salePositions.slice(1).map(
    (position, index) => position - salePositions[index]
  );
  const meanInterval = intervals.length
    ? intervals.reduce((total, interval) => total + interval, 0) / intervals.length
    : null;
  const daysSinceSale = salePositions.length
    ? values.length - salePositions[salePositions.length - 1] - 1
    : null;
  if (
    salePositions.length >= 8
    && meanInterval !== null
    && meanInterval <= 7
    && daysSinceSale <= 14
  ) {
    return 'frequent';
  }
  return units <= 8 ? 'low' : 'intermittent';
}

function weightsForAges(ages, halfLife) {
  return ages.map((age) => 2 ** (-age / halfLife));
}

function weightedMean(values, weights) {
  const denominator = weights.reduce((sum, weight) => sum + weight, 0);
  if (!values.length || denominator <= 0) return 0;
  return values.reduce((sum, value, index) => sum + value * weights[index], 0) / denominator;
}

function movingAverage(values, originIndex, windowDays, strategy) {
  const observed = [];
  const firstIndex = strategy === 'rolling'
    ? Math.max(0, originIndex - windowDays + 1)
    : 0;
  for (let index = firstIndex; index <= originIndex; index += 1) {
    const value = values[index];
    if (value !== null) observed.push({ index, value });
  }
  if (strategy === 'rolling') {
    if (!observed.length) return 0;
    return observed.reduce((sum, row) => sum + row.value, 0) / observed.length;
  }
  const selected = observed;
  const weights = weightsForAges(
    selected.map(({ index }) => originIndex - index),
    windowDays
  );
  return weightedMean(selected.map(({ value }) => value), weights);
}

function weightedCrostonRate(history, alpha, halfLife) {
  const events = history
    .map((value, index) => ({ index, value }))
    .filter(({ value }) => value > 0);
  if (events.length < 2) {
    return weightedMean(
      history,
      weightsForAges(history.map((_, index) => history.length - index - 1), halfLife)
    );
  }
  const latest = history.length - 1;
  const size = weightedMean(
    events.map(({ value }) => value),
    weightsForAges(events.map(({ index }) => latest - index), halfLife)
  );
  const intervals = events.slice(1).map(
    (event, index) => event.index - events[index].index
  );
  const intervalWeights = weightsForAges(
    events.slice(1).map(({ index }) => latest - index),
    halfLife
  );
  const interval = weightedMean(intervals, intervalWeights);
  return interval > 0 ? Math.max(0, (1 - alpha / 2) * size / interval) : 0;
}

function adidaForecast(values, originIndex, horizon, alpha, halfLifeDays) {
  if (values.slice(0, originIndex + 1).some((value) => value === null)) {
    return null;
  }
  const history = values.slice(0, originIndex + 1).map(Number);
  const weekly = [];
  for (let end = history.length; end - 7 >= 0; end -= 7) {
    weekly.push(history.slice(end - 7, end).reduce((sum, value) => sum + value, 0));
  }
  weekly.reverse();
  if (!weekly.length) return 0;
  const dailyRate = weightedCrostonRate(
    weekly,
    alpha,
    Math.max(halfLifeDays / 7, 1)
  ) / 7;
  return Math.max(0, dailyRate * horizon);
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function solveCholesky(matrix, vector) {
  const size = vector.length;
  const lower = Array.from({ length: size }, () => Array(size).fill(0));
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      let value = matrix[row][column];
      for (let k = 0; k < column; k += 1) {
        value -= lower[row][k] * lower[column][k];
      }
      if (row === column) {
        if (!(value > 0) || !Number.isFinite(value)) {
          throw new Error('No se pudo resolver el sistema Ridge: matriz no positiva definida.');
        }
        lower[row][column] = Math.sqrt(value);
      } else {
        lower[row][column] = value / lower[column][column];
      }
    }
  }

  const intermediate = Array(size).fill(0);
  for (let row = 0; row < size; row += 1) {
    let value = vector[row];
    for (let column = 0; column < row; column += 1) {
      value -= lower[row][column] * intermediate[column];
    }
    intermediate[row] = value / lower[row][row];
  }
  const solution = Array(size).fill(0);
  for (let row = size - 1; row >= 0; row -= 1) {
    let value = intermediate[row];
    for (let column = row + 1; column < size; column += 1) {
      value -= lower[column][row] * solution[column];
    }
    solution[row] = value / lower[row][row];
  }
  return solution;
}

function fitRidge(features, targets, alpha) {
  if (!features.length || features.length !== targets.length) {
    throw new TypeError('Ridge requiere features y objetivos de igual longitud no vacía.');
  }
  const names = [...new Set(features.flatMap((row) => Object.keys(row)))].sort();
  const matrix = features.map((row) => names.map((name) => Number(row[name] || 0)));
  if (matrix.some((row) => row.some((value) => !Number.isFinite(value)))) {
    throw new TypeError('Ridge recibió una variable no finita.');
  }
  const means = names.map((_, column) =>
    matrix.reduce((sum, row) => sum + row[column], 0) / matrix.length
  );
  const targetMean = targets.reduce((sum, value) => sum + value, 0) / targets.length;
  const centered = matrix.map((row) => row.map((value, column) => value - means[column]));
  const centeredTargets = targets.map((value) => value - targetMean);
  const gram = Array.from({ length: names.length }, () => Array(names.length).fill(0));
  const right = Array(names.length).fill(0);

  for (let row = 0; row < centered.length; row += 1) {
    for (let left = 0; left < names.length; left += 1) {
      right[left] += centered[row][left] * centeredTargets[row];
      for (let column = 0; column <= left; column += 1) {
        gram[left][column] += centered[row][left] * centered[row][column];
      }
    }
  }
  for (let row = 0; row < names.length; row += 1) {
    gram[row][row] += alpha;
    for (let column = 0; column < row; column += 1) {
      gram[column][row] = gram[row][column];
    }
  }

  return {
    names,
    means,
    targetMean,
    coefficients: solveCholesky(gram, right),
  };
}

function predictRidge(model, features) {
  const values = model.names.map((name) => Number(features[name] || 0));
  const centered = values.map((value, index) => value - model.means[index]);
  return Math.max(0, model.targetMean + dot(centered, model.coefficients));
}

function ridgeFeatures(values, productId, originIndex, horizon, dates, windowDays) {
  const firstIndex = Math.max(0, originIndex - windowDays + 1);
  const historyValues = values.slice(firstIndex, originIndex + 1);
  if (!historyValues.length || historyValues.some((value) => value === null)) return null;
  const history = historyValues.map(Number);
  const mean = history.reduce((sum, value) => sum + value, 0) / history.length;
  const positiveFraction = history.filter((value) => value > 0).length / history.length;
  const lastPositiveIndex = history.map((value, index) => value > 0 ? index : -1)
    .filter((index) => index >= 0).at(-1);
  const features = {
    [`product_id=${productId}`]: 1,
    sales_rate_configured: mean,
    positive_fraction_configured: positiveFraction,
    days_since_sale_capped: lastPositiveIndex === undefined
      ? history.length
      : history.length - lastPositiveIndex - 1,
    history_days_available: history.length,
  };

  const positions = history.map((_, index) => index);
  const positionMean = positions.reduce((sum, value) => sum + value, 0) / positions.length;
  const valueMean = mean;
  const denominator = positions.reduce(
    (sum, position) => sum + (position - positionMean) ** 2,
    0
  );
  features.slope_configured = denominator > 0
    ? history.reduce(
      (sum, value, index) => sum + (positions[index] - positionMean) * (value - valueMean),
      0
    ) / denominator
    : 0;

  for (let weekday = 0; weekday < 7; weekday += 1) {
    const occurrences = Array.from({ length: horizon }, (_, index) => {
      const day = addDays(parseIsoDate(dates[originIndex]), index + 1);
      return day.getUTCDay() === weekday ? 1 : 0;
    }).reduce((sum, value) => sum + value, 0);
    features[`target_weekday_${weekday}_fraction`] = occurrences / horizon;
  }
  return features;
}

function targetUnits(values, originIndex, horizon) {
  const target = values.slice(originIndex + 1, originIndex + horizon + 1);
  if (target.length !== horizon || target.some((value) => value === null)) return null;
  return target.reduce((sum, value) => sum + Number(value), 0);
}

function mondayOnOrBefore(date) {
  const result = new Date(date);
  const daysSinceMonday = (result.getUTCDay() + 6) % 7;
  result.setUTCDate(result.getUTCDate() - daysSinceMonday);
  return result;
}

function trainFrequentRidge(
  panel,
  dates,
  dateIndex,
  horizon,
  windowDays,
  alpha,
  referenceOrigins
) {
  const trainingFeatures = [];
  const trainingTargets = [];
  const firstOrigin = parseIsoDate(RIDGE_DEVELOPMENT_ORIGIN_START);
  const lastDate = parseIsoDate(dates[dates.length - 1]);
  const origins = referenceOrigins
    ? referenceOrigins.map(parseIsoDate)
    : getRidgeTrainingOrigins(horizon, formatDate(lastDate)).map(parseIsoDate);
  for (const origin of origins) {
    if (origin < firstOrigin || origin > addDays(lastDate, -horizon)) continue;
    const originIndex = dateIndex.get(formatDate(origin));
    if (originIndex === undefined || originIndex < SEGMENT_WINDOW_DAYS - 1) continue;
    for (const [productId, series] of panel.products) {
      const segment = classifySegment(
        series.values.slice(originIndex - SEGMENT_WINDOW_DAYS + 1, originIndex + 1)
      );
      if (segment !== 'frequent') continue;
      const target = targetUnits(series.values, originIndex, horizon);
      if (target === null) continue;
      const features = ridgeFeatures(
        series.values, productId, originIndex, horizon, dates, windowDays
      );
      if (features) {
        trainingFeatures.push(features);
        trainingTargets.push(target);
      }
    }
  }
  if (!trainingTargets.length) {
    throw new Error(`No hay ejemplos de entrenamiento Ridge para H${horizon}.`);
  }
  return fitRidge(trainingFeatures, trainingTargets, alpha);
}

function forecastProduct(panel, productId, horizon, options = {}) {
  const policy = POLICIES[horizon];
  if (!policy) throw new RangeError('Horizonte permitido: 7, 14 o 30 días.');
  const series = panel.products.get(Number(productId));
  if (!series) return null;
  const originIndex = panel.dates.length - 1;
  const segment = classifySegment(
    series.values.slice(originIndex - SEGMENT_WINDOW_DAYS + 1, originIndex + 1)
  );
  if (segment === 'unknown') {
    return {
      available: false,
      reason: 'insufficient_observable_history',
      segment,
      model: null,
      demand: null,
      observedDays: series.values.filter((value) => value !== null).length,
    };
  }

  const selected = policy[segment];
  let demand;
  const originDate = panel.dates[originIndex];
  if (selected.model === 'ridge_history') {
    const features = ridgeFeatures(
      series.values,
      Number(productId),
      originIndex,
      horizon,
      panel.dates,
      selected.windowDays
    );
    if (!features) {
      return {
        available: false,
        reason: 'ridge_requires_complete_observed_history',
        segment,
        model: selected.model,
        demand: null,
      };
    }
    const model = trainFrequentRidge(
      panel,
      panel.dates,
      panel.dateIndex,
      horizon,
      selected.windowDays,
      selected.alpha,
      options.ridgeTrainingOrigins
        || getRidgeTrainingOrigins(horizon, originDate)
    );
    demand = predictRidge(model, features);
  } else if (selected.model === 'adida_weighted') {
    demand = adidaForecast(
      series.values,
      originIndex,
      horizon,
      selected.alpha,
      selected.halfLifeDays
    );
    if (demand === null) {
      return {
        available: false,
        reason: 'intermittent_model_requires_complete_observed_history',
        segment,
        model: selected.model,
        demand: null,
      };
    }
  } else {
    const rate = movingAverage(
      series.values,
      originIndex,
      selected.windowDays,
      selected.strategy
    );
    demand = Math.max(0, rate * horizon);
  }

  if (!Number.isFinite(demand) || demand < 0) {
    throw new Error('El modelo produjo un pronóstico no válido.');
  }
  const lastDate = parseIsoDate(originDate);
  const targetStart = formatDate(addDays(lastDate, 1));
  const targetEnd = formatDate(addDays(lastDate, horizon));
  return {
    available: true,
    segment,
    model: selected.model,
    configuration: selected,
    demand,
    observedDays: series.values.filter((value) => value !== null).length,
    targetStart,
    targetEnd,
    cutoffDate: LAST_VALIDATED_DATE,
  };
}

module.exports = {
  FIRST_COMMERCIAL_DATE,
  LABEL_START_DATE,
  LAST_VALIDATED_DATE,
  MODEL_VERSION,
  POLICIES,
  SEGMENT_WINDOW_DAYS,
  adidaForecast,
  buildDailyPanel,
  classifySegment,
  dateRange,
  fitRidge,
  forecastProduct,
  getRidgeTrainingOrigins,
  movingAverage,
  parseIsoDate,
  predictRidge,
};
