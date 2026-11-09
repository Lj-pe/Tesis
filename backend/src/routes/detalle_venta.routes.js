const express = require('express');
const detalleVentaController = require('../controllers/detalle_venta.controller');
const authorizeModule = require('../middleware/authorizeModule');

const router = express.Router();

router.get('/api/detalle-ventas', authorizeModule('Ventas'), detalleVentaController.getAllDetalleVentas);
router.get('/api/detalle-ventas/:id', authorizeModule('Ventas'), detalleVentaController.getDetalleVentaById);

module.exports = router;
