const pool = require('../config/database');
const ventaModel = require('../models/venta.model');
const compraModel = require('../models/compra.model');
const productoModel = require('../models/producto.model');
const inventarioModel = require('../models/inventario.model');
const movimientoInventarioModel = require('../models/movimiento_inventario.model');
const detalleCompraModel = require('../models/detalle_compra.model');
const detalleVentaModel = require('../models/detalle_venta.model');
const categoriaModel = require('../models/categoria.model');
const proveedorModel = require('../models/proveedor.model');

async function getDatosReportes(req, res) {
  try {
    const [
      ventas, compras, productos, existencias, movimientos, detallesCompras,
      detallesVentas, categorias, proveedores,
      saldosCompras, entregasPendientes, totalesVentas, ventasDiarias,
    ] = await Promise.all([
      ventaModel.getAllVentas(),
      compraModel.getAllCompras(),
      productoModel.getAllProductos(),
      inventarioModel.getAllExistencias(),
      movimientoInventarioModel.getAllMovimientosInventario(),
      detalleCompraModel.getAllDetalleCompras(),
      detalleVentaModel.getAllDetalleVentas(),
      categoriaModel.getAllCategorias(),
      proveedorModel.getAllProveedores(),
      pool.query('SELECT * FROM vista_saldos_compras').then(([rows]) => rows),
      pool.query('SELECT * FROM vista_entregas_pendientes').then(([rows]) => rows),
      pool.query('SELECT * FROM vista_totales_ventas').then(([rows]) => rows),
      pool.query('SELECT * FROM vista_ventas_diarias').then(([rows]) => rows),
    ]);

    const proveedorIds = new Set(
      proveedores
        .filter((proveedor) => typeof proveedor.nombre === 'string' && proveedor.nombre.trim())
        .map((proveedor) => String(proveedor.id))
    );
    if (compras.some((compra) => !proveedorIds.has(String(compra.proveedor_id)))) {
      throw new Error('Hay compras sin un proveedor válido en la base de datos');
    }

    return res.status(200).json({
      ventas, compras, productos, existencias, movimientos, detallesCompras,
      detallesVentas, categorias, proveedores,
      saldosCompras, entregasPendientes, totalesVentas, ventasDiarias,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Error al obtener datos de reportes',
      error: error.message,
    });
  }
}

module.exports = { getDatosReportes };
