const express = require('express');
const usuarioController = require('../controllers/usuario.controller');
const { authorizeRoles } = require('../middleware/authorizeMiddleware');

const router = express.Router();

router.get('/api/usuarios', authorizeRoles('Administrador'), usuarioController.getAllUsuarios);
router.get('/api/usuarios/:id', authorizeRoles('Administrador'), usuarioController.getUsuarioById);
router.post('/api/usuarios', authorizeRoles('Administrador'), usuarioController.createUsuario);
router.put('/api/usuarios/:id', authorizeRoles('Administrador'), usuarioController.updateUsuario);
router.delete('/api/usuarios/:id', authorizeRoles('Administrador'), usuarioController.deleteUsuario);

module.exports = router;
