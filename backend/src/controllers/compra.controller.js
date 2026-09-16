const compraModel = require('../models/compra.model');
const { createCompraTransaccional: createCompraTransaccionalService } = require('../services/compraTransaccional.service');

async function getAllCompras(req, res) {
  try {
    const compras = await compraModel.getAllCompras();
    res.status(200).json(compras);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener compras', error: error.message });
  }
}

async function getCompraById(req, res) {
  try {
    const compra = await compraModel.getCompraById(req.params.id);

    if (!compra) {
      return res.status(404).json({ message: 'Compra no encontrada' });
    }

    return res.status(200).json(compra);
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener compra', error: error.message });
  }
}

async function createCompra(req, res) {
  try {
    const {
      proveedor_id,
      usuario_id,
      numero_factura,
      fecha_compra,
      fecha_recepcion,
      subtotal,
      impuesto,
      total,
      estado,
      observaciones,
    } = req.body;

    if (!proveedor_id || !usuario_id || !fecha_compra) {
      return res.status(400).json({
        message: 'Los campos proveedor_id, usuario_id y fecha_compra son obligatorios',
      });
    }

    const compra = await compraModel.createCompra({
      proveedor_id,
      usuario_id,
      numero_factura,
      fecha_compra,
      fecha_recepcion,
      subtotal,
      impuesto,
      total,
      estado,
      observaciones,
    });

    return res.status(201).json(compra);
  } catch (error) {
    return res.status(500).json({ message: 'Error al crear compra', error: error.message });
  }
}

async function updateCompra(req, res) {
  try {
    const compra = await compraModel.getCompraById(req.params.id);

    if (!compra) {
      return res.status(404).json({ message: 'Compra no encontrada' });
    }

    const updated = await compraModel.updateCompra(req.params.id, req.body);

    if (!updated) {
      return res.status(400).json({ message: 'No se enviaron datos para actualizar' });
    }

    const compraActualizada = await compraModel.getCompraById(req.params.id);
    return res.status(200).json(compraActualizada);
  } catch (error) {
    return res.status(500).json({ message: 'Error al actualizar compra', error: error.message });
  }
}

async function deleteCompra(req, res) {
  try {
    const compra = await compraModel.getCompraById(req.params.id);

    if (!compra) {
      return res.status(404).json({ message: 'Compra no encontrada' });
    }

    const result = await compraModel.deleteCompra(req.params.id);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Compra no encontrada' });
    }

    return res.status(200).json({ message: 'Compra eliminada correctamente' });
  } catch (error) {
    return res.status(500).json({ message: 'Error al eliminar compra', error: error.message });
  }
}

async function createCompraTransaccional(req, res) {
  try {
    if (!req.user?.id_usuario) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    const result = await createCompraTransaccionalService(req.body, req.user.id_usuario);

    return res.status(201).json(result);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      message: error.message || 'Error al crear compra transaccional',
      error: error.message,
    });
  }
}

module.exports = {
  getAllCompras,
  getCompraById,
  createCompra,
  createCompraTransaccional,
  updateCompra,
  deleteCompra,
};
