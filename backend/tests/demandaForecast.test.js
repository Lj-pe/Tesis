const {
  buildCompleteMonthlyHistory,
  buildCompleteWeeklyHistory,
  calculateStockMetrics,
  forecastDemand,
  getHistoryWindow,
  selectRecentCompleteWeeklyHistory,
} = require('../src/services/demandaForecast.service');
const {
  createDemandaPrediccionController,
} = require('../src/controllers/demandaPrediccion.controller');
const { createDemandaModel } = require('../src/models/demanda.model');

describe('pronóstico operativo de demanda', () => {
  test('el historial sin semanas produce cero con fallback móvil-4', () => {
    expect(forecastDemand([], 7)).toEqual({
      demand: 0,
      selectedMethod: 'promedio_movil_4',
      positiveTrainingWeeks: 0,
      trainingWeeks: 0,
    });
  });

  test.each([
    [[5], 5],
    [[2, 4], 3],
    [[1, 2, 3], 2],
  ])('fallback promedia las semanas disponibles: %j', (history, expected) => {
    expect(forecastDemand(history, 7).demand).toBe(expected);
    expect(forecastDemand(history, 7).selectedMethod).toBe('promedio_movil_4');
  });

  test.each([7, 14, 30])(
    'incluye semanas sin ventas registradas en el promedio móvil-4 de %i días',
    (horizon) => {
      const result = forecastDemand([8, 0, 0, 0], horizon);

      expect(result.selectedMethod).toBe('promedio_movil_4');
      expect(result.positiveTrainingWeeks).toBe(1);
      expect(result.demand).toBeCloseTo(2 * horizon / 7);
    }
  );

  test('convierte el promedio móvil semanal a 7, 14 y 30 días', () => {
    const history = [4, 8, 0, 4];
    expect(forecastDemand(history, 7).demand).toBe(4);
    expect(forecastDemand(history, 14).demand).toBe(8);
    expect(forecastDemand(history, 30).demand).toBeCloseTo(4 * 30 / 7);
  });

  test.each([7, 14])(
    'utiliza móvil-4 para %i días aunque haya ocho semanas positivas',
    (horizon) => {
      const result = forecastDemand([1, 1, 1, 1, 1, 1, 1, 1], horizon);

      expect(result.selectedMethod).toBe('promedio_movil_4');
      expect(result.positiveTrainingWeeks).toBe(8);
      expect(result.demand).toBe(horizon / 7);
    }
  );

  test('utiliza móvil-4 para 30 días cuando hay menos de ocho semanas positivas', () => {
    const result = forecastDemand([1, 0, 2, 0, 1, 0, 3], 30);

    expect(result.selectedMethod).toBe('promedio_movil_4');
    expect(result.positiveTrainingWeeks).toBe(4);
    expect(result.demand).toBeCloseTo(30 / 7);
  });

  test('selecciona Croston-SBA desde ocho semanas positivas para 30 días', () => {
    const result = forecastDemand([1, 1, 1, 1, 1, 1, 1, 1], 30);
    expect(result.selectedMethod).toBe('croston_sba');
    expect(result.positiveTrainingWeeks).toBe(8);
    expect(result.demand).toBeCloseTo(0.95 * 30 / 7);
  });

  test('mantiene Croston-SBA con más de ocho semanas positivas para 30 días', () => {
    const result = forecastDemand(
      [1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 3, 0, 1, 0, 2],
      30
    );
    expect(result.selectedMethod).toBe('croston_sba');
    expect(result.positiveTrainingWeeks).toBe(9);
    expect(result.demand).toBeGreaterThan(0);
  });

  test('construye semanas completas y representa las semanas ausentes con cero', () => {
    expect(buildCompleteWeeklyHistory(
      '2026-01-05',
      '2026-01-19',
      [
        { week_start: '2026-01-05', demand_units: '3' },
        { week_start: '2026-01-19', demand_units: '2' },
      ]
    )).toEqual([
      { week_start: '2026-01-05', demand_units: 3 },
      { week_start: '2026-01-12', demand_units: 0 },
      { week_start: '2026-01-19', demand_units: 2 },
    ]);
  });

  test.each([
    [7, '2026-08-04'],
    [14, '2026-07-04'],
    [30, '2026-04-04'],
  ])('calcula el inicio móvil del horizonte de %i días desde el domingo cerrado', (
    horizon,
    firstDate
  ) => {
    expect(getHistoryWindow(horizon, '2026-09-28')).toEqual({
      firstDate,
      lastDate: '2026-10-04',
    });
  });

  test.each([
    [7, '2025-12-01'],
    [14, '2025-11-01'],
    [30, '2025-08-01'],
  ])('maneja el cambio de año en la ventana móvil de %i días', (horizon, firstDate) => {
    expect(getHistoryWindow(horizon, '2026-01-26')).toEqual({
      firstDate,
      lastDate: '2026-02-01',
    });
  });

  test('ajusta el día inicial al último día válido del mes de destino', () => {
    expect(getHistoryWindow(30, '2026-08-24')).toEqual({
      firstDate: '2026-02-28',
      lastDate: '2026-08-30',
    });
  });

  test('selecciona semanas cerradas dentro de la ventana, conserva ceros y excluye límites incompletos/futuros', () => {
    const history = buildCompleteWeeklyHistory(
      '2026-03-30',
      '2026-09-28',
      [
        { week_start: '2026-03-30', demand_units: '40' },
        { week_start: '2026-04-06', demand_units: '5' },
        { week_start: '2026-04-27', demand_units: '40' },
        { week_start: '2026-05-04', demand_units: '5' },
        { week_start: '2026-08-10', demand_units: '3' },
        { week_start: '2026-09-28', demand_units: '0' },
      ]
    );

    const twoMonthHistory = selectRecentCompleteWeeklyHistory(history, 7, '2026-09-28');
    const threeMonthHistory = selectRecentCompleteWeeklyHistory(history, 14, '2026-09-28');
    const sixMonthHistory = selectRecentCompleteWeeklyHistory(
      [...history, { week_start: '2026-10-05', demand_units: 99 }],
      30,
      '2026-09-28'
    );

    expect(twoMonthHistory[0].week_start).toBe('2026-08-10');
    expect(twoMonthHistory.some(({ week_start }) => week_start === '2026-08-03')).toBe(false);
    expect(twoMonthHistory.at(-1)).toEqual({
      week_start: '2026-09-28',
      demand_units: 0,
    });
    expect(threeMonthHistory[0].week_start).toBe('2026-07-06');
    expect(sixMonthHistory[0]).toEqual({
      week_start: '2026-04-06',
      demand_units: 5,
    });
    expect(sixMonthHistory.some(({ week_start }) => week_start === '2026-03-30')).toBe(false);
    expect(sixMonthHistory.some(({ week_start }) => week_start === '2026-10-05')).toBe(false);
  });

  test('construye seis meses calendario exactos y conserva los meses sin ventas', () => {
    expect(buildCompleteMonthlyHistory(
      '2026-05-01',
      '2026-10-01',
      '2026-10-04',
      [
        { month_start: '2026-05-01', demand_units: '25' },
        { month_start: '2026-10-01', demand_units: '12' },
      ]
    )).toEqual([
      { month_start: '2026-05-01', period_end: '2026-05-31', demand_units: 25 },
      { month_start: '2026-06-01', period_end: '2026-06-30', demand_units: 0 },
      { month_start: '2026-07-01', period_end: '2026-07-31', demand_units: 0 },
      { month_start: '2026-08-01', period_end: '2026-08-31', demand_units: 0 },
      { month_start: '2026-09-01', period_end: '2026-09-30', demand_units: 0 },
      { month_start: '2026-10-01', period_end: '2026-10-04', demand_units: 12 },
    ]);
  });

  test('usa el inicio del producto, rellena semanas posteriores vacías y excluye semanas posteriores al corte', async () => {
    const firstWeek = '2026-04-06';
    const lastWeek = '2026-09-28';
    const database = {
      query: jest.fn()
        .mockResolvedValueOnce([[
          {
            id_producto: 42,
            categoria_id: 6,
            codigo_sku: 'BEB-001',
            nombre: 'Coca-Cola Original 500 ml',
            categoria_nombre: 'Bebidas',
            id_inventario: 8,
            stock_actual: 59,
            stock_minimo: 25,
            stock_maximo: 100,
            fecha_creacion: '2026-09-24 14:41:56',
            first_complete_week: firstWeek,
            last_complete_week: lastWeek,
          },
        ]])
        .mockResolvedValueOnce([[
          { week_start: firstWeek, demand_units: '4' },
          { week_start: '2026-09-21', demand_units: '22' },
          { week_start: lastWeek, demand_units: '2' },
        ]]),
    };
    const model = createDemandaModel(database);
    const data = await model.getOperationalProductData(42);
    const history = buildCompleteWeeklyHistory(
      data.firstCompleteWeek,
      data.lastCompleteWeek,
      [
        ...data.salesByWeek,
        { week_start: '2026-10-05', demand_units: '99' },
      ]
    );

    expect(database.query.mock.calls[0][0]).not.toMatch(/p\.fecha_creacion/i);
    expect(database.query.mock.calls[0][0]).toMatch(/i\.stock_minimo/i);
    expect(database.query.mock.calls[0][0]).not.toMatch(/stock_seguridad/i);
    expect(database.query.mock.calls[0][0]).toMatch(/MIN\(v\.fecha_venta\)/i);
    expect(database.query.mock.calls[0][0]).toMatch(/dv\.producto_id = p\.id_producto/i);
    expect(database.query.mock.calls[0][0]).toMatch(
      /WHERE v\.estado = 'pagada'\s+AND dv\.producto_id = p\.id_producto/i
    );
    expect(database.query.mock.calls[1][1]).toEqual([42, firstWeek, lastWeek]);
    expect(data.inventory).toEqual({
      stock_actual: 59,
      stock_minimo: 25,
      stock_maximo: 100,
    });
    expect(data.salesByWeek[0]).toEqual({ week_start: firstWeek, demand_units: '4' });
    expect(history).toHaveLength(26);
    expect(history[0]).toEqual({ week_start: firstWeek, demand_units: 4 });
    expect(history[1]).toEqual({ week_start: '2026-04-13', demand_units: 0 });
    expect(history[24]).toEqual({ week_start: '2026-09-21', demand_units: 22 });
    expect(history[25]).toEqual({ week_start: lastWeek, demand_units: 2 });
    expect(history.at(-1).week_start).toBe(lastWeek);
    expect(history.some(({ week_start }) => week_start >= '2026-10-05')).toBe(false);
  });

  test.each([
    ['2026-04-06', '2026-04-06'],
    ['2026-04-08', '2026-04-13'],
    ['2026-04-30', '2026-05-04'],
    ['2026-12-31', '2027-01-04'],
  ])('mantiene semanas completas cuando la primera venta es %s', async (
    firstSaleDate,
    firstCompleteWeek
  ) => {
    const database = {
      query: jest.fn()
        .mockResolvedValueOnce([[
          {
            id_producto: 42,
            categoria_id: 6,
            codigo_sku: 'BEB-001',
            nombre: 'Producto de prueba',
            categoria_nombre: 'Bebidas',
            id_inventario: null,
            stock_actual: null,
            stock_minimo: null,
            stock_maximo: null,
            first_complete_week: firstCompleteWeek,
            last_complete_week: firstCompleteWeek,
          },
        ]])
        .mockResolvedValueOnce([[
          { week_start: firstCompleteWeek, demand_units: '2' },
        ]]),
    };
    const model = createDemandaModel(database);
    const data = await model.getOperationalProductData(42);
    const history = buildCompleteWeeklyHistory(
      data.firstCompleteWeek,
      data.lastCompleteWeek,
      data.salesByWeek
    );
    const firstSale = new Date(`${firstSaleDate}T00:00:00.000Z`);
    const weekday = (firstSale.getUTCDay() + 6) % 7;
    firstSale.setUTCDate(firstSale.getUTCDate() - weekday + (weekday === 0 ? 0 : 7));

    expect(firstCompleteWeek).toBe(firstSale.toISOString().slice(0, 10));
    expect(database.query.mock.calls[0][0]).toMatch(/WEEKDAY\(MIN\(v\.fecha_venta\)\)/i);
    expect(database.query.mock.calls[0][0]).toMatch(/INTERVAL IF\(WEEKDAY\(MIN\(v\.fecha_venta\)\) = 0, 0, 7\) DAY/i);
    expect(database.query.mock.calls[1][1]).toEqual([
      42,
      firstCompleteWeek,
      firstCompleteWeek,
    ]);
    expect(history[0]).toEqual({ week_start: firstCompleteWeek, demand_units: 2 });
    expect(history.every(({ week_start }) => week_start >= firstCompleteWeek)).toBe(true);
  });

  test('una primera venta en lunes de la última semana cerrada coincide con el corte y consulta esa semana', async () => {
    const lastCompleteWeek = '2026-04-20';
    const database = {
      query: jest.fn()
        .mockResolvedValueOnce([[
          {
            id_producto: 42,
            categoria_id: 6,
            codigo_sku: 'BEB-001',
            nombre: 'Producto de prueba',
            categoria_nombre: 'Bebidas',
            id_inventario: null,
            stock_actual: null,
            stock_minimo: null,
            stock_maximo: null,
            first_complete_week: lastCompleteWeek,
            last_complete_week: lastCompleteWeek,
          },
        ]])
        .mockResolvedValueOnce([[
          { week_start: lastCompleteWeek, demand_units: '3' },
        ]]),
    };
    const model = createDemandaModel(database);

    const data = await model.getOperationalProductData(42);

    expect(data.firstCompleteWeek).toBe(lastCompleteWeek);
    expect(data.lastCompleteWeek).toBe(lastCompleteWeek);
    expect(database.query).toHaveBeenCalledTimes(2);
    expect(database.query.mock.calls[1][1]).toEqual([
      42,
      lastCompleteWeek,
      lastCompleteWeek,
    ]);
    expect(data.salesByWeek).toEqual([
      { week_start: lastCompleteWeek, demand_units: '3' },
    ]);
  });

  test('primera venta de martes a domingo en la última semana cerrada omite la consulta semanal', async () => {
    const lastCompleteWeek = '2026-04-20';
    const firstPaidSaleDate = '2026-04-22';
    const nextWeek = '2026-04-27';
    const database = {
      query: jest.fn().mockResolvedValueOnce([[
        {
          id_producto: 42,
          categoria_id: 6,
          codigo_sku: 'BEB-001',
          nombre: 'Producto de prueba',
          categoria_nombre: 'Bebidas',
          id_inventario: null,
          stock_actual: null,
          stock_minimo: null,
          stock_maximo: null,
          first_complete_week: nextWeek,
          last_complete_week: lastCompleteWeek,
        },
      ]]),
    };
    const model = createDemandaModel(database);

    const data = await model.getOperationalProductData(42);
    const firstSale = new Date(`${firstPaidSaleDate}T00:00:00.000Z`);
    const weekday = (firstSale.getUTCDay() + 6) % 7;
    firstSale.setUTCDate(firstSale.getUTCDate() - weekday + 7);

    expect(firstSale.toISOString().slice(0, 10)).toBe(nextWeek);
    expect(data.firstCompleteWeek).toBe(nextWeek);
    expect(data.lastCompleteWeek).toBe(lastCompleteWeek);
    expect(data.salesByWeek).toEqual([]);
    expect(database.query).toHaveBeenCalledTimes(1);
  });

  test('productos con primeras ventas observadas en semanas distintas no comparten ceros anteriores', async () => {
    const firstWeeks = new Map([
      [42, '2026-04-06'],
      [43, '2026-04-20'],
    ]);
    const database = {
      query: jest.fn(async (sql, [productId]) => {
        if (!/SELECT\s+p\.id_producto/i.test(sql)) {
          return [[]];
        }

        return [[{
          id_producto: productId,
          categoria_id: 6,
          codigo_sku: `BEB-00${productId}`,
          nombre: 'Producto de prueba',
          categoria_nombre: 'Bebidas',
          id_inventario: null,
          stock_actual: null,
          stock_minimo: null,
          stock_maximo: null,
          first_complete_week: firstWeeks.get(productId),
          last_complete_week: '2026-04-27',
        }]];
      }),
    };
    const model = createDemandaModel(database);

    const firstProduct = await model.getOperationalProductData(42);
    const secondProduct = await model.getOperationalProductData(43);
    const firstProductHistory = buildCompleteWeeklyHistory(
      firstProduct.firstCompleteWeek,
      firstProduct.lastCompleteWeek,
      []
    );
    const secondProductHistory = buildCompleteWeeklyHistory(
      secondProduct.firstCompleteWeek,
      secondProduct.lastCompleteWeek,
      []
    );

    expect(firstProductHistory[0].week_start).toBe('2026-04-06');
    expect(secondProductHistory[0].week_start).toBe('2026-04-20');
    expect(secondProductHistory.some(({ week_start }) => week_start < '2026-04-20')).toBe(false);
    expect(database.query).toHaveBeenCalledTimes(4);
    expect(database.query.mock.calls[1][1]).toEqual([42, '2026-04-06', '2026-04-27']);
    expect(database.query.mock.calls[3][1]).toEqual([43, '2026-04-20', '2026-04-27']);
  });

  test('sin venta pagada observada conserva el inicio nulo y no consulta semanas de ventas', async () => {
    const database = {
      query: jest.fn().mockResolvedValueOnce([[
        {
          id_producto: 42,
          categoria_id: 6,
          codigo_sku: 'BEB-001',
          nombre: 'Producto sin ventas',
          categoria_nombre: 'Bebidas',
          id_inventario: null,
          stock_actual: null,
          stock_minimo: null,
          stock_maximo: null,
          first_complete_week: null,
          last_complete_week: '2026-04-27',
        },
      ]]),
    };
    const model = createDemandaModel(database);

    const data = await model.getOperationalProductData(42);

    expect(data.firstCompleteWeek).toBeNull();
    expect(data.salesByWeek).toEqual([]);
    expect(database.query).toHaveBeenCalledTimes(1);
  });

  test('consulta ventas pagadas reales agrupadas por mes hasta la última semana cerrada', async () => {
    const database = {
      query: jest.fn().mockResolvedValueOnce([[
        { month_start: '2026-05-01', demand_units: '25' },
      ]]),
    };
    const model = createDemandaModel(database);

    await expect(model.getOperationalMonthlySales(42, '2026-05-01', '2026-09-28'))
      .resolves.toEqual([{ month_start: '2026-05-01', demand_units: '25' }]);

    expect(database.query.mock.calls[0][0]).toMatch(/v\.estado = 'pagada'/i);
    expect(database.query.mock.calls[0][0]).toMatch(/DATE_FORMAT\(v\.fecha_venta, '%Y-%m-01'\)/i);
    expect(database.query.mock.calls[0][0]).toMatch(/DATE_ADD\(\?, INTERVAL 7 DAY\)/i);
    expect(database.query.mock.calls[0][1]).toEqual([42, '2026-05-01', '2026-09-28']);
  });

  test('consulta ventas pagadas por fecha para los periodos históricos de la gráfica', async () => {
    const database = {
      query: jest.fn().mockResolvedValueOnce([[
        { sale_date: '2026-05-03', demand_units: '3' },
        { sale_date: '2026-05-04', demand_units: '5' },
      ]]),
    };
    const model = createDemandaModel(database);

    await expect(model.getOperationalDailySales(42, '2026-04-04', '2026-10-04'))
      .resolves.toEqual([
        { sale_date: '2026-05-03', demand_units: '3' },
        { sale_date: '2026-05-04', demand_units: '5' },
      ]);

    expect(database.query.mock.calls[0][0]).toMatch(/v\.estado = 'pagada'/i);
    expect(database.query.mock.calls[0][0]).toMatch(/DATE_FORMAT\(v\.fecha_venta, '%Y-%m-%d'\)/i);
    expect(database.query.mock.calls[0][0]).toMatch(/GROUP BY v\.fecha_venta/i);
    expect(database.query.mock.calls[0][0]).toMatch(/v\.fecha_venta < DATE_ADD\(\?, INTERVAL 1 DAY\)/i);
    expect(database.query.mock.calls[0][1]).toEqual([42, '2026-04-04', '2026-10-04']);
  });

  test('calcula riesgo y reposición desde stock mínimo y aplica el límite máximo', () => {
    expect(calculateStockMetrics(3.2, {
      stock_actual: 0,
      stock_minimo: 2,
      stock_maximo: 5,
    })).toEqual({ risk: true, replenishment: 5 });
  });

  test('compara el stock actual con demanda más stock mínimo', () => {
    expect(calculateStockMetrics(5, {
      stock_actual: 10,
      stock_minimo: 5,
      stock_maximo: null,
    })).toEqual({ risk: true, replenishment: 0 });
    expect(calculateStockMetrics(5, {
      stock_actual: 9,
      stock_minimo: 5,
      stock_maximo: null,
    })).toEqual({ risk: true, replenishment: 1 });
    expect(calculateStockMetrics(5, {
      stock_actual: 11,
      stock_minimo: 5,
      stock_maximo: null,
    })).toEqual({ risk: false, replenishment: 0 });
  });

  test('ignora stock de seguridad y usa stock mínimo para riesgo y reposición', () => {
    const inventory = {
      stock_actual: 9,
      stock_minimo: 5,
      stock_maximo: null,
      stock_seguridad: 0,
    };
    const metricsWithZeroSafetyStock = calculateStockMetrics(5, inventory);
    const metricsWithHighSafetyStock = calculateStockMetrics(5, {
      ...inventory,
      stock_seguridad: 100,
    });
    const metricsWithLowerMinimum = calculateStockMetrics(5, {
      ...inventory,
      stock_minimo: 3,
      stock_seguridad: 100,
    });

    expect(metricsWithZeroSafetyStock).toEqual({ risk: true, replenishment: 1 });
    expect(metricsWithHighSafetyStock).toEqual(metricsWithZeroSafetyStock);
    expect(metricsWithLowerMinimum).toEqual({ risk: false, replenishment: 0 });
  });

  test('redondea la reposición hacia arriba y respeta el máximo cuando está configurado', () => {
    expect(calculateStockMetrics(3.2, {
      stock_actual: 0,
      stock_minimo: 2,
      stock_maximo: null,
    })).toEqual({ risk: true, replenishment: 6 });
    expect(calculateStockMetrics(3.2, {
      stock_actual: 0,
      stock_minimo: 2,
      stock_maximo: 5,
    })).toEqual({ risk: true, replenishment: 5 });
  });

  test('no calcula métricas de inventario si falta el registro o stock mínimo', () => {
    expect(calculateStockMetrics(4, null)).toEqual({ risk: null, replenishment: null });
    expect(calculateStockMetrics(4, {
      stock_actual: 0,
      stock_minimo: null,
      stock_maximo: null,
    })).toEqual({ risk: null, replenishment: null });
  });
});

