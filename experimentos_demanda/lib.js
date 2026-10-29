const crypto = require("node:crypto");

function serializarCsv(rows, columns) {
  const escape = (value) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  return [
    columns.map(escape).join(","),
    ...rows.map((row) => columns.map((column) => escape(row[column])).join(",")),
  ].join("\r\n") + "\r\n";
}

function parsearCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      if (field.length > 0) throw new Error("CSV contiene comillas mal formadas.");
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      row.push(field);
      field = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      if (char === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error("CSV termina dentro de un campo entrecomillado.");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => value !== "")) rows.push(row);
  }

  if (rows.length === 0) return { columns: [], records: [] };
  const [columns, ...values] = rows;
  if (new Set(columns).size !== columns.length) {
    throw new Error("CSV contiene nombres de columna duplicados.");
  }

  const records = values.map((valuesRow, index) => {
    if (valuesRow.length !== columns.length) {
      throw new Error(`Fila CSV ${index + 2} tiene un número de columnas inesperado.`);
    }
    return Object.fromEntries(columns.map((column, columnIndex) => [
      column,
      valuesRow[columnIndex],
    ]));
  });

  return { columns, records };
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function esFechaIso(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function obtenerSemanaIso(fecha) {
  const [year, month, day] = fecha.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

module.exports = {
  esFechaIso,
  obtenerSemanaIso,
  parsearCsv,
  serializarCsv,
  sha256,
};
