const express = require('express');
const compraController = require('../controllers/compra.controller');
const authorizeModule = require('../middleware/authorizeModule');

const router = express.Router();

router.use(authorizeModule('Compras'));

router.get('/', compraController.getAllCompras);
router.get('/:id', compraController.getCompraById);
router.post('/', compraController.createCompra);
router.post('/transaccional', compraController.createCompraTransaccional);
router.post('/:id/estado', compraController.cambiarEstadoCompraTransaccional);
router.put('/:id', compraController.updateCompra);
router.delete('/:id', compraController.deleteCompra);

module.exports = router;
