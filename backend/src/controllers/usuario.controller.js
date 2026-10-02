const bcrypt = require('bcryptjs');
const usuarioModel = require('../models/usuario.model');

async function getAllUsuarios(req, res) {
  try {
    const usuarios = await usuarioModel.getAllUsuarios();
    res.status(200).json(usuarios);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener usuarios', error: error.message });
  }
}

async function getUsuarioById(req, res) {
  try {
    const usuario = await usuarioModel.getUsuarioById(req.params.id);

    if (!usuario) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    return res.status(200).json(usuario);
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener usuario', error: error.message });
  }
}

async function createUsuario(req, res) {
  try {
    const {
      rol_id,
      nombre,
      apellido,
      username,
      email,
      password,
      password_hash,
      estado,
      ultimo_acceso,
    } = req.body;

    if (!rol_id || !nombre || !apellido || !username || !email || (!password && !password_hash)) {
      return res.status(400).json({
        message: 'Los campos rol_id, nombre, apellido, username, email y password son obligatorios',
      });
    }

    const passwordHash = password ? await bcrypt.hash(password, 10) : password_hash;

    const usuario = await usuarioModel.createUsuario({
      rol_id,
      nombre,
      apellido,
      username,
      email,
      password_hash: passwordHash,
      estado,
      ultimo_acceso,
    });

    return res.status(201).json(usuario);
  } catch (error) {
    return res.status(500).json({ message: 'Error al crear usuario', error: error.message });
  }
}

async function updateUsuario(req, res) {
  try {
    const usuario = await usuarioModel.getUsuarioById(req.params.id);

    if (!usuario) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const payload = { ...req.body };
    const esPropioUsuario = Number(req.user?.id_usuario) === Number(req.params.id);
    const cambiaRol = payload.rol_id !== undefined && Number(payload.rol_id) !== Number(usuario.rol_id);
    const cambiaEstado = payload.estado !== undefined && payload.estado !== usuario.estado;

    if (esPropioUsuario && (cambiaRol || cambiaEstado)) {
      return res.status(400).json({ message: 'No puedes cambiar tu propio rol o estado' });
    }

    if (payload.password) {
      payload.password_hash = await bcrypt.hash(payload.password, 10);
      delete payload.password;
    }

    const updated = await usuarioModel.updateUsuario(req.params.id, payload);

    if (!updated) {
      return res.status(400).json({ message: 'No se enviaron datos para actualizar' });
    }

    const usuarioActualizado = await usuarioModel.getUsuarioById(req.params.id);
    return res.status(200).json(usuarioActualizado);
  } catch (error) {
    return res.status(500).json({ message: 'Error al actualizar usuario', error: error.message });
  }
}

async function deleteUsuario(req, res) {
  try {
    const usuario = await usuarioModel.getUsuarioById(req.params.id);

    if (!usuario) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const result = await usuarioModel.deleteUsuario(req.params.id);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    return res.status(200).json({ message: 'Usuario eliminado correctamente' });
  } catch (error) {
    return res.status(500).json({ message: 'Error al eliminar usuario', error: error.message });
  }
}

module.exports = {
  getAllUsuarios,
  getUsuarioById,
  createUsuario,
  updateUsuario,
  deleteUsuario,
};
