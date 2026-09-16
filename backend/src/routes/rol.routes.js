const express = require('express');
const rolController = require('../controllers/rol.controller');
const { authorizeRoles } = require('../middleware/authorizeMiddleware');

const router = express.Router();

router.get('/api/roles', authorizeRoles('Administrador'), rolController.getAllRoles);
router.get('/api/roles/:id', authorizeRoles('Administrador'), rolController.getRolById);
router.post('/api/roles', authorizeRoles('Administrador'), rolController.createRol);
router.put('/api/roles/:id', authorizeRoles('Administrador'), rolController.updateRol);
router.delete('/api/roles/:id', authorizeRoles('Administrador'), rolController.deleteRol);

module.exports = router;
