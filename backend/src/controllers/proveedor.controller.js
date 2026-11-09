const proveedorModel = require('../models/proveedor.model');
const productoModel = require('../models/producto.model');
const { normalizeDecimal } = require('../utils/decimal');

async function getAllProveedores(req, res) {
  try {
    res.status(200).json(await proveedorModel.getAllProveedores());
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener proveedores', error: error.message });
  }
}

async function getProveedorById(req, res) {
  try {
    const proveedor = await proveedorModel.getProveedorById(req.params.id);
    if (!proveedor) return res.status(404).json({ message: 'Proveedor no encontrado' });
    return res.status(200).json(proveedor);
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener proveedor', error: error.message });
  }
}

async function createProveedor(req, res) {
  try {
    const { codigo, nombre, telefono, correo, direccion, plazo_entrega_dias, activo } = req.body;
    if (typeof codigo !== 'string' || !codigo.trim() ||
        typeof nombre !== 'string' || !nombre.trim() ||
        !Number.isInteger(plazo_entrega_dias) || plazo_entrega_dias < 0 ||
        (activo !== undefined && typeof activo !== 'boolean')) {
      return res.status(400).json({ message: 'Datos de proveedor inválidos' });
    }
    return res.status(201).json(await proveedorModel.createProveedor({
      codigo: String(codigo).trim(), nombre: String(nombre).trim(),
      telefono: telefono || null, correo: correo || null, direccion: direccion || null,
      plazo_entrega_dias, activo,
    }));
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'El código de proveedor ya existe' });
    return res.status(500).json({ message: 'Error al crear proveedor', error: error.message });
  }
}

async function updateProveedor(req, res) {
  try {
    const data = { ...req.body };
    if (data.activo !== undefined && typeof data.activo !== 'boolean') {
      return res.status(400).json({ message: 'activo debe ser booleano' });
    }
    if (data.plazo_entrega_dias !== undefined &&
        (!Number.isInteger(data.plazo_entrega_dias) || data.plazo_entrega_dias < 0)) {
      return res.status(400).json({ message: 'plazo_entrega_dias debe ser entero no negativo' });
    }
    const updated = await proveedorModel.updateProveedor(req.params.id, data);
    if (!updated) return res.status(404).json({ message: 'Proveedor no encontrado o sin cambios' });
    return res.status(200).json(await proveedorModel.getProveedorById(req.params.id));
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'El código ya está registrado' });
    return res.status(500).json({ message: 'Error al actualizar proveedor', error: error.message });
  }
}

async function deleteProveedor(req, res) {
  try {
    if (!(await proveedorModel.desactivarProveedor(req.params.id))) {
      return res.status(404).json({ message: 'Proveedor no encontrado' });
    }
    return res.status(200).json({ message: 'Proveedor desactivado' });
  } catch (error) {
    return res.status(500).json({ message: 'Error al desactivar proveedor', error: error.message });
  }
}

async function getDiasPedido(req, res) {
  try {
    const proveedor = await proveedorModel.getProveedorById(req.params.id);
    if (!proveedor) return res.status(404).json({ message: 'Proveedor no encontrado' });
    return res.status(200).json(await proveedorModel.getDiasPedidoProveedor(req.params.id));
  } catch (error) {
    return res.status(500).json({ message: 'Error al consultar días de pedido', error: error.message });
  }
}

