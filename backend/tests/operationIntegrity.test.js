jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  getConnection: jest.fn(),
}));
jest.mock('../src/models/compra.model', () => ({ getCompraById: jest.fn() }));
jest.mock('../src/models/recepcion.model', () => ({ getRecepcionById: jest.fn() }));
jest.mock('../src/models/venta.model', () => ({ getVentaById: jest.fn() }));
jest.mock('../src/models/inventario.model', () => ({ getExistenciaByProductoId: jest.fn() }));
jest.mock('../src/models/movimiento_inventario.model', () => ({ createMovimiento: jest.fn() }));
jest.mock('../src/services/movimientosInventario.service', () => ({
  registrarSalida: jest.fn(),
  registrarMovimiento: jest.fn(),
}));
jest.mock('../src/models/usuario.model', () => ({ getUsuarioById: jest.fn() }));
jest.mock('../src/utils/jwt', () => ({ verifyToken: jest.fn() }));

const pool = require('../src/config/database');
const compraModel = require('../src/models/compra.model');
const recepcionModel = require('../src/models/recepcion.model');
const ventaModel = require('../src/models/venta.model');
const inventoryModel = require('../src/models/inventario.model');
const proveedorModel = require('../src/models/proveedor.model');
const usuarioModel = require('../src/models/usuario.model');
const { verifyToken } = require('../src/utils/jwt');
const compraService = require('../src/services/compraTransaccional.service');
const ventaService = require('../src/services/ventaTransaccional.service');
const inventoryService = require('../src/services/inventarioTransaccional.service');
const authMiddleware = require('../src/middleware/authMiddleware');
const { getColumnEnumValues, getColumnMetadata } = require('../src/utils/mysqlEnum');
const { normalizeDecimal } = require('../src/utils/decimal');

function createConnection(firstResult) {
  return {
    beginTransaction: jest.fn().mockResolvedValue(),
    query: jest.fn().mockResolvedValueOnce(firstResult),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn(),
  };
}

function createVentaConnection(queryResults) {
  const connection = createConnection([]);
  connection.query = jest.fn(async (sql) => {
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
    return queryResults.shift() || [[]];
  });
  return connection;
}

function createCompraConnection(queryResults) {
  const connection = createConnection([]);
  connection.query = jest.fn(async (sql) => {
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
    return queryResults.shift() || [[]];
  });
  return connection;
}

