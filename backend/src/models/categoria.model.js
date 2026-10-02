const pool = require('../config/database');

async function getAllCategorias() {
  const [rows] = await pool.query('SELECT * FROM categorias ORDER BY id_categoria ASC');
  return rows;
}

async function getCategoriaById(id) {
  const [rows] = await pool.query('SELECT * FROM categorias WHERE id_categoria = ?', [id]);
  return rows[0] || null;
}

async function createCategoria(data) {
  const { nombre, descripcion, estado } = data;
  const estadoInicial = estado ?? 'activo';

  const [result] = await pool.query(
    'INSERT INTO categorias (nombre, descripcion, estado, fecha_inactivacion) VALUES (?, ?, ?, ?)',
    [nombre, descripcion ?? null, estadoInicial, estadoInicial === 'inactivo' ? new Date() : null]
  );

  return {
    id_categoria: result.insertId,
    nombre,
    descripcion: descripcion ?? null,
    estado: estadoInicial,
    fecha_inactivacion: estadoInicial === 'inactivo' ? new Date() : null,
  };
}

async function updateCategoria(id, data) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [categoriaRows] = await connection.query(
      'SELECT * FROM categorias WHERE id_categoria = ? FOR UPDATE',
      [id]
    );
    const categoriaActual = categoriaRows[0];

    if (!categoriaActual) {
      await connection.rollback();
      return null;
    }

  const fields = [];
  const values = [];

  if (data.nombre !== undefined) {
    fields.push('nombre = ?');
    values.push(data.nombre);
  }

  if (data.descripcion !== undefined) {
    fields.push('descripcion = ?');
    values.push(data.descripcion);
  }

  if (data.estado !== undefined) {
    fields.push('estado = ?');
    values.push(data.estado);
  }

  const estadoSiguiente = data.estado ?? categoriaActual.estado;
  let productosInactivos = 0;

  if (categoriaActual.estado === 'inactivo' && estadoSiguiente === 'activo') {
    const [productoRows] = await connection.query(
      `SELECT COUNT(*) AS cantidad
       FROM productos
       WHERE categoria_id = ? AND estado = 'inactivo'`,
      [id]
    );
    productosInactivos = Number(productoRows[0].cantidad);

    if (productosInactivos > 0 && data.activar_productos === undefined) {
      const error = new Error(
        `La categoría tiene ${productosInactivos} productos inactivos asociados. ¿Deseas activar también los productos asociados?`
      );
      error.statusCode = 409;
      throw error;
    }
  }

  if (estadoSiguiente === 'inactivo' && categoriaActual.estado !== 'inactivo') {
    fields.push('fecha_inactivacion = CURRENT_TIMESTAMP');
  } else if (estadoSiguiente === 'activo' && categoriaActual.estado !== 'activo') {
    fields.push('fecha_inactivacion = NULL');
  }

  if (fields.length === 0) {
    await connection.rollback();
    return null;
  }

  fields.push('fecha_actualizacion = CURRENT_TIMESTAMP');
  values.push(id);

  await connection.query(
    `UPDATE categorias SET ${fields.join(', ')} WHERE id_categoria = ?`,
    values
  );

    if (estadoSiguiente === 'inactivo' && categoriaActual.estado !== 'inactivo') {
      await connection.query(
        `UPDATE productos
         SET estado = 'inactivo',
             fecha_inactivacion = CURRENT_TIMESTAMP,
             fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE categoria_id = ? AND estado = 'activo'`,
        [id]
      );
    }

    if (
      estadoSiguiente === 'activo' &&
      categoriaActual.estado === 'inactivo' &&
      data.activar_productos === true &&
      productosInactivos > 0
    ) {
      await connection.query(
        `UPDATE productos
         SET estado = 'activo',
             fecha_inactivacion = NULL,
             fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE categoria_id = ? AND estado = 'inactivo'`,
        [id]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return true;
}

async function deleteCategoria(id) {
  const [result] = await pool.query('DELETE FROM categorias WHERE id_categoria = ?', [id]);
  return result;
}

module.exports = {
  getAllCategorias,
  getCategoriaById,
  createCategoria,
  updateCategoria,
  deleteCategoria,
};
