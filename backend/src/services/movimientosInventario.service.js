async function registrarEntrada(connection, movimiento) {
  await connection.query(
    `INSERT INTO movimientos_inventario (
      inventario_id,
      tipo_movimiento,
      cantidad,
      motivo,
      compra_id,
      venta_id,
      usuario_id,
      fecha_movimiento,
      estado,
      observaciones
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      movimiento.inventario_id,
      'entrada',
      movimiento.cantidad,
      movimiento.motivo || null,
      movimiento.compra_id || null,
      movimiento.venta_id || null,
      movimiento.usuario_id,
      movimiento.fecha_movimiento || new Date(),
      movimiento.estado || 'confirmado',
      movimiento.observaciones || null,
    ]
  );
}

async function registrarSalida(connection, movimiento) {
  await connection.query(
    `INSERT INTO movimientos_inventario (
      inventario_id,
      tipo_movimiento,
      cantidad,
      motivo,
      compra_id,
      venta_id,
      usuario_id,
      fecha_movimiento,
      estado,
      observaciones
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      movimiento.inventario_id,
      'salida',
      movimiento.cantidad,
      movimiento.motivo || null,
      movimiento.compra_id || null,
      movimiento.venta_id || null,
      movimiento.usuario_id,
      movimiento.fecha_movimiento || new Date(),
      movimiento.estado || 'confirmado',
      movimiento.observaciones || null,
    ]
  );
}

module.exports = {
  registrarEntrada,
  registrarSalida,
};
