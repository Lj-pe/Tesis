const proveedorModel = require('../models/proveedor.model');

async function getAllProveedores(req, res) {
  try {
    const proveedores = await proveedorModel.getAllProveedores();
    res.status(200).json(proveedores);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener proveedores', error: error.message });
  }
}

async function getProveedorById(req, res) {
  try {
    const proveedor = await proveedorModel.getProveedorById(req.params.id);

    if (!proveedor) {
      return res.status(404).json({ message: 'Proveedor no encontrado' });
    }

    return res.status(200).json(proveedor);
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener proveedor', error: error.message });
  }
}

async function createProveedor(req, res) {
  try {
    const {
      nombre,
      contacto,
      telefono,
      email,
      direccion,
      documento_identidad,
      estado,
    } = req.body;

    if (!nombre) {
      return res.status(400).json({ message: 'El campo nombre es obligatorio' });
    }

    const proveedor = await proveedorModel.createProveedor({
      nombre,
      contacto,
      telefono,
      email,
      direccion,
      documento_identidad,
      estado,
    });

    return res.status(201).json(proveedor);
  } catch (error) {
    return res.status(500).json({ message: 'Error al crear proveedor', error: error.message });
  }
}

async function updateProveedor(req, res) {
  try {
    const proveedor = await proveedorModel.getProveedorById(req.params.id);

    if (!proveedor) {
      return res.status(404).json({ message: 'Proveedor no encontrado' });
    }

    const updated = await proveedorModel.updateProveedor(req.params.id, req.body);

    if (!updated) {
      return res.status(400).json({ message: 'No se enviaron datos para actualizar' });
    }

    const proveedorActualizado = await proveedorModel.getProveedorById(req.params.id);
    return res.status(200).json(proveedorActualizado);
  } catch (error) {
    return res.status(500).json({ message: 'Error al actualizar proveedor', error: error.message });
  }
}

async function deleteProveedor(req, res) {
  try {
    const proveedor = await proveedorModel.getProveedorById(req.params.id);

    if (!proveedor) {
      return res.status(404).json({ message: 'Proveedor no encontrado' });
    }

    const result = await proveedorModel.deleteProveedor(req.params.id);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Proveedor no encontrado' });
    }

    return res.status(200).json({ message: 'Proveedor eliminado correctamente' });
  } catch (error) {
    return res.status(500).json({ message: 'Error al eliminar proveedor', error: error.message });
  }
}

module.exports = {
  getAllProveedores,
  getProveedorById,
  createProveedor,
  updateProveedor,
  deleteProveedor,
};
