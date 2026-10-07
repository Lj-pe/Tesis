const express = require('express');
const proveedorController = require('../controllers/proveedor.controller');
const authorizeModule = require('../middleware/authorizeModule');

const router = express.Router();

router.use(authorizeModule('Proveedores'));

router.get('/', proveedorController.getAllProveedores);
router.get('/:id', proveedorController.getProveedorById);
router.post('/', proveedorController.createProveedor);
router.put('/:id', proveedorController.updateProveedor);
router.delete('/:id', proveedorController.deleteProveedor);

module.exports = router;
