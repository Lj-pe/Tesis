const categoriaModel = require('../models/categoria.model');

async function getAllCategorias(req, res) {
  try {
    const categorias = await categoriaModel.getAllCategorias();
    res.status(200).json(categorias);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener categorias', error: error.message });
  }
}

async function getCategoriaById(req, res) {
  try {
    const categoria = await categoriaModel.getCategoriaById(req.params.id);

    if (!categoria) {
      return res.status(404).json({ message: 'Categoria no encontrada' });
    }

    return res.status(200).json(categoria);
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener categoria', error: error.message });
  }
}

async function createCategoria(req, res) {
  try {
    const { nombre, descripcion, estado } = req.body;

    if (!nombre) {
      return res.status(400).json({ message: 'El campo nombre es obligatorio' });
    }

    const categoria = await categoriaModel.createCategoria({ nombre, descripcion, estado });
    return res.status(201).json(categoria);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Ya existe una categoria con ese nombre' });
    }

    return res.status(500).json({ message: 'Error al crear categoria', error: error.message });
  }
}

async function updateCategoria(req, res) {
  try {
    const categoria = await categoriaModel.getCategoriaById(req.params.id);

    if (!categoria) {
      return res.status(404).json({ message: 'Categoria no encontrada' });
    }

    const updated = await categoriaModel.updateCategoria(req.params.id, req.body);

    if (!updated) {
      return res.status(400).json({ message: 'No se enviaron datos para actualizar' });
    }

    const categoriaActualizada = await categoriaModel.getCategoriaById(req.params.id);
    return res.status(200).json(categoriaActualizada);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || 'Error al actualizar categoria',
    });
  }
}

async function deleteCategoria(req, res) {
  try {
    const categoria = await categoriaModel.getCategoriaById(req.params.id);

    if (!categoria) {
      return res.status(404).json({ message: 'Categoria no encontrada' });
    }

    const result = await categoriaModel.deleteCategoria(req.params.id);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Categoria no encontrada' });
    }

    return res.status(200).json({ message: 'Categoria eliminada correctamente' });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: 'Error al eliminar categoria', error: error.message });
  }
}

module.exports = {
  getAllCategorias,
  getCategoriaById,
  createCategoria,
  updateCategoria,
  deleteCategoria,
};
