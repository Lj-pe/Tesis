function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    const userRoleId = req.user.rol_id;
    const userRoleName = req.user.rol && req.user.rol.nombre ? req.user.rol.nombre : null;

    const allowed = allowedRoles.some((role) => {
      const normalizedRole = String(role);
      return normalizedRole === String(userRoleId) || normalizedRole === String(userRoleName);
    });

    if (!allowed) {
      return res.status(403).json({ message: 'No tienes permisos para acceder a este recurso' });
    }

    return next();
  };
}

module.exports = {
  authorizeRoles,
};
