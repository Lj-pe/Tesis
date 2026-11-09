const { randomUUID } = require('crypto');
const movimientoModel = require('../models/movimiento_inventario.model');

async function registrarMovimiento(connection, movimiento) {
  return movimientoModel.createMovimiento(connection, {
    clave_operacion: randomUUID(),
    ...movimiento,
  });
}

async function registrarEntrada(connection, movimiento) {
  return registrarMovimiento(connection, {
    ...movimiento,
    tipo: movimiento.tipo || 'recepcion',
    variacion_unidades: String(movimiento.cantidad),
  });
}

async function registrarSalida(connection, movimiento) {
  return registrarMovimiento(connection, {
    ...movimiento,
    tipo: movimiento.tipo || 'venta',
    variacion_unidades: String(-BigInt(movimiento.cantidad)),
  });
}

module.exports = { registrarMovimiento, registrarEntrada, registrarSalida };
