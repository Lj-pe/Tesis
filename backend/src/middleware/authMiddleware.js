const usuarioModel = require('../models/usuario.model');
const { verifyToken } = require('../utils/jwt');

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token no proporcionado' });
    }

    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      return res.status(401).json({ message: 'Token no proporcionado' });
    }

    const decoded = verifyToken(token);

    const user = await usuarioModel.getUsuarioById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: 'Usuario no autorizado' });
    }

    req.user = user;
    const debeCambiarClave = user.debe_cambiar_clave === true ||
      user.debe_cambiar_clave === 1 ||
      user.debe_cambiar_clave === '1';
    const rutaActual = `${req.baseUrl}${req.path}`.split('?')[0];
    const rutasPermitidas = ['/api/auth/me', '/api/auth/clave'];
    if (debeCambiarClave && !rutasPermitidas.includes(rutaActual)) {
      return res.status(403).json({ message: 'Debe cambiar su clave antes de continuar' });
    }

    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expirado' });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Token inválido' });
    }

    return res.status(500).json({ message: 'Error al validar autenticación' });
  }
}

module.exports = authMiddleware;
