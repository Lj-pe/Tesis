const express = require('express');
const inventarioController = require('../controllers/inventario.controller');

const router = express.Router();

router.get('/api/inventarios', inventarioController.getAllInventarios);
router.get('/api/inventarios/:id', inventarioController.getInventarioById);
router.post('/api/inventarios', inventarioController.createInventario);
router.put('/api/inventarios/:id', inventarioController.updateInventario);
router.delete('/api/inventarios/:id', inventarioController.deleteInventario);

module.exports = router;