async function setDiasPedido(req, res) {
  try {
    const { dias } = req.body;
    if (!Array.isArray(dias) ||
        dias.some((dia) => !(typeof dia === 'string' && dia.trim()) && !Number.isInteger(dia)) ||
        new Set(dias.map(String)).size !== dias.length) {
      return res.status(400).json({ message: 'dias debe ser una lista sin valores repetidos' });
    }
    const proveedor = await proveedorModel.getProveedorById(req.params.id);
    if (!proveedor) return res.status(404).json({ message: 'Proveedor no encontrado' });
    return res.status(200).json(await proveedorModel.setDiasPedidoProveedor(req.params.id, dias));
  } catch (error) {
    if (error.code === 'INVALID_DAY_VALUE') {
      return res.status(400).json({ message: error.message });
    }
    if (error.code === 'PROVIDER_NOT_FOUND') {
      return res.status(404).json({ message: 'Proveedor no encontrado' });
    }
    if (error.code === 'SCHEMA_ENUM_UNAVAILABLE') {
      return res.status(500).json({ message: 'No se pudo verificar los valores permitidos de dia_semana' });
    }
    if (error.code === 'SCHEMA_TYPE_UNSUPPORTED') {
      return res.status(500).json({ message: 'No se pudo verificar el tipo permitido de dia_semana' });
    }
    if (['ER_BAD_FIELD_ERROR', 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD', 'WARN_DATA_TRUNCATED'].includes(error.code)) {
      return res.status(400).json({ message: 'Uno o más días no son válidos para la estructura de la base de datos' });
    }
    return res.status(500).json({ message: 'Error al actualizar días de pedido', error: error.message });
  }
}

async function getCatalogo(req, res) {
  try {
    const query = {};
    if (req.query.proveedor_id !== undefined) query.proveedorId = req.query.proveedor_id;
    if (req.query.producto_id !== undefined) query.productoId = req.query.producto_id;
    query.soloActivos = req.query.incluir_inactivos !== 'true';
    return res.status(200).json(await productoModel.getProductosProveedor(query));
  } catch (error) {
    return res.status(500).json({ message: 'Error al consultar catálogo de proveedores', error: error.message });
  }
}

async function createCatalogo(req, res) {
  try {
    const { proveedor_id, producto_id, presentacion_compra, unidades_por_presentacion,
      costo_presentacion, minimo_presentaciones, preferido, activo } = req.body;
    if (!proveedor_id || !producto_id || typeof presentacion_compra !== 'string' || !presentacion_compra.trim() ||
        !Number.isInteger(unidades_por_presentacion) || unidades_por_presentacion < 1 ||
        normalizeDecimal(costo_presentacion, 12, 2) === null ||
        (minimo_presentaciones !== undefined && (!Number.isInteger(minimo_presentaciones) || minimo_presentaciones < 1)) ||
        (preferido !== undefined && typeof preferido !== 'boolean') ||
        (activo !== undefined && typeof activo !== 'boolean')) {
      return res.status(400).json({ message: 'Datos del catálogo proveedor-producto inválidos' });
    }
    return res.status(201).json(await productoModel.createProductoProveedor({
      proveedor_id, producto_id, presentacion_compra, unidades_por_presentacion,
      costo_presentacion: normalizeDecimal(costo_presentacion, 12, 2),
      minimo_presentaciones, preferido, activo,
    }));
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'La relación proveedor-producto ya existe' });
    if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
      return res.status(400).json({ message: 'El proveedor o producto no existe' });
    }
    if (['ER_BAD_FIELD_ERROR', 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD', 'WARN_DATA_TRUNCATED', 'ER_DATA_TOO_LONG'].includes(error.code)) {
      return res.status(400).json({ message: 'Uno de los valores no está permitido por la estructura de la base de datos' });
    }
    return res.status(500).json({ message: 'Error al crear relación de catálogo', error: error.message });
  }
}

async function updateCatalogo(req, res) {
  try {
    const { presentacion_compra, unidades_por_presentacion, costo_presentacion,
      minimo_presentaciones, preferido, activo } = req.body;
    if (presentacion_compra !== undefined &&
        (typeof presentacion_compra !== 'string' || !presentacion_compra.trim())) {
      return res.status(400).json({ message: 'presentacion_compra inválida' });
    }
    if (unidades_por_presentacion !== undefined &&
        (!Number.isInteger(unidades_por_presentacion) || unidades_por_presentacion < 1)) {
      return res.status(400).json({ message: 'unidades_por_presentacion debe ser positivo' });
    }
    if (costo_presentacion !== undefined && normalizeDecimal(costo_presentacion, 12, 2) === null) {
      return res.status(400).json({ message: 'costo_presentacion debe ajustarse a DECIMAL(12,2)' });
    }
    if (minimo_presentaciones !== undefined &&
        (!Number.isInteger(minimo_presentaciones) || minimo_presentaciones < 1)) {
      return res.status(400).json({ message: 'minimo_presentaciones debe ser positivo' });
    }
    for (const [field, value] of Object.entries({ preferido, activo })) {
      if (value !== undefined && typeof value !== 'boolean') {
        return res.status(400).json({ message: `${field} debe ser booleano` });
      }
    }
    const data = {
      ...req.body,
      ...(costo_presentacion !== undefined
        ? { costo_presentacion: normalizeDecimal(costo_presentacion, 12, 2) }
        : {}),
    };
    const updated = await productoModel.updateProductoProveedor(req.params.id, data);
    if (!updated) return res.status(404).json({ message: 'Relación no encontrada o sin cambios' });
    return res.status(200).json(await productoModel.getProductoProveedor(req.params.id));
  } catch (error) {
    if (['ER_BAD_FIELD_ERROR', 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD', 'WARN_DATA_TRUNCATED', 'ER_DATA_TOO_LONG'].includes(error.code)) {
      return res.status(400).json({ message: 'Uno de los valores no está permitido por la estructura de la base de datos' });
    }
    return res.status(500).json({ message: 'Error al actualizar relación de catálogo', error: error.message });
  }
}

module.exports = {
  getAllProveedores, getProveedorById, createProveedor, updateProveedor, deleteProveedor,
  getDiasPedido, setDiasPedido, getCatalogo, createCatalogo, updateCatalogo,
};
