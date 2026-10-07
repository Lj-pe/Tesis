const express = require('express');
const usuarioController = require('../controllers/usuario.controller');
const { authorizeRoles } = require('../middleware/authorizeMiddleware');
const authorizeModule = require('../middleware/authorizeModule');

const router = express.Router();

router.get('/api/usuarios', authorizeRoles('Administrador'), authorizeModule('Usuarios'), usuarioController.getAllUsuarios);
router.get('/api/usuarios/:id', authorizeRoles('Administrador'), authorizeModule('Usuarios'), usuarioController.getUsuarioById);
router.post('/api/usuarios', authorizeRoles('Administrador'), authorizeModule('Usuarios'), usuarioController.createUsuario);
router.put('/api/usuarios/:id', authorizeRoles('Administrador'), authorizeModule('Usuarios'), usuarioController.updateUsuario);
router.delete('/api/usuarios/:id', authorizeRoles('Administrador'), authorizeModule('Usuarios'), usuarioController.deleteUsuario);

module.exports = router;
