const pool = require('../config/database');

async function getAllInventarios() {
  const [rows] = await pool.query('SELECT * FROM inventarios ORDER BY id_inventario ASC');
  return rows;
}

async function getInventarioById(id) {
  const [rows] = await pool.query('SELECT * FROM inventarios WHERE id_inventario = ?', [id]);
  return rows[0] || null;
}

async function createInventario(data) {
  const {
    producto_id,
    stock_actual,
    stock_minimo,
    stock_seguridad,
    stock_maximo,
    estado_inventario,
  } = data;

  const [result] = await pool.query(
    `INSERT INTO inventarios (
      producto_id,
      stock_actual,
      stock_minimo,
      stock_seguridad,
      stock_maximo,
      estado_inventario
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      producto_id,
      stock_actual ?? 0,
      stock_minimo ?? 0,
      stock_seguridad ?? 0,
      stock_maximo ?? null,
      estado_inventario ?? 'normal',
    ]
  );

  return {
    id_inventario: result.insertId,
    producto_id,
    stock_actual: stock_actual ?? 0,
    stock_minimo: stock_minimo ?? 0,
    stock_seguridad: stock_seguridad ?? 0,
    stock_maximo: stock_maximo ?? null,
    estado_inventario: estado_inventario ?? 'normal',
  };
}

async function updateInventario(id, data) {
  const fields = [];
  const values = [];

  if (data.producto_id !== undefined) {
    fields.push('producto_id = ?');
    values.push(data.producto_id);
  }

  if (data.stock_actual !== undefined) {
    fields.push('stock_actual = ?');
    values.push(data.stock_actual);
  }

  if (data.stock_minimo !== undefined) {
    fields.push('stock_minimo = ?');
    values.push(data.stock_minimo);
  }

  if (data.stock_seguridad !== undefined) {
    fields.push('stock_seguridad = ?');
    values.push(data.stock_seguridad);
  }

  if (data.stock_maximo !== undefined) {
    fields.push('stock_maximo = ?');
    values.push(data.stock_maximo);
  }

  if (data.estado_inventario !== undefined) {
    fields.push('estado_inventario = ?');
    values.push(data.estado_inventario);
  }

  if (fields.length === 0) {
    return null;
  }

  fields.push('fecha_actualizacion = CURRENT_TIMESTAMP');
  values.push(id);

  await pool.query(
    `UPDATE inventarios SET ${fields.join(', ')} WHERE id_inventario = ?`,
    values
  );

  return true;
}

async function deleteInventario(id) {
  const [result] = await pool.query('DELETE FROM inventarios WHERE id_inventario = ?', [id]);
  return result;
}

module.exports = {
  getAllInventarios,
  getInventarioById,
  createInventario,
  updateInventario,
  deleteInventario,
};
