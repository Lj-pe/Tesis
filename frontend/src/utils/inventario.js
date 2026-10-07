function calcularEstadoInventario(stockActual, stockMinimo, estadoActual) {
  if (estadoActual === "bloqueado") return "bloqueado";

  const actual = Number(stockActual) || 0;
  const minimo = Number(stockMinimo) || 0;

  if (actual === 0) return "agotado";
  if (actual <= minimo) return "bajo";
  return "normal";
}

export default calcularEstadoInventario;
