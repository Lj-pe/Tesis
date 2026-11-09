const movimientoModel = require('../models/movimiento_inventario.model');
const { crearAjusteTransaccional } = require('../services/inventarioTransaccional.service');

async function getAllMovimientosInventario(req, res) {
  try {
    return res.status(200).json(await movimientoModel.getAllMovimientosInventario());
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener movimientos', error: error.message });
  }
}

async function getMovimientoInventarioById(req, res) {
  try {
    const movimiento = await movimientoModel.getMovimientoInventarioById(req.params.id);
    if (!movimiento) return res.status(404).json({ message: 'Movimiento no encontrado' });
    return res.status(200).json(movimiento);
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener movimiento', error: error.message });
  }
}

async function crearAjuste(req, res) {
  const { producto_id, variacion_unidades, fecha_comercial, motivo_ajuste, descripcion_ajuste, clave_operacion } = req.body;
  const parsedDate = typeof fecha_comercial === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha_comercial)
    ? new Date(`${fecha_comercial}T00:00:00Z`)
    : null;
  const validDate = parsedDate && !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === fecha_comercial;
  const validQuantity = /^-?[1-9]\d*$/.test(String(variacion_unidades)) &&
    BigInt(variacion_unidades) >= -9223372036854775808n &&
    BigInt(variacion_unidades) <= 9223372036854775807n;
  if (!/^\d+$/.test(String(producto_id)) || BigInt(producto_id) < 1n ||
      !validQuantity || !validDate ||
      typeof motivo_ajuste !== 'string' || !motivo_ajuste.trim() ||
      typeof clave_operacion !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clave_operacion)) {
    return res.status(400).json({ message: 'Datos de ajuste inválidos' });
  }
  try {
    const result = await crearAjusteTransaccional({
      producto_id: String(producto_id),
      variacion_unidades: String(variacion_unidades),
      fecha_comercial,
      motivo_ajuste,
      descripcion_ajuste: descripcion_ajuste || null,
      clave_operacion,
    }, req.user.id);
    return res.status(result.duplicado ? 200 : 201).json(result);
  } catch (error) {
    const status = error.statusCode ||
      (['ER_BAD_FIELD_ERROR', 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD'].includes(error.code) ? 400 : 500);
    return res.status(status).json({ message: error.message || 'Error al registrar ajuste' });
  }
}

module.exports = { getAllMovimientosInventario, getMovimientoInventarioById, crearAjuste };
