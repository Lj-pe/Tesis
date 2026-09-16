const productoModel = require('../models/producto.model');

async function getAllProductos(req, res) {
  try {
    const productos = await productoModel.getAllProductos();
    res.status(200).json(productos);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener productos', error: error.message });
  }
}

async function getProductoById(req, res) {
  try {
    const producto = await productoModel.getProductoById(req.params.id);

    if (!producto) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    return res.status(200).json(producto);
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener producto', error: error.message });
  }
}

async function createProducto(req, res) {
  try {
    const {
      categoria_id,
      codigo_sku,
      nombre,
      descripcion,
      estado,
      unidad_medida,
      precio_venta_actual,
      costo_promedio_actual,
    } = req.body;

    if (!categoria_id || !codigo_sku || !nombre || !unidad_medida || precio_venta_actual === undefined) {
      return res.status(400).json({
        message: 'Los campos categoria_id, codigo_sku, nombre, unidad_medida y precio_venta_actual son obligatorios',
      });
    }

    const producto = await productoModel.createProducto({
      categoria_id,
      codigo_sku,
      nombre,
      descripcion,
      estado,
      unidad_medida,
      precio_venta_actual,
      costo_promedio_actual,
    });

    return res.status(201).json(producto);
  } catch (error) {
    return res.status(500).json({ message: 'Error al crear producto', error: error.message });
  }
}

async function updateProducto(req, res) {
  try {
    const producto = await productoModel.getProductoById(req.params.id);

    if (!producto) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    const updated = await productoModel.updateProducto(req.params.id, req.body);

    if (!updated) {
      return res.status(400).json({ message: 'No se enviaron datos para actualizar' });
    }

    const productoActualizado = await productoModel.getProductoById(req.params.id);
    return res.status(200).json(productoActualizado);
  } catch (error) {
    return res.status(500).json({ message: 'Error al actualizar producto', error: error.message });
  }
}

async function deleteProducto(req, res) {
  try {
    const producto = await productoModel.getProductoById(req.params.id);

    if (!producto) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    const result = await productoModel.deleteProducto(req.params.id);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    return res.status(200).json({ message: 'Producto eliminado correctamente' });
  } catch (error) {
    return res.status(500).json({ message: 'Error al eliminar producto', error: error.message });
  }
}

module.exports = {
  getAllProductos,
  getProductoById,
  createProducto,
  updateProducto,
  deleteProducto,
};
