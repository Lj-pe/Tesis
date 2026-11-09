const inventoryModel = require('../models/inventario.model');
const movementModel = require('../models/movimiento_inventario.model');
const pool = require('../config/database');
const { normalizeDate } = require('../utils/operationPayload');
const { getColumnEnumValues } = require('../utils/mysqlEnum');

async function validarValoresAjuste(connection, tipo, motivo) {
  const tipos = await getColumnEnumValues(connection, 'movimientos_inventario', 'tipo');
  if (tipos && !tipos.includes(tipo)) {
    throw Object.assign(new Error(`El tipo de movimiento ${tipo} no está permitido por la base de datos`), {
      statusCode: 409,
    });
  }
  const motivos = await getColumnEnumValues(connection, 'movimientos_inventario', 'motivo_ajuste');
  if (motivos && !motivos.includes(motivo)) {
    throw Object.assign(new Error('El motivo de ajuste no está permitido por la base de datos'), {
      statusCode: 400,
    });
  }
}

function ajusteCoincide(data, movimiento) {
  return movimiento &&
    String(movimiento.producto_id) === String(data.producto_id) &&
    movimiento.tipo === 'ajuste' &&
    String(movimiento.variacion_unidades) === String(data.variacion_unidades) &&
    normalizeDate(movimiento.fecha_comercial) === data.fecha_comercial &&
    movimiento.motivo_ajuste === data.motivo_ajuste &&
    (movimiento.descripcion_ajuste ?? null) === (data.descripcion_ajuste ?? null);
}

function conflictForReusedKey() {
  return Object.assign(new Error('La clave de operación ya se usó con datos diferentes'), { statusCode: 409 });
}

function compareUnsignedIds(a, b) {
  const left = BigInt(a);
  const right = BigInt(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

async function lockProductos(connection, productoIds) {
  const ids = [...new Set(productoIds.map(String))].sort(compareUnsignedIds);
  if (!ids.length) return;
  const [rows] = await connection.query(
    'SELECT id FROM productos WHERE id IN (?) ORDER BY id FOR UPDATE',
    [ids]
  );
  if (rows.length !== ids.length) {
    throw Object.assign(new Error('Uno o más productos no existen'), { statusCode: 400 });
  }
}

async function obtenerExistencia(connection, productoId) {
  const existencia = await inventoryModel.getExistenciaByProductoId(productoId, connection);
  if (!existencia) {
    throw Object.assign(new Error(`No existe el producto ${productoId}`), { statusCode: 404 });
  }
  return BigInt(existencia.unidades_disponibles || 0);
}

async function validarStockDisponible(connection, productoId, cantidad) {
  const disponible = await obtenerExistencia(connection, productoId);
  if (BigInt(cantidad) > disponible) {
    throw Object.assign(new Error(`Stock insuficiente para el producto ${productoId}`), { statusCode: 409 });
  }
}

async function crearAjusteTransaccional(data, usuarioId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query(
      `SELECT id, producto_id, tipo, variacion_unidades, fecha_comercial,
              motivo_ajuste, descripcion_ajuste
       FROM movimientos_inventario WHERE clave_operacion = ?`,
      [data.clave_operacion]
    );
    if (existing.length) {
      if (!ajusteCoincide(data, existing[0])) throw conflictForReusedKey();
      await connection.commit();
      return { movimiento: existing[0], duplicado: true };
    }

    await validarValoresAjuste(connection, 'ajuste', data.motivo_ajuste);
    await lockProductos(connection, [data.producto_id]);
    const stockAntes = await obtenerExistencia(connection, data.producto_id);
    const stockDespues = stockAntes + BigInt(data.variacion_unidades);
    if (stockDespues < 0n) {
      throw Object.assign(new Error('El ajuste no puede dejar existencias negativas'), { statusCode: 409 });
    }

    const id = await movementModel.createMovimiento(connection, {
      ...data,
      tipo: 'ajuste',
      ocurrido_en: data.ocurrido_en || new Date(),
      usuario_id: usuarioId,
    });
    await connection.commit();
    return { movimiento: await movementModel.getMovimientoInventarioById(id), duplicado: false };
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      const [rows] = await pool.query(
        `SELECT id, producto_id, tipo, variacion_unidades, fecha_comercial,
                motivo_ajuste, descripcion_ajuste
         FROM movimientos_inventario WHERE clave_operacion = ?`,
        [data.clave_operacion]
      );
      if (rows[0]) {
        if (!ajusteCoincide(data, rows[0])) throw conflictForReusedKey();
        return { movimiento: rows[0], duplicado: true };
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  lockProductos,
  obtenerExistencia,
  validarStockDisponible,
  crearAjusteTransaccional,
};
