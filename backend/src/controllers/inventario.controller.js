const inventarioModel = require('../models/inventario.model');

const ESTADOS_INVENTARIO_VALIDOS = ['normal', 'bajo', 'agotado', 'bloqueado'];

function validarInventarioCreate(data) {
  const { producto_id, stock_actual, stock_minimo, stock_seguridad, stock_maximo, estado_inventario } = data;

  if (producto_id === undefined || producto_id === null || producto_id === '') {
    return 'El campo producto_id es obligatorio';
  }

  if (!Number.isInteger(producto_id) || producto_id <= 0) {
    return 'El campo producto_id debe ser un entero positivo';
  }

  if (stock_actual !== undefined && (!Number.isInteger(stock_actual) || stock_actual < 0)) {
    return 'El campo stock_actual debe ser un entero mayor o igual a 0';
  }

  if (stock_minimo !== undefined && (!Number.isInteger(stock_minimo) || stock_minimo < 0)) {
    return 'El campo stock_minimo debe ser un entero mayor o igual a 0';
  }

  if (stock_seguridad !== undefined && stock_seguridad !== null && (!Number.isInteger(stock_seguridad) || stock_seguridad < 0)) {
    return 'El campo stock_seguridad debe ser un entero mayor o igual a 0 o NULL';
  }

  if (stock_maximo !== undefined && stock_maximo !== null && (!Number.isInteger(stock_maximo) || stock_maximo < 0)) {
    return 'El campo stock_maximo debe ser un entero mayor o igual a 0 o NULL';
  }

  const stockMinimoAplicado = stock_minimo !== undefined ? stock_minimo : 0;
  if (stock_maximo !== undefined && stock_maximo !== null && stock_maximo < stockMinimoAplicado) {
    return 'El campo stock_maximo debe ser mayor o igual que stock_minimo';
  }

  if (estado_inventario !== undefined && !ESTADOS_INVENTARIO_VALIDOS.includes(estado_inventario)) {
    return 'El campo estado_inventario debe ser normal, bajo, agotado o bloqueado';
  }

  return null;
}

function validarInventarioUpdate(data) {
  const { producto_id, stock_actual, stock_minimo, stock_seguridad, stock_maximo, estado_inventario } = data;

  if (producto_id !== undefined && producto_id !== null && producto_id !== '' && (!Number.isInteger(producto_id) || producto_id <= 0)) {
    return 'El campo producto_id debe ser un entero positivo';
  }

  if (stock_actual !== undefined && (!Number.isInteger(stock_actual) || stock_actual < 0)) {
    return 'El campo stock_actual debe ser un entero mayor o igual a 0';
  }

  if (stock_minimo !== undefined && (!Number.isInteger(stock_minimo) || stock_minimo < 0)) {
    return 'El campo stock_minimo debe ser un entero mayor o igual a 0';
  }

  if (stock_seguridad !== undefined && stock_seguridad !== null && (!Number.isInteger(stock_seguridad) || stock_seguridad < 0)) {
    return 'El campo stock_seguridad debe ser un entero mayor o igual a 0 o NULL';
  }

  if (stock_maximo !== undefined && stock_maximo !== null && (!Number.isInteger(stock_maximo) || stock_maximo < 0)) {
    return 'El campo stock_maximo debe ser un entero mayor o igual a 0 o NULL';
  }

  const stockMinimoAplicado = stock_minimo !== undefined ? stock_minimo : 0;
  if (stock_maximo !== undefined && stock_maximo !== null && stock_maximo < stockMinimoAplicado) {
    return 'El campo stock_maximo debe ser mayor o igual que stock_minimo';
  }

  if (estado_inventario !== undefined && !ESTADOS_INVENTARIO_VALIDOS.includes(estado_inventario)) {
    return 'El campo estado_inventario debe ser normal, bajo, agotado o bloqueado';
  }

  return null;
}

async function getAllInventarios(req, res) {
  try {
    const inventarios = await inventarioModel.getAllInventarios();
    res.status(200).json(inventarios);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener inventarios', error: error.message });
  }
}

async function getInventarioById(req, res) {
  try {
    const inventario = await inventarioModel.getInventarioById(req.params.id);

    if (!inventario) {
      return res.status(404).json({ message: 'Inventario no encontrado' });
    }

    return res.status(200).json(inventario);
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener inventario', error: error.message });
  }
}

async function createInventario(req, res) {
  try {
    const {
      producto_id,
      stock_actual,
      stock_minimo,
      stock_seguridad,
      stock_maximo,
      estado_inventario,
    } = req.body;

    const errorValidacion = validarInventarioCreate({
      producto_id,
      stock_actual,
      stock_minimo,
      stock_seguridad,
      stock_maximo,
      estado_inventario,
    });

    if (errorValidacion) {
      return res.status(400).json({ message: errorValidacion });
    }

    const inventario = await inventarioModel.createInventario({
      producto_id,
      stock_actual,
      stock_minimo,
      stock_seguridad,
      stock_maximo,
      estado_inventario,
    });

    return res.status(201).json(inventario);
  } catch (error) {
    if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
      return res.status(400).json({ message: 'El campo producto_id debe apuntar a un producto existente' });
    }

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Ya existe un inventario para este producto' });
    }

    return res.status(500).json({ message: 'Error al crear inventario', error: error.message });
  }
}

async function updateInventario(req, res) {
  try {
    const inventario = await inventarioModel.getInventarioById(req.params.id);

    if (!inventario) {
      return res.status(404).json({ message: 'Inventario no encontrado' });
    }

    const errorValidacion = validarInventarioUpdate(req.body);

    if (errorValidacion) {
      return res.status(400).json({ message: errorValidacion });
    }

    const updated = await inventarioModel.updateInventario(req.params.id, req.body);

    if (!updated) {
      return res.status(400).json({ message: 'No se enviaron datos para actualizar' });
    }

    const inventarioActualizado = await inventarioModel.getInventarioById(req.params.id);
    return res.status(200).json(inventarioActualizado);
  } catch (error) {
    if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
      return res.status(400).json({ message: 'El campo producto_id debe apuntar a un producto existente' });
    }

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Ya existe un inventario para este producto' });
    }

    return res.status(500).json({ message: 'Error al actualizar inventario', error: error.message });
  }
}

async function deleteInventario(req, res) {
  try {
    const inventario = await inventarioModel.getInventarioById(req.params.id);

    if (!inventario) {
      return res.status(404).json({ message: 'Inventario no encontrado' });
    }

    const result = await inventarioModel.deleteInventario(req.params.id);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Inventario no encontrado' });
    }

    return res.status(200).json({ message: 'Inventario eliminado correctamente' });
  } catch (error) {
    return res.status(500).json({ message: 'Error al eliminar inventario', error: error.message });
  }
}

module.exports = {
  getAllInventarios,
  getInventarioById,
  createInventario,
  updateInventario,
  deleteInventario,
};
