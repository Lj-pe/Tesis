const express = require('express');
const movimientoInventarioController = require('../controllers/movimiento_inventario.controller');
const authorizeModule = require('../middleware/authorizeModule');

const router = express.Router();

router.get('/api/movimientos-inventario', authorizeModule('Movimientos'), movimientoInventarioController.getAllMovimientosInventario);
router.get('/api/movimientos-inventario/:id', authorizeModule('Movimientos'), movimientoInventarioController.getMovimientoInventarioById);
router.post('/api/movimientos-inventario/ajustes', authorizeModule('Movimientos'), movimientoInventarioController.crearAjuste);

module.exports = router;
