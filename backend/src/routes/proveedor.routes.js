const express = require('express');
const proveedorController = require('../controllers/proveedor.controller');

const router = express.Router();

router.get('/api/proveedores', proveedorController.getAllProveedores);
router.get('/api/proveedores/:id', proveedorController.getProveedorById);
router.post('/api/proveedores', proveedorController.createProveedor);
router.put('/api/proveedores/:id', proveedorController.updateProveedor);
router.delete('/api/proveedores/:id', proveedorController.deleteProveedor);

module.exports = router;
