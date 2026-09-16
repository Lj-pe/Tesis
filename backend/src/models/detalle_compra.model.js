const pool = require('../config/database');

async function getAllDetalleCompras() {
  const [rows] = await pool.query('SELECT * FROM detalle_compras ORDER BY id_detalle_compra ASC');
  return rows;
}

async function getDetalleCompraById(id) {
  const [rows] = await pool.query('SELECT * FROM detalle_compras WHERE id_detalle_compra = ?', [id]);
  return rows[0] || null;
}

async function createDetalleCompra(data) {
  const {
    compra_id,
    producto_id,
    cantidad,
    costo_unitario,
    subtotal,
    impuesto,
    total_linea,
    observaciones,
  } = data;

  const [result] = await pool.query(
    `INSERT INTO detalle_compras (
      compra_id,
      producto_id,
      cantidad,
      costo_unitario,
      subtotal,
      impuesto,
      total_linea,
      observaciones
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      compra_id,
      producto_id,
      cantidad,
      costo_unitario,
      subtotal ?? 0,
      impuesto ?? 0,
      total_linea ?? 0,
      observaciones ?? null,
    ]
  );

  return {
    id_detalle_compra: result.insertId,
    compra_id,
    producto_id,
    cantidad,
    costo_unitario,
    subtotal: subtotal ?? 0,
    impuesto: impuesto ?? 0,
    total_linea: total_linea ?? 0,
    observaciones: observaciones ?? null,
  };
}

async function updateDetalleCompra(id, data) {
  const fields = [];
  const values = [];

  if (data.compra_id !== undefined) {
    fields.push('compra_id = ?');
    values.push(data.compra_id);
  }

  if (data.producto_id !== undefined) {
    fields.push('producto_id = ?');
    values.push(data.producto_id);
  }

  if (data.cantidad !== undefined) {
    fields.push('cantidad = ?');
    values.push(data.cantidad);
  }

  if (data.costo_unitario !== undefined) {
    fields.push('costo_unitario = ?');
    values.push(data.costo_unitario);
  }

  if (data.subtotal !== undefined) {
    fields.push('subtotal = ?');
    values.push(data.subtotal);
  }

  if (data.impuesto !== undefined) {
    fields.push('impuesto = ?');
    values.push(data.impuesto);
  }

  if (data.total_linea !== undefined) {
    fields.push('total_linea = ?');
    values.push(data.total_linea);
  }

  if (data.observaciones !== undefined) {
    fields.push('observaciones = ?');
    values.push(data.observaciones);
  }

  if (fields.length === 0) {
    return null;
  }

  await pool.query(
    `UPDATE detalle_compras SET ${fields.join(', ')} WHERE id_detalle_compra = ?`,
    [...values, id]
  );

  return true;
}

async function deleteDetalleCompra(id) {
  const [result] = await pool.query('DELETE FROM detalle_compras WHERE id_detalle_compra = ?', [id]);
  return result;
}

module.exports = {
  getAllDetalleCompras,
  getDetalleCompraById,
  createDetalleCompra,
  updateDetalleCompra,
  deleteDetalleCompra,
};
