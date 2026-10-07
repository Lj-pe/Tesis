const permisoModel = require('../models/permiso.model');

function authorizeModule(moduleName) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    try {
      const permisos = await permisoModel.getPermisosByRolId(req.user.rol_id);
      const permisoModulo = permisos.find((permiso) => permiso.modulo === moduleName);

      if (!permisoModulo || !Boolean(permisoModulo.acceso)) {
        return res.status(403).json({
          message: `No tienes permiso para acceder al módulo ${moduleName}`,
        });
      }

      return next();
    } catch (error) {
      return res.status(500).json({
        message: 'Error al validar el permiso del módulo',
        error: error.message,
      });
    }
  };
}

module.exports = authorizeModule;
