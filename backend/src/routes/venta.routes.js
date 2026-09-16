const express = require('express');
const ventaController = require('../controllers/venta.controller');

const router = express.Router();

router.get('/api/ventas', ventaController.getAllVentas);
router.get('/api/ventas/:id', ventaController.getVentaById);
router.post('/api/ventas', ventaController.createVenta);
router.post('/api/ventas/transaccional', ventaController.createVentaTransaccional);
router.put('/api/ventas/:id', ventaController.updateVenta);
router.delete('/api/ventas/:id', ventaController.deleteVenta);

module.exports = router;
