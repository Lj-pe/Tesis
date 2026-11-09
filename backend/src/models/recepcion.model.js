const pool = require('../config/database');

async function getAllRecepciones() {
  const [rows] = await pool.query(
    `SELECT id, numero, clave_operacion, compra_id, recibida_en,
            fecha_comercial, usuario_id, observacion
     FROM recepciones ORDER BY recibida_en DESC, id DESC`
  );
  return rows;
}

async function getRecepcionById(id, executor = pool) {
  const [rows] = await executor.query(
    `SELECT id, numero, clave_operacion, compra_id, recibida_en,
            fecha_comercial, usuario_id, observacion
     FROM recepciones WHERE id = ?`,
    [id]
  );
  const recepcion = rows[0];
  if (!recepcion) return null;
  const [detalles] = await executor.query(
    `SELECT id, recepcion_id, compra_id, detalle_compra_id, producto_id,
            unidades_recibidas
     FROM detalle_recepciones WHERE recepcion_id = ? ORDER BY id`,
    [id]
  );
  return { ...recepcion, detalles };
}

module.exports = { getAllRecepciones, getRecepcionById };
