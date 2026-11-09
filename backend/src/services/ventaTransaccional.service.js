const pool = require('../config/database');
const ventaModel = require('../models/venta.model');
const inventoryService = require('./inventarioTransaccional.service');
const movementService = require('./movimientosInventario.service');
const { normalizeDate, normalizeDecimal, sameItems } = require('../utils/operationPayload');
const { getColumnEnumValues } = require('../utils/mysqlEnum');
const { normalizeDecimal: normalizeSalePrice } = require('../utils/decimal');

const SALE_NUMBER_PREFIX = 'VTA-SIM-';

async function getNextSaleNumber(connection) {
  const [rows] = await connection.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(numero, 9) AS UNSIGNED)), 0) AS last_sequence
     FROM ventas WHERE numero REGEXP '^VTA-SIM-[0-9]+$'`
  );
  const sequence = BigInt(rows[0]?.last_sequence || 0) + 1n;
  return `${SALE_NUMBER_PREFIX}${sequence.toString().padStart(7, '0')}`;
}

function ventaCoincide(payload, venta) {
  return venta &&
    normalizeDate(venta.fecha_comercial) === payload.fecha_comercial &&
    String(venta.medio_pago) === payload.medio_pago &&
    sameItems(
      venta.detalles.map((detail) => [
        detail.producto_id,
        detail.cantidad,
        normalizeDecimal(detail.precio_unitario),
      ]),
      payload.detalles.map((detail) => [
        detail.producto_id,
        detail.cantidad,
        normalizeDecimal(detail.precio_unitario),
      ])
    );
}

function conflictForReusedKey() {
  return Object.assign(new Error('La clave de operación ya se usó con datos diferentes'), { statusCode: 409 });
}

async function crearVentaTransaccional(payload, usuarioId) {
  const connection = await pool.getConnection();
  let sequenceLockAcquired = false;
  try {
    await connection.beginTransaction();
    const [lockRows] = await connection.query(
      "SELECT GET_LOCK(CONCAT(DATABASE(), ':ventas:sequence'), 10) AS acquired"
    );
    if (Number(lockRows[0]?.acquired) !== 1) {
      throw Object.assign(new Error('No se pudo reservar el correlativo de venta; intenta nuevamente'), {
        statusCode: 503,
      });
    }
    sequenceLockAcquired = true;

    const [existing] = await connection.query(
      'SELECT id FROM ventas WHERE clave_operacion = ? FOR UPDATE',
      [payload.clave_operacion]
    );
    if (existing[0]) {
      const venta = await ventaModel.getVentaById(existing[0].id, connection);
      if (!ventaCoincide(payload, venta)) throw conflictForReusedKey();
      await connection.commit();
      return { venta, duplicada: true };
    }

    payload.numero = await getNextSaleNumber(connection);
    const productIds = payload.detalles.map((detail) => String(detail.producto_id));
    if (new Set(productIds).size !== productIds.length) {
      throw Object.assign(new Error('Cada producto debe aparecer una sola vez en la venta'), { statusCode: 400 });
    }
    await inventoryService.lockProductos(connection, productIds);

    const [products] = await connection.query(
      `SELECT id, codigo, nombre, presentacion, activo, precio_venta
       FROM productos WHERE id IN (?) ORDER BY id`,
      [productIds]
    );
    const productsById = new Map(products.map((product) => [String(product.id), product]));
    for (const detail of payload.detalles) {
      const product = productsById.get(String(detail.producto_id));
      if (!product) throw Object.assign(new Error(`Producto ${detail.producto_id} no encontrado`), { statusCode: 404 });
      if (!Number(product.activo)) throw Object.assign(new Error(`Producto ${detail.producto_id} inactivo`), { statusCode: 409 });
      if (normalizeSalePrice(product.precio_venta, 12, 2) !== detail.precio_unitario) {
        throw Object.assign(new Error(`El precio del producto ${detail.producto_id} cambió; actualiza la venta`), {
          statusCode: 409,
        });
      }
      await inventoryService.validarStockDisponible(connection, detail.producto_id, detail.cantidad);
    }

    const [saleResult] = await connection.query(
      `INSERT INTO ventas (
        numero, clave_operacion, realizada_en, fecha_comercial,
        estado, medio_pago, usuario_id
      ) VALUES (?, ?, CURRENT_TIMESTAMP, ?, 'realizada', ?, ?)`,
      [payload.numero, payload.clave_operacion, payload.fecha_comercial, payload.medio_pago, usuarioId]
    );

    for (const detail of payload.detalles) {
      const product = productsById.get(String(detail.producto_id));
      const [detailResult] = await connection.query(
        `INSERT INTO detalle_ventas (
          venta_id, producto_id, codigo_producto, nombre_producto,
          presentacion_producto, cantidad, precio_unitario
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          saleResult.insertId, product.id, product.codigo, product.nombre,
          product.presentacion, detail.cantidad, detail.precio_unitario,
        ]
      );
      await movementService.registrarSalida(connection, {
        producto_id: product.id,
        cantidad: detail.cantidad,
        fecha_comercial: payload.fecha_comercial,
        ocurrido_en: new Date(),
        detalle_venta_id: detailResult.insertId,
        usuario_id: usuarioId,
      });
    }

    const venta = await ventaModel.getVentaById(saleResult.insertId, connection);
    await connection.commit();
    return { venta, duplicada: false };
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      const [existing] = await pool.query(
        'SELECT id FROM ventas WHERE clave_operacion = ?',
        [payload.clave_operacion]
      );
      if (existing[0]) {
        const venta = await ventaModel.getVentaById(existing[0].id);
        if (!ventaCoincide(payload, venta)) throw conflictForReusedKey();
        return { venta, duplicada: true };
      }
      error.statusCode = 409;
    }
    throw error;
  } finally {
    try {
      if (sequenceLockAcquired) {
        await connection.query(
          "SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':ventas:sequence')) AS released"
        );
      }
    } finally {
      connection.release();
    }
  }
}

