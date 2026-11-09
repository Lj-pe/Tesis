const productoModel = require('../models/producto.model');
const { normalizeDecimal } = require('../utils/decimal');

const isPositiveInteger = (value) => /^\d+$/.test(String(value)) && BigInt(value) > 0n;
const isNonNegativeInteger = (value) => Number.isInteger(value) && value >= 0;

async function getAllProductos(req, res) {
  try {
    res.status(200).json(await productoModel.getAllProductos());
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener productos', error: error.message });
  }
}

async function getProductoById(req, res) {
  try {
    const producto = await productoModel.getProductoById(req.params.id);
    if (!producto) return res.status(404).json({ message: 'Producto no encontrado' });
    return res.status(200).json(producto);
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener producto', error: error.message });
  }
}

async function createProducto(req, res) {
  try {
    const { codigo, codigo_barras, categoria_id, nombre, marca, presentacion, precio_venta, dias_seguridad, activo } = req.body;
    if (
      typeof codigo !== 'string' || !codigo.trim() ||
      !isPositiveInteger(categoria_id) ||
      typeof nombre !== 'string' || !nombre.trim() ||
      typeof presentacion !== 'string' || !presentacion.trim() ||
      normalizeDecimal(precio_venta, 12, 2) === null ||
      (dias_seguridad !== undefined && !isNonNegativeInteger(dias_seguridad)) ||
      (activo !== undefined && typeof activo !== 'boolean')
    ) {
      return res.status(400).json({ message: 'Datos de producto inválidos' });
    }
    const producto = await productoModel.createProducto({
      codigo: codigo.trim(), codigo_barras: codigo_barras || null, categoria_id: String(categoria_id),
      nombre: nombre.trim(), marca: marca || null, presentacion: presentacion.trim(),
      precio_venta: normalizeDecimal(precio_venta, 12, 2), dias_seguridad,
      activo: activo === undefined ? undefined : Number(activo),
    });
    return res.status(201).json(producto);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'El código de producto ya existe' });
    if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
      return res.status(400).json({ message: 'La categoría no existe' });
    }
    return res.status(500).json({ message: 'Error al crear producto', error: error.message });
  }
}

async function updateProducto(req, res) {
  try {
    const data = { ...req.body };
    for (const field of ['codigo', 'nombre', 'presentacion']) {
      if (data[field] !== undefined && (typeof data[field] !== 'string' || !data[field].trim())) {
        return res.status(400).json({ message: `${field} debe ser texto no vacío` });
      }
    }
    for (const field of ['codigo_barras', 'marca']) {
      if (data[field] !== undefined && data[field] !== null && typeof data[field] !== 'string') {
        return res.status(400).json({ message: `${field} debe ser texto o null` });
      }
    }
    if (data.activo !== undefined && typeof data.activo !== 'boolean') {
      return res.status(400).json({ message: 'activo debe ser booleano' });
    }
    if (data.categoria_id !== undefined && !isPositiveInteger(data.categoria_id)) {
      return res.status(400).json({ message: 'categoria_id debe ser entero positivo' });
    }
    if (data.precio_venta !== undefined && normalizeDecimal(data.precio_venta, 12, 2) === null) {
      return res.status(400).json({ message: 'precio_venta debe ajustarse a DECIMAL(12,2)' });
    }
    if (data.dias_seguridad !== undefined && !isNonNegativeInteger(data.dias_seguridad)) {
      return res.status(400).json({ message: 'dias_seguridad debe ser entero no negativo' });
    }
    if (data.categoria_id !== undefined) data.categoria_id = String(data.categoria_id);
    if (data.precio_venta !== undefined) data.precio_venta = normalizeDecimal(data.precio_venta, 12, 2);
    const updated = await productoModel.updateProducto(req.params.id, data);
    if (!updated) return res.status(404).json({ message: 'Producto no encontrado o sin cambios' });
    return res.status(200).json(await productoModel.getProductoById(req.params.id));
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'El código ya está registrado' });
    if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
      return res.status(400).json({ message: 'La categoría no existe' });
    }
    return res.status(500).json({ message: 'Error al actualizar producto', error: error.message });
  }
}

async function deleteProducto(req, res) {
  try {
    if (!(await productoModel.desactivarProducto(req.params.id))) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    return res.status(200).json({ message: 'Producto desactivado' });
  } catch (error) {
    return res.status(500).json({ message: 'Error al desactivar producto', error: error.message });
  }
}

module.exports = { getAllProductos, getProductoById, createProducto, updateProducto, deleteProducto };
