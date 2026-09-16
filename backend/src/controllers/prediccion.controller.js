const prediccionModel = require('../models/prediccion.model');

const ESTADOS_PREDICCION_VALIDOS = ['generada', 'aprobada', 'descartada'];

function validarPrediccionCreate(data) {
  const {
    producto_id,
    periodo_inicio,
    periodo_fin,
    metodo_prediccion,
    valor_predicho,
    intervalo_confianza,
    estado,
    fecha_aplicacion,
    observaciones,
  } = data;

  if (producto_id === undefined || producto_id === null || producto_id === '') {
    return 'El campo producto_id es obligatorio';
  }

  if (!Number.isInteger(producto_id) || producto_id <= 0) {
    return 'El campo producto_id debe ser un entero positivo';
  }

  if (!periodo_inicio || !/^\d{4}-\d{2}-\d{2}$/.test(periodo_inicio)) {
    return 'El campo periodo_inicio debe ser una fecha válida en formato YYYY-MM-DD';
  }

  if (!periodo_fin || !/^\d{4}-\d{2}-\d{2}$/.test(periodo_fin)) {
    return 'El campo periodo_fin debe ser una fecha válida en formato YYYY-MM-DD';
  }

  if (!metodo_prediccion || typeof metodo_prediccion !== 'string' || metodo_prediccion.trim().length === 0) {
    return 'El campo metodo_prediccion es obligatorio';
  }

  if (metodo_prediccion.trim().length > 100) {
    return 'El campo metodo_prediccion no debe superar 100 caracteres';
  }

  if (valor_predicho === undefined || valor_predicho === null || valor_predicho === '') {
    return 'El campo valor_predicho es obligatorio';
  }

  if (typeof valor_predicho !== 'number' || Number.isNaN(valor_predicho)) {
    return 'El campo valor_predicho debe ser numérico';
  }

  if (intervalo_confianza !== undefined && intervalo_confianza !== null && intervalo_confianza !== '') {
    if (typeof intervalo_confianza !== 'number' || Number.isNaN(intervalo_confianza)) {
      return 'El campo intervalo_confianza debe ser numérico o NULL';
    }
  }

  if (estado !== undefined && estado !== null && !ESTADOS_PREDICCION_VALIDOS.includes(estado)) {
    return 'El campo estado debe ser generada, aprobada o descartada';
  }

  if (fecha_aplicacion !== undefined && fecha_aplicacion !== null && fecha_aplicacion !== '') {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?$/.test(fecha_aplicacion) && !/^\d{4}-\d{2}-\d{2}$/.test(fecha_aplicacion)) {
      return 'El campo fecha_aplicacion debe ser una fecha válida';
    }
  }

  if (observaciones !== undefined && observaciones !== null && typeof observaciones !== 'string') {
    return 'El campo observaciones debe ser texto o NULL';
  }

  return null;
}

function validarPrediccionUpdate(data) {
  const {
    producto_id,
    periodo_inicio,
    periodo_fin,
    metodo_prediccion,
    valor_predicho,
    intervalo_confianza,
    estado,
    fecha_aplicacion,
    observaciones,
  } = data;

  if (producto_id !== undefined && producto_id !== null && producto_id !== '' && (!Number.isInteger(producto_id) || producto_id <= 0)) {
    return 'El campo producto_id debe ser un entero positivo';
  }

  if (periodo_inicio !== undefined && periodo_inicio !== null && periodo_inicio !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(periodo_inicio)) {
    return 'El campo periodo_inicio debe ser una fecha válida en formato YYYY-MM-DD';
  }

  if (periodo_fin !== undefined && periodo_fin !== null && periodo_fin !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(periodo_fin)) {
    return 'El campo periodo_fin debe ser una fecha válida en formato YYYY-MM-DD';
  }

  if (metodo_prediccion !== undefined && metodo_prediccion !== null && metodo_prediccion !== '' && (typeof metodo_prediccion !== 'string' || metodo_prediccion.trim().length > 100)) {
    return 'El campo metodo_prediccion no debe superar 100 caracteres';
  }

  if (valor_predicho !== undefined && valor_predicho !== null && valor_predicho !== '' && (typeof valor_predicho !== 'number' || Number.isNaN(valor_predicho))) {
    return 'El campo valor_predicho debe ser numérico';
  }

  if (intervalo_confianza !== undefined && intervalo_confianza !== null && intervalo_confianza !== '' && (typeof intervalo_confianza !== 'number' || Number.isNaN(intervalo_confianza))) {
    return 'El campo intervalo_confianza debe ser numérico o NULL';
  }

  if (estado !== undefined && estado !== null && !ESTADOS_PREDICCION_VALIDOS.includes(estado)) {
    return 'El campo estado debe ser generada, aprobada o descartada';
  }

  if (fecha_aplicacion !== undefined && fecha_aplicacion !== null && fecha_aplicacion !== '' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?$/.test(fecha_aplicacion) && !/^\d{4}-\d{2}-\d{2}$/.test(fecha_aplicacion)) {
    return 'El campo fecha_aplicacion debe ser una fecha válida';
  }

  if (observaciones !== undefined && observaciones !== null && typeof observaciones !== 'string') {
    return 'El campo observaciones debe ser texto o NULL';
  }

  return null;
}

