const pool = require('../config/database');

async function getAllMovimientosInventario() {
  const [rows] = await pool.query('SELECT * FROM movimientos_inventario ORDER BY id_movimiento ASC');
  return rows;
}

async function getMovimientoInventarioById(id) {
  const [rows] = await pool.query('SELECT * FROM movimientos_inventario WHERE id_movimiento = ?', [id]);
  return rows[0] || null;
}

async function createMovimientoInventario(data) {
  const {
    inventario_id,
    tipo_movimiento,
    cantidad,
    motivo,
    compra_id,
    venta_id,
    usuario_id,
    fecha_movimiento,
    estado,
    observaciones,
  } = data;

  const columns = [
    'inventario_id',
    'tipo_movimiento',
    'cantidad',
    'motivo',
    'compra_id',
    'venta_id',
    'usuario_id',
    'estado',
    'observaciones',
  ];

  const values = [
    inventario_id,
    tipo_movimiento,
    cantidad,
    motivo ?? null,
    compra_id ?? null,
    venta_id ?? null,
    usuario_id,
    estado ?? 'confirmado',
    observaciones ?? null,
  ];

  if (fecha_movimiento !== undefined && fecha_movimiento !== null) {
    columns.push('fecha_movimiento');
    values.push(fecha_movimiento);
  }

  const placeholders = columns.map(() => '?').join(', ');

  const [result] = await pool.query(
    `INSERT INTO movimientos_inventario (${columns.join(', ')}) VALUES (${placeholders})`,
    values
  );

  return {
    id_movimiento: result.insertId,
    inventario_id,
    tipo_movimiento,
    cantidad,
    motivo: motivo ?? null,
    compra_id: compra_id ?? null,
    venta_id: venta_id ?? null,
    usuario_id,
    fecha_movimiento: fecha_movimiento ?? null,
    estado: estado ?? 'confirmado',
    observaciones: observaciones ?? null,
  };
}

async function updateMovimientoInventario(id, data) {
  const fields = [];
  const values = [];

  if (data.inventario_id !== undefined) {
    fields.push('inventario_id = ?');
    values.push(data.inventario_id);
  }

  if (data.tipo_movimiento !== undefined) {
    fields.push('tipo_movimiento = ?');
    values.push(data.tipo_movimiento);
  }

  if (data.cantidad !== undefined) {
    fields.push('cantidad = ?');
    values.push(data.cantidad);
  }

  if (data.motivo !== undefined) {
    fields.push('motivo = ?');
    values.push(data.motivo);
  }

  if (data.compra_id !== undefined) {
    fields.push('compra_id = ?');
    values.push(data.compra_id);
  }

  if (data.venta_id !== undefined) {
    fields.push('venta_id = ?');
    values.push(data.venta_id);
  }

  if (data.usuario_id !== undefined) {
    fields.push('usuario_id = ?');
    values.push(data.usuario_id);
  }

  if (data.fecha_movimiento !== undefined) {
    fields.push('fecha_movimiento = ?');
    values.push(data.fecha_movimiento);
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

  await pool.query(
    `UPDATE movimientos_inventario SET ${fields.join(', ')} WHERE id_movimiento = ?`,
    [...values, id]
  );

  return true;
}

async function deleteMovimientoInventario(id) {
  const [result] = await pool.query('DELETE FROM movimientos_inventario WHERE id_movimiento = ?', [id]);
  return result;
}

module.exports = {
  getAllMovimientosInventario,
  getMovimientoInventarioById,
  createMovimientoInventario,
  updateMovimientoInventario,
  deleteMovimientoInventario,
};
