const express = require('express');
const inventarioController = require('../controllers/inventario.controller');
const authorizeModule = require('../middleware/authorizeModule');
const authorizeAction = require('../middleware/authorizeAction');

const router = express.Router();

router.get('/api/inventarios', authorizeModule('Inventario'), inventarioController.getAllInventarios);
router.get('/api/inventarios/:id', authorizeModule('Inventario'), inventarioController.getInventarioById);
router.get('/api/existencias', authorizeModule('Inventario'), inventarioController.getAllInventarios);
router.get('/api/existencias/:productoId', authorizeModule('Inventario'), (req, res) => {
  req.params.id = req.params.productoId;
  return inventarioController.getInventarioById(req, res);
});

module.exports = router;
