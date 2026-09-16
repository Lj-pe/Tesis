const express = require('express');
const detalleVentaController = require('../controllers/detalle_venta.controller');

const router = express.Router();

router.get('/api/detalle-ventas', detalleVentaController.getAllDetalleVentas);
router.get('/api/detalle-ventas/:id', detalleVentaController.getDetalleVentaById);
router.post('/api/detalle-ventas', detalleVentaController.createDetalleVenta);
router.put('/api/detalle-ventas/:id', detalleVentaController.updateDetalleVenta);
router.delete('/api/detalle-ventas/:id', detalleVentaController.deleteDetalleVenta);

module.exports = router;
