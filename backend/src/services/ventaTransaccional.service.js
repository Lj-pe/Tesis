const pool = require('../config/database');
const { calcularTotalesVenta } = require('./totales.service');
const {
  obtenerInventarioPorProducto,
  validarStockDisponible,
  actualizarStock,
} = require('./inventarioTransaccional.service');
const {
  registrarEntrada,
  registrarSalida,
} = require('./movimientosInventario.service');

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
        descuento,
        total,
        estado,
        observaciones,
        forma_pago
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuarioEjecutorId,
        payload.numero_factura || null,
        payload.fecha_venta,
        totales.subtotal,
        totales.descuento,
        totales.total,
        payload.estado || 'pendiente',
        payload.observaciones || null,
        payload.forma_pago || null,
      ]
    );

    const ventaId = ventaResult.insertId;
    const detallesRespuesta = payload.detalles.map(({ producto_id, cantidad, precio_unitario }) => ({
      producto_id,
      cantidad,
      precio_unitario,
    }));

    for (const detalle of detallesRespuesta) {
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
      const totalLinea = subtotalLinea - descuentoLinea;

      await connection.query(
        `INSERT INTO detalle_ventas (
          venta_id,
          producto_id,
          cantidad,
          precio_unitario,
          subtotal,
          descuento,
          total_linea
        ) VALUES (?, ?, ?, ?, ?, ?, ?)` ,
        [
          ventaId,
          detalle.producto_id,
          detalle.cantidad,
          detalle.precio_unitario,
          subtotalLinea,
          descuentoLinea,
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

    const [ventaRows] = await connection.query(
      `SELECT id_venta, usuario_id, numero_factura, fecha_venta, subtotal, descuento,
              total, estado, observaciones, forma_pago, fecha_creacion, fecha_actualizacion
       FROM ventas WHERE id_venta = ?`,
      [ventaId]
    );

    return {
      id_venta: ventaId,
      venta: ventaRows[0],
      detalles: detallesRespuesta,
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

async function cambiarEstadoVentaTransaccional(ventaId, estadoDestino, usuarioEjecutorId) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (!usuarioEjecutorId) {
      throw Object.assign(new Error('Usuario no autenticado'), { statusCode: 401 });
    }

    if (!['pagada', 'anulada'].includes(estadoDestino)) {
      throw Object.assign(new Error('Solo se permite cambiar una venta a pagada o anulada'), { statusCode: 400 });
    }

    const [ventaRows] = await connection.query(
      'SELECT * FROM ventas WHERE id_venta = ? FOR UPDATE',
      [ventaId]
    );
    const venta = ventaRows[0];

    if (!venta) {
      throw Object.assign(new Error('Venta no encontrada'), { statusCode: 404 });
    }

    const transicionValida =
      (venta.estado === 'pendiente' && ['pagada', 'anulada'].includes(estadoDestino)) ||
      (venta.estado === 'pagada' && estadoDestino === 'anulada');

    if (!transicionValida) {
      throw Object.assign(new Error(`No se permite cambiar una venta ${venta.estado} a ${estadoDestino}`), { statusCode: 409 });
    }

    if (venta.estado === 'pendiente' && estadoDestino === 'pagada') {
      const [detalles] = await connection.query(
        'SELECT producto_id, cantidad FROM detalle_ventas WHERE venta_id = ?',
        [ventaId]
      );

      if (detalles.length === 0) {
        throw Object.assign(new Error('La venta no tiene detalles para ser pagada'), { statusCode: 400 });
      }

      for (const detalle of detalles) {
        const inventario = await validarStockDisponible(connection, detalle.producto_id, detalle.cantidad);
        await actualizarStock(connection, inventario.id_inventario, -Number(detalle.cantidad));
        await registrarSalida(connection, {
          inventario_id: inventario.id_inventario,
          cantidad: Number(detalle.cantidad),
          venta_id: ventaId,
          usuario_id: usuarioEjecutorId,
          motivo: 'Venta transaccional',
          observaciones: `Pago transaccional de venta ${ventaId}`,
        });
      }
    }

    if (venta.estado === 'pagada' && estadoDestino === 'anulada') {
      const [detalles] = await connection.query(
        'SELECT producto_id, cantidad FROM detalle_ventas WHERE venta_id = ?',
        [ventaId]
      );

      for (const detalle of detalles) {
        const inventario = await obtenerInventarioPorProducto(connection, detalle.producto_id);

        if (!inventario) {
          throw Object.assign(new Error(`No existe inventario para el producto ${detalle.producto_id}`), { statusCode: 400 });
        }

        await actualizarStock(connection, inventario.id_inventario, Number(detalle.cantidad));
        await registrarEntrada(connection, {
          inventario_id: inventario.id_inventario,
          cantidad: Number(detalle.cantidad),
          venta_id: ventaId,
          usuario_id: usuarioEjecutorId,
          motivo: 'Reversión por anulación de venta',
          observaciones: `Anulación transaccional de venta ${ventaId}`,
        });
      }
    }

    await connection.query(
      'UPDATE ventas SET estado = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_venta = ? AND estado = ?',
      [estadoDestino, ventaId, venta.estado]
    );

    await connection.commit();

    const [ventaActualizadaRows] = await pool.query(
      'SELECT * FROM ventas WHERE id_venta = ?',
      [ventaId]
    );

    return {
      venta: ventaActualizadaRows[0],
      estado: estadoDestino,
      movimiento_generado: true,
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
  cambiarEstadoVentaTransaccional,
};
