const pool = require('../config/database');

async function getAllProductos() {
  const [rows] = await pool.query('SELECT * FROM productos ORDER BY id_producto ASC');
  return rows;
}

async function getProductoById(id) {
  const [rows] = await pool.query('SELECT * FROM productos WHERE id_producto = ?', [id]);
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

  const [result] = await pool.query(
    `INSERT INTO productos (
      categoria_id,
      codigo_sku,
      nombre,
      descripcion,
      estado,
      unidad_medida,
      precio_venta_actual,
      costo_promedio_actual
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      categoria_id,
      codigo_sku,
      nombre,
      descripcion ?? null,
      estado ?? 'activo',
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
    estado: estado ?? 'activo',
    unidad_medida,
    precio_venta_actual,
    costo_promedio_actual: costo_promedio_actual ?? null,
  };
}

async function updateProducto(id, data) {
  const fields = [];
  const values = [];

  if (data.categoria_id !== undefined) {
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

  if (data.estado !== undefined) {
    fields.push('estado = ?');
    values.push(data.estado);
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

  if (fields.length === 0) {
    return null;
  }

  fields.push('fecha_actualizacion = CURRENT_TIMESTAMP');
  values.push(id);

  await pool.query(
    `UPDATE productos SET ${fields.join(', ')} WHERE id_producto = ?`,
    values
  );

  return true;
}

async function deleteProducto(id) {
  const [result] = await pool.query('DELETE FROM productos WHERE id_producto = ?', [id]);
  return result;
}

module.exports = {
  getAllProductos,
  getProductoById,
  createProducto,
  updateProducto,
  deleteProducto,
};
