const compraModel = require('../models/compra.model');
const recepcionModel = require('../models/recepcion.model');
const {
  crearCompraTransaccional,
  crearRecepcionTransaccional,
} = require('../services/compraTransaccional.service');

const isDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const isUuid = (value) => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const isId = (value) => /^\d+$/.test(String(value)) && BigInt(value) > 0n;

async function getAllCompras(req, res) {
  try { return res.status(200).json(await compraModel.getAllCompras()); }
  catch (error) { return res.status(500).json({ message: 'Error al obtener compras', error: error.message }); }
}

async function getCompraById(req, res) {
  try {
    const compra = await compraModel.getCompraById(req.params.id);
    if (!compra) return res.status(404).json({ message: 'Compra no encontrada' });
    return res.status(200).json(compra);
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener compra', error: error.message });
  }
}

async function createCompraTransaccional(req, res) {
  const { numero, clave_operacion, proveedor_id, fecha_pedido, fecha_entrega_prevista, detalles } = req.body;
  if (typeof numero !== 'string' || !numero.trim() || numero.length > 30 ||
      !isUuid(clave_operacion) || !isId(proveedor_id) ||
      !isDate(fecha_pedido) || !isDate(fecha_entrega_prevista) ||
      !Array.isArray(detalles) || detalles.length === 0 ||
      detalles.some((detail) => !isId(detail.producto_proveedor_id) ||
        !Number.isInteger(detail.cantidad_presentaciones) ||
        detail.cantidad_presentaciones < 1 || detail.cantidad_presentaciones > 4294967295)) {
    return res.status(400).json({ message: 'Datos del pedido inválidos' });
  }
  try {
    const result = await crearCompraTransaccional({
      numero: numero.trim(), clave_operacion, proveedor_id: String(proveedor_id),
      fecha_pedido, fecha_entrega_prevista,
      detalles: detalles.map((detail) => ({
        producto_proveedor_id: String(detail.producto_proveedor_id),
        cantidad_presentaciones: detail.cantidad_presentaciones,
      })),
    }, req.user.id);
    return res.status(result.duplicada ? 200 : 201).json(result);
  } catch (error) {
    return res.status(error.statusCode || (error.code === 'ER_DUP_ENTRY' ? 409 : 500)).json({
      message: error.message || 'Error al registrar compra',
    });
  }
}

async function crearRecepcion(req, res) {
  const { numero, clave_operacion, fecha_comercial, observacion, detalles } = req.body;
  if (typeof numero !== 'string' || !numero.trim() || numero.length > 30 ||
      !isUuid(clave_operacion) || !isDate(fecha_comercial) ||
      !Array.isArray(detalles) || detalles.length === 0 ||
      detalles.some((detail) => !isId(detail.detalle_compra_id) ||
        !/^\d+$/.test(String(detail.unidades_recibidas)) ||
        BigInt(detail.unidades_recibidas) < 1n ||
        BigInt(detail.unidades_recibidas) > 18446744073709551615n)) {
    return res.status(400).json({ message: 'Datos de recepción inválidos' });
  }
  try {
    const result = await crearRecepcionTransaccional(req.params.id, {
      numero: numero.trim(), clave_operacion, fecha_comercial,
      observacion: observacion ?? null,
      detalles: detalles.map((detail) => ({
        detalle_compra_id: String(detail.detalle_compra_id),
        unidades_recibidas: String(detail.unidades_recibidas),
      })),
    }, req.user.id);
    const recepcion = await recepcionModel.getRecepcionById(result.recepcion_id);
    return res.status(result.duplicada ? 200 : 201).json({ ...result, recepcion });
  } catch (error) {
    return res.status(error.statusCode || (error.code === 'ER_DUP_ENTRY' ? 409 : 500)).json({
      message: error.message || 'Error al registrar recepción',
    });
  }
}

async function getAllRecepciones(req, res) {
  try { return res.status(200).json(await recepcionModel.getAllRecepciones()); }
  catch (error) { return res.status(500).json({ message: 'Error al obtener recepciones', error: error.message }); }
}

async function getRecepcionById(req, res) {
  try {
    const recepcion = await recepcionModel.getRecepcionById(req.params.id);
    if (!recepcion) return res.status(404).json({ message: 'Recepción no encontrada' });
    return res.status(200).json(recepcion);
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener recepción', error: error.message });
  }
}

module.exports = {
  getAllCompras, getCompraById, createCompraTransaccional, crearRecepcion,
  getAllRecepciones, getRecepcionById,
};
