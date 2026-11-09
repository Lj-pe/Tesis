const pool = require('../config/database');

async function getAllCompras() {
  const [rows] = await pool.query(
    `SELECT id, numero, clave_operacion, proveedor_id, nombre_proveedor,
            fecha_pedido, fecha_entrega_prevista, plazo_entrega_dias, estado,
            usuario_id, creada_en, cerrada_en, motivo_cierre,
            COALESCE(s.unidades_pedidas, 0) AS unidades_pedidas,
            COALESCE(s.unidades_recibidas, 0) AS unidades_recibidas,
            COALESCE(s.unidades_sin_recibir, 0) AS unidades_pendientes
     FROM compras c
     LEFT JOIN (
       SELECT compra_id, SUM(unidades_pedidas) AS unidades_pedidas,
              SUM(unidades_recibidas) AS unidades_recibidas,
              SUM(unidades_sin_recibir) AS unidades_sin_recibir
       FROM vista_saldos_compras
       GROUP BY compra_id
     ) s ON s.compra_id = c.id
     ORDER BY fecha_pedido DESC, id DESC`
  );
  return rows;
}

async function getCompraById(id, executor = pool) {
  const [rows] = await executor.query(
    `SELECT id, numero, clave_operacion, proveedor_id, nombre_proveedor,
            fecha_pedido, fecha_entrega_prevista, plazo_entrega_dias, estado,
            usuario_id, creada_en, cerrada_en, motivo_cierre
     FROM compras WHERE id = ?`,
    [id]
  );
  const compra = rows[0];
  if (!compra) return null;

  const [detalles] = await executor.query(
    `SELECT d.id, d.compra_id, d.proveedor_id, d.producto_proveedor_id,
            d.producto_id, d.codigo_producto, d.nombre_producto,
            d.presentacion_producto, d.presentacion_compra,
            d.unidades_por_presentacion, d.cantidad_presentaciones,
            d.costo_presentacion, d.unidades_pedidas, d.importe,
            COALESCE(s.unidades_recibidas, 0) AS unidades_recibidas,
            COALESCE(s.unidades_sin_recibir, 0) AS unidades_sin_recibir,
            COALESCE(s.unidades_por_llegar, 0) AS unidades_por_llegar
     FROM detalle_compras d
     LEFT JOIN vista_saldos_compras s ON s.detalle_compra_id = d.id
     WHERE d.compra_id = ? ORDER BY d.id`,
    [id]
  );
  return { ...compra, detalles };
}

module.exports = { getAllCompras, getCompraById };
