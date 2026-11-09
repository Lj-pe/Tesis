const detalleCompraModel = require('../models/detalle_compra.model');

async function getAllDetalleCompras(req, res) {
  try {
    return res.status(200).json(await detalleCompraModel.getAllDetalleCompras());
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener detalles de compra', error: error.message });
  }
}

async function getDetalleCompraById(req, res) {
  try {
    const detail = await detalleCompraModel.getDetalleCompraById(req.params.id);
    if (!detail) return res.status(404).json({ message: 'Detalle de compra no encontrado' });
    return res.status(200).json(detail);
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener detalle de compra', error: error.message });
  }
}

module.exports = { getAllDetalleCompras, getDetalleCompraById };
