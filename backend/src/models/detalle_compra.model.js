const pool = require('../config/database');

const DETAIL_COLUMNS = `
  id, compra_id, proveedor_id, producto_proveedor_id, producto_id,
  codigo_producto, nombre_producto, presentacion_producto,
  presentacion_compra, unidades_por_presentacion, cantidad_presentaciones,
  costo_presentacion, unidades_pedidas, importe
`;

async function getAllDetalleCompras() {
  const [rows] = await pool.query(
    `SELECT ${DETAIL_COLUMNS} FROM detalle_compras ORDER BY id`
  );
  return rows;
}

async function getDetalleCompraById(id) {
  const [rows] = await pool.query(
    `SELECT ${DETAIL_COLUMNS} FROM detalle_compras WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

module.exports = { getAllDetalleCompras, getDetalleCompraById };
