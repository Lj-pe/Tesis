const ventaModel = require('../models/venta.model');
const {
  createVentaTransaccional: createVentaTransaccionalService,
  cambiarEstadoVentaTransaccional: cambiarEstadoVentaTransaccionalService,
} = require('../services/ventaTransaccional.service');

async function getAllVentas(req, res) {
  try {
    const ventas = await ventaModel.getAllVentas();
    res.status(200).json(ventas);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener ventas', error: error.message });
  }
}

async function getVentaById(req, res) {
  try {
    const venta = await ventaModel.getVentaById(req.params.id);

    if (!venta) {
      return res.status(404).json({ message: 'Venta no encontrada' });
    }

    return res.status(200).json(venta);
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener venta', error: error.message });
  }
}

async function createVenta(req, res) {
  try {
    const {
      usuario_id,
      numero_factura,
      fecha_venta,
      subtotal,
      descuento,
      total,
      estado,
      observaciones,
      forma_pago,
    } = req.body;

    if (!usuario_id || !fecha_venta) {
      return res.status(400).json({ message: 'Los campos usuario_id y fecha_venta son obligatorios' });
    }

    const validEstados = ['pendiente', 'pagada', 'anulada', 'cancelada'];
    if (estado && !validEstados.includes(estado)) {
      return res.status(400).json({ message: 'El campo estado debe ser pendiente, pagada, anulada o cancelada' });
    }

    const venta = await ventaModel.createVenta({
      usuario_id,
      numero_factura,
      fecha_venta,
      subtotal,
      descuento,
      total,
      estado,
      observaciones,
      forma_pago,
    });

    return res.status(201).json(venta);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'El numero_factura ya existe' });
    }

    if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
      return res.status(400).json({ message: 'El usuario referenciado no existe' });
    }

    return res.status(500).json({ message: 'Error al crear venta', error: error.message });
  }
}

async function updateVenta(req, res) {
  try {
    const venta = await ventaModel.getVentaById(req.params.id);

    if (!venta) {
      return res.status(404).json({ message: 'Venta no encontrada' });
    }

    const validEstados = ['pendiente', 'pagada', 'anulada', 'cancelada'];
    if (req.body.estado && !validEstados.includes(req.body.estado)) {
      return res.status(400).json({ message: 'El campo estado debe ser pendiente, pagada, anulada o cancelada' });
    }

    const updated = await ventaModel.updateVenta(req.params.id, req.body);

    if (!updated) {
      return res.status(400).json({ message: 'No se enviaron datos para actualizar' });
    }

    const ventaActualizada = await ventaModel.getVentaById(req.params.id);
    return res.status(200).json(ventaActualizada);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'El numero_factura ya existe' });
    }

    if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
      return res.status(400).json({ message: 'El usuario referenciado no existe' });
    }

    return res.status(500).json({ message: 'Error al actualizar venta', error: error.message });
  }
}

async function deleteVenta(req, res) {
  try {
    const venta = await ventaModel.getVentaById(req.params.id);

    if (!venta) {
      return res.status(404).json({ message: 'Venta no encontrada' });
    }

    const result = await ventaModel.deleteVenta(req.params.id);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Venta no encontrada' });
    }

    return res.status(200).json({ message: 'Venta eliminada correctamente' });
  } catch (error) {
    return res.status(500).json({ message: 'Error al eliminar venta', error: error.message });
  }
}

async function createVentaTransaccional(req, res) {
  try {
    if (!req.user?.id_usuario) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    const result = await createVentaTransaccionalService(req.body, req.user.id_usuario);

    return res.status(201).json(result);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      message: error.message || 'Error al crear venta transaccional',
      error: error.message,
    });
  }
}

async function cambiarEstadoVentaTransaccional(req, res) {
  try {
    if (!req.user?.id_usuario) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    const result = await cambiarEstadoVentaTransaccionalService(
      req.params.id,
      req.body.estado,
      req.user.id_usuario
    );

    return res.status(200).json(result);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      message: error.message || 'Error al cambiar estado de venta',
      error: error.message,
    });
  }
}

module.exports = {
  getAllVentas,
  getVentaById,
  createVenta,
  createVentaTransaccional,
  cambiarEstadoVentaTransaccional,
  updateVenta,
  deleteVenta,
};
