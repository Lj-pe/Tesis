const pool = require('../config/database');

async function getPermisoAccion(rolId, modulo, accion) {
  const [rows] = await pool.query(
    `SELECT acceso
     FROM permisos_acciones_roles
     WHERE rol_id = ? AND modulo = ? AND accion = ?
     LIMIT 1`,
    [rolId, modulo, accion]
  );

  return rows.length > 0 && Boolean(rows[0].acceso);
}

module.exports = {
  getPermisoAccion,
};
