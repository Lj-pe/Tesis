function authorizeAction(modulo, accion) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }
    return next();
  };
}

module.exports = authorizeAction;
