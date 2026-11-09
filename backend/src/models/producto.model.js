const pool = require('../config/database');

const PRODUCT_SELECT = `
  SELECT p.id, p.codigo, p.codigo_barras, p.categoria_id, p.nombre, p.marca,
         p.presentacion, p.precio_venta, p.dias_seguridad, p.activo,
         p.creado_en, p.actualizado_en,
         COALESCE(e.unidades_disponibles, 0) AS unidades_disponibles
  FROM productos p
  LEFT JOIN vista_existencias e ON e.producto_id = p.id`;

async function getAllProductos() {
  const [rows] = await pool.query(`${PRODUCT_SELECT} ORDER BY p.nombre ASC`);
  return rows;
}

async function getProductoById(id, executor = pool) {
  const [rows] = await executor.query(`${PRODUCT_SELECT} WHERE p.id = ?`, [id]);
  return rows[0] || null;
}

async function createProducto(data) {
  const columns = [
    'codigo', 'codigo_barras', 'categoria_id', 'nombre', 'marca', 'presentacion',
    'precio_venta',
  ];
  const values = [
    data.codigo, data.codigo_barras ?? null, data.categoria_id, data.nombre,
    data.marca ?? null, data.presentacion, data.precio_venta,
  ];
  if (data.dias_seguridad !== undefined) {
    columns.push('dias_seguridad');
    values.push(data.dias_seguridad);
  }
  if (data.activo !== undefined) {
    columns.push('activo');
    values.push(data.activo);
  }
  const [result] = await pool.query(
    `INSERT INTO productos (${columns.join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    values
  );
  return getProductoById(result.insertId);
}

async function updateProducto(id, data) {
  const fields = [];
  const values = [];
  for (const field of [
    'codigo', 'codigo_barras', 'categoria_id', 'nombre', 'marca',
    'presentacion', 'precio_venta', 'dias_seguridad', 'activo',
  ]) {
    if (data[field] !== undefined) {
      fields.push(`${field} = ?`);
      values.push(data[field] === null && field === 'codigo_barras' ? null : data[field]);
    }
  }
  if (!fields.length) return false;
  values.push(id);
  const [result] = await pool.query(
    `UPDATE productos SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  return result.affectedRows > 0;
}

async function desactivarProducto(id) {
  const [result] = await pool.query('UPDATE productos SET activo = 0 WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function getProductoProveedor(id, executor = pool) {
  const [rows] = await executor.query(
    `SELECT pp.id, pp.proveedor_id, pp.producto_id, pp.presentacion_compra,
            pp.unidades_por_presentacion, pp.costo_presentacion,
            pp.minimo_presentaciones, pp.preferido, pp.activo,
            p.codigo, p.nombre AS nombre_producto, p.presentacion AS presentacion_producto
     FROM productos_proveedores pp
     JOIN productos p ON p.id = pp.producto_id
     WHERE pp.id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function getProductosProveedor({ proveedorId, productoId, soloActivos = true } = {}) {
  const conditions = [];
  const values = [];
  if (proveedorId !== undefined) {
    conditions.push('pp.proveedor_id = ?');
    values.push(proveedorId);
  }
  if (productoId !== undefined) {
    conditions.push('pp.producto_id = ?');
    values.push(productoId);
  }
  if (soloActivos) conditions.push('pp.activo = 1');
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT pp.id, pp.proveedor_id, pp.producto_id, pp.presentacion_compra,
            pp.unidades_por_presentacion, pp.costo_presentacion,
            pp.minimo_presentaciones, pp.preferido, pp.activo,
            p.codigo, p.nombre AS nombre_producto, p.presentacion AS presentacion_producto,
            pr.nombre AS nombre_proveedor
     FROM productos_proveedores pp
     JOIN productos p ON p.id = pp.producto_id
     JOIN proveedores pr ON pr.id = pp.proveedor_id
     ${where}
     ORDER BY pr.nombre, p.nombre`,
    values
  );
  return rows;
}

async function createProductoProveedor(data) {
  const columns = [
    'proveedor_id', 'producto_id', 'presentacion_compra',
    'unidades_por_presentacion', 'costo_presentacion',
  ];
  const values = [
    data.proveedor_id, data.producto_id, data.presentacion_compra,
    data.unidades_por_presentacion, data.costo_presentacion,
  ];
  for (const field of ['minimo_presentaciones', 'preferido', 'activo']) {
    if (data[field] !== undefined) {
      columns.push(field);
      values.push(['preferido', 'activo'].includes(field) ? (data[field] ? 1 : 0) : data[field]);
    }
  }
  const [result] = await pool.query(
    `INSERT INTO productos_proveedores (${columns.join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    values
  );
  return getProductoProveedor(result.insertId);
}

async function updateProductoProveedor(id, data) {
  const fields = [];
  const values = [];
  for (const field of [
    'presentacion_compra', 'unidades_por_presentacion', 'costo_presentacion',
    'minimo_presentaciones', 'preferido', 'activo',
  ]) {
    if (data[field] !== undefined) {
      fields.push(`${field} = ?`);
      values.push(['preferido', 'activo'].includes(field) ? (data[field] ? 1 : 0) : data[field]);
    }
  }
  if (!fields.length) return false;
  values.push(id);
  const [result] = await pool.query(
    `UPDATE productos_proveedores SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  return result.affectedRows > 0;
}

module.exports = {
  getAllProductos,
  getProductoById,
  createProducto,
  updateProducto,
  desactivarProducto,
  getProductoProveedor,
  getProductosProveedor,
  createProductoProveedor,
  updateProductoProveedor,
};
