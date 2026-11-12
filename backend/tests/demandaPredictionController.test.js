const { createDemandaPrediccionController } = require(
  '../src/controllers/demandaPrediccion.controller'
);
const { createDemandaModel } = require('../src/models/demanda.model');

function createResponse() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

function createDataset() {
  const products = [{
    id_producto: 9,
    categoria_id: 3,
    codigo_sku: 'SKU-9',
    nombre: 'Producto frecuente',
    activo: 1,
    stock_actual: 500,
  }];
  const sales = [];
  const movements = [{
    movement_id: 1,
    product_id: 9,
    delta_units: 1000,
    commercial_date: '2025-10-01',
    occurred_at: '2025-10-01 08:00:00',
  }];
  for (let index = 0; index < 401; index += 1) {
    const date = new Date(Date.UTC(2025, 9, 2 + index)).toISOString().slice(0, 10);
    sales.push({ product_id: 9, commercial_date: date, units: 1 });
    movements.push({
      movement_id: index + 2,
      product_id: 9,
      delta_units: -1,
      commercial_date: date,
      occurred_at: `${date} 12:00:00`,
    });
  }
  return { products, sales, movements };
}

describe('controlador de predicción de demanda sombra', () => {
  test.each([7, 14, 30])('devuelve H%i con corte y rango objetivo explícitos', async (horizon) => {
    const model = {
      getForecastDataset: jest.fn().mockResolvedValue(createDataset()),
    };
    const controller = createDemandaPrediccionController(model);
    const res = createResponse();

    await controller.getProductForecast(
      { params: { productId: '9' }, query: { horizonte_dias: String(horizon) } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.cutoff_date).toBe('2026-11-06');
    expect(body.target_range.firstDate).toBe('2026-11-07');
    expect(body.target_range.lastDate).toBe(
      new Date(Date.UTC(2026, 10, 6 + horizon)).toISOString().slice(0, 10)
    );
    expect(body.prediction).toEqual(expect.objectContaining({
      segment: 'frequent',
      selected_method: 'ridge_history',
      model_version: expect.any(String),
      mode: 'shadow',
    }));
    expect(body.risk).toBeNull();
    expect(body.suggested_replenishment).toBeNull();
  });

  test('rechaza horizonte no permitido y valida producto activo', async () => {
    const model = { getForecastDataset: jest.fn().mockResolvedValue(createDataset()) };
    const controller = createDemandaPrediccionController(model);
    const invalidHorizon = createResponse();
    const inactiveProduct = createResponse();

    await controller.getProductForecast(
      { params: { productId: '9' }, query: { horizonte_dias: '21' } },
      invalidHorizon
    );
    await controller.getProductForecast(
      { params: { productId: '10' }, query: { horizonte_dias: '7' } },
      inactiveProduct
    );

    expect(invalidHorizon.status).toHaveBeenCalledWith(400);
    expect(inactiveProduct.status).toHaveBeenCalledWith(404);
  });

  test('no convierte un historial censurado en una predicción de cero', async () => {
    const model = {
      getForecastDataset: jest.fn().mockResolvedValue({
        products: [{
          id_producto: 9,
          activo: 1,
          stock_actual: 0,
          nombre: 'Producto sin disponibilidad',
        }],
        sales: [],
        movements: [],
      }),
    };
    const controller = createDemandaPrediccionController(model);
    const res = createResponse();

    await controller.getProductForecast(
      { params: { productId: '9' }, query: { horizonte_dias: '7' } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'insufficient_observable_history',
      segment: 'unknown',
    }));
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('prediction');
  });

  test('devuelve error explícito ante fallo de lectura del dataset', async () => {
    const model = {
      getForecastDataset: jest.fn().mockRejectedValue(new Error('database unavailable')),
    };
    const controller = createDemandaPrediccionController(model);
    const res = createResponse();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await controller.getProductForecast(
      { params: { productId: '9' }, query: { horizonte_dias: '7' } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'No se pudo calcular la predicción de demanda.',
    });
    consoleError.mockRestore();
  });
});

describe('extracción del dataset de predicción', () => {
  test('solo ejecuta consultas SELECT con parámetros de rango fijos', async () => {
    const database = {
      query: jest.fn()
        .mockResolvedValueOnce([[{ id_producto: 9 }]])
        .mockResolvedValueOnce([[{ product_id: 9 }]])
        .mockResolvedValueOnce([[{ product_id: 9 }]]),
    };
    const model = createDemandaModel(database);

    await expect(model.getForecastDataset()).resolves.toEqual({
      products: [{ id_producto: 9 }],
      sales: [{ product_id: 9 }],
      movements: [{ product_id: 9 }],
    });

    expect(database.query).toHaveBeenCalledTimes(3);
    for (const [sql] of database.query.mock.calls) {
      expect(sql.trim()).toMatch(/^SELECT/i);
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP)\b/i);
    }
    expect(database.query.mock.calls[1][1]).toEqual(['2025-10-01', '2026-11-06']);
    expect(database.query.mock.calls[2][1]).toEqual(['2025-10-01', '2026-11-06']);
  });
});
