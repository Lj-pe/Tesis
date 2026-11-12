const {
  LABEL_START_DATE,
  LAST_VALIDATED_DATE,
  POLICIES,
  adidaForecast,
  buildDailyPanel,
  classifySegment,
  fitRidge,
  forecastProduct,
  getRidgeTrainingOrigins,
  movingAverage,
  predictRidge,
} = require('../src/services/demandaPolicy.service');

function makeMovements(initialStock, dailySales) {
  const movements = [{
    movement_id: 1,
    product_id: 1,
    delta_units: initialStock,
    commercial_date: '2025-10-01',
    occurred_at: '2025-10-01 08:00:00',
  }];
  for (const [index, units] of dailySales.entries()) {
    const date = new Date(Date.UTC(2025, 9, 2 + index)).toISOString().slice(0, 10);
    if (units > 0) {
      movements.push({
        movement_id: index + 2,
        product_id: 1,
        delta_units: -units,
        commercial_date: date,
        occurred_at: `${date} 12:00:00`,
      });
    }
  }
  return movements;
}

function makeDataset({ initialStock = 1000, dailySales = [] } = {}) {
  return {
    products: [{
      id_producto: 1,
      activo: 1,
      stock_actual: initialStock,
      nombre: 'Producto de prueba',
    }],
    sales: dailySales.flatMap((units, index) => {
      if (!units) return [];
      const date = new Date(Date.UTC(2025, 9, 2 + index)).toISOString().slice(0, 10);
      return [{ product_id: 1, commercial_date: date, units }];
    }),
    movements: makeMovements(initialStock, dailySales),
  };
}

describe('política de pronóstico minimarket', () => {
  test('solo respalda ceros cuando el saldo permanece positivo todo el día', () => {
    const panel = buildDailyPanel(makeDataset({
      initialStock: 10,
      dailySales: [2, 8, 0],
    }));
    const series = panel.products.get(1);

    expect(panel.dates[0]).toBe(LABEL_START_DATE);
    expect(series.values.slice(0, 3)).toEqual([2, null, null]);
    expect(series.statuses.slice(0, 3)).toEqual([
      'observed_available',
      'censored_with_recorded_sales',
      'censored_or_unavailable',
    ]);
  });

  test('excluye las ventanas objetivo fuera del corte fijo', () => {
    const panel = buildDailyPanel(makeDataset());
    const forecast = forecastProduct(panel, 1, 7);

    expect(LAST_VALIDATED_DATE).toBe('2026-11-06');
    expect(forecast.targetStart).toBe('2026-11-07');
    expect(forecast.targetEnd).toBe('2026-11-13');
  });

  test.each([
    [7, 'frequent', 'ridge_history', 90],
    [14, 'intermittent', 'adida_weighted', 150],
    [30, 'low', 'moving_average', 90],
  ])('mantiene la política seleccionada para H%i / %s', (horizon, segment, model, windowDays) => {
    const configuration = POLICIES[horizon][segment];
    expect(configuration.model).toBe(model);
    expect(configuration.windowDays ?? configuration.halfLifeDays).toBe(windowDays);
  });

  test('clasifica solo mediante los 56 días anteriores, con reglas de frecuencia y volumen', () => {
    const frequent = Array.from({ length: 56 }, (_, index) =>
      index % 7 === 0 ? 1 : 0
    );
    const intermittent = Array.from({ length: 56 }, (_, index) =>
      index % 10 === 0 ? 2 : 0
    );

    expect(classifySegment(frequent)).toBe('frequent');
    expect(classifySegment(intermittent)).toBe('intermittent');
    expect(classifySegment(Array(56).fill(0))).toBe('low');
    expect(classifySegment([null, ...Array(55).fill(0)])).toBe('unknown');
  });

  test('una ventana móvil representa días calendario y no días observables acumulados', () => {
    const values = Array(100).fill(null);
    values[50] = 100;
    values[60] = 1;
    values[99] = 3;

    expect(movingAverage(values, 99, 45, 'rolling')).toBe(2);
  });

  test('un producto frecuente se pronostica más allá del último día del panel', () => {
    const dailySales = Array(401).fill(1);
    const panel = buildDailyPanel(makeDataset({ initialStock: 1000, dailySales }));
    const forecast = forecastProduct(panel, 1, 7);

    expect(forecast.available).toBe(true);
    expect(forecast.segment).toBe('frequent');
    expect(forecast.model).toBe('ridge_history');
    expect(Number.isFinite(forecast.demand)).toBe(true);
  });

  test.each([7, 14, 30])(
    'usa los orígenes experimentales elegibles hasta el corte para Ridge H%i',
    (horizon) => {
      const origins = getRidgeTrainingOrigins(horizon, LAST_VALIDATED_DATE);

      expect(origins).toHaveLength(40);
      expect(origins[0]).toBe('2025-12-01');
      expect(origins[34]).toBe('2026-07-27');
      expect(origins.slice(35)).toEqual([
        '2026-09-07',
        '2026-09-14',
        '2026-09-21',
        '2026-09-28',
        '2026-10-05',
      ]);
      expect(origins.every((origin) =>
        new Date(`${origin}T00:00:00Z`).getUTCDay() === 1
      )).toBe(true);
    }
  );

  test('excluye orígenes cuyas etiquetas alcanzan o cruzan el origen de pronóstico', () => {
    expect(getRidgeTrainingOrigins(7, '2026-10-05').slice(-3)).toEqual([
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
    ]);
    expect(getRidgeTrainingOrigins(14, '2026-10-05').slice(-2)).toEqual([
      '2026-09-07',
      '2026-09-14',
    ]);
    expect(getRidgeTrainingOrigins(30, '2026-10-05').slice(-1)).toEqual([
      '2026-07-27',
    ]);
  });

  test('Ridge coincide con scikit-learn en un fixture numérico de referencia', () => {
    const features = [
      { a: 0, b: 1 },
      { a: 1, b: 0 },
      { a: 2, b: 1 },
      { a: 3, b: 0 },
    ];
    const model = fitRidge(features, [1, 2, 2, 4], 100);
    const prediction = predictRidge(model, { a: 1.5, b: 1 });

    expect(prediction).toBeCloseTo(2.24278574, 7);
  });

  test('ADIDA ponderado coincide con el fixture de referencia de Python v6', () => {
    const history = Array(140).fill(0);
    for (const [index, units] of [
      [3, 2],
      [20, 3],
      [40, 1],
      [41, 4],
      [88, 5],
      [102, 2],
      [120, 3],
      [139, 1],
    ]) {
      history[index] = units;
    }

    expect(adidaForecast(history, history.length - 1, 7, 0.3, 90))
      .toBeCloseTo(0.7647762229409446, 12);
  });
});