describe('endpoint operativo de predicción', () => {
  const createResponse = () => {
    const res = {
      status: jest.fn(),
      json: jest.fn(),
    };
    res.status.mockReturnValue(res);
    return res;
  };

  test('rechaza horizontes no admitidos', async () => {
    const model = { getOperationalProductData: jest.fn() };
    const controller = createDemandaPrediccionController(model);
    const res = createResponse();

    await controller.getProductForecast(
      { params: { productId: '1' }, query: { horizonte_dias: '21' } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(model.getOperationalProductData).not.toHaveBeenCalled();
  });

  test('integra historial sin ventas y stock cero sin consultar resultados persistidos', async () => {
    const model = {
      getOperationalProductData: jest.fn().mockResolvedValue({
        product: { id_producto: 4, nombre: 'Producto de prueba' },
        inventory: { stock_actual: 0, stock_minimo: 0, stock_maximo: null },
        firstCompleteWeek: '2026-01-05',
        lastCompleteWeek: '2026-01-12',
        salesByWeek: [],
      }),
    };
    const controller = createDemandaPrediccionController(model);
    const res = createResponse();

    await controller.getProductForecast(
      { params: { productId: '4' }, query: { horizonte_dias: '7' } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      prediction: expect.objectContaining({
        demand: 0,
        selected_method: 'promedio_movil_4',
        history_insufficient: true,
      }),
      risk: true,
      suggested_replenishment: 0,
      history: [
        { week_start: '2026-01-05', demand_units: 0 },
        { week_start: '2026-01-12', demand_units: 0 },
      ],
      monthly_history: [],
    }));
  });

  test('sin semanas completas devuelve cero explícitamente y conserva el producto', async () => {
    const model = {
      getOperationalProductData: jest.fn().mockResolvedValue({
        product: { id_producto: 29, nombre: 'Producto sin historial' },
        inventory: null,
        firstCompleteWeek: null,
        lastCompleteWeek: null,
        salesByWeek: [],
      }),
    };
    const controller = createDemandaPrediccionController(model);
    const res = createResponse();

    await controller.getProductForecast(
      { params: { productId: '29' }, query: { horizonte_dias: '30' } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      product: { id_producto: 29, nombre: 'Producto sin historial' },
      prediction: expect.objectContaining({
        demand: 0,
        selected_method: 'promedio_movil_4',
        training_weeks: 0,
        positive_training_weeks: 0,
        history_insufficient: true,
      }),
      history: [],
      last_complete_week: null,
      history_window: null,
      daily_history: [],
      risk: null,
      suggested_replenishment: null,
    }));
  });

  test.each([7, 14, 30])(
    'el horizonte de %i días no recibe semanas anteriores al inicio observado del producto',
    async (horizonDays) => {
      const firstProductWeek = '2026-08-10';
      const model = {
        getOperationalProductData: jest.fn().mockResolvedValue({
          product: { id_producto: 42, nombre: 'Producto de prueba' },
          inventory: null,
          firstCompleteWeek: firstProductWeek,
          lastCompleteWeek: '2026-09-28',
          salesByWeek: [
            { week_start: firstProductWeek, demand_units: '2' },
            { week_start: '2026-09-28', demand_units: '1' },
          ],
        }),
        getOperationalDailySales: jest.fn().mockResolvedValue([]),
      };
      const controller = createDemandaPrediccionController(model);
      const res = createResponse();

      await controller.getProductForecast(
        { params: { productId: '42' }, query: { horizonte_dias: String(horizonDays) } },
        res
      );

      expect(res.status).toHaveBeenCalledWith(200);
      const response = res.json.mock.calls[0][0];
      expect(response.history.length).toBeGreaterThan(0);
      expect(response.history.every(({ week_start }) => week_start >= firstProductWeek)).toBe(true);
      expect(response.horizon_days).toBe(horizonDays);
      expect(response.prediction.demand).toBeGreaterThanOrEqual(0);
    }
  );

  test('para 30 días devuelve al gráfico exactamente las semanas usadas por el cálculo', async () => {
    const model = {
      getOperationalProductData: jest.fn().mockResolvedValue({
        product: { id_producto: 4, nombre: 'Producto de prueba' },
        inventory: null,
        firstCompleteWeek: '2026-04-06',
        lastCompleteWeek: '2026-09-28',
        salesByWeek: [
          { week_start: '2026-05-04', demand_units: '4' },
          { week_start: '2026-09-28', demand_units: '4' },
        ],
      }),
      getOperationalMonthlySales: jest.fn(),
      getOperationalDailySales: jest.fn().mockResolvedValue([
        { sale_date: '2026-05-04', demand_units: '4' },
      ]),
    };
    const controller = createDemandaPrediccionController(model);
    const res = createResponse();

    await controller.getProductForecast(
      { params: { productId: '4' }, query: { horizonte_dias: '30' } },
      res
    );

    expect(model.getOperationalMonthlySales).not.toHaveBeenCalled();
    expect(model.getOperationalDailySales).toHaveBeenCalledWith(
      4,
      '2026-04-04',
      '2026-10-04'
    );
    const response = res.json.mock.calls[0][0];
    expect(response.history_window).toEqual({
      firstDate: '2026-04-04',
      lastDate: '2026-10-04',
    });
    expect(response.history).toHaveLength(response.prediction.training_weeks);
    expect(response).not.toHaveProperty('chart_history');
    expect(response).toEqual(expect.objectContaining({
      prediction: expect.objectContaining({
        demand: 30 / 7,
        selected_method: 'promedio_movil_4',
        training_weeks: 26,
        positive_training_weeks: 2,
        history_insufficient: true,
      }),
      history: expect.arrayContaining([
        { week_start: '2026-04-06', demand_units: 0 },
        { week_start: '2026-05-04', demand_units: 4 },
        { week_start: '2026-09-28', demand_units: 4 },
      ]),
      daily_history: [{ sale_date: '2026-05-04', demand_units: '4' }],
      monthly_history: [],
    }));
  });

  test('devuelve error explícito si falla la consulta de datos', async () => {
    const model = {
      getOperationalProductData: jest.fn().mockRejectedValue(new Error('db unavailable')),
    };
    const controller = createDemandaPrediccionController(model);
    const res = createResponse();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await controller.getProductForecast(
      { params: { productId: '1' }, query: { horizonte_dias: '7' } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'No se pudo calcular la predicción de demanda.',
    });
    consoleError.mockRestore();
  });
});
