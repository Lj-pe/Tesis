const pool = require('../config/database');

async function getAllRoles() {
  const [rows] = await pool.query('SELECT * FROM roles ORDER BY id_rol ASC');
  return rows;
}

async function getRolById(id) {
  const [rows] = await pool.query('SELECT * FROM roles WHERE id_rol = ?', [id]);
  return rows[0] || null;
}

async function createRol(data) {
  const { nombre, descripcion, estado } = data;

  const [result] = await pool.query(
    `INSERT INTO roles (
      nombre,
      descripcion,
      estado
    ) VALUES (?, ?, ?)`,
    [nombre, descripcion ?? null, estado ?? 'activo']
  );

  return {
    id_rol: result.insertId,
    nombre,
    descripcion: descripcion ?? null,
    estado: estado ?? 'activo',
  };
}

async function updateRol(id, data) {
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
    `UPDATE roles SET ${fields.join(', ')} WHERE id_rol = ?`,
    values
  );

  return true;
}

async function deleteRol(id) {
  const [result] = await pool.query('DELETE FROM roles WHERE id_rol = ?', [id]);
  return result;
}

module.exports = {
  getAllRoles,
  getRolById,
  createRol,
  updateRol,
  deleteRol,
};
