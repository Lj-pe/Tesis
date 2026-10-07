const pool = require('../config/database');

async function getAllVentas() {
  const [rows] = await pool.query(
    `SELECT id_venta, usuario_id, numero_factura, fecha_venta,
            total, estado, observaciones, forma_pago, fecha_creacion, fecha_actualizacion
     FROM ventas ORDER BY id_venta ASC`
  );
  return rows;
}

async function getVentaById(id) {
  const [rows] = await pool.query(
    `SELECT id_venta, usuario_id, numero_factura, fecha_venta,
            total, estado, observaciones, forma_pago, fecha_creacion, fecha_actualizacion
     FROM ventas WHERE id_venta = ?`,
    [id]
  );
  const venta = rows[0];

  if (!venta) {
    return null;
  }

  const [detalles] = await pool.query(
    `SELECT
       dv.id_detalle_venta,
       dv.venta_id,
       dv.producto_id,
       p.nombre AS nombre_producto,
       p.codigo_sku,
       dv.cantidad,
       dv.precio_unitario,
       dv.total_linea
     FROM detalle_ventas dv
     LEFT JOIN productos p ON p.id_producto = dv.producto_id
     WHERE dv.venta_id = ?
     ORDER BY dv.id_detalle_venta ASC`,
    [id]
  );

  return {
    ...venta,
    detalles,
  };
}

async function createVenta(data) {
  const {
    usuario_id,
    numero_factura,
    fecha_venta,
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
      total,
      estado,
      observaciones,
      forma_pago
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      usuario_id,
      numero_factura ?? null,
      fecha_venta,
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
