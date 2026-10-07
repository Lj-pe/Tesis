const ventaModel = require('../models/venta.model');
const compraModel = require('../models/compra.model');
const productoModel = require('../models/producto.model');
const inventarioModel = require('../models/inventario.model');
const movimientoInventarioModel = require('../models/movimiento_inventario.model');
const detalleCompraModel = require('../models/detalle_compra.model');

async function getDatosReportes(req, res) {
  try {
    const [ventas, compras, productos, inventarios, movimientos, detallesCompras] = await Promise.all([
      ventaModel.getAllVentas(),
      compraModel.getAllCompras(),
      productoModel.getAllProductos(),
      inventarioModel.getAllInventarios(),
      movimientoInventarioModel.getAllMovimientosInventario(),
      detalleCompraModel.getAllDetalleCompras(),
    ]);

    return res.status(200).json({
      ventas,
      compras,
      productos,
      inventarios,
      movimientos,
      detallesCompras,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Error al obtener datos de reportes',
      error: error.message,
    });
  }
}

module.exports = {
  getDatosReportes,
};
