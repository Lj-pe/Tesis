const pool = require('../config/database');

async function getAllCategorias() {
  const [rows] = await pool.query(
    'SELECT id, nombre, activa FROM categorias ORDER BY nombre ASC'
  );
  return rows;
}

async function getCategoriaById(id) {
  const [rows] = await pool.query(
    'SELECT id, nombre, activa FROM categorias WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

async function createCategoria({ nombre, activa = true }) {
  const [result] = await pool.query(
    'INSERT INTO categorias (nombre, activa) VALUES (?, ?)',
    [nombre, activa ? 1 : 0]
  );
  return getCategoriaById(result.insertId);
}

async function updateCategoria(id, data) {
  const fields = [];
  const values = [];
  for (const field of ['nombre', 'activa']) {
    if (data[field] !== undefined) {
      fields.push(`${field} = ?`);
      values.push(field === 'activa' ? (data[field] ? 1 : 0) : data[field]);
    }
  }
  if (!fields.length) return null;
  values.push(id);
  const [result] = await pool.query(
    `UPDATE categorias SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  return result.affectedRows > 0;
}

async function desactivarCategoria(id) {
  const [result] = await pool.query('UPDATE categorias SET activa = 0 WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

module.exports = {
  getAllCategorias,
  getCategoriaById,
  createCategoria,
  updateCategoria,
  desactivarCategoria,
};
