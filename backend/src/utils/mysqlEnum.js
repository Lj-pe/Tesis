function parseEnumValues(columnType) {
  const match = /^enum\(((?:'(?:\\.|''|[^'])*')(?:\s*,\s*'(?:\\.|''|[^'])*')*)\)$/i.exec(columnType || '');
  if (!match) return null;
  return match[1].match(/'(?:\\.|''|[^'])*'/g).map((literal) =>
    literal.slice(1, -1)
      .replace(/''/g, "'")
      .replace(/\\(.)/g, (_, character) => ({
        0: '\0',
        b: '\b',
        n: '\n',
        r: '\r',
        t: '\t',
        Z: '\x1a',
      }[character] || character))
  );
}

async function getColumnMetadata(executor, tableName, columnName) {
  const [columns] = await executor.query(
    `SELECT COLUMN_TYPE AS column_type
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  if (!columns[0]) {
    throw Object.assign(new Error(`No se encontró la columna ${tableName}.${columnName}`), {
      code: 'SCHEMA_COLUMN_UNAVAILABLE',
    });
  }
  const columnType = columns[0].column_type;
  const enumValues = parseEnumValues(columnType);
  if (/^enum\(/i.test(columnType || '') && !enumValues) {
    throw Object.assign(new Error(`No se pudieron leer los valores ENUM de ${tableName}.${columnName}`), {
      code: 'SCHEMA_ENUM_UNAVAILABLE',
    });
  }
  return { columnType, enumValues };
}

async function getColumnEnumValues(executor, tableName, columnName) {
  const { enumValues } = await getColumnMetadata(executor, tableName, columnName);
  return enumValues;
}

module.exports = { getColumnEnumValues, getColumnMetadata };
