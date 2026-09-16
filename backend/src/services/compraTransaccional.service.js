const pool = require('../config/database');
const { calcularTotalesCompra } = require('./totales.service');
const { obtenerInventarioPorProducto, actualizarStock } = require('./inventarioTransaccional.service');
const { registrarEntrada } = require('./movimientosInventario.service');

async function createCompraTransaccional(payload, usuarioEjecutorId) {
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
        impuesto,
        total,
        estado,
        observaciones
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.proveedor_id,
        usuarioEjecutorId,
        payload.numero_factura || null,
        payload.fecha_compra,
        payload.fecha_recepcion || null,
        totales.subtotal,
        totales.impuesto,
        totales.total,
        payload.estado || 'pendiente',
        payload.observaciones || null,
      ]
    );

    const compraId = compraResult.insertId;

    for (const detalle of payload.detalles) {
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
      const impuestoLinea = 0;
      const totalLinea = subtotalLinea + impuestoLinea;

      await connection.query(
        `INSERT INTO detalle_compras (
          compra_id,
          producto_id,
          cantidad,
          costo_unitario,
          subtotal,
          impuesto,
          total_linea,
          observaciones
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          compraId,
          detalle.producto_id,
          detalle.cantidad,
          detalle.costo_unitario,
          subtotalLinea,
          impuestoLinea,
          totalLinea,
          detalle.observaciones || null,
        ]
      );

      if (payload.estado === 'recibida') {
        const inventario = await obtenerInventarioPorProducto(connection, detalle.producto_id);

        if (!inventario) {
          throw Object.assign(new Error(`No existe inventario para el producto ${detalle.producto_id}`), {
            statusCode: 400,
          });
        }

        await actualizarStock(connection, inventario.id_inventario, Number(detalle.cantidad));

        await registrarEntrada(connection, {
          inventario_id: inventario.id_inventario,
          cantidad: Number(detalle.cantidad),
          compra_id: compraId,
          usuario_id: usuarioEjecutorId || payload.usuario_id,
          motivo: 'Compra transaccional',
          observaciones: `Compra transaccional ${compraId}`,
        });
      }
    }

    await connection.commit();

    const [compraRows] = await connection.query('SELECT * FROM compras WHERE id_compra = ?', [compraId]);

    return {
      id_compra: compraId,
      compra: compraRows[0],
      detalles: payload.detalles,
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

module.exports = {
  createCompraTransaccional,
};
