const pool = require('../config/database');

const SAFE_USER_COLUMNS = `
  id_usuario,
  rol_id,
  nombre,
  apellido,
  username,
  email,
  estado,
  fecha_creacion,
  ultimo_acceso,
  fecha_actualizacion
`;

async function getAllUsuarios() {
  const [rows] = await pool.query(`SELECT ${SAFE_USER_COLUMNS} FROM usuarios ORDER BY id_usuario ASC`);
  return rows;
}

async function getUsuarioById(id) {
  const [rows] = await pool.query(`SELECT ${SAFE_USER_COLUMNS} FROM usuarios WHERE id_usuario = ?`, [id]);
  return rows[0] || null;
}

async function findByUsernameOrEmail(username, email) {
  // El login usa un solo campo, por lo que el valor recibido puede ser username o email.
  const usernameIdentifier = username || email;
  const emailIdentifier = email || username;

  if (!usernameIdentifier && !emailIdentifier) {
    return null;
  }

  const [rows] = await pool.query(
    'SELECT * FROM usuarios WHERE username = ? OR email = ? LIMIT 1',
    [usernameIdentifier, emailIdentifier]
  );

  return rows[0] || null;
}

async function createUsuario(data) {
  const {
    rol_id,
    nombre,
    apellido,
    username,
    email,
    password_hash,
    estado,
    ultimo_acceso,
  } = data;

  const [result] = await pool.query(
    `INSERT INTO usuarios (
      rol_id,
      nombre,
      apellido,
      username,
      email,
      password_hash,
      estado,
      ultimo_acceso
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rol_id,
      nombre,
      apellido,
      username,
      email,
      password_hash,
      estado ?? 'activo',
      ultimo_acceso ?? null,
    ]
  );

  return {
    id_usuario: result.insertId,
    rol_id,
    nombre,
    apellido,
    username,
    email,
    estado: estado ?? 'activo',
    ultimo_acceso: ultimo_acceso ?? null,
  };
}

async function updateUsuario(id, data) {
  const fields = [];
  const values = [];

  if (data.rol_id !== undefined) {
    fields.push('rol_id = ?');
    values.push(data.rol_id);
  }

  if (data.nombre !== undefined) {
    fields.push('nombre = ?');
    values.push(data.nombre);
  }

  if (data.apellido !== undefined) {
    fields.push('apellido = ?');
    values.push(data.apellido);
  }

  if (data.username !== undefined) {
    fields.push('username = ?');
    values.push(data.username);
  }

  if (data.email !== undefined) {
    fields.push('email = ?');
    values.push(data.email);
  }

  if (data.password_hash !== undefined) {
    fields.push('password_hash = ?');
    values.push(data.password_hash);
  }

  if (data.estado !== undefined) {
    fields.push('estado = ?');
    values.push(data.estado);
  }

  if (data.ultimo_acceso !== undefined) {
    fields.push('ultimo_acceso = ?');
    values.push(data.ultimo_acceso);
  }

  if (fields.length === 0) {
    return null;
  }

  fields.push('fecha_actualizacion = CURRENT_TIMESTAMP');
  values.push(id);

  await pool.query(
    `UPDATE usuarios SET ${fields.join(', ')} WHERE id_usuario = ?`,
    values
  );

  return true;
}

async function deleteUsuario(id) {
  const [result] = await pool.query('DELETE FROM usuarios WHERE id_usuario = ?', [id]);
  return result;
}

module.exports = {
  getAllUsuarios,
  getUsuarioById,
  findByUsernameOrEmail,
  createUsuario,
  updateUsuario,
  deleteUsuario,
};
