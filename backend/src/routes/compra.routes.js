const express = require('express');
const compraController = require('../controllers/compra.controller');

const router = express.Router();

router.get('/api/compras', compraController.getAllCompras);
router.get('/api/compras/:id', compraController.getCompraById);
router.post('/api/compras', compraController.createCompra);
router.post('/api/compras/transaccional', compraController.createCompraTransaccional);
router.put('/api/compras/:id', compraController.updateCompra);
router.delete('/api/compras/:id', compraController.deleteCompra);

module.exports = router;
