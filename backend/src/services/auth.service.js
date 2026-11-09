const bcrypt = require('bcryptjs');
const usuarioModel = require('../models/usuario.model');
const { signToken } = require('../utils/jwt');

function perfilSeguro(usuario) {
  return {
    id: usuario.id,
    nombre_usuario: usuario.nombre_usuario,
    nombre: usuario.nombre,
    debe_cambiar_clave: Boolean(usuario.debe_cambiar_clave),
  };
}

async function login({ nombre_usuario, password }) {
  if (!nombre_usuario || !password) {
    throw Object.assign(new Error('Se requiere nombre_usuario y password'), { status: 400 });
  }
  const usuario = await usuarioModel.findByNombreUsuario(nombre_usuario);
  if (!usuario || !(await bcrypt.compare(password, usuario.clave_hash))) {
    throw Object.assign(new Error('Credenciales inválidas'), { status: 401 });
  }
  const user = perfilSeguro(usuario);
  return {
    token: signToken({ id: String(usuario.id), nombre_usuario: usuario.nombre_usuario }),
    user,
  };
}

async function cambiarClave(id, claveActual, claveNueva) {
  if (typeof claveNueva !== 'string' || claveNueva.length < 8) {
    throw Object.assign(new Error('La nueva clave debe tener al menos 8 caracteres'), { status: 400 });
  }
  const usuario = await usuarioModel.getUsuarioConClaveById(id);
  if (!usuario || !(await bcrypt.compare(claveActual || '', usuario.clave_hash))) {
    throw Object.assign(new Error('La clave actual no es válida'), { status: 401 });
  }
  const hash = await bcrypt.hash(claveNueva, 10);
  await usuarioModel.updateClave(id, hash);
  return { message: 'Clave actualizada' };
}

module.exports = { login, cambiarClave, perfilSeguro };
