const pool = require('../config/database');

function createDemandaModel(database = pool) {
  async function getPredictionCatalog() {
    const [categories] = await database.query(
      `SELECT id AS id_categoria, nombre,
              CASE WHEN activa = 1 THEN 'activo' ELSE 'inactivo' END AS estado
       FROM categorias
       WHERE activa = 1
       ORDER BY nombre ASC`
    );
    const [products] = await database.query(
      `SELECT p.id AS id_producto, p.categoria_id, p.codigo AS codigo_sku,
              p.nombre,
              CASE WHEN p.activo = 1 THEN 'activo' ELSE 'inactivo' END AS estado
       FROM productos p
       INNER JOIN categorias c ON c.id = p.categoria_id
       WHERE p.activo = 1 AND c.activa = 1
       ORDER BY p.nombre ASC`
    );

    return { categories, products };
  }

  async function getForecastDataset() {
    const [products] = await database.query(
      `SELECT p.id AS id_producto, p.categoria_id, p.codigo AS codigo_sku,
              p.nombre, p.activo,
              e.unidades_disponibles AS stock_actual
       FROM productos p
       LEFT JOIN vista_existencias e ON e.producto_id = p.id
       ORDER BY p.id`
    );
    const [sales] = await database.query(
      `SELECT dv.producto_id AS product_id,
              DATE_FORMAT(v.fecha_comercial, '%Y-%m-%d') AS commercial_date,
              SUM(dv.cantidad) AS units
       FROM ventas v
       INNER JOIN detalle_ventas dv ON dv.venta_id = v.id
       WHERE v.estado = 'realizada'
         AND v.fecha_comercial >= ?
         AND v.fecha_comercial < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY dv.producto_id, DATE(v.fecha_comercial)
       ORDER BY dv.producto_id, DATE(v.fecha_comercial)`,
      ['2025-10-01', '2026-11-06']
    );
    const [movements] = await database.query(
      `SELECT id AS movement_id, producto_id AS product_id, tipo,
              variacion_unidades AS delta_units,
              DATE_FORMAT(fecha_comercial, '%Y-%m-%d') AS commercial_date,
              DATE_FORMAT(ocurrido_en, '%Y-%m-%d %H:%i:%s') AS occurred_at
       FROM movimientos_inventario
       WHERE fecha_comercial >= ?
         AND fecha_comercial < DATE_ADD(?, INTERVAL 1 DAY)
       ORDER BY producto_id, fecha_comercial, ocurrido_en, id`,
      ['2025-10-01', '2026-11-06']
    );
    return { products, sales, movements };
  }

  return {
    getForecastDataset,
    getPredictionCatalog,
  };
}

module.exports = {
  ...createDemandaModel(),
  createDemandaModel,
};
