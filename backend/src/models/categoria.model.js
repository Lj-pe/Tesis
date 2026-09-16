const pool = require('../config/database');

async function getAllCategorias() {
  const [rows] = await pool.query('SELECT * FROM categorias ORDER BY id_categoria ASC');
  return rows;
}

async function getCategoriaById(id) {
  const [rows] = await pool.query('SELECT * FROM categorias WHERE id_categoria = ?', [id]);
  return rows[0] || null;
}

async function createCategoria(data) {
  const { nombre, descripcion, estado } = data;

  const [result] = await pool.query(
    'INSERT INTO categorias (nombre, descripcion, estado) VALUES (?, ?, ?)',
    [nombre, descripcion ?? null, estado ?? 'activo']
  );

  return {
    id_categoria: result.insertId,
    nombre,
    descripcion: descripcion ?? null,
    estado: estado ?? 'activo',
  };
}

async function updateCategoria(id, data) {
  const fields = [];
  const values = [];

  if (data.nombre !== undefined) {
    fields.push('nombre = ?');
    values.push(data.nombre);
  }

  if (data.descripcion !== undefined) {
    fields.push('descripcion = ?');
    values.push(data.descripcion);
  }

  if (data.estado !== undefined) {
    fields.push('estado = ?');
    values.push(data.estado);
  }

  if (fields.length === 0) {
    return null;
  }

  fields.push('fecha_actualizacion = CURRENT_TIMESTAMP');
  values.push(id);

  await pool.query(
    `UPDATE categorias SET ${fields.join(', ')} WHERE id_categoria = ?`,
    values
  );

  return true;
}

async function deleteCategoria(id) {
  const [result] = await pool.query('DELETE FROM categorias WHERE id_categoria = ?', [id]);
  return result;
}

module.exports = {
  getAllCategorias,
  getCategoriaById,
  createCategoria,
  updateCategoria,
  deleteCategoria,
};
