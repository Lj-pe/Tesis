const pool = require('../config/database');
const { calcularTotalesCompra } = require('./totales.service');
const { actualizarStock } = require('./inventarioTransaccional.service');
const { registrarEntrada } = require('./movimientosInventario.service');

async function obtenerInventarioParaRecepcion(connection, productoId, cantidad) {
  const [rows] = await connection.query(
    'SELECT * FROM inventarios WHERE producto_id = ? LIMIT 1 FOR UPDATE',
    [productoId]
  );
  const inventario = rows[0];

  if (!inventario) {
    throw Object.assign(new Error(`No existe inventario para el producto ${productoId}`), {
      statusCode: 400,
    });
  }

  if (
    inventario.stock_maximo !== null &&
    inventario.stock_maximo !== undefined &&
    Number(inventario.stock_actual) + Number(cantidad) > Number(inventario.stock_maximo)
  ) {
    throw Object.assign(new Error(`La recepción supera el stock máximo del producto ${productoId}`), {
      statusCode: 400,
    });
  }

  return inventario;
}

async function createCompraTransaccional(payload, usuarioEjecutorId) {
  if (payload.estado === 'parcial') {
    throw Object.assign(new Error('El estado parcial no está permitido'), {
      statusCode: 400,
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (!usuarioEjecutorId) {
      throw Object.assign(new Error('Usuario no autenticado'), {
        statusCode: 401,
      });
    }

    if (!payload.proveedor_id || !payload.fecha_compra) {
      throw Object.assign(new Error('Los campos proveedor_id y fecha_compra son obligatorios'), {
        statusCode: 400,
      });
    }

    const [proveedores] = await connection.query(
      'SELECT estado FROM proveedores WHERE id_proveedor = ? FOR UPDATE',
      [payload.proveedor_id]
    );
    if (proveedores.length > 0 && proveedores[0].estado !== 'activo') {
      throw Object.assign(new Error('La compra requiere un proveedor activo'), {
        statusCode: 400,
      });
    }

    if (!payload.detalles || !Array.isArray(payload.detalles) || payload.detalles.length === 0) {
      throw Object.assign(new Error('Debe incluir al menos un detalle de compra'), {
        statusCode: 400,
      });
    }

    const totales = calcularTotalesCompra(payload.detalles);

    const [compraResult] = await connection.query(
      `INSERT INTO compras (
        proveedor_id,
        usuario_id,
        numero_factura,
        fecha_compra,
        fecha_recepcion,
        subtotal,
        total,
        estado,
        observaciones
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.proveedor_id,
        usuarioEjecutorId,
        payload.numero_factura || null,
        payload.fecha_compra,
        payload.fecha_recepcion || null,
        totales.subtotal,
        totales.total,
        payload.estado || 'pendiente',
        payload.observaciones || null,
      ]
    );

    const compraId = compraResult.insertId;
    const detallesRespuesta = payload.detalles.map(({ producto_id, cantidad, costo_unitario, observaciones }) => ({
      producto_id,
      cantidad,
      costo_unitario,
      observaciones,
    }));

    for (const detalle of detallesRespuesta) {
      if (!detalle.producto_id || !detalle.cantidad || !detalle.costo_unitario) {
        throw Object.assign(new Error('Cada detalle debe incluir producto_id, cantidad y costo_unitario'), {
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

      const subtotalLinea = Number(detalle.cantidad) * Number(detalle.costo_unitario);
      const totalLinea = subtotalLinea;

      await connection.query(
        `INSERT INTO detalle_compras (
          compra_id,
          producto_id,
          cantidad,
          costo_unitario,
          subtotal,
          total_linea,
          observaciones
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          compraId,
          detalle.producto_id,
          detalle.cantidad,
          detalle.costo_unitario,
          subtotalLinea,
          totalLinea,
          detalle.observaciones || null,
        ]
      );

      if (payload.estado === 'recibida') {
        const cantidad = Number(detalle.cantidad);
        const inventario = await obtenerInventarioParaRecepcion(
          connection,
          detalle.producto_id,
          cantidad
        );

        await actualizarStock(connection, inventario.id_inventario, cantidad);

        await registrarEntrada(connection, {
          inventario_id: inventario.id_inventario,
          cantidad,
          compra_id: compraId,
          usuario_id: usuarioEjecutorId || payload.usuario_id,
          motivo: 'Compra transaccional',
          observaciones: `Compra transaccional ${compraId}`,
        });
      }
    }

    await connection.commit();

    const [compraRows] = await connection.query(
      `SELECT id_compra, proveedor_id, usuario_id, numero_factura, fecha_compra,
              fecha_recepcion, subtotal, total, estado, observaciones,
              fecha_creacion, fecha_actualizacion
       FROM compras WHERE id_compra = ?`,
      [compraId]
    );

    return {
      id_compra: compraId,
      compra: compraRows[0],
      detalles: detallesRespuesta,
      totales,
      movimiento_generado: payload.estado === 'recibida',
    };
  } catch (error) {
    await connection.rollback();
    error.statusCode = error.statusCode || 500;
    throw error;
  } finally {
    connection.release();
  }
}

async function cambiarEstadoCompraTransaccional(compraId, estadoDestino, usuarioEjecutorId) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (!usuarioEjecutorId) {
      throw Object.assign(new Error('Usuario no autenticado'), {
        statusCode: 401,
      });
    }

    if (!['recibida', 'anulada'].includes(estadoDestino)) {
      throw Object.assign(new Error('Solo se permite cambiar una compra pendiente a recibida o anulada'), {
        statusCode: 400,
      });
    }

    const [compraRows] = await connection.query(
      'SELECT * FROM compras WHERE id_compra = ? FOR UPDATE',
      [compraId]
    );
    const compra = compraRows[0];

    if (!compra) {
      throw Object.assign(new Error('Compra no encontrada'), {
        statusCode: 404,
      });
    }

    if (compra.estado !== 'pendiente') {
      throw Object.assign(new Error('Solo se pueden cambiar compras en estado pendiente'), {
        statusCode: 409,
      });
    }

    if (estadoDestino === 'anulada') {
      await connection.query(
        `UPDATE compras
         SET estado = 'anulada', fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id_compra = ? AND estado = 'pendiente'`,
        [compraId]
      );
    } else {
      const [detalleRows] = await connection.query(
        `SELECT producto_id, cantidad, costo_unitario
         FROM detalle_compras
         WHERE compra_id = ?`,
        [compraId]
      );

      if (detalleRows.length === 0) {
        throw Object.assign(new Error('La compra no tiene detalles para ser recibida'), {
          statusCode: 400,
        });
      }

      for (const detalle of detalleRows) {
        const cantidad = Number(detalle.cantidad);
        const inventario = await obtenerInventarioParaRecepcion(
          connection,
          detalle.producto_id,
          cantidad
        );

        await actualizarStock(connection, inventario.id_inventario, cantidad);

        await registrarEntrada(connection, {
          inventario_id: inventario.id_inventario,
          cantidad,
          compra_id: compraId,
          usuario_id: usuarioEjecutorId,
          motivo: 'Recepción de compra',
          observaciones: `Recepción transaccional de compra ${compraId}`,
        });
      }

      await connection.query(
        `UPDATE compras
         SET estado = 'recibida',
             fecha_recepcion = COALESCE(fecha_recepcion, CURRENT_DATE),
             fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id_compra = ? AND estado = 'pendiente'`,
        [compraId]
      );
    }

    await connection.commit();

    const [compraActualizadaRows] = await pool.query(
      'SELECT * FROM compras WHERE id_compra = ?',
      [compraId]
    );

    return {
      compra: compraActualizadaRows[0],
      estado: estadoDestino,
      movimiento_generado: estadoDestino === 'recibida',
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
  createCompraTransaccional,
  cambiarEstadoCompraTransaccional,
};
