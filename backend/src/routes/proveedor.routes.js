const express = require('express');
const proveedorController = require('../controllers/proveedor.controller');
const authorizeModule = require('../middleware/authorizeModule');

const router = express.Router();

router.use(authorizeModule('Proveedores'));

router.get('/', proveedorController.getAllProveedores);
router.get('/catalogo', proveedorController.getCatalogo);
router.post('/catalogo', proveedorController.createCatalogo);
router.put('/catalogo/:id', proveedorController.updateCatalogo);
router.get('/:id', proveedorController.getProveedorById);
router.post('/', proveedorController.createProveedor);
router.put('/:id', proveedorController.updateProveedor);
router.delete('/:id', proveedorController.deleteProveedor);
router.get('/:id/dias-pedido', proveedorController.getDiasPedido);
router.put('/:id/dias-pedido', proveedorController.setDiasPedido);

module.exports = router;
