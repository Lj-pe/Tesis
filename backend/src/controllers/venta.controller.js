const ventaModel = require('../models/venta.model');
const {
  crearVentaTransaccional,
  anularVentaTransaccional,
} = require('../services/ventaTransaccional.service');
const { normalizeDecimal } = require('../utils/decimal');

const isDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const isUuid = (value) => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const isId = (value) => /^\d+$/.test(String(value)) && BigInt(value) > 0n;
const normalizePrice = (value) => normalizeDecimal(value, 12, 2);

async function getAllVentas(req, res) {
  try { return res.status(200).json(await ventaModel.getAllVentas()); }
  catch (error) { return res.status(500).json({ message: 'Error al obtener ventas', error: error.message }); }
}

async function getVentaById(req, res) {
  try {
    const venta = await ventaModel.getVentaById(req.params.id);
    if (!venta) return res.status(404).json({ message: 'Venta no encontrada' });
    return res.status(200).json(venta);
  } catch (error) { return res.status(500).json({ message: 'Error al obtener venta', error: error.message }); }
}

async function createVentaTransaccional(req, res) {
  const { numero, clave_operacion, fecha_comercial, medio_pago, detalles } = req.body;
  const medios = ['efectivo', 'electronico', 'yape', 'plin'];
  if (typeof numero !== 'string' || !numero.trim() || numero.length > 30 ||
      !isUuid(clave_operacion) || !isDate(fecha_comercial) || !medios.includes(medio_pago) ||
      !Array.isArray(detalles) || detalles.length === 0 ||
      detalles.some((detail) => !isId(detail.producto_id) ||
        !Number.isInteger(detail.cantidad) || detail.cantidad < 1 ||
        detail.cantidad > 4294967295 || normalizePrice(detail.precio_unitario) === null)) {
    return res.status(400).json({ message: 'Datos de venta inválidos' });
  }
  try {
    const result = await crearVentaTransaccional({
      numero: numero.trim(), clave_operacion, fecha_comercial, medio_pago,
      detalles: detalles.map((detail) => ({
        producto_id: String(detail.producto_id),
        cantidad: detail.cantidad,
        precio_unitario: normalizePrice(detail.precio_unitario),
      })),
    }, req.user.id);
    return res.status(result.duplicada ? 200 : 201).json(result);
  } catch (error) {
    return res.status(error.statusCode || (error.code === 'ER_DUP_ENTRY' ? 409 : 500)).json({
      message: error.message || 'Error al registrar venta',
    });
  }
}

async function anularVenta(req, res) {
  const { fecha_comercial, motivo_anulacion } = req.body;
  if (!isDate(fecha_comercial) ||
      (motivo_anulacion !== undefined && motivo_anulacion !== null &&
        typeof motivo_anulacion !== 'string')) {
    return res.status(400).json({ message: 'Datos de anulación inválidos' });
  }
  try {
    const result = await anularVentaTransaccional(
      req.params.id, { fecha_comercial, motivo_anulacion }, req.user.id
    );
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.statusCode || (error.code === 'ER_DUP_ENTRY' ? 409 : 500)).json({
      message: error.message || 'Error al anular venta',
    });
  }
}

module.exports = { getAllVentas, getVentaById, createVentaTransaccional, anularVenta };