describe('claves de operación', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rechaza una clave de compra existente con otro payload', async () => {
    const connection = createCompraConnection([[[{ id: '12' }]]]);
    pool.getConnection.mockResolvedValueOnce(connection);
    compraModel.getCompraById.mockResolvedValueOnce({
      numero: 'P-12',
      proveedor_id: '4',
      fecha_pedido: '2026-01-01',
      fecha_entrega_prevista: '2026-01-03',
      detalles: [{ producto_proveedor_id: '7', cantidad_presentaciones: 2 }],
    });

    await expect(compraService.crearCompraTransaccional({
      clave_operacion: 'operation',
      numero: 'P-12',
      proveedor_id: '4',
      fecha_pedido: '2026-01-01',
      fecha_entrega_prevista: '2026-01-03',
      detalles: [{ producto_proveedor_id: '7', cantidad_presentaciones: 3 }],
    }, '1')).rejects.toMatchObject({ statusCode: 409 });

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('asigna el siguiente correlativo de compra bajo bloqueo de MySQL', async () => {
    const connection = createCompraConnection([
      [[]],
      [[{ last_sequence: '367' }]],
      [[{ id: '4', nombre: 'Proveedor', plazo_entrega_dias: 2, activo: 1 }]],
      [{ insertId: 15 }],
      [[{
        id: '8', proveedor_id: '4', producto_id: '3', presentacion_compra: 'caja',
        unidades_por_presentacion: 12, costo_presentacion: '24.00',
        minimo_presentaciones: 1, activo: 1, codigo: 'P-3',
        nombre_producto: 'Producto', presentacion_producto: 'unidad',
      }]],
      [{ insertId: 19 }],
    ]);
    pool.getConnection.mockResolvedValueOnce(connection);
    const compra = { id: '15', numero: 'OC-SIM-000368' };
    compraModel.getCompraById.mockResolvedValueOnce(compra);

    const result = await compraService.crearCompraTransaccional({
      clave_operacion: 'operation',
      numero: 'OC-SIM-000001',
      proveedor_id: '4',
      fecha_pedido: '2026-02-01',
      fecha_entrega_prevista: '2026-02-03',
      detalles: [{ producto_proveedor_id: '8', cantidad_presentaciones: 2 }],
    }, '1');

    const insertCall = connection.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO compras'));
    expect(insertCall[1][0]).toBe('OC-SIM-000368');
    expect(result).toEqual({ compra, duplicada: false });
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.query.mock.calls.some(([sql]) => sql.includes('GET_LOCK'))).toBe(true);
    expect(connection.query.mock.calls.some(([sql]) => sql.includes('RELEASE_LOCK'))).toBe(true);
  });

  test('acepta un reintento de venta con el mismo payload', async () => {
    const connection = createVentaConnection([[[{ id: '21' }]]]);
    pool.getConnection.mockResolvedValueOnce(connection);
    const venta = {
      numero: 'V-21',
      fecha_comercial: '2026-02-01',
      medio_pago: 'efectivo',
      detalles: [{ producto_id: '3', cantidad: 2, precio_unitario: '1.00' }],
    };
    ventaModel.getVentaById.mockResolvedValueOnce(venta);

    const result = await ventaService.crearVentaTransaccional({
      clave_operacion: 'operation',
      numero: 'V-21',
      fecha_comercial: '2026-02-01',
      medio_pago: 'efectivo',
      detalles: [{ producto_id: '3', cantidad: 2, precio_unitario: '1' }],
    }, '1');

    expect(result).toEqual({ venta, duplicada: true });
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  test('rechaza una clave de venta existente con otro payload', async () => {
    const connection = createVentaConnection([[[{ id: '22' }]]]);
    pool.getConnection.mockResolvedValueOnce(connection);
    ventaModel.getVentaById.mockResolvedValueOnce({
      numero: 'V-22',
      fecha_comercial: '2026-02-01',
      medio_pago: 'efectivo',
      detalles: [{ producto_id: '3', cantidad: 2, precio_unitario: '1.00' }],
    });

    await expect(ventaService.crearVentaTransaccional({
      clave_operacion: 'operation',
      numero: 'V-22',
      fecha_comercial: '2026-02-01',
      medio_pago: 'efectivo',
      detalles: [{ producto_id: '3', cantidad: 3, precio_unitario: '1' }],
    }, '1')).rejects.toMatchObject({ statusCode: 409 });

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('rechaza precios de venta diferentes al precio vigente del producto', async () => {
    const connection = createVentaConnection([
      [[]],
      [[{ last_sequence: '500' }]],
      [[{ id: '3' }]],
      [[
          { id: '3', codigo: 'P-3', nombre: 'Producto', presentacion: 'unidad', activo: 1, precio_venta: '2.00' },
      ]],
    ]);
    pool.getConnection.mockResolvedValueOnce(connection);

    await expect(ventaService.crearVentaTransaccional({
      clave_operacion: 'operation',
      numero: 'V-23',
      fecha_comercial: '2026-02-01',
      medio_pago: 'efectivo',
      detalles: [{ producto_id: '3', cantidad: 1, precio_unitario: '1.00' }],
    }, '1')).rejects.toMatchObject({ statusCode: 409 });

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.query).toHaveBeenCalledTimes(6);
  });

  test('asigna el siguiente correlativo bajo bloqueo de MySQL', async () => {
    const connection = createVentaConnection([
      [[]],
      [[{ last_sequence: '500' }]],
      [[{ id: '3' }]],
      [[{ id: '3', codigo: 'P-3', nombre: 'Producto', presentacion: 'unidad', activo: 1, precio_venta: '2.00' }]],
      [{ insertId: 23 }],
      [{ insertId: 33 }],
    ]);
    pool.getConnection.mockResolvedValueOnce(connection);
    inventoryModel.getExistenciaByProductoId.mockResolvedValueOnce({ unidades_disponibles: '10' });
    const venta = { numero: 'VTA-SIM-0000501' };
    ventaModel.getVentaById.mockResolvedValueOnce(venta);

    const result = await ventaService.crearVentaTransaccional({
      clave_operacion: 'operation',
      numero: 'VTA-SIM-0000501',
      fecha_comercial: '2026-02-01',
      medio_pago: 'efectivo',
      detalles: [{ producto_id: '3', cantidad: 1, precio_unitario: '2.00' }],
    }, '1');

    const insertCall = connection.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO ventas'));
    expect(insertCall[1][0]).toBe('VTA-SIM-0000501');
    expect(result.venta).toBe(venta);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.query.mock.calls.some(([sql]) => sql.includes('GET_LOCK'))).toBe(true);
    expect(connection.query.mock.calls.some(([sql]) => sql.includes('RELEASE_LOCK'))).toBe(true);
  });

  test('no escribe reversos cuando el ENUM no contiene anulacion_venta', async () => {
    const connection = {
      beginTransaction: jest.fn().mockResolvedValue(),
      query: jest.fn()
        .mockResolvedValueOnce([[{ id: '40', estado: 'realizada' }]])
        .mockResolvedValueOnce([[{ id: '41', producto_id: '3', cantidad: '2' }]])
        .mockResolvedValueOnce([[{ column_type: "enum('entrada','salida','ajuste')" }]]),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn(),
    };
    pool.getConnection.mockResolvedValueOnce(connection);

    await expect(ventaService.anularVentaTransaccional('40', {
      fecha_comercial: '2026-02-01',
      motivo_anulacion: 'error',
    }, '1')).rejects.toMatchObject({ statusCode: 409 });

    expect(connection.query).toHaveBeenCalledTimes(3);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('rechaza una clave de recepción existente con otros detalles', async () => {
    const connection = createConnection([[{ id: '25' }]]);
    pool.getConnection.mockResolvedValueOnce(connection);
    recepcionModel.getRecepcionById.mockResolvedValueOnce({
      compra_id: '2',
      numero: 'R-25',
      fecha_comercial: '2026-02-01',
      observacion: null,
      detalles: [{ detalle_compra_id: '9', unidades_recibidas: '4' }],
    });

    await expect(compraService.crearRecepcionTransaccional('2', {
      clave_operacion: 'operation',
      numero: 'R-25',
      fecha_comercial: '2026-02-01',
      observacion: null,
      detalles: [{ detalle_compra_id: '9', unidades_recibidas: '5' }],
    }, '1')).rejects.toMatchObject({ statusCode: 409 });

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('rechaza una clave de ajuste existente con otro motivo', async () => {
    const connection = createConnection([[
      {
        id: '31',
        producto_id: '3',
        tipo: 'ajuste',
        variacion_unidades: '-2',
        fecha_comercial: '2026-02-01',
        motivo_ajuste: 'merma',
        descripcion_ajuste: null,
      },
    ]]);
    pool.getConnection.mockResolvedValueOnce(connection);

    await expect(inventoryService.crearAjusteTransaccional({
      clave_operacion: 'operation',
      producto_id: '3',
      variacion_unidades: '-2',
      fecha_comercial: '2026-02-01',
      motivo_ajuste: 'conteo',
      descripcion_ajuste: null,
    }, '1')).rejects.toMatchObject({ statusCode: 409 });

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });
});

describe('cambio obligatorio de clave', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyToken.mockReturnValue({ id: '1' });
    usuarioModel.getUsuarioById.mockResolvedValue({
      id: '1',
      debe_cambiar_clave: 1,
    });
  });

  function makeRequest(path) {
    return {
      headers: { authorization: 'Bearer test-token' },
      baseUrl: '/api/auth',
      path,
    };
  }

  function makeResponse() {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  }

  test('bloquea endpoints protegidos distintos a identidad y cambio de clave', async () => {
    const req = makeRequest('/ventas');
    const res = makeResponse();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test.each(['/me', '/clave'])('permite /api/auth%s', async (path) => {
    const req = makeRequest(path);
    const res = makeResponse();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('días de pedido', () => {
  test('revierte y conserva los días existentes si el ENUM no permite el valor', async () => {
    const connection = createConnection([[{ column_type: "enum('allowed_a','allowed_b')" }]]);
    pool.getConnection.mockResolvedValueOnce(connection);

    await expect(proveedorModel.setDiasPedidoProveedor('4', ['not_allowed']))
      .rejects.toMatchObject({ code: 'INVALID_DAY_VALUE' });

    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(connection.query.mock.calls[0][0]).toContain('INFORMATION_SCHEMA.COLUMNS');
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('valida dia_semana con el rango numérico real antes del borrado', async () => {
    const connection = createConnection([[{ column_type: 'tinyint(3) unsigned' }]]);
    pool.getConnection.mockResolvedValueOnce(connection);

    await expect(proveedorModel.setDiasPedidoProveedor('4', ['256']))
      .rejects.toMatchObject({ code: 'INVALID_DAY_VALUE' });

    expect(connection.query.mock.calls[0][0]).toContain('INFORMATION_SCHEMA.COLUMNS');
    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('normaliza duplicados numéricos antes de reemplazar días', async () => {
    const connection = createConnection([[{ column_type: 'tinyint(3) unsigned' }]]);
    pool.getConnection.mockResolvedValueOnce(connection);

    await expect(proveedorModel.setDiasPedidoProveedor('4', ['1', '01']))
      .rejects.toMatchObject({ code: 'INVALID_DAY_VALUE' });

    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('acepta los límites de almacenamiento unsigned observados en metadatos', async () => {
    const connection = {
      beginTransaction: jest.fn().mockResolvedValue(),
      query: jest.fn(async (sql) => {
        if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
          return [[{ column_type: 'tinyint(3) unsigned' }]];
        }
        if (sql.startsWith('SELECT id FROM proveedores')) {
          return [[{ id: '4' }]];
        }
        return [{ affectedRows: 1 }];
      }),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn(),
    };
    pool.getConnection.mockResolvedValueOnce(connection);
    pool.query.mockResolvedValueOnce([[{ dia_semana: 1 }, { dia_semana: 255 }]]);

    await expect(proveedorModel.setDiasPedidoProveedor('4', ['1', '255']))
      .resolves.toEqual([1, 255]);

    expect(connection.query).toHaveBeenCalledWith(
      'INSERT INTO dias_pedido_proveedor (proveedor_id, dia_semana) VALUES (?, ?)',
      ['4', '1']
    );
    expect(connection.query).toHaveBeenCalledWith(
      'INSERT INTO dias_pedido_proveedor (proveedor_id, dia_semana) VALUES (?, ?)',
      ['4', '255']
    );
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });
});

describe('valores ENUM reales', () => {
  test('lee los valores literales desde metadatos usando parámetros', async () => {
    const connection = {
      query: jest.fn().mockResolvedValueOnce([[
        { column_type: "enum('allowed_a','allowed_b')" },
      ]]),
    };

    await expect(getColumnEnumValues(connection, 'example_table', 'example_column'))
      .resolves.toEqual(['allowed_a', 'allowed_b']);
    expect(connection.query.mock.calls[0][1]).toEqual(['example_table', 'example_column']);
  });

  test('devuelve null si la columna no es ENUM', async () => {
    const connection = {
      query: jest.fn().mockResolvedValueOnce([[{ column_type: 'varchar(32)' }]]),
    };

    await expect(getColumnEnumValues(connection, 'example_table', 'example_column'))
      .resolves.toBeNull();
  });

  test('expone metadatos de una columna numérica sin fingir que es ENUM', async () => {
    const connection = {
      query: jest.fn().mockResolvedValueOnce([[{ column_type: 'tinyint(3) unsigned' }]]),
    };

    await expect(getColumnMetadata(connection, 'dias_pedido_proveedor', 'dia_semana'))
      .resolves.toEqual({ columnType: 'tinyint(3) unsigned', enumValues: null });
  });
});

describe('precisión DECIMAL del esquema', () => {
  test('normaliza exactamente DECIMAL(12,2) sin usar Number', () => {
    expect(normalizeDecimal('00012.3', 12, 2)).toBe('12.30');
    expect(normalizeDecimal('9999999999.99', 12, 2)).toBe('9999999999.99');
  });

  test.each(['1.234', '10000000000', '-1', 'not-a-number'])(
    'rechaza valores no representables: %s',
    (value) => {
      expect(normalizeDecimal(value, 12, 2)).toBeNull();
    }
  );
});
