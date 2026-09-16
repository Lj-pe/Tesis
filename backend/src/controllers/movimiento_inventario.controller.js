const movimientoInventarioModel = require('../models/movimiento_inventario.model');

async function getAllMovimientosInventario(req, res) {
  try {
    const movimientosInventario = await movimientoInventarioModel.getAllMovimientosInventario();
    res.status(200).json(movimientosInventario);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener movimientos de inventario', error: error.message });
  }
}

async function getMovimientoInventarioById(req, res) {
  try {
    const movimientoInventario = await movimientoInventarioModel.getMovimientoInventarioById(req.params.id);

    if (!movimientoInventario) {
      return res.status(404).json({ message: 'Movimiento de inventario no encontrado' });
    }

    return res.status(200).json(movimientoInventario);
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener movimiento de inventario', error: error.message });
  }
}

async function createMovimientoInventario(req, res) {
  try {
    const {
      inventario_id,
      tipo_movimiento,
      cantidad,
      motivo,
      compra_id,
      venta_id,
      usuario_id,
      fecha_movimiento,
      estado,
      observaciones,
    } = req.body;

    if (!inventario_id || !tipo_movimiento || !cantidad || !usuario_id) {
      return res.status(400).json({
        message: 'Los campos inventario_id, tipo_movimiento, cantidad y usuario_id son obligatorios',
      });
    }

    const tiposValidos = ['entrada', 'salida', 'ajuste', 'devolucion', 'perdida'];
    if (!tiposValidos.includes(tipo_movimiento)) {
      return res.status(400).json({ message: 'El campo tipo_movimiento debe ser entrada, salida, ajuste, devolucion o perdida' });
    }

    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      return res.status(400).json({ message: 'La cantidad debe ser un entero mayor que 0' });
    }

    const estadosValidos = ['confirmado', 'anulado'];
    if (estado && !estadosValidos.includes(estado)) {
      return res.status(400).json({ message: 'El campo estado debe ser confirmado o anulado' });
    }

    const movimientoInventario = await movimientoInventarioModel.createMovimientoInventario({
      inventario_id,
      tipo_movimiento,
      cantidad,
      motivo,
      compra_id,
      venta_id,
      usuario_id,
      fecha_movimiento,
      estado,
      observaciones,
    });

    return res.status(201).json(movimientoInventario);
  } catch (error) {
    if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
      return res.status(400).json({ message: 'Uno o más identificadores referenciados no existen' });
    }

    return res.status(500).json({ message: 'Error al crear movimiento de inventario', error: error.message });
  }
}

async function updateMovimientoInventario(req, res) {
  try {
    const movimientoInventario = await movimientoInventarioModel.getMovimientoInventarioById(req.params.id);

    if (!movimientoInventario) {
      return res.status(404).json({ message: 'Movimiento de inventario no encontrado' });
    }

    if (req.body.cantidad !== undefined && (!Number.isInteger(req.body.cantidad) || req.body.cantidad <= 0)) {
      return res.status(400).json({ message: 'La cantidad debe ser un entero mayor que 0' });
    }

    if (req.body.tipo_movimiento !== undefined) {
      const tiposValidos = ['entrada', 'salida', 'ajuste', 'devolucion', 'perdida'];
      if (!tiposValidos.includes(req.body.tipo_movimiento)) {
        return res.status(400).json({ message: 'El campo tipo_movimiento debe ser entrada, salida, ajuste, devolucion o perdida' });
      }
    }

    if (req.body.estado !== undefined) {
      const estadosValidos = ['confirmado', 'anulado'];
      if (!estadosValidos.includes(req.body.estado)) {
        return res.status(400).json({ message: 'El campo estado debe ser confirmado o anulado' });
      }
    }

    const updated = await movimientoInventarioModel.updateMovimientoInventario(req.params.id, req.body);

    if (!updated) {
      return res.status(400).json({ message: 'No se enviaron datos para actualizar' });
    }

    const movimientoInventarioActualizado = await movimientoInventarioModel.getMovimientoInventarioById(req.params.id);
    return res.status(200).json(movimientoInventarioActualizado);
  } catch (error) {
    if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
      return res.status(400).json({ message: 'Uno o más identificadores referenciados no existen' });
    }

    return res.status(500).json({ message: 'Error al actualizar movimiento de inventario', error: error.message });
  }
}

async function deleteMovimientoInventario(req, res) {
  try {
    const movimientoInventario = await movimientoInventarioModel.getMovimientoInventarioById(req.params.id);

    if (!movimientoInventario) {
      return res.status(404).json({ message: 'Movimiento de inventario no encontrado' });
    }

    const result = await movimientoInventarioModel.deleteMovimientoInventario(req.params.id);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Movimiento de inventario no encontrado' });
    }

    return res.status(200).json({ message: 'Movimiento de inventario eliminado correctamente' });
  } catch (error) {
    return res.status(500).json({ message: 'Error al eliminar movimiento de inventario', error: error.message });
  }
}

module.exports = {
  getAllMovimientosInventario,
  getMovimientoInventarioById,
  createMovimientoInventario,
  updateMovimientoInventario,
  deleteMovimientoInventario,
};
