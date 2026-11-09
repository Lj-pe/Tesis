const pool = require('../config/database');
const compraModel = require('../models/compra.model');
const recepcionModel = require('../models/recepcion.model');
const inventoryService = require('./inventarioTransaccional.service');
const movementService = require('./movimientosInventario.service');
const { normalizeDate, sameItems } = require('../utils/operationPayload');

const PURCHASE_NUMBER_PREFIX = 'OC-SIM-';

async function getNextPurchaseNumber(connection) {
  const [rows] = await connection.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(numero, 8) AS UNSIGNED)), 0) AS last_sequence
     FROM compras WHERE numero REGEXP '^OC-SIM-[0-9]+$'`
  );
  const sequence = BigInt(rows[0]?.last_sequence || 0) + 1n;
  return `${PURCHASE_NUMBER_PREFIX}${sequence.toString().padStart(6, '0')}`;
}

function compraCoincide(payload, compra) {
  return compra &&
    String(compra.proveedor_id) === String(payload.proveedor_id) &&
    normalizeDate(compra.fecha_pedido) === payload.fecha_pedido &&
    normalizeDate(compra.fecha_entrega_prevista) === payload.fecha_entrega_prevista &&
    sameItems(
      compra.detalles.map((detail) => [detail.producto_proveedor_id, detail.cantidad_presentaciones]),
      payload.detalles.map((detail) => [detail.producto_proveedor_id, detail.cantidad_presentaciones])
    );
}

function recepcionCoincide(compraId, payload, recepcion) {
  return recepcion &&
    String(recepcion.compra_id) === String(compraId) &&
    String(recepcion.numero) === payload.numero &&
    normalizeDate(recepcion.fecha_comercial) === payload.fecha_comercial &&
    (recepcion.observacion ?? null) === (payload.observacion ?? null) &&
    sameItems(
      recepcion.detalles.map((detail) => [detail.detalle_compra_id, detail.unidades_recibidas]),
      payload.detalles.map((detail) => [detail.detalle_compra_id, detail.unidades_recibidas])
    );
}

function conflictForReusedKey() {
  return Object.assign(new Error('La clave de operación ya se usó con datos diferentes'), { statusCode: 409 });
}

async function crearCompraTransaccional(payload, usuarioId) {
  const connection = await pool.getConnection();
  let sequenceLockAcquired = false;
  try {
    await connection.beginTransaction();
    const [lockRows] = await connection.query(
      "SELECT GET_LOCK(CONCAT(DATABASE(), ':compras:sequence'), 10) AS acquired"
    );
    if (Number(lockRows[0]?.acquired) !== 1) {
      throw Object.assign(new Error('No se pudo reservar el correlativo del pedido; intenta nuevamente'), {
        statusCode: 503,
      });
    }
    sequenceLockAcquired = true;

    const [existing] = await connection.query(
      'SELECT id FROM compras WHERE clave_operacion = ? FOR UPDATE',
      [payload.clave_operacion]
    );
    if (existing[0]) {
      const compra = await compraModel.getCompraById(existing[0].id, connection);
      if (!compraCoincide(payload, compra)) throw conflictForReusedKey();
      await connection.commit();
      return { compra, duplicada: true };
    }

    payload.numero = await getNextPurchaseNumber(connection);
    const catalogIds = payload.detalles.map((item) => String(item.producto_proveedor_id));
    if (new Set(catalogIds).size !== catalogIds.length) {
      throw Object.assign(new Error('Cada producto del proveedor debe aparecer una sola vez en el pedido'), {
        statusCode: 400,
      });
    }

    const [proveedores] = await connection.query(
      `SELECT id, nombre, plazo_entrega_dias, activo
       FROM proveedores WHERE id = ? FOR UPDATE`,
      [payload.proveedor_id]
    );
    const proveedor = proveedores[0];
    if (!proveedor) throw Object.assign(new Error('Proveedor no encontrado'), { statusCode: 404 });
    if (!Number(proveedor.activo)) throw Object.assign(new Error('Proveedor inactivo'), { statusCode: 409 });

    const [compraResult] = await connection.query(
      `INSERT INTO compras (
        numero, clave_operacion, proveedor_id, nombre_proveedor, fecha_pedido,
        fecha_entrega_prevista, plazo_entrega_dias, estado, usuario_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
      [
        payload.numero, payload.clave_operacion, proveedor.id, proveedor.nombre,
        payload.fecha_pedido, payload.fecha_entrega_prevista,
        proveedor.plazo_entrega_dias, usuarioId,
      ]
    );

    const [catalogRows] = await connection.query(
      `SELECT pp.id, pp.proveedor_id, pp.producto_id, pp.presentacion_compra,
              pp.unidades_por_presentacion, pp.costo_presentacion, pp.activo,
              pp.minimo_presentaciones,
              p.codigo, p.nombre AS nombre_producto, p.presentacion AS presentacion_producto
       FROM productos_proveedores pp
       JOIN productos p ON p.id = pp.producto_id
       WHERE pp.id IN (?) AND pp.proveedor_id = ?
       ORDER BY pp.id
       FOR UPDATE`,
      [catalogIds, proveedor.id]
    );
    const catalogs = new Map(catalogRows.map((row) => [String(row.id), row]));
    if (catalogs.size !== new Set(catalogIds).size) {
      throw Object.assign(new Error('Una relación de catálogo no corresponde al proveedor'), { statusCode: 400 });
    }

    for (const detail of payload.detalles) {
      const item = catalogs.get(String(detail.producto_proveedor_id));
      if (!item || !Number(item.activo)) {
        throw Object.assign(new Error('La relación de catálogo está inactiva o no existe'), { statusCode: 409 });
      }
      if (detail.cantidad_presentaciones < Number(item.minimo_presentaciones || 1)) {
        throw Object.assign(new Error(`La cantidad es menor al mínimo para ${item.nombre_producto}`), { statusCode: 400 });
      }
      await connection.query(
        `INSERT INTO detalle_compras (
          compra_id, proveedor_id, producto_proveedor_id, producto_id,
          codigo_producto, nombre_producto, presentacion_producto,
          presentacion_compra, unidades_por_presentacion,
          cantidad_presentaciones, costo_presentacion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          compraResult.insertId, proveedor.id, item.id, item.producto_id,
          item.codigo, item.nombre_producto, item.presentacion_producto,
          item.presentacion_compra, item.unidades_por_presentacion,
          detail.cantidad_presentaciones, item.costo_presentacion,
        ]
      );
    }

    const compra = await compraModel.getCompraById(compraResult.insertId, connection);
    await connection.commit();
    return { compra, duplicada: false };
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      const [existing] = await pool.query(
        'SELECT id FROM compras WHERE clave_operacion = ?',
        [payload.clave_operacion]
      );
      if (existing[0]) {
        const compra = await compraModel.getCompraById(existing[0].id);
        if (!compraCoincide(payload, compra)) throw conflictForReusedKey();
        return { compra, duplicada: true };
      }
      error.statusCode = 409;
    }
    throw error;
  } finally {
    try {
      if (sequenceLockAcquired) {
        await connection.query(
          "SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':compras:sequence')) AS released"
        );
      }
    } finally {
      connection.release();
    }
  }
}

async function crearRecepcionTransaccional(compraId, payload, usuarioId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query(
      'SELECT id FROM recepciones WHERE clave_operacion = ? FOR UPDATE',
      [payload.clave_operacion]
    );
    if (existing[0]) {
      const recepcion = await recepcionModel.getRecepcionById(existing[0].id, connection);
      if (!recepcionCoincide(compraId, payload, recepcion)) throw conflictForReusedKey();
      await connection.commit();
      return { recepcion_id: existing[0].id, duplicada: true };
    }

    const [compraRows] = await connection.query(
      'SELECT id, estado FROM compras WHERE id = ? FOR UPDATE',
      [compraId]
    );
    const compra = compraRows[0];
    if (!compra) throw Object.assign(new Error('Compra no encontrada'), { statusCode: 404 });
    if (!['pendiente', 'recibida_parcial'].includes(compra.estado)) {
      throw Object.assign(new Error('La compra no admite nuevas recepciones'), { statusCode: 409 });
    }

    const detailIds = payload.detalles.map((detail) => String(detail.detalle_compra_id));
    if (new Set(detailIds).size !== detailIds.length) {
      throw Object.assign(new Error('No se puede repetir un detalle en la misma recepción'), { statusCode: 400 });
    }

    const [purchaseDetails] = await connection.query(
      `SELECT d.id, d.compra_id, d.producto_id
       FROM detalle_compras d
       WHERE d.compra_id = ? AND d.id IN (?)
       ORDER BY d.producto_id
       FOR UPDATE`,
      [compraId, detailIds]
    );
    if (purchaseDetails.length !== detailIds.length) {
      throw Object.assign(new Error('Uno o más detalles no pertenecen a la compra'), { statusCode: 400 });
    }
    await inventoryService.lockProductos(connection, purchaseDetails.map((row) => row.producto_id));

    const [balanceRows] = await connection.query(
      `SELECT detalle_compra_id, producto_id, unidades_por_llegar
       FROM vista_saldos_compras WHERE compra_id = ? AND detalle_compra_id IN (?)`,
      [compraId, detailIds]
    );
    const balances = new Map(balanceRows.map((row) => [String(row.detalle_compra_id), row]));
    for (const detail of payload.detalles) {
      const balance = balances.get(String(detail.detalle_compra_id));
      if (!balance || BigInt(detail.unidades_recibidas) > BigInt(balance.unidades_por_llegar || 0)) {
        throw Object.assign(new Error('La cantidad recibida supera el saldo pendiente del detalle'), { statusCode: 409 });
      }
    }

    const [receiptResult] = await connection.query(
      `INSERT INTO recepciones (
        numero, clave_operacion, compra_id, recibida_en, fecha_comercial,
        usuario_id, observacion
      ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)`,
      [
        payload.numero, payload.clave_operacion, compraId,
        payload.fecha_comercial, usuarioId, payload.observacion ?? null,
      ]
    );

    for (const detail of payload.detalles) {
      const productId = balances.get(String(detail.detalle_compra_id)).producto_id;
      const [receiptDetailResult] = await connection.query(
        `INSERT INTO detalle_recepciones (
          recepcion_id, compra_id, detalle_compra_id, producto_id, unidades_recibidas
        ) VALUES (?, ?, ?, ?, ?)`,
        [
          receiptResult.insertId, compraId, detail.detalle_compra_id,
          productId, detail.unidades_recibidas,
        ]
      );
      await movementService.registrarEntrada(connection, {
        producto_id: productId,
        cantidad: detail.unidades_recibidas,
        fecha_comercial: payload.fecha_comercial,
        ocurrido_en: new Date(),
        detalle_recepcion_id: receiptDetailResult.insertId,
        usuario_id: usuarioId,
      });
    }

    const [allBalances] = await connection.query(
      'SELECT unidades_por_llegar FROM vista_saldos_compras WHERE compra_id = ?',
      [compraId]
    );
    const pendiente = allBalances.some((row) => BigInt(row.unidades_por_llegar || 0) > 0n);
    await connection.query(
      'UPDATE compras SET estado = ? WHERE id = ?',
      [pendiente ? 'recibida_parcial' : 'recibida', compraId]
    );
    await connection.commit();
    return { recepcion_id: receiptResult.insertId, duplicada: false };
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      const [existing] = await pool.query(
        'SELECT id FROM recepciones WHERE clave_operacion = ?',
        [payload.clave_operacion]
      );
      if (existing[0]) {
        const recepcion = await recepcionModel.getRecepcionById(existing[0].id);
        if (!recepcionCoincide(compraId, payload, recepcion)) throw conflictForReusedKey();
        return { recepcion_id: existing[0].id, duplicada: true };
      }
      error.statusCode = 409;
    }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  crearCompraTransaccional,
  crearRecepcionTransaccional,
  getNextPurchaseNumber,
};
