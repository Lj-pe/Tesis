async function obtenerInventarioPorProducto(connection, productoId) {
  const [rows] = await connection.query(
    'SELECT * FROM inventarios WHERE producto_id = ? LIMIT 1',
    [productoId]
  );

  return rows[0] || null;
}

async function validarStockDisponible(connection, productoId, cantidad) {
  const inventario = await obtenerInventarioPorProducto(connection, productoId);

  if (!inventario) {
    const error = new Error('No existe inventario para el producto especificado');
    error.statusCode = 400;
    throw error;
  }

  if (Number(cantidad) > Number(inventario.stock_actual)) {
    const error = new Error('No hay stock suficiente para la venta solicitada');
    error.statusCode = 400;
    throw error;
  }

  return inventario;
}

async function actualizarStock(connection, inventarioId, delta) {
  const [result] = await connection.query(
    'UPDATE inventarios SET stock_actual = stock_actual + ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_inventario = ?',
    [delta, inventarioId]
  );

  if (result.affectedRows === 0) {
    const error = new Error('No se pudo actualizar el inventario solicitado');
    error.statusCode = 400;
    throw error;
  }
}

module.exports = {
  obtenerInventarioPorProducto,
  validarStockDisponible,
  actualizarStock,
};
