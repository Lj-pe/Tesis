const pool = require('../config/database');

async function getAllCompras() {
  const [rows] = await pool.query('SELECT * FROM compras ORDER BY id_compra ASC');
  return rows;
}

async function getCompraById(id) {
  const [rows] = await pool.query('SELECT * FROM compras WHERE id_compra = ?', [id]);
  return rows[0] || null;
}

async function createCompra(data) {
  const {
    proveedor_id,
    usuario_id,
    numero_factura,
    fecha_compra,
    fecha_recepcion,
    subtotal,
    impuesto,
    total,
    estado,
    observaciones,
  } = data;

  const [result] = await pool.query(
    `INSERT INTO compras (
      proveedor_id,
      usuario_id,
      numero_factura,
      fecha_compra,
      fecha_recepcion,
      subtotal,
      impuesto,
      total,
      estado,
      observaciones
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      proveedor_id,
      usuario_id,
      numero_factura ?? null,
      fecha_compra,
      fecha_recepcion ?? null,
      subtotal ?? 0,
      impuesto ?? 0,
      total ?? 0,
      estado ?? 'pendiente',
      observaciones ?? null,
    ]
  );

  return {
    id_compra: result.insertId,
    proveedor_id,
    usuario_id,
    numero_factura: numero_factura ?? null,
    fecha_compra,
    fecha_recepcion: fecha_recepcion ?? null,
    subtotal: subtotal ?? 0,
    impuesto: impuesto ?? 0,
    total: total ?? 0,
    estado: estado ?? 'pendiente',
    observaciones: observaciones ?? null,
  };
}

async function updateCompra(id, data) {
  const fields = [];
  const values = [];

  if (data.proveedor_id !== undefined) {
    fields.push('proveedor_id = ?');
    values.push(data.proveedor_id);
  }

  if (data.usuario_id !== undefined) {
    fields.push('usuario_id = ?');
    values.push(data.usuario_id);
  }

  if (data.numero_factura !== undefined) {
    fields.push('numero_factura = ?');
    values.push(data.numero_factura);
  }

  if (data.fecha_compra !== undefined) {
    fields.push('fecha_compra = ?');
    values.push(data.fecha_compra);
  }

  if (data.fecha_recepcion !== undefined) {
    fields.push('fecha_recepcion = ?');
    values.push(data.fecha_recepcion);
  }

  if (data.subtotal !== undefined) {
    fields.push('subtotal = ?');
    values.push(data.subtotal);
  }

  if (data.impuesto !== undefined) {
    fields.push('impuesto = ?');
    values.push(data.impuesto);
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

  if (fields.length === 0) {
    return null;
  }

  fields.push('fecha_actualizacion = CURRENT_TIMESTAMP');
  values.push(id);

  await pool.query(
    `UPDATE compras SET ${fields.join(', ')} WHERE id_compra = ?`,
    values
  );

  return true;
}

async function deleteCompra(id) {
  const [result] = await pool.query('DELETE FROM compras WHERE id_compra = ?', [id]);
  return result;
}

module.exports = {
  getAllCompras,
  getCompraById,
  createCompra,
  updateCompra,
  deleteCompra,
};
