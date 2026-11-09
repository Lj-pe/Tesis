const pool = require('../config/database');

async function getAllExistencias() {
  const [rows] = await pool.query(
    `SELECT p.id AS producto_id, COALESCE(e.unidades_disponibles, 0) AS unidades_disponibles,
            p.codigo, p.codigo_barras, p.categoria_id, p.nombre, p.presentacion, p.activo
     FROM productos p
     LEFT JOIN vista_existencias e ON e.producto_id = p.id
     ORDER BY p.nombre`
  );
  return rows;
}

async function getExistenciaByProductoId(id, executor = pool) {
  const [rows] = await executor.query(
    `SELECT p.id AS producto_id, COALESCE(e.unidades_disponibles, 0) AS unidades_disponibles,
            p.codigo, p.nombre, p.presentacion, p.activo
     FROM productos p
     LEFT JOIN vista_existencias e ON e.producto_id = p.id
     WHERE p.id = ?`,
    [id]
  );
  return rows[0] || null;
}

module.exports = { getAllExistencias, getExistenciaByProductoId };
