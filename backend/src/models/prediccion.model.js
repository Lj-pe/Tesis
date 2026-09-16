const pool = require('../config/database');

async function getAllPredicciones() {
  const [rows] = await pool.query('SELECT * FROM predicciones ORDER BY id_prediccion ASC');
  return rows;
}

async function getPrediccionById(id) {
  const [rows] = await pool.query('SELECT * FROM predicciones WHERE id_prediccion = ?', [id]);
  return rows[0] || null;
}

async function createPrediccion(data) {
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

  const columns = [
    'producto_id',
    'periodo_inicio',
    'periodo_fin',
    'metodo_prediccion',
    'valor_predicho',
    'estado',
    'observaciones',
  ];

  const values = [
    producto_id,
    periodo_inicio,
    periodo_fin,
    metodo_prediccion,
    valor_predicho,
    estado ?? 'generada',
    observaciones ?? null,
  ];

  if (intervalo_confianza !== undefined && intervalo_confianza !== null) {
    columns.push('intervalo_confianza');
    values.push(intervalo_confianza);
  }

  if (fecha_aplicacion !== undefined && fecha_aplicacion !== null) {
    columns.push('fecha_aplicacion');
    values.push(fecha_aplicacion);
  }

  const placeholders = columns.map(() => '?').join(', ');

  const [result] = await pool.query(
    `INSERT INTO predicciones (${columns.join(', ')}) VALUES (${placeholders})`,
    values
  );

  return {
    id_prediccion: result.insertId,
    producto_id,
    periodo_inicio,
    periodo_fin,
    metodo_prediccion,
    valor_predicho,
    intervalo_confianza: intervalo_confianza ?? null,
    estado: estado ?? 'generada',
    fecha_generacion: null,
    fecha_aplicacion: fecha_aplicacion ?? null,
    observaciones: observaciones ?? null,
  };
}

async function updatePrediccion(id, data) {
  const fields = [];
  const values = [];

  if (data.producto_id !== undefined) {
    fields.push('producto_id = ?');
    values.push(data.producto_id);
  }

  if (data.periodo_inicio !== undefined) {
    fields.push('periodo_inicio = ?');
    values.push(data.periodo_inicio);
  }

  if (data.periodo_fin !== undefined) {
    fields.push('periodo_fin = ?');
    values.push(data.periodo_fin);
  }

  if (data.metodo_prediccion !== undefined) {
    fields.push('metodo_prediccion = ?');
    values.push(data.metodo_prediccion);
  }

  if (data.valor_predicho !== undefined) {
    fields.push('valor_predicho = ?');
    values.push(data.valor_predicho);
  }

  if (data.intervalo_confianza !== undefined) {
    fields.push('intervalo_confianza = ?');
    values.push(data.intervalo_confianza);
  }

  if (data.estado !== undefined) {
    fields.push('estado = ?');
    values.push(data.estado);
  }

  if (data.fecha_aplicacion !== undefined) {
    fields.push('fecha_aplicacion = ?');
    values.push(data.fecha_aplicacion);
  }

  if (data.observaciones !== undefined) {
    fields.push('observaciones = ?');
    values.push(data.observaciones);
  }

  if (fields.length === 0) {
    return null;
  }

  await pool.query(
    `UPDATE predicciones SET ${fields.join(', ')} WHERE id_prediccion = ?`,
    [...values, id]
  );

  return true;
}

async function deletePrediccion(id) {
  const [result] = await pool.query('DELETE FROM predicciones WHERE id_prediccion = ?', [id]);
  return result;
}

module.exports = {
  getAllPredicciones,
  getPrediccionById,
  createPrediccion,
  updatePrediccion,
  deletePrediccion,
};
