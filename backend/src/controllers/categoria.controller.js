const categoriaModel = require('../models/categoria.model');

async function getAllCategorias(req, res) {
  try {
    res.status(200).json(await categoriaModel.getAllCategorias());
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener categorías', error: error.message });
  }
}

async function getCategoriaById(req, res) {
  try {
    const categoria = await categoriaModel.getCategoriaById(req.params.id);
    if (!categoria) return res.status(404).json({ message: 'Categoría no encontrada' });
    return res.status(200).json(categoria);
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener categoría', error: error.message });
  }
}

async function createCategoria(req, res) {
  try {
    const { nombre, activa = true } = req.body;
    if (typeof nombre !== 'string' || !nombre.trim() || typeof activa !== 'boolean') {
      return res.status(400).json({ message: 'nombre y activa (booleano) son obligatorios' });
    }
    return res.status(201).json(await categoriaModel.createCategoria({ nombre: nombre.trim(), activa }));
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'El nombre ya existe' });
    return res.status(500).json({ message: 'Error al crear categoría', error: error.message });
  }
}

async function updateCategoria(req, res) {
  try {
    const { nombre, activa } = req.body;
    if (nombre !== undefined && (typeof nombre !== 'string' || !nombre.trim())) {
      return res.status(400).json({ message: 'nombre debe ser texto no vacío' });
    }
    if (activa !== undefined && typeof activa !== 'boolean') {
      return res.status(400).json({ message: 'activa debe ser booleano' });
    }
    const updated = await categoriaModel.updateCategoria(req.params.id, {
      ...(nombre !== undefined ? { nombre: nombre.trim() } : {}),
      ...(activa !== undefined ? { activa } : {}),
    });
    if (!updated) return res.status(404).json({ message: 'Categoría no encontrada o sin cambios' });
    return res.status(200).json(await categoriaModel.getCategoriaById(req.params.id));
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'El nombre ya existe' });
    return res.status(500).json({ message: 'Error al actualizar categoría', error: error.message });
  }
}

async function deleteCategoria(req, res) {
  try {
    if (!(await categoriaModel.desactivarCategoria(req.params.id))) {
      return res.status(404).json({ message: 'Categoría no encontrada' });
    }
    return res.status(200).json({ message: 'Categoría desactivada' });
  } catch (error) {
    return res.status(500).json({ message: 'Error al desactivar categoría', error: error.message });
  }
}

module.exports = { getAllCategorias, getCategoriaById, createCategoria, updateCategoria, deleteCategoria };
