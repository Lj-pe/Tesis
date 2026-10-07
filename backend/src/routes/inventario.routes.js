const express = require('express');
const inventarioController = require('../controllers/inventario.controller');
const authorizeModule = require('../middleware/authorizeModule');
const authorizeAction = require('../middleware/authorizeAction');

const router = express.Router();

router.get('/api/inventarios', authorizeModule('Inventario'), authorizeAction('Inventario', 'ver'), inventarioController.getAllInventarios);
router.get('/api/inventarios/:id', authorizeModule('Inventario'), authorizeAction('Inventario', 'detalle'), inventarioController.getInventarioById);
router.post('/api/inventarios', authorizeModule('Inventario'), authorizeAction('Inventario', 'crear'), inventarioController.createInventario);
router.put('/api/inventarios/:id', authorizeModule('Inventario'), authorizeAction('Inventario', 'editar'), inventarioController.updateInventario);
router.delete('/api/inventarios/:id', authorizeModule('Inventario'), authorizeAction('Inventario', 'eliminar'), inventarioController.deleteInventario);

module.exports = router;
