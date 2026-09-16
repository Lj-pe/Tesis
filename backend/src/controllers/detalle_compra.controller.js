const detalleCompraModel = require('../models/detalle_compra.model');

async function getAllDetalleCompras(req, res) {
  try {
    const detalleCompras = await detalleCompraModel.getAllDetalleCompras();
    res.status(200).json(detalleCompras);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener detalle de compras', error: error.message });
  }
}

async function getDetalleCompraById(req, res) {
  try {
    const detalleCompra = await detalleCompraModel.getDetalleCompraById(req.params.id);

    if (!detalleCompra) {
      return res.status(404).json({ message: 'Detalle de compra no encontrado' });
    }

    return res.status(200).json(detalleCompra);
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener detalle de compra', error: error.message });
  }
}

async function createDetalleCompra(req, res) {
  try {
    const {
      compra_id,
      producto_id,
      cantidad,
      costo_unitario,
      subtotal,
      impuesto,
      total_linea,
      observaciones,
    } = req.body;

    if (!compra_id || !producto_id || !cantidad || !costo_unitario) {
      return res.status(400).json({
        message: 'Los campos compra_id, producto_id, cantidad y costo_unitario son obligatorios',
      });
    }

    if (cantidad <= 0) {
      return res.status(400).json({ message: 'La cantidad debe ser mayor que 0' });
    }

    const detalleCompra = await detalleCompraModel.createDetalleCompra({
      compra_id,
      producto_id,
      cantidad,
      costo_unitario,
      subtotal,
      impuesto,
      total_linea,
      observaciones,
    });

    return res.status(201).json(detalleCompra);
  } catch (error) {
    if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
      return res.status(400).json({ message: 'La compra o el producto referenciado no existe' });
    }

    return res.status(500).json({ message: 'Error al crear detalle de compra', error: error.message });
  }
}

async function updateDetalleCompra(req, res) {
  try {
    const detalleCompra = await detalleCompraModel.getDetalleCompraById(req.params.id);

    if (!detalleCompra) {
      return res.status(404).json({ message: 'Detalle de compra no encontrado' });
    }

    if (req.body.cantidad !== undefined && req.body.cantidad <= 0) {
      return res.status(400).json({ message: 'La cantidad debe ser mayor que 0' });
    }

    const updated = await detalleCompraModel.updateDetalleCompra(req.params.id, req.body);

    if (!updated) {
      return res.status(400).json({ message: 'No se enviaron datos para actualizar' });
    }

    const detalleCompraActualizado = await detalleCompraModel.getDetalleCompraById(req.params.id);
    return res.status(200).json(detalleCompraActualizado);
  } catch (error) {
    if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
      return res.status(400).json({ message: 'La compra o el producto referenciado no existe' });
    }

    return res.status(500).json({ message: 'Error al actualizar detalle de compra', error: error.message });
  }
}

async function deleteDetalleCompra(req, res) {
  try {
    const detalleCompra = await detalleCompraModel.getDetalleCompraById(req.params.id);

    if (!detalleCompra) {
      return res.status(404).json({ message: 'Detalle de compra no encontrado' });
    }

    const result = await detalleCompraModel.deleteDetalleCompra(req.params.id);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Detalle de compra no encontrado' });
    }

    return res.status(200).json({ message: 'Detalle de compra eliminado correctamente' });
  } catch (error) {
    return res.status(500).json({ message: 'Error al eliminar detalle de compra', error: error.message });
  }
}

module.exports = {
  getAllDetalleCompras,
  getDetalleCompraById,
  createDetalleCompra,
  updateDetalleCompra,
  deleteDetalleCompra,
};
