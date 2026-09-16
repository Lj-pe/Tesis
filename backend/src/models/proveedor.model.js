const pool = require('../config/database');

async function getAllProveedores() {
  const [rows] = await pool.query('SELECT * FROM proveedores ORDER BY id_proveedor ASC');
  return rows;
}

async function getProveedorById(id) {
  const [rows] = await pool.query('SELECT * FROM proveedores WHERE id_proveedor = ?', [id]);
  return rows[0] || null;
}

async function createProveedor(data) {
  const {
    nombre,
    contacto,
    telefono,
    email,
    direccion,
    documento_identidad,
    estado,
  } = data;

  const [result] = await pool.query(
    `INSERT INTO proveedores (
      nombre,
      contacto,
      telefono,
      email,
      direccion,
      documento_identidad,
      estado
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      nombre,
      contacto ?? null,
      telefono ?? null,
      email ?? null,
      direccion ?? null,
      documento_identidad ?? null,
      estado ?? 'activo',
    ]
  );

  return {
    id_proveedor: result.insertId,
    nombre,
    contacto: contacto ?? null,
    telefono: telefono ?? null,
    email: email ?? null,
    direccion: direccion ?? null,
    documento_identidad: documento_identidad ?? null,
    estado: estado ?? 'activo',
  };
}

async function updateProveedor(id, data) {
  const fields = [];
  const values = [];

  if (data.nombre !== undefined) {
    fields.push('nombre = ?');
    values.push(data.nombre);
  }

  if (data.contacto !== undefined) {
    fields.push('contacto = ?');
    values.push(data.contacto);
  }

  if (data.telefono !== undefined) {
    fields.push('telefono = ?');
    values.push(data.telefono);
  }

  if (data.email !== undefined) {
    fields.push('email = ?');
    values.push(data.email);
  }

  if (data.direccion !== undefined) {
    fields.push('direccion = ?');
    values.push(data.direccion);
  }

  if (data.documento_identidad !== undefined) {
    fields.push('documento_identidad = ?');
    values.push(data.documento_identidad);
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
    `UPDATE proveedores SET ${fields.join(', ')} WHERE id_proveedor = ?`,
    values
  );

  return true;
}

async function deleteProveedor(id) {
  const [result] = await pool.query('DELETE FROM proveedores WHERE id_proveedor = ?', [id]);
  return result;
}

module.exports = {
  getAllProveedores,
  getProveedorById,
  createProveedor,
  updateProveedor,
  deleteProveedor,
};
