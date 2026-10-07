const express = require('express');
const detalleCompraController = require('../controllers/detalle_compra.controller');
const authorizeModule = require('../middleware/authorizeModule');

const router = express.Router();

router.get('/api/detalle-compras', authorizeModule('Compras'), detalleCompraController.getAllDetalleCompras);
router.get('/api/detalle-compras/:id', authorizeModule('Compras'), detalleCompraController.getDetalleCompraById);
router.post('/api/detalle-compras', authorizeModule('Compras'), detalleCompraController.createDetalleCompra);
router.put('/api/detalle-compras/:id', authorizeModule('Compras'), detalleCompraController.updateDetalleCompra);
router.delete('/api/detalle-compras/:id', authorizeModule('Compras'), detalleCompraController.deleteDetalleCompra);

module.exports = router;
