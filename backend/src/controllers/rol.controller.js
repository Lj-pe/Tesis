const rolModel = require('../models/rol.model');

const ESTADOS_ROL_VALIDOS = ['activo', 'inactivo'];

function validarRolCreate(data) {
  const { nombre, descripcion, estado } = data;

  if (!nombre || nombre.trim() === '') {
    return 'El campo nombre es obligatorio';
  }

  if (typeof nombre !== 'string' || nombre.trim().length > 100) {
    return 'El campo nombre no debe superar 100 caracteres';
  }

  if (descripcion !== undefined && descripcion !== null && typeof descripcion !== 'string') {
    return 'El campo descripcion debe ser texto o NULL';
  }

  if (estado !== undefined && estado !== null && !ESTADOS_ROL_VALIDOS.includes(estado)) {
    return 'El campo estado debe ser activo o inactivo';
  }

  return null;
}

function validarRolUpdate(data) {
  const { nombre, descripcion, estado } = data;

  if (nombre !== undefined && nombre !== null && nombre !== '') {
    if (typeof nombre !== 'string' || nombre.trim().length > 100) {
      return 'El campo nombre no debe superar 100 caracteres';
    }
  }

  if (descripcion !== undefined && descripcion !== null && typeof descripcion !== 'string') {
    return 'El campo descripcion debe ser texto o NULL';
  }

  if (estado !== undefined && estado !== null && !ESTADOS_ROL_VALIDOS.includes(estado)) {
    return 'El campo estado debe ser activo o inactivo';
  }

  return null;
}

async function getAllRoles(req, res) {
  try {
    const roles = await rolModel.getAllRoles();
    res.status(200).json(roles);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener roles', error: error.message });
  }
}

async function getRolById(req, res) {
  try {
    const rol = await rolModel.getRolById(req.params.id);

    if (!rol) {
      return res.status(404).json({ message: 'Rol no encontrado' });
    }

    return res.status(200).json(rol);
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener rol', error: error.message });
  }
}

async function createRol(req, res) {
  try {
    const { nombre, descripcion, estado } = req.body;

    const errorValidacion = validarRolCreate({ nombre, descripcion, estado });

    if (errorValidacion) {
      return res.status(400).json({ message: errorValidacion });
    }

    const rol = await rolModel.createRol({
      nombre,
      descripcion,
      estado,
    });

    return res.status(201).json(rol);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Ya existe un rol con ese nombre' });
    }

    return res.status(500).json({ message: 'Error al crear rol', error: error.message });
  }
}

async function updateRol(req, res) {
  try {
    const rol = await rolModel.getRolById(req.params.id);

    if (!rol) {
      return res.status(404).json({ message: 'Rol no encontrado' });
    }

    const errorValidacion = validarRolUpdate(req.body);

    if (errorValidacion) {
      return res.status(400).json({ message: errorValidacion });
    }

    const updated = await rolModel.updateRol(req.params.id, req.body);

    if (!updated) {
      return res.status(400).json({ message: 'No se enviaron datos para actualizar' });
    }

    const rolActualizado = await rolModel.getRolById(req.params.id);
    return res.status(200).json(rolActualizado);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Ya existe un rol con ese nombre' });
    }

    return res.status(500).json({ message: 'Error al actualizar rol', error: error.message });
  }
}

async function deleteRol(req, res) {
  try {
    const rol = await rolModel.getRolById(req.params.id);

    if (!rol) {
      return res.status(404).json({ message: 'Rol no encontrado' });
    }

    const result = await rolModel.deleteRol(req.params.id);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Rol no encontrado' });
    }

    return res.status(200).json({ message: 'Rol eliminado correctamente' });
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
      return res.status(409).json({
        message: 'No se puede eliminar el rol porque está siendo utilizado por uno o más usuarios',
      });
    }

    return res.status(500).json({ message: 'Error al eliminar rol', error: error.message });
  }
}

module.exports = {
  getAllRoles,
  getRolById,
  createRol,
  updateRol,
  deleteRol,
};
