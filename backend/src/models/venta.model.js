const pool = require('../config/database');

async function getAllVentas() {
  const [rows] = await pool.query(
    `SELECT v.id, v.numero, v.clave_operacion, v.realizada_en,
            v.fecha_comercial, v.estado, v.medio_pago, v.usuario_id,
            v.creada_en, v.anulada_en, v.motivo_anulacion,
            COALESCE(t.importe_total, 0) AS importe_total
     FROM ventas v
     LEFT JOIN vista_totales_ventas t ON t.venta_id = v.id
     ORDER BY v.realizada_en DESC, v.id DESC`
  );
  return rows;
}

async function getVentaById(id, executor = pool) {
  const [rows] = await executor.query(
    `SELECT v.id, v.numero, v.clave_operacion, v.realizada_en,
            v.fecha_comercial, v.estado, v.medio_pago, v.usuario_id,
            v.creada_en, v.anulada_en, v.motivo_anulacion,
            COALESCE(t.importe_total, 0) AS importe_total
     FROM ventas v
     LEFT JOIN vista_totales_ventas t ON t.venta_id = v.id
     WHERE v.id = ?`,
    [id]
  );
  const venta = rows[0];
  if (!venta) return null;
  const [detalles] = await executor.query(
    `SELECT id, venta_id, producto_id, codigo_producto, nombre_producto,
            presentacion_producto, cantidad, precio_unitario, importe
     FROM detalle_ventas WHERE venta_id = ? ORDER BY id`,
    [id]
  );
  return { ...venta, detalles };
}

module.exports = { getAllVentas, getVentaById };
