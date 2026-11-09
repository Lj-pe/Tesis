const inventarioModel = require('../models/inventario.model');

async function getAllInventarios(req, res) {
  try {
    return res.status(200).json(await inventarioModel.getAllExistencias());
  } catch (error) {
    return res.status(500).json({ message: 'Error al consultar existencias', error: error.message });
  }
}

async function getInventarioById(req, res) {
  try {
    const existencia = await inventarioModel.getExistenciaByProductoId(req.params.id);
    if (!existencia) return res.status(404).json({ message: 'Producto no encontrado' });
    return res.status(200).json(existencia);
  } catch (error) {
    return res.status(500).json({ message: 'Error al consultar existencias', error: error.message });
  }
}

module.exports = { getAllInventarios, getInventarioById };
