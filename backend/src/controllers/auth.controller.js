const authService = require('../services/auth.service');
const permisoModel = require('../models/permiso.model');

async function login(req, res) {
  try {
    const { username, email, password } = req.body;

    if ((!username && !email) || !password) {
      return res.status(400).json({
        message: 'Se requiere username o email y password',
      });
    }

    const result = await authService.login({ username, email, password });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      message: error.message || 'Error durante el login',
    });
  }
}

async function getMe(req, res) {
  try {
    const permisosGuardados = await permisoModel.getPermisosByRolId(req.user.rol_id);
    const permisosPorModulo = new Map(
      permisosGuardados.map(({ modulo, acceso }) => [modulo, Boolean(acceso)])
    );
    const permisos = permisoModel.MODULOS_PERMITIDOS.map((modulo) => ({
      modulo,
      acceso: permisosPorModulo.get(modulo) ?? false,
    }));

    return res.status(200).json({ ...req.user, permisos });
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener permisos del usuario', error: error.message });
  }
}

module.exports = {
  login,
  getMe,
};
