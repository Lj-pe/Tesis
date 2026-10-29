const pool = require('../config/database');
const { calcularEstadoInventario } = require('../utils/inventario');

async function getAllInventarios() {
  const [rows] = await pool.query(
    `SELECT
       id_inventario,
       producto_id,
       stock_actual,
       stock_minimo,
       stock_maximo,
       estado_inventario,
       fecha_ultima_actualizacion,
       fecha_creacion,
       fecha_actualizacion
     FROM inventarios
     ORDER BY id_inventario ASC`
  );
  return rows;
}

async function getInventarioById(id) {
  const [rows] = await pool.query(
    `SELECT
       id_inventario,
       producto_id,
       stock_actual,
       stock_minimo,
       stock_maximo,
       estado_inventario,
       fecha_ultima_actualizacion,
       fecha_creacion,
       fecha_actualizacion
     FROM inventarios
     WHERE id_inventario = ?`,
    [id]
  );
  return rows[0] || null;
}

async function createInventario(data) {
  const {
    producto_id,
    stock_actual,
    stock_minimo,
    stock_maximo,
    estado_inventario,
  } = data;
  const stockActual = stock_actual ?? 0;
  const stockMinimo = stock_minimo ?? 0;
  const estadoInventario = calcularEstadoInventario(
    stockActual,
    stockMinimo,
    estado_inventario
  );

  const [result] = await pool.query(
    `INSERT INTO inventarios (
      producto_id,
      stock_actual,
      stock_minimo,
      stock_maximo,
      estado_inventario,
      fecha_ultima_actualizacion,
      fecha_actualizacion
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      producto_id,
      stockActual,
      stockMinimo,
      stock_maximo ?? null,
      estadoInventario,
    ]
  );

  return {
    id_inventario: result.insertId,
    producto_id,
    stock_actual: stockActual,
    stock_minimo: stockMinimo,
    stock_maximo: stock_maximo ?? null,
    estado_inventario: estadoInventario,
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

  if (data.stock_maximo !== undefined) {
    fields.push('stock_maximo = ?');
    values.push(data.stock_maximo);
  }

  const hasEstadoInventario = data.estado_inventario !== undefined;
  if (fields.length === 0 && !hasEstadoInventario) {
    return null;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT stock_actual, stock_minimo, estado_inventario
       FROM inventarios
       WHERE id_inventario = ?
       FOR UPDATE`,
      [id]
    );
    const inventario = rows[0];

    if (!inventario) {
      await connection.rollback();
      return false;
    }

    const stockActual = data.stock_actual ?? inventario.stock_actual;
    const stockMinimo = data.stock_minimo ?? inventario.stock_minimo;
    const estadoAnterior = data.estado_inventario ?? inventario.estado_inventario;
    const estadoInventario = calcularEstadoInventario(
      stockActual,
      stockMinimo,
      estadoAnterior
    );

    values.push(estadoInventario);
    fields.push('estado_inventario = ?');
    fields.push('fecha_ultima_actualizacion = CURRENT_TIMESTAMP');
    fields.push('fecha_actualizacion = CURRENT_TIMESTAMP');
    values.push(id);

    await connection.query(
      `UPDATE inventarios SET ${fields.join(', ')} WHERE id_inventario = ?`,
      values
    );
    await connection.commit();

    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
