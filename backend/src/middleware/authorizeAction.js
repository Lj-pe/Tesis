const permisoAccionModel = require('../models/permisoAccion.model');

function authorizeAction(modulo, accion) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    try {
      const tienePermiso = await permisoAccionModel.getPermisoAccion(
        req.user.rol_id,
        modulo,
        accion
      );

      if (!tienePermiso) {
        return res.status(403).json({
          message: `No tienes permiso para realizar la acción ${accion} en el módulo ${modulo}`,
        });
      }

      return next();
    } catch (error) {
      return res.status(500).json({
        message: 'Error al validar el permiso de la acción',
        error: error.message,
      });
    }
  };
}

module.exports = authorizeAction;
