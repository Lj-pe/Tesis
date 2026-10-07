const pool = require('../config/database');

const MODULOS_PERMITIDOS = [
  'Dashboard',
  'Productos',
  'Categorías',
  'Inventario',
  'Movimientos',
  'Ventas',
  'Compras',
  'Proveedores',
  'Usuarios',
  'Roles',
  'Reportes',
  'Predicción',
];

async function getPermisosByRolId(rolId) {
  const [rows] = await pool.query(
    'SELECT rol_id, modulo, acceso FROM permisos_roles WHERE rol_id = ? ORDER BY modulo ASC',
    [rolId]
  );
  return rows;
}

async function guardarPermisosByRolId(rolId, permisos) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    for (const { modulo, acceso } of permisos) {
      await connection.query(
        `INSERT INTO permisos_roles (rol_id, modulo, acceso)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE acceso = VALUES(acceso), fecha_actualizacion = CURRENT_TIMESTAMP`,
        [rolId, modulo, acceso]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  MODULOS_PERMITIDOS,
  getPermisosByRolId,
  guardarPermisosByRolId,
};
