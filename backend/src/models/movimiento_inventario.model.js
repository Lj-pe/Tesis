const pool = require('../config/database');

async function getAllMovimientosInventario() {
  const [rows] = await pool.query(
    `SELECT m.id, m.clave_operacion, m.producto_id,
            p.codigo AS codigo_producto, p.nombre AS nombre_producto,
            m.tipo, m.variacion_unidades, m.ocurrido_en, m.fecha_comercial,
            m.detalle_venta_id, m.detalle_recepcion_id,
            m.motivo_ajuste, m.descripcion_ajuste,
            m.usuario_id, u.nombre_usuario, m.creado_en
     FROM movimientos_inventario m
     JOIN productos p ON p.id = m.producto_id
     JOIN usuarios u ON u.id = m.usuario_id
     ORDER BY m.ocurrido_en DESC, m.id DESC`
  );
  return rows;
}

async function getMovimientoInventarioById(id) {
  const [rows] = await pool.query(
    `SELECT id, clave_operacion, producto_id, tipo, variacion_unidades,
            ocurrido_en, fecha_comercial, detalle_venta_id, detalle_recepcion_id,
            motivo_ajuste, descripcion_ajuste, usuario_id, creado_en
     FROM movimientos_inventario WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function createMovimiento(connection, movimiento) {
  const [result] = await connection.query(
    `INSERT INTO movimientos_inventario (
      clave_operacion, producto_id, tipo, variacion_unidades, ocurrido_en,
      fecha_comercial, detalle_venta_id, detalle_recepcion_id, motivo_ajuste,
      descripcion_ajuste, usuario_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      movimiento.clave_operacion,
      movimiento.producto_id,
      movimiento.tipo,
      movimiento.variacion_unidades,
      movimiento.ocurrido_en,
      movimiento.fecha_comercial,
      movimiento.detalle_venta_id ?? null,
      movimiento.detalle_recepcion_id ?? null,
      movimiento.motivo_ajuste ?? null,
      movimiento.descripcion_ajuste ?? null,
      movimiento.usuario_id,
    ]
  );
  return result.insertId;
}

module.exports = { getAllMovimientosInventario, getMovimientoInventarioById, createMovimiento };