async function getAllPredicciones(req, res) {
  try {
    const predicciones = await prediccionModel.getAllPredicciones();
    res.status(200).json(predicciones);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener predicciones', error: error.message });
  }
}

async function getPrediccionById(req, res) {
  try {
    const prediccion = await prediccionModel.getPrediccionById(req.params.id);

    if (!prediccion) {
      return res.status(404).json({ message: 'Predicción no encontrada' });
    }

    return res.status(200).json(prediccion);
  } catch (error) {
    return res.status(500).json({ message: 'Error al obtener predicción', error: error.message });
  }
}

async function createPrediccion(req, res) {
  try {
    const {
      producto_id,
      periodo_inicio,
      periodo_fin,
      metodo_prediccion,
      valor_predicho,
      intervalo_confianza,
      estado,
      fecha_aplicacion,
      observaciones,
    } = req.body;

    const errorValidacion = validarPrediccionCreate({
      producto_id,
      periodo_inicio,
      periodo_fin,
      metodo_prediccion,
      valor_predicho,
      intervalo_confianza,
      estado,
      fecha_aplicacion,
      observaciones,
    });

    if (errorValidacion) {
      return res.status(400).json({ message: errorValidacion });
    }

    const prediccion = await prediccionModel.createPrediccion({
      producto_id,
      periodo_inicio,
      periodo_fin,
      metodo_prediccion,
      valor_predicho,
      intervalo_confianza,
      estado,
      fecha_aplicacion,
      observaciones,
    });

    return res.status(201).json(prediccion);
  } catch (error) {
    if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
      return res.status(400).json({ message: 'El campo producto_id debe apuntar a un producto existente' });
    }

    return res.status(500).json({ message: 'Error al crear predicción', error: error.message });
  }
}

async function updatePrediccion(req, res) {
  try {
    const prediccion = await prediccionModel.getPrediccionById(req.params.id);

    if (!prediccion) {
      return res.status(404).json({ message: 'Predicción no encontrada' });
    }

    const errorValidacion = validarPrediccionUpdate(req.body);

    if (errorValidacion) {
      return res.status(400).json({ message: errorValidacion });
    }

    const updated = await prediccionModel.updatePrediccion(req.params.id, req.body);

    if (!updated) {
      return res.status(400).json({ message: 'No se enviaron datos para actualizar' });
    }

    const prediccionActualizada = await prediccionModel.getPrediccionById(req.params.id);
    return res.status(200).json(prediccionActualizada);
  } catch (error) {
    if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
      return res.status(400).json({ message: 'El campo producto_id debe apuntar a un producto existente' });
    }

    return res.status(500).json({ message: 'Error al actualizar predicción', error: error.message });
  }
}

async function deletePrediccion(req, res) {
  try {
    const prediccion = await prediccionModel.getPrediccionById(req.params.id);

    if (!prediccion) {
      return res.status(404).json({ message: 'Predicción no encontrada' });
    }

    const result = await prediccionModel.deletePrediccion(req.params.id);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Predicción no encontrada' });
    }

    return res.status(200).json({ message: 'Predicción eliminada correctamente' });
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
      return res.status(409).json({
        message: 'No se puede eliminar la predicción porque está siendo referenciada por otra tabla',
      });
    }

    return res.status(500).json({ message: 'Error al eliminar predicción', error: error.message });
  }
}

module.exports = {
  getAllPredicciones,
  getPrediccionById,
  createPrediccion,
  updatePrediccion,
  deletePrediccion,
};
