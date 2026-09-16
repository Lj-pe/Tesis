const pool = require('../config/database');

async function getAllDetalleVentas() {
  const [rows] = await pool.query('SELECT * FROM detalle_ventas ORDER BY id_detalle_venta ASC');
  return rows;
}

async function getDetalleVentaById(id) {
  const [rows] = await pool.query('SELECT * FROM detalle_ventas WHERE id_detalle_venta = ?', [id]);
  return rows[0] || null;
}

async function createDetalleVenta(data) {
  const {
    venta_id,
    producto_id,
    cantidad,
    precio_unitario,
    subtotal,
    descuento,
    impuesto,
    total_linea,
  } = data;

  const [result] = await pool.query(
    `INSERT INTO detalle_ventas (
      venta_id,
      producto_id,
      cantidad,
      precio_unitario,
      subtotal,
      descuento,
      impuesto,
      total_linea
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      venta_id,
      producto_id,
      cantidad,
      precio_unitario,
      subtotal ?? 0,
      descuento ?? 0,
      impuesto ?? 0,
      total_linea ?? 0,
    ]
  );

  return {
    id_detalle_venta: result.insertId,
    venta_id,
    producto_id,
    cantidad,
    precio_unitario,
    subtotal: subtotal ?? 0,
    descuento: descuento ?? 0,
    impuesto: impuesto ?? 0,
    total_linea: total_linea ?? 0,
  };
}

async function updateDetalleVenta(id, data) {
  const fields = [];
  const values = [];

  if (data.venta_id !== undefined) {
    fields.push('venta_id = ?');
    values.push(data.venta_id);
  }

  if (data.producto_id !== undefined) {
    fields.push('producto_id = ?');
    values.push(data.producto_id);
  }

  if (data.cantidad !== undefined) {
    fields.push('cantidad = ?');
    values.push(data.cantidad);
  }

  if (data.precio_unitario !== undefined) {
    fields.push('precio_unitario = ?');
    values.push(data.precio_unitario);
  }

  if (data.subtotal !== undefined) {
    fields.push('subtotal = ?');
    values.push(data.subtotal);
  }

  if (data.descuento !== undefined) {
    fields.push('descuento = ?');
    values.push(data.descuento);
  }

  if (data.impuesto !== undefined) {
    fields.push('impuesto = ?');
    values.push(data.impuesto);
  }

  if (data.total_linea !== undefined) {
    fields.push('total_linea = ?');
    values.push(data.total_linea);
  }

  if (fields.length === 0) {
    return null;
  }

  await pool.query(
    `UPDATE detalle_ventas SET ${fields.join(', ')} WHERE id_detalle_venta = ?`,
    [...values, id]
  );

  return true;
}

async function deleteDetalleVenta(id) {
  const [result] = await pool.query('DELETE FROM detalle_ventas WHERE id_detalle_venta = ?', [id]);
  return result;
}

module.exports = {
  getAllDetalleVentas,
  getDetalleVentaById,
  createDetalleVenta,
  updateDetalleVenta,
  deleteDetalleVenta,
};
