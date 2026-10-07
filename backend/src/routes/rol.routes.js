const express = require('express');
const rolController = require('../controllers/rol.controller');
const { authorizeRoles } = require('../middleware/authorizeMiddleware');
const authorizeModule = require('../middleware/authorizeModule');

const router = express.Router();

router.get('/api/roles', authorizeRoles('Administrador'), authorizeModule('Roles'), rolController.getAllRoles);
router.get('/api/roles/:id/permisos', authorizeRoles('Administrador'), authorizeModule('Roles'), rolController.getPermisosByRolId);
router.put('/api/roles/:id/permisos', authorizeRoles('Administrador'), authorizeModule('Roles'), rolController.guardarPermisosByRolId);
router.get('/api/roles/:id', authorizeRoles('Administrador'), authorizeModule('Roles'), rolController.getRolById);
router.post('/api/roles', authorizeRoles('Administrador'), authorizeModule('Roles'), rolController.createRol);
router.put('/api/roles/:id', authorizeRoles('Administrador'), authorizeModule('Roles'), rolController.updateRol);
router.delete('/api/roles/:id', authorizeRoles('Administrador'), authorizeModule('Roles'), rolController.deleteRol);

module.exports = router;
