const bcrypt = require('bcryptjs');
const usuarioModel = require('../models/usuario.model');
const rolModel = require('../models/rol.model');
const { signToken } = require('../utils/jwt');

function buildSafeUserProfile(usuario, role) {
  return {
    id_usuario: usuario.id_usuario,
    rol_id: usuario.rol_id,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    username: usuario.username,
    email: usuario.email,
    estado: usuario.estado,
    ultimo_acceso: usuario.ultimo_acceso,
    fecha_creacion: usuario.fecha_creacion,
    fecha_actualizacion: usuario.fecha_actualizacion,
    rol: role
      ? {
          id_rol: role.id_rol,
          nombre: role.nombre,
          estado: role.estado,
        }
      : null,
  };
}

async function login({ username, email, password }) {
  if ((!username && !email) || !password) {
    throw {
      status: 400,
      message: 'Se requiere username o email y password',
    };
  }

  const user = await usuarioModel.findByUsernameOrEmail(username, email);

  if (!user || !user.password_hash) {
    throw {
      status: 401,
      message: 'Credenciales inválidas',
    };
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);

  if (!passwordMatches) {
    throw {
      status: 401,
      message: 'Credenciales inválidas',
    };
  }

  if (user.estado !== 'activo') {
    throw {
      status: 401,
      message: 'Usuario no autorizado',
    };
  }

  const role = await rolModel.getRolById(user.rol_id);

  if (!role) {
    throw {
      status: 401,
      message: 'Usuario no autorizado',
    };
  }

  const token = signToken({
    id_usuario: user.id_usuario,
    username: user.username,
    email: user.email,
    rol_id: user.rol_id,
    rol_nombre: role.nombre,
    estado: user.estado,
  });

  return {
    token,
    user: buildSafeUserProfile(user, role),
  };
}

module.exports = {
  login,
};
