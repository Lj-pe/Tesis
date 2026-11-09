const authService = require('../services/auth.service');
const usuarioModel = require('../models/usuario.model');

async function login(req, res) {
  try {
    const result = await authService.login(req.body);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Error durante el login' });
  }
}

async function getMe(req, res) {
  return res.status(200).json(req.user);
}

async function cambiarClave(req, res) {
  try {
    const result = await authService.cambiarClave(
      req.user.id,
      req.body.clave_actual,
      req.body.clave_nueva
    );
    const usuario = await usuarioModel.getUsuarioById(req.user.id);
    return res.status(200).json({ ...result, user: usuario });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Error al cambiar clave' });
  }
}

module.exports = {
  login,
  getMe,
  cambiarClave,
};
