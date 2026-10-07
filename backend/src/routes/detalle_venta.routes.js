const express = require('express');
const detalleVentaController = require('../controllers/detalle_venta.controller');
const authorizeModule = require('../middleware/authorizeModule');

const router = express.Router();

router.get('/api/detalle-ventas', authorizeModule('Ventas'), detalleVentaController.getAllDetalleVentas);
router.get('/api/detalle-ventas/:id', authorizeModule('Ventas'), detalleVentaController.getDetalleVentaById);
router.post('/api/detalle-ventas', authorizeModule('Ventas'), detalleVentaController.createDetalleVenta);
router.put('/api/detalle-ventas/:id', authorizeModule('Ventas'), detalleVentaController.updateDetalleVenta);
router.delete('/api/detalle-ventas/:id', authorizeModule('Ventas'), detalleVentaController.deleteDetalleVenta);

module.exports = router;
