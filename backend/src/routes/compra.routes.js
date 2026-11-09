const express = require('express');
const compraController = require('../controllers/compra.controller');
const authorizeModule = require('../middleware/authorizeModule');

const router = express.Router();

router.use(authorizeModule('Compras'));

router.get('/', compraController.getAllCompras);
router.get('/:id', compraController.getCompraById);
router.post('/transaccional', compraController.createCompraTransaccional);
router.post('/:id/recepciones', compraController.crearRecepcion);

module.exports = router;
