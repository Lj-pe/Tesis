const detalleVentaModel = require('../models/detalle_venta.model');

async function getAllDetalleVentas(req, res) {
  try {
    return res.status(200).json(await detalleVentaModel.getAllDetalleVentas());
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener detalles de venta', error: error.message });
  }
}

async function getDetalleVentaById(req, res) {
  try {
    const detail = await detalleVentaModel.getDetalleVentaById(req.params.id);
    if (!detail) return res.status(404).json({ message: 'Detalle de venta no encontrado' });
    return res.status(200).json(detail);
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener detalle de venta', error: error.message });
  }
}

module.exports = { getAllDetalleVentas, getDetalleVentaById };
