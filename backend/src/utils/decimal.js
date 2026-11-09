function normalizeDecimal(value, precision, scale) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match || match[2]?.length > scale) return null;

  const integer = match[1].replace(/^0+(?=\d)/, '');
  if (integer.length > precision - scale) return null;

  const fraction = (match[2] || '').padEnd(scale, '0');
  return scale ? `${integer}.${fraction}` : integer;
}

module.exports = { normalizeDecimal };
