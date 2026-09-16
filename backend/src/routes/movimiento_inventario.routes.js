const express = require('express');
const movimientoInventarioController = require('../controllers/movimiento_inventario.controller');

const router = express.Router();

router.get('/api/movimientos-inventario', movimientoInventarioController.getAllMovimientosInventario);
router.get('/api/movimientos-inventario/:id', movimientoInventarioController.getMovimientoInventarioById);
router.post('/api/movimientos-inventario', movimientoInventarioController.createMovimientoInventario);
router.put('/api/movimientos-inventario/:id', movimientoInventarioController.updateMovimientoInventario);
router.delete('/api/movimientos-inventario/:id', movimientoInventarioController.deleteMovimientoInventario);

module.exports = router;
