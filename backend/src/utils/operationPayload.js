function normalizeDate(value) {
  if (!(value instanceof Date)) return String(value).slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDecimal(value) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match) return String(value);
  const integer = match[1].replace(/^0+(?=\d)/, '');
  const fraction = (match[2] || '').replace(/0+$/, '');
  return fraction ? `${integer}.${fraction}` : integer;
}

function sameItems(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const normalize = (items) => items.map((item) => JSON.stringify(item.map(String))).sort();
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return normalizedLeft.every((item, index) => item === normalizedRight[index]);
}

module.exports = { normalizeDate, normalizeDecimal, sameItems };
