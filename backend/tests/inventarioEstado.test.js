jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  getConnection: jest.fn(),
}));

const pool = require('../src/config/database');
const inventoryModel = require('../src/models/inventario.model');
const inventoryService = require('../src/services/inventarioTransaccional.service');

describe('consultas de existencias', () => {
  beforeEach(() => jest.clearAllMocks());

  test('consulta todos los productos y deriva unidades desde vista_existencias', async () => {
    pool.query.mockResolvedValueOnce([[{ producto_id: '9007199254740993', unidades_disponibles: '4' }]]);

    await inventoryModel.getAllExistencias();

    expect(pool.query.mock.calls[0][0]).toContain('LEFT JOIN vista_existencias');
    expect(pool.query.mock.calls[0][0]).not.toContain('inventarios');
  });

  test('conserva los identificadores grandes como texto', async () => {
    pool.query.mockResolvedValueOnce([[{ producto_id: '9007199254740993', unidades_disponibles: '0' }]]);

    const result = await inventoryModel.getExistenciaByProductoId('9007199254740993');

    expect(result.producto_id).toBe('9007199254740993');
    expect(pool.query.mock.calls[0][1]).toEqual(['9007199254740993']);
  });
});

describe('bloqueos de inventario', () => {
  test('bloquea productos ordenando sus IDs sin convertirlos a Number', async () => {
    const connection = {
      query: jest.fn().mockResolvedValueOnce([[{ id: '2' }, { id: '10' }]]),
    };

    await inventoryService.lockProductos(connection, ['10', '2', '10']);

    expect(connection.query.mock.calls[0][1]).toEqual([['2', '10']]);
    expect(connection.query.mock.calls[0][0]).toContain('ORDER BY id FOR UPDATE');
  });

  test('rechaza una salida superior a las existencias', async () => {
    jest.spyOn(inventoryModel, 'getExistenciaByProductoId')
      .mockResolvedValueOnce({ producto_id: '5', unidades_disponibles: '3' });

    await expect(inventoryService.validarStockDisponible({}, '5', '4'))
      .rejects.toMatchObject({ statusCode: 409 });
  });
});
