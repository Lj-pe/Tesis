const express = require('express');
const productoController = require('../controllers/producto.controller');

const router = express.Router();

router.get('/api/productos', productoController.getAllProductos);
router.get('/api/productos/:id', productoController.getProductoById);
router.post('/api/productos', productoController.createProducto);
router.put('/api/productos/:id', productoController.updateProducto);
router.delete('/api/productos/:id', productoController.deleteProducto);

module.exports = router;
