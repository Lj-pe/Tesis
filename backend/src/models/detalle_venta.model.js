const pool = require('../config/database');

const DETAIL_COLUMNS = `
  id, venta_id, producto_id, codigo_producto, nombre_producto,
  presentacion_producto, cantidad, precio_unitario, importe
`;

async function getAllDetalleVentas() {
  const [rows] = await pool.query(`SELECT ${DETAIL_COLUMNS} FROM detalle_ventas ORDER BY id`);
  return rows;
}

async function getDetalleVentaById(id) {
  const [rows] = await pool.query(
    `SELECT ${DETAIL_COLUMNS} FROM detalle_ventas WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

module.exports = { getAllDetalleVentas, getDetalleVentaById };
