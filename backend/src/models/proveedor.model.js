const pool = require('../config/database');
const { getColumnMetadata } = require('../utils/mysqlEnum');

async function getAllProveedores() {
  const [rows] = await pool.query(
    `SELECT id, codigo, nombre, telefono, correo, direccion,
            plazo_entrega_dias, activo, creado_en, actualizado_en
     FROM proveedores ORDER BY nombre ASC`
  );
  return rows;
}

async function getProveedorById(id, executor = pool) {
  const [rows] = await executor.query(
    `SELECT id, codigo, nombre, telefono, correo, direccion,
            plazo_entrega_dias, activo, creado_en, actualizado_en
     FROM proveedores WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function createProveedor(data) {
  const [result] = await pool.query(
    `INSERT INTO proveedores (
      codigo, nombre, telefono, correo, direccion, plazo_entrega_dias, activo
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.codigo,
      data.nombre,
      data.telefono ?? null,
      data.correo ?? null,
      data.direccion ?? null,
      data.plazo_entrega_dias,
      data.activo === undefined ? 1 : (data.activo ? 1 : 0),
    ]
  );
  return getProveedorById(result.insertId);
}

async function updateProveedor(id, data) {
  const fields = [];
  const values = [];
  for (const field of ['codigo', 'nombre', 'telefono', 'correo', 'direccion', 'plazo_entrega_dias', 'activo']) {
    if (data[field] !== undefined) {
      fields.push(`${field} = ?`);
      values.push(field === 'activo' ? (data[field] ? 1 : 0) : data[field]);
    }
  }
  if (!fields.length) return false;
  values.push(id);
  const [result] = await pool.query(
    `UPDATE proveedores SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  return result.affectedRows > 0;
}

async function desactivarProveedor(id) {
  const [result] = await pool.query('UPDATE proveedores SET activo = 0 WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function getDiasPedidoProveedor(proveedorId) {
  const [rows] = await pool.query(
    'SELECT dia_semana FROM dias_pedido_proveedor WHERE proveedor_id = ? ORDER BY dia_semana',
    [proveedorId]
  );
  return rows.map(({ dia_semana }) => dia_semana);
}

async function setDiasPedidoProveedor(proveedorId, dias) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { columnType, enumValues } = await getColumnMetadata(
      connection,
      'dias_pedido_proveedor',
      'dia_semana'
    );
    let normalizedDays;
    if (enumValues) {
      if (dias.some((dia) => !enumValues.includes(String(dia)))) {
        throw Object.assign(new Error('Uno o más días no están permitidos'), {
          code: 'INVALID_DAY_VALUE',
        });
      }
      normalizedDays = dias.map(String);
    } else {
      const integerType = /^(tinyint|smallint|mediumint|int|integer|bigint)(?:\(\d+\))?( unsigned)?$/i.exec(columnType);
      if (!integerType) {
        throw Object.assign(new Error('No se pudo determinar el rango permitido para dia_semana'), {
          code: 'SCHEMA_TYPE_UNSUPPORTED',
        });
      }
      const bitWidths = { tinyint: 8n, smallint: 16n, mediumint: 24n, int: 32n, integer: 32n, bigint: 64n };
      const bitWidth = bitWidths[integerType[1].toLowerCase()];
      const unsigned = Boolean(integerType[2]);
      const minimum = unsigned ? 0n : -(1n << (bitWidth - 1n));
      const maximum = unsigned ? (1n << bitWidth) - 1n : (1n << (bitWidth - 1n)) - 1n;
      if (dias.some((dia) => !/^\d+$/.test(String(dia).trim()) ||
          BigInt(String(dia).trim()) < minimum || BigInt(String(dia).trim()) > maximum)) {
        throw Object.assign(new Error('Uno o más días no caben en la columna dia_semana'), {
          code: 'INVALID_DAY_VALUE',
        });
      }
      normalizedDays = dias.map((dia) => BigInt(String(dia).trim()).toString());
    }
    if (new Set(normalizedDays).size !== normalizedDays.length) {
      throw Object.assign(new Error('La lista de días contiene valores repetidos'), {
        code: 'INVALID_DAY_VALUE',
      });
    }
    const [providers] = await connection.query(
      'SELECT id FROM proveedores WHERE id = ? FOR UPDATE',
      [proveedorId]
    );
    if (!providers[0]) {
      throw Object.assign(new Error('Proveedor no encontrado'), { code: 'PROVIDER_NOT_FOUND' });
    }
    await connection.query('DELETE FROM dias_pedido_proveedor WHERE proveedor_id = ?', [proveedorId]);
    for (const dia of normalizedDays) {
      await connection.query(
        'INSERT INTO dias_pedido_proveedor (proveedor_id, dia_semana) VALUES (?, ?)',
        [proveedorId, dia]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return getDiasPedidoProveedor(proveedorId);
}

module.exports = {
  getAllProveedores,
  getProveedorById,
  createProveedor,
  updateProveedor,
  desactivarProveedor,
  getDiasPedidoProveedor,
  setDiasPedidoProveedor,
};
