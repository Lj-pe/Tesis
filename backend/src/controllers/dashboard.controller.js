const pool = require('../config/database');

const isDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

async function getDashboard(req, res) {
  const { desde, hasta } = req.query;
  if (!isDate(desde) || !isDate(hasta) ||
      Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`) !== 6 * 86400000) {
    return res.status(400).json({ message: 'El período debe incluir exactamente siete fechas válidas.' });
  }

  try {
    const [[statsRows], [salesByDay], [movements]] = await Promise.all([
      pool.query(
        `SELECT
           (SELECT COUNT(*) FROM productos WHERE activo = 1) AS productos_activos,
           (SELECT COALESCE(SUM(unidades_disponibles), 0) FROM vista_existencias) AS unidades_en_stock,
           (SELECT COUNT(*) FROM ventas WHERE estado = 'realizada') AS ventas_realizadas,
           (SELECT COUNT(DISTINCT compra_id)
            FROM vista_entregas_pendientes
            WHERE unidades_por_llegar > 0) AS compras_por_recibir`
      ),
      pool.execute(
        `SELECT fecha_comercial, SUM(importe_total) AS ingresos
         FROM vista_totales_ventas
         WHERE estado = 'realizada' AND fecha_comercial BETWEEN ? AND ?
         GROUP BY fecha_comercial
         ORDER BY fecha_comercial`,
        [desde, hasta]
      ),
      pool.query(
        `SELECT m.id, m.tipo, m.variacion_unidades, m.ocurrido_en,
                p.nombre AS nombre_producto
         FROM movimientos_inventario m
         JOIN productos p ON p.id = m.producto_id
         ORDER BY m.ocurrido_en DESC, m.id DESC
         LIMIT 10`
      ),
    ]);

    return res.status(200).json({ stats: statsRows[0], salesByDay, movements });
  } catch (error) {
    console.error('Error al obtener datos del dashboard:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los datos del dashboard.' });
  }
}

module.exports = { getDashboard };
