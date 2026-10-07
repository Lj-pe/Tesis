const detalleVentaModel = require('../models/detalle_venta.model');

async function getAllDetalleVentas(req, res) {
  try {
    const detalleVentas = await detalleVentaModel.getAllDetalleVentas();
    res.status(200).json(detalleVentas);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener detalle de ventas', error: error.message });
  }
}

async function getDetalleVentaById(req, res) {
  try {
    const detalleVenta = await detalleVentaModel.getDetalleVentaById(req.params.id);

    if (!detalleVenta) {
      return res.status(404).json({ message: 'Detalle de venta no encontrado' });
    }

    return res.status(200).json(detalleVenta);
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener detalle de venta', error: error.message });
  }
}

async function createDetalleVenta(req, res) {
  try {
    const {
      venta_id,
      producto_id,
      cantidad,
      precio_unitario,
      total_linea,
    } = req.body;

    if (!venta_id || !producto_id || !cantidad || !precio_unitario) {
      return res.status(400).json({
        message: 'Los campos venta_id, producto_id, cantidad y precio_unitario son obligatorios',
      });
    }

    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      return res.status(400).json({ message: 'La cantidad debe ser un entero mayor que 0' });
    }

    const detalleVenta = await detalleVentaModel.createDetalleVenta({
      venta_id,
      producto_id,
      cantidad,
      precio_unitario,
      total_linea,
    });

    return res.status(201).json(detalleVenta);
  } catch (error) {
    if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
      return res.status(400).json({ message: 'La venta o el producto referenciado no existe' });
    }

    return res.status(500).json({ message: 'Error al crear detalle de venta', error: error.message });
  }
}

async function updateDetalleVenta(req, res) {
  try {
    const detalleVenta = await detalleVentaModel.getDetalleVentaById(req.params.id);

    if (!detalleVenta) {
      return res.status(404).json({ message: 'Detalle de venta no encontrado' });
    }

    if (req.body.cantidad !== undefined && (!Number.isInteger(req.body.cantidad) || req.body.cantidad <= 0)) {
      return res.status(400).json({ message: 'La cantidad debe ser un entero mayor que 0' });
    }

    const updated = await detalleVentaModel.updateDetalleVenta(req.params.id, req.body);

    if (!updated) {
      return res.status(400).json({ message: 'No se enviaron datos para actualizar' });
    }

    const detalleVentaActualizado = await detalleVentaModel.getDetalleVentaById(req.params.id);
    return res.status(200).json(detalleVentaActualizado);
  } catch (error) {
    if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
      return res.status(400).json({ message: 'La venta o el producto referenciado no existe' });
    }

    return res.status(500).json({ message: 'Error al actualizar detalle de venta', error: error.message });
  }
}

async function deleteDetalleVenta(req, res) {
  try {
    const detalleVenta = await detalleVentaModel.getDetalleVentaById(req.params.id);

    if (!detalleVenta) {
      return res.status(404).json({ message: 'Detalle de venta no encontrado' });
    }

    const result = await detalleVentaModel.deleteDetalleVenta(req.params.id);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Detalle de venta no encontrado' });
    }

    return res.status(200).json({ message: 'Detalle de venta eliminado correctamente' });
  } catch (error) {
    return res.status(500).json({ message: 'Error al eliminar detalle de venta', error: error.message });
  }
}

module.exports = {
  getAllDetalleVentas,
  getDetalleVentaById,
  createDetalleVenta,
  updateDetalleVenta,
  deleteDetalleVenta,
};
