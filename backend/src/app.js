const express = require('express');
const cors = require('cors');
const pool = require('./config/database');
const authRoutes = require('./routes/auth.routes');
const categoriaRoutes = require('./routes/categoria.routes');
const productoRoutes = require('./routes/producto.routes');
const inventarioRoutes = require('./routes/inventario.routes');
const rolRoutes = require('./routes/rol.routes');
const prediccionRoutes = require('./routes/prediccion.routes');
const proveedorRoutes = require('./routes/proveedor.routes');
const compraRoutes = require('./routes/compra.routes');
const usuarioRoutes = require('./routes/usuario.routes');
const detalleCompraRoutes = require('./routes/detalle_compra.routes');
const ventaRoutes = require('./routes/venta.routes');
const detalleVentaRoutes = require('./routes/detalle_venta.routes');
const movimientoInventarioRoutes = require('./routes/movimiento_inventario.routes');
const authMiddleware = require('./middleware/authMiddleware');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');

    if (rows && rows.length > 0) {
      res.status(200).json({ status: 'ok' });
      return;
    }

    res.status(500).json({ status: 'error', message: 'No se obtuvo respuesta válida de MySQL' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'No se pudo conectar a MySQL' });
  }
});

app.use('/api/auth', authRoutes);
app.use(authMiddleware);
app.use(categoriaRoutes);
app.use(productoRoutes);
app.use(inventarioRoutes);
app.use(rolRoutes);
app.use(prediccionRoutes);
app.use(proveedorRoutes);
app.use(compraRoutes);
app.use(usuarioRoutes);
app.use(detalleCompraRoutes);
app.use(ventaRoutes);
app.use(detalleVentaRoutes);
app.use(movimientoInventarioRoutes);

module.exports = app;
