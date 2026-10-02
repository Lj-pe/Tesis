const pool = require('../config/database');

async function getAllProductos() {
  const [rows] = await pool.query(
    `SELECT p.*,
            (SELECT i.stock_seguridad
             FROM inventarios i
             WHERE i.producto_id = p.id_producto
             LIMIT 1) AS stock_seguridad
     FROM productos p
     ORDER BY p.id_producto ASC`
  );
  return rows;
}

async function getProductoById(id) {
  const [rows] = await pool.query(
    `SELECT p.*,
            (SELECT i.stock_seguridad
             FROM inventarios i
             WHERE i.producto_id = p.id_producto
             LIMIT 1) AS stock_seguridad
     FROM productos p
     WHERE p.id_producto = ?`,
    [id]
  );
  return rows[0] || null;
}

async function createProducto(data) {
  const {
    categoria_id,
    codigo_sku,
    nombre,
    descripcion,
    estado,
    unidad_medida,
    precio_venta_actual,
    costo_promedio_actual,
  } = data;
  const estadoInicial = estado ?? 'activo';

  const [result] = await pool.query(
    `INSERT INTO productos (
      categoria_id,
      codigo_sku,
      nombre,
      descripcion,
      estado,
      fecha_inactivacion,
      unidad_medida,
      precio_venta_actual,
      costo_promedio_actual
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      categoria_id,
      codigo_sku,
      nombre,
      descripcion ?? null,
      estadoInicial,
      estadoInicial === 'inactivo' ? new Date() : null,
      unidad_medida,
      precio_venta_actual,
      costo_promedio_actual ?? null,
    ]
  );

  return {
    id_producto: result.insertId,
    categoria_id,
    codigo_sku,
    nombre,
    descripcion: descripcion ?? null,
    estado: estadoInicial,
    fecha_inactivacion: estadoInicial === 'inactivo' ? new Date() : null,
    unidad_medida,
    precio_venta_actual,
    costo_promedio_actual: costo_promedio_actual ?? null,
  };
}

async function updateProducto(id, data) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [productoRows] = await connection.query(
      'SELECT * FROM productos WHERE id_producto = ? FOR UPDATE',
      [id]
    );
    const productoActual = productoRows[0];

    if (!productoActual) {
      await connection.rollback();
      return null;
    }

    const fields = [];
    const values = [];
    let estadoSiguiente = data.estado ?? productoActual.estado;
    let categoriaCambiada = false;

    if (data.categoria_id !== undefined) {
      const [categoriaRows] = await connection.query(
        'SELECT estado FROM categorias WHERE id_categoria = ? FOR UPDATE',
        [data.categoria_id]
      );

      if (categoriaRows.length === 0) {
        const error = new Error('La categoría especificada no existe');
        error.statusCode = 400;
        throw error;
      }

      const estadoCategoria = categoriaRows[0].estado;
      if (
        estadoCategoria === 'inactivo' &&
        data.estado === 'activo' &&
        productoActual.estado !== 'suspendido'
      ) {
        const error = new Error(
          'No se puede activar el producto porque su categoría está inactiva'
        );
        error.statusCode = 409;
        throw error;
      }

      categoriaCambiada = Number(productoActual.categoria_id) !== Number(data.categoria_id);
      if (categoriaCambiada && productoActual.estado !== 'suspendido') {
        estadoSiguiente = estadoCategoria === 'activo' ? 'activo' : 'inactivo';
      }
      fields.push('categoria_id = ?');
      values.push(data.categoria_id);
    }

    if (data.codigo_sku !== undefined) {
      fields.push('codigo_sku = ?');
      values.push(data.codigo_sku);
    }

    if (data.nombre !== undefined) {
      fields.push('nombre = ?');
      values.push(data.nombre);
    }

    if (data.descripcion !== undefined) {
      fields.push('descripcion = ?');
      values.push(data.descripcion);
    }

    if (data.estado !== undefined || data.categoria_id !== undefined) {
      fields.push('estado = ?');
      values.push(estadoSiguiente);
    }

    if (data.unidad_medida !== undefined) {
      fields.push('unidad_medida = ?');
      values.push(data.unidad_medida);
    }

    if (data.precio_venta_actual !== undefined) {
      fields.push('precio_venta_actual = ?');
      values.push(data.precio_venta_actual);
    }

    if (data.costo_promedio_actual !== undefined) {
      fields.push('costo_promedio_actual = ?');
      values.push(data.costo_promedio_actual);
    }

    if (estadoSiguiente === 'inactivo' && productoActual.estado !== 'inactivo') {
      fields.push('fecha_inactivacion = CURRENT_TIMESTAMP');
    } else if (estadoSiguiente === 'activo' && productoActual.estado !== 'activo') {
      fields.push('fecha_inactivacion = NULL');
    }

    if (fields.length === 0 && data.stock_seguridad === undefined) {
      await connection.rollback();
      return null;
    }

    fields.push('fecha_actualizacion = CURRENT_TIMESTAMP');
    values.push(id);

    await connection.query(
      `UPDATE productos SET ${fields.join(', ')} WHERE id_producto = ?`,
      values
    );

    if (data.stock_seguridad !== undefined) {
      const [inventarioRows] = await connection.query(
        'SELECT id_inventario FROM inventarios WHERE producto_id = ? LIMIT 1 FOR UPDATE',
        [id]
      );

      if (inventarioRows.length > 0) {
        await connection.query(
          `UPDATE inventarios
           SET stock_seguridad = ?, fecha_actualizacion = CURRENT_TIMESTAMP
           WHERE id_inventario = ?`,
          [data.stock_seguridad, inventarioRows[0].id_inventario]
        );
      } else {
        await connection.query(
          `INSERT INTO inventarios (producto_id, stock_seguridad)
           VALUES (?, ?)`,
          [id, data.stock_seguridad]
        );
      }
    }

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteProducto(id) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [productoRows] = await connection.query(
      'SELECT * FROM productos WHERE id_producto = ? FOR UPDATE',
      [id]
    );
    const producto = productoRows[0];

    if (!producto) {
      await connection.rollback();
      return { affectedRows: 0 };
    }

    const [relatedRows] = await connection.query(
      `SELECT
        EXISTS (SELECT 1 FROM inventarios WHERE producto_id = ?) AS inventarios,
        EXISTS (SELECT 1 FROM detalle_compras WHERE producto_id = ?) AS detalle_compras,
        EXISTS (SELECT 1 FROM detalle_ventas WHERE producto_id = ?) AS detalle_ventas,
        EXISTS (SELECT 1 FROM predicciones WHERE producto_id = ?) AS predicciones`,
      [id, id, id, id]
    );
    const tieneRelaciones = Object.values(relatedRows[0]).some(Boolean);

    if (producto.estado === 'activo' && tieneRelaciones) {
      await connection.query(
        `UPDATE productos
         SET estado = 'inactivo',
             fecha_inactivacion = CURRENT_TIMESTAMP,
             fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id_producto = ?`,
        [id]
      );

      await connection.commit();
      return {
        affectedRows: 0,
        desactivado: true,
        message: 'El producto fue desactivado porque tiene registros asociados y no puede eliminarse físicamente',
      };
    }

    if (producto.estado !== 'inactivo') {
      const error = new Error('El producto debe estar inactivo antes de eliminarse');
      error.statusCode = 409;
      throw error;
    }

    if (!producto.fecha_inactivacion) {
      const error = new Error('No existe una fecha de inactivación válida para este producto');
      error.statusCode = 409;
      throw error;
    }

    if (tieneRelaciones) {
      const error = new Error('El producto tiene registros relacionados y debe conservarse como inactivo');
      error.statusCode = 409;
      throw error;
    }

    const [result] = await connection.query(
      `DELETE FROM productos
       WHERE id_producto = ?
         AND estado = 'inactivo'
         AND fecha_inactivacion <= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY)`,
      [id]
    );

    if (result.affectedRows === 0) {
      const error = new Error('El producto aún no cumple 30 días de inactivación');
      error.statusCode = 409;
      throw error;
    }

    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  getAllProductos,
  getProductoById,
  createProducto,
  updateProducto,
  deleteProducto,
};