async function anularVentaTransaccional(ventaId, payload, usuarioId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [sales] = await connection.query(
      'SELECT id, estado FROM ventas WHERE id = ? FOR UPDATE',
      [ventaId]
    );
    const sale = sales[0];
    if (!sale) throw Object.assign(new Error('Venta no encontrada'), { statusCode: 404 });
    if (sale.estado === 'anulada') {
      const venta = await ventaModel.getVentaById(ventaId, connection);
      await connection.commit();
      return { venta, duplicada: true };
    }
    if (sale.estado !== 'realizada') {
      throw Object.assign(new Error('La venta no se encuentra en un estado anulable'), { statusCode: 409 });
    }

    const [details] = await connection.query(
      'SELECT id, producto_id, cantidad FROM detalle_ventas WHERE venta_id = ? ORDER BY producto_id FOR UPDATE',
      [ventaId]
    );
    const movementTypes = await getColumnEnumValues(connection, 'movimientos_inventario', 'tipo');
    if (movementTypes && !movementTypes.includes('anulacion_venta')) {
      throw Object.assign(new Error('La base de datos no permite el tipo de movimiento anulacion_venta'), {
        statusCode: 409,
      });
    }
    await inventoryService.lockProductos(connection, details.map((detail) => detail.producto_id));
    const now = new Date();
    for (const detail of details) {
      await movementService.registrarMovimiento(connection, {
        producto_id: detail.producto_id,
        tipo: 'anulacion_venta',
        variacion_unidades: String(detail.cantidad),
        fecha_comercial: payload.fecha_comercial,
        ocurrido_en: now,
        detalle_venta_id: detail.id,
        usuario_id: usuarioId,
      });
    }

    await connection.query(
      `UPDATE ventas SET estado = 'anulada', anulada_en = CURRENT_TIMESTAMP,
         motivo_anulacion = ? WHERE id = ? AND estado = 'realizada'`,
      [payload.motivo_anulacion ?? null, ventaId]
    );
    const venta = await ventaModel.getVentaById(ventaId, connection);
    await connection.commit();
    return { venta, duplicada: false };
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') error.statusCode = 409;
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { crearVentaTransaccional, anularVentaTransaccional, getNextSaleNumber };
