const express = require('express');
const detalleCompraController = require('../controllers/detalle_compra.controller');

const router = express.Router();

router.get('/api/detalle-compras', detalleCompraController.getAllDetalleCompras);
router.get('/api/detalle-compras/:id', detalleCompraController.getDetalleCompraById);
router.post('/api/detalle-compras', detalleCompraController.createDetalleCompra);
router.put('/api/detalle-compras/:id', detalleCompraController.updateDetalleCompra);
router.delete('/api/detalle-compras/:id', detalleCompraController.deleteDetalleCompra);

module.exports = router;
