const pool = require('../config/database');

async function getAllVentas() {
  const [rows] = await pool.query('SELECT * FROM ventas ORDER BY id_venta ASC');
  return rows;
}

async function getVentaById(id) {
  const [rows] = await pool.query('SELECT * FROM ventas WHERE id_venta = ?', [id]);
  return rows[0] || null;
}

async function createVenta(data) {
  const {
    usuario_id,
    numero_factura,
    fecha_venta,
    subtotal,
    impuesto,
    descuento,
    total,
    estado,
    observaciones,
    forma_pago,
  } = data;

  const [result] = await pool.query(
    `INSERT INTO ventas (
      usuario_id,
      numero_factura,
      fecha_venta,
      subtotal,
      impuesto,
      descuento,
      total,
      estado,
      observaciones,
      forma_pago
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      usuario_id,
      numero_factura ?? null,
      fecha_venta,
      subtotal ?? 0,
      impuesto ?? 0,
      descuento ?? 0,
      total ?? 0,
      estado ?? 'pendiente',
      observaciones ?? null,
      forma_pago ?? null,
    ]
  );

  return {
    id_venta: result.insertId,
    usuario_id,
    numero_factura: numero_factura ?? null,
    fecha_venta,
    subtotal: subtotal ?? 0,
    impuesto: impuesto ?? 0,
    descuento: descuento ?? 0,
    total: total ?? 0,
    estado: estado ?? 'pendiente',
    observaciones: observaciones ?? null,
    forma_pago: forma_pago ?? null,
  };
}

async function updateVenta(id, data) {
  const fields = [];
  const values = [];

  if (data.usuario_id !== undefined) {
    fields.push('usuario_id = ?');
    values.push(data.usuario_id);
  }

  if (data.numero_factura !== undefined) {
    fields.push('numero_factura = ?');
    values.push(data.numero_factura);
  }

  if (data.fecha_venta !== undefined) {
    fields.push('fecha_venta = ?');
    values.push(data.fecha_venta);
  }

  if (data.subtotal !== undefined) {
    fields.push('subtotal = ?');
    values.push(data.subtotal);
  }

  if (data.impuesto !== undefined) {
    fields.push('impuesto = ?');
    values.push(data.impuesto);
  }

  if (data.descuento !== undefined) {
    fields.push('descuento = ?');
    values.push(data.descuento);
  }

  if (data.total !== undefined) {
    fields.push('total = ?');
    values.push(data.total);
  }

  if (data.estado !== undefined) {
    fields.push('estado = ?');
    values.push(data.estado);
  }

  if (data.observaciones !== undefined) {
    fields.push('observaciones = ?');
    values.push(data.observaciones);
  }

  if (data.forma_pago !== undefined) {
    fields.push('forma_pago = ?');
    values.push(data.forma_pago);
  }

  if (fields.length === 0) {
    return null;
  }

  fields.push('fecha_actualizacion = CURRENT_TIMESTAMP');
  values.push(id);

  await pool.query(
    `UPDATE ventas SET ${fields.join(', ')} WHERE id_venta = ?`,
    values
  );

  return true;
}

async function deleteVenta(id) {
  const [result] = await pool.query('DELETE FROM ventas WHERE id_venta = ?', [id]);
  return result;
}

module.exports = {
  getAllVentas,
  getVentaById,
  createVenta,
  updateVenta,
  deleteVenta,
};
