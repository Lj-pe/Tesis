const express = require('express');
const productoController = require('../controllers/producto.controller');
const authorizeModule = require('../middleware/authorizeModule');
const authorizeAction = require('../middleware/authorizeAction');

const router = express.Router();

router.get('/api/productos', authorizeModule('Productos'), authorizeAction('Productos', 'ver'), productoController.getAllProductos);
router.get('/api/productos/:id', authorizeModule('Productos'), authorizeAction('Productos', 'detalle'), productoController.getProductoById);
router.post('/api/productos', authorizeModule('Productos'), authorizeAction('Productos', 'crear'), productoController.createProducto);
router.put('/api/productos/:id', authorizeModule('Productos'), authorizeAction('Productos', 'editar'), productoController.updateProducto);
router.delete('/api/productos/:id', authorizeModule('Productos'), authorizeAction('Productos', 'eliminar'), productoController.deleteProducto);

module.exports = router;
