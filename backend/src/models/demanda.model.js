const pool = require('../config/database');

function createDemandaModel(database = pool) {
  async function getPredictionCatalog() {
    const [categories] = await database.query(
      `SELECT id_categoria, nombre, estado
       FROM categorias
       WHERE estado = 'activo'
       ORDER BY nombre ASC`
    );
    const [products] = await database.query(
      `SELECT p.id_producto, p.categoria_id, p.codigo_sku, p.nombre, p.estado
       FROM productos p
       INNER JOIN categorias c ON c.id_categoria = p.categoria_id
       WHERE p.estado = 'activo' AND c.estado = 'activo'
       ORDER BY p.nombre ASC`
    );

    return { categories, products };
  }

  async function getOperationalProductData(productId) {
    const [products] = await database.query(
      `SELECT
         p.id_producto,
         p.categoria_id,
         p.codigo_sku,
         p.nombre,
         c.nombre AS categoria_nombre,
         i.id_inventario,
         i.stock_actual,
         i.stock_minimo,
         i.stock_maximo,
         DATE_FORMAT(
           (
             SELECT DATE_ADD(
               DATE_SUB(
                 MIN(v.fecha_venta),
                 INTERVAL WEEKDAY(MIN(v.fecha_venta)) DAY
               ),
               INTERVAL IF(WEEKDAY(MIN(v.fecha_venta)) = 0, 0, 7) DAY
             )
             FROM ventas v
             INNER JOIN detalle_ventas dv ON dv.venta_id = v.id_venta
             WHERE v.estado = 'pagada'
               AND dv.producto_id = p.id_producto
           ),
           '%Y-%m-%d'
         ) AS first_complete_week,
         DATE_FORMAT(history_bounds.last_complete_week, '%Y-%m-%d') AS last_complete_week
       FROM productos p
       INNER JOIN categorias c ON c.id_categoria = p.categoria_id
       LEFT JOIN inventarios i ON i.producto_id = p.id_producto
       CROSS JOIN (
         SELECT DATE_SUB(
           DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY),
           INTERVAL 7 DAY
         ) AS last_complete_week
       ) AS history_bounds
       WHERE p.id_producto = ?
         AND p.estado = 'activo'
         AND c.estado = 'activo'
       LIMIT 1`,
      [productId]
    );
    const product = products[0];

    if (!product) {
      return null;
    }

    let salesByWeek = [];
    if (
      product.first_complete_week
      && product.last_complete_week
      && product.first_complete_week <= product.last_complete_week
    ) {
      const [rows] = await database.query(
        `SELECT
           DATE_FORMAT(
             DATE_SUB(v.fecha_venta, INTERVAL WEEKDAY(v.fecha_venta) DAY),
             '%Y-%m-%d'
           ) AS week_start,
           SUM(dv.cantidad) AS demand_units
         FROM ventas v
         INNER JOIN detalle_ventas dv ON dv.venta_id = v.id_venta
         WHERE v.estado = 'pagada'
           AND dv.producto_id = ?
           AND v.fecha_venta >= ?
           AND v.fecha_venta < DATE_ADD(?, INTERVAL 7 DAY)
         GROUP BY DATE_SUB(v.fecha_venta, INTERVAL WEEKDAY(v.fecha_venta) DAY)
         ORDER BY week_start ASC`,
        [productId, product.first_complete_week, product.last_complete_week]
      );
      salesByWeek = rows;
    }

    return {
      product: {
        id_producto: product.id_producto,
        categoria_id: product.categoria_id,
        codigo_sku: product.codigo_sku,
        nombre: product.nombre,
        categoria_nombre: product.categoria_nombre,
      },
      inventory: product.id_inventario
        ? {
            stock_actual: product.stock_actual,
            stock_minimo: product.stock_minimo,
            stock_maximo: product.stock_maximo,
          }
        : null,
      firstCompleteWeek: product.first_complete_week,
      lastCompleteWeek: product.last_complete_week,
      salesByWeek,
    };
  }

  async function getOperationalMonthlySales(productId, firstMonth, lastCompleteWeek) {
    const [rows] = await database.query(
      `SELECT
         DATE_FORMAT(v.fecha_venta, '%Y-%m-01') AS month_start,
         SUM(dv.cantidad) AS demand_units
       FROM ventas v
       INNER JOIN detalle_ventas dv ON dv.venta_id = v.id_venta
       WHERE v.estado = 'pagada'
         AND dv.producto_id = ?
         AND v.fecha_venta >= ?
         AND v.fecha_venta < DATE_ADD(?, INTERVAL 7 DAY)
       GROUP BY DATE_FORMAT(v.fecha_venta, '%Y-%m-01')
       ORDER BY month_start ASC`,
      [productId, firstMonth, lastCompleteWeek]
    );

    return rows;
  }

  async function getOperationalDailySales(productId, firstDate, lastDate) {
    const [rows] = await database.query(
      `SELECT
         DATE_FORMAT(v.fecha_venta, '%Y-%m-%d') AS sale_date,
         SUM(dv.cantidad) AS demand_units
       FROM ventas v
       INNER JOIN detalle_ventas dv ON dv.venta_id = v.id_venta
       WHERE v.estado = 'pagada'
         AND dv.producto_id = ?
         AND v.fecha_venta >= ?
         AND v.fecha_venta < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY v.fecha_venta
       ORDER BY sale_date ASC`,
      [productId, firstDate, lastDate]
    );

    return rows;
  }

  return {
    getOperationalDailySales,
    getOperationalMonthlySales,
    getOperationalProductData,
    getPredictionCatalog,
  };
}

module.exports = {
  ...createDemandaModel(),
  createDemandaModel,
};
