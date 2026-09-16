const pool = require('../config/database');
const { calcularTotalesVenta } = require('./totales.service');
const { validarStockDisponible, actualizarStock } = require('./inventarioTransaccional.service');
const { registrarSalida } = require('./movimientosInventario.service');

async function createVentaTransaccional(payload, usuarioEjecutorId) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (!usuarioEjecutorId) {
      throw Object.assign(new Error('Usuario no autenticado'), {
        statusCode: 401,
      });
    }

    if (!payload.fecha_venta) {
      throw Object.assign(new Error('El campo fecha_venta es obligatorio'), {
        statusCode: 400,
      });
    }

    if (!payload.detalles || !Array.isArray(payload.detalles) || payload.detalles.length === 0) {
      throw Object.assign(new Error('Debe incluir al menos un detalle de venta'), {
        statusCode: 400,
      });
    }

    const totales = calcularTotalesVenta(payload.detalles);

    const [ventaResult] = await connection.query(
      `INSERT INTO ventas (
        usuario_id,
        numero_factura,
        fecha_venta,
        subtotal,
        impuesto,
        descuento,
        total,
        estado,
        observaciones,
        forma_pago
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuarioEjecutorId,
        payload.numero_factura || null,
        payload.fecha_venta,
        totales.subtotal,
        totales.impuesto,
        totales.descuento,
        totales.total,
        payload.estado || 'pendiente',
        payload.observaciones || null,
        payload.forma_pago || null,
      ]
    );

    const ventaId = ventaResult.insertId;

    for (const detalle of payload.detalles) {
      if (!detalle.producto_id || !detalle.cantidad || !detalle.precio_unitario) {
        throw Object.assign(new Error('Cada detalle debe incluir producto_id, cantidad y precio_unitario'), {
          statusCode: 400,
        });
      }

      const [productoRows] = await connection.query(
        'SELECT id_producto FROM productos WHERE id_producto = ? LIMIT 1',
        [detalle.producto_id]
      );

      if (productoRows.length === 0) {
        throw Object.assign(new Error('El producto especificado no existe'), {
          statusCode: 400,
        });
      }

      const subtotalLinea = Number(detalle.cantidad) * Number(detalle.precio_unitario);
      const descuentoLinea = 0;
      const impuestoLinea = 0;
      const totalLinea = subtotalLinea + impuestoLinea - descuentoLinea;

      await connection.query(
        `INSERT INTO detalle_ventas (
          venta_id,
          producto_id,
          cantidad,
          precio_unitario,
          subtotal,
          descuento,
          impuesto,
          total_linea
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ventaId,
          detalle.producto_id,
          detalle.cantidad,
          detalle.precio_unitario,
          subtotalLinea,
          descuentoLinea,
          impuestoLinea,
          totalLinea,
        ]
      );

      if (payload.estado === 'pagada') {
        const inventario = await validarStockDisponible(connection, detalle.producto_id, detalle.cantidad);

        await actualizarStock(connection, inventario.id_inventario, -Number(detalle.cantidad));

        await registrarSalida(connection, {
          inventario_id: inventario.id_inventario,
          cantidad: Number(detalle.cantidad),
          venta_id: ventaId,
          usuario_id: usuarioEjecutorId || payload.usuario_id,
          motivo: 'Venta transaccional',
          observaciones: `Venta transaccional ${ventaId}`,
        });
      }
    }

    await connection.commit();

    const [ventaRows] = await connection.query('SELECT * FROM ventas WHERE id_venta = ?', [ventaId]);

    return {
      id_venta: ventaId,
      venta: ventaRows[0],
      detalles: payload.detalles,
      totales,
      movimiento_generado: payload.estado === 'pagada',
    };
  } catch (error) {
    await connection.rollback();
    error.statusCode = error.statusCode || 500;
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  createVentaTransaccional,
};
