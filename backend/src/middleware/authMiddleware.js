const usuarioModel = require('../models/usuario.model');
const rolModel = require('../models/rol.model');
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

    const user = await usuarioModel.getUsuarioById(decoded.id_usuario);

    if (!user) {
      return res.status(401).json({ message: 'Usuario no autorizado' });
    }

    if (user.estado !== 'activo') {
      return res.status(401).json({ message: 'Usuario no autorizado' });
    }

    const role = await rolModel.getRolById(user.rol_id);

    req.user = {
      id_usuario: user.id_usuario,
      rol_id: user.rol_id,
      nombre: user.nombre,
      apellido: user.apellido,
      username: user.username,
      email: user.email,
      estado: user.estado,
      ultimo_acceso: user.ultimo_acceso,
      fecha_creacion: user.fecha_creacion,
      fecha_actualizacion: user.fecha_actualizacion,
      rol: role
        ? {
            id_rol: role.id_rol,
            nombre: role.nombre,
            estado: role.estado,
          }
        : null,
    };

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
