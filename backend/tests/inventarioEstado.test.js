jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  getConnection: jest.fn(),
}));

const pool = require('../src/config/database');
const { calcularEstadoInventario } = require('../src/utils/inventario');
const { actualizarStock } = require('../src/services/inventarioTransaccional.service');
const inventarioModel = require('../src/models/inventario.model');

describe('calcularEstadoInventario', () => {
  test.each([
    [0, 3, 'normal', 'agotado'],
    [2, 3, 'normal', 'bajo'],
    [3, 3, 'normal', 'bajo'],
    [4, 3, 'agotado', 'normal'],
    [0, 3, 'bloqueado', 'bloqueado'],
  ])('calcula estado para stock %s, mínimo %s y estado previo %s', (stock, minimo, previo, esperado) => {
    expect(calcularEstadoInventario(stock, minimo, previo)).toBe(esperado);
  });
});

describe('actualizarStock', () => {
  test('actualiza stock, estado y ambas fechas dentro de la transacción', async () => {
    const connection = {
      query: jest.fn()
        .mockResolvedValueOnce([[{
          stock_actual: 4,
          stock_minimo: 2,
          estado_inventario: 'normal',
        }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };

    await actualizarStock(connection, 12, -3);

    expect(connection.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FOR UPDATE'),
      [12]
    );
    expect(connection.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('fecha_ultima_actualizacion = CURRENT_TIMESTAMP'),
      [1, 'bajo', 12]
    );
    expect(connection.query.mock.calls[1][0]).toContain(
      'fecha_actualizacion = CURRENT_TIMESTAMP'
    );
  });

  test('conserva bloqueado cuando cambia el stock', async () => {
    const connection = {
      query: jest.fn()
        .mockResolvedValueOnce([[{
          stock_actual: 4,
          stock_minimo: 2,
          estado_inventario: 'bloqueado',
        }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };

    await actualizarStock(connection, 12, -1);

    expect(connection.query.mock.calls[1][1]).toEqual([3, 'bloqueado', 12]);
  });
});

describe('inventarioModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calcula el estado al crear y actualiza ambas fechas', async () => {
    pool.query.mockResolvedValueOnce([{ insertId: 9 }]);

    const result = await inventarioModel.createInventario({
      producto_id: 3,
      stock_actual: 0,
      stock_minimo: 2,
      estado_inventario: 'normal',
    });

    expect(result.estado_inventario).toBe('agotado');
    expect(pool.query.mock.calls[0][0]).toContain('fecha_ultima_actualizacion');
    expect(pool.query.mock.calls[0][1]).toEqual([3, 0, 2, null, 'agotado']);
  });

  test('recalcula estado después de una actualización manual', async () => {
    const connection = {
      beginTransaction: jest.fn(),
      query: jest.fn()
        .mockResolvedValueOnce([[{
          stock_actual: 5,
          stock_minimo: 2,
          estado_inventario: 'normal',
        }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };
    pool.getConnection.mockResolvedValueOnce(connection);

    const result = await inventarioModel.updateInventario(9, {
      stock_actual: 2,
      estado_inventario: 'normal',
    });

    expect(result).toBe(true);
    expect(connection.query.mock.calls[1][0]).toContain(
      'fecha_ultima_actualizacion = CURRENT_TIMESTAMP'
    );
    expect(connection.query.mock.calls[1][1]).toEqual([2, 'bajo', 9]);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  test('conserva bloqueo en actualización manual si no se solicita quitarlo', async () => {
    const connection = {
      beginTransaction: jest.fn(),
      query: jest.fn()
        .mockResolvedValueOnce([[{
          stock_actual: 5,
          stock_minimo: 2,
          estado_inventario: 'bloqueado',
        }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };
    pool.getConnection.mockResolvedValueOnce(connection);

    await inventarioModel.updateInventario(9, { stock_actual: 1 });

    expect(connection.query.mock.calls[1][1]).toEqual([1, 'bloqueado', 9]);
  });
});
