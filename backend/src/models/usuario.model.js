const pool = require('../config/database');

const USER_COLUMNS = `
  id, nombre_usuario, nombre, debe_cambiar_clave
`;

async function findByNombreUsuario(nombreUsuario) {
  const [rows] = await pool.query(
    `SELECT ${USER_COLUMNS}, clave_hash FROM usuarios WHERE nombre_usuario = ? LIMIT 1`,
    [nombreUsuario]
  );
  return rows[0] || null;
}

async function getUsuarioById(id) {
  const [rows] = await pool.query(
    `SELECT ${USER_COLUMNS} FROM usuarios WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function getUsuarioConClaveById(id) {
  const [rows] = await pool.query(
    `SELECT ${USER_COLUMNS}, clave_hash FROM usuarios WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function updateClave(id, claveHash) {
  const [result] = await pool.query(
    `UPDATE usuarios SET clave_hash = ?, debe_cambiar_clave = 0 WHERE id = ?`,
    [claveHash, id]
  );
  return result.affectedRows > 0;
}

module.exports = {
  findByNombreUsuario,
  getUsuarioById,
  getUsuarioConClaveById,
  updateClave,
};
