const express = require('express');
const ventaController = require('../controllers/venta.controller');
const authorizeModule = require('../middleware/authorizeModule');

const router = express.Router();

router.get('/api/ventas', authorizeModule('Ventas'), ventaController.getAllVentas);
router.get('/api/ventas/:id', authorizeModule('Ventas'), ventaController.getVentaById);
router.post('/api/ventas', authorizeModule('Ventas'), ventaController.createVenta);
router.post('/api/ventas/transaccional', authorizeModule('Ventas'), ventaController.createVentaTransaccional);
router.post('/api/ventas/:id/estado', authorizeModule('Ventas'), ventaController.cambiarEstadoVentaTransaccional);
router.put('/api/ventas/:id', authorizeModule('Ventas'), ventaController.updateVenta);
router.delete('/api/ventas/:id', authorizeModule('Ventas'), ventaController.deleteVenta);

module.exports = router;
