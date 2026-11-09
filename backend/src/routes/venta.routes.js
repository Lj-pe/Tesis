const express = require('express');
const ventaController = require('../controllers/venta.controller');
const authorizeModule = require('../middleware/authorizeModule');

const router = express.Router();

router.get('/api/ventas', authorizeModule('Ventas'), ventaController.getAllVentas);
router.get('/api/ventas/:id', authorizeModule('Ventas'), ventaController.getVentaById);
router.post('/api/ventas/transaccional', authorizeModule('Ventas'), ventaController.createVentaTransaccional);
router.post('/api/ventas/:id/anulacion', authorizeModule('Ventas'), ventaController.anularVenta);

module.exports = router;
