function calcularTotalesCompra(detalles) {
  const subtotal = detalles.reduce((acumulador, detalle) => {
    const cantidad = Number(detalle.cantidad || 0);
    const costoUnitario = Number(detalle.costo_unitario || 0);
    return acumulador + cantidad * costoUnitario;
  }, 0);

  const total = subtotal;

  return {
    subtotal: Number(subtotal.toFixed(2)),
    total: Number(total.toFixed(2)),
  };
}

function calcularTotalesVenta(detalles) {
  const subtotal = detalles.reduce((acumulador, detalle) => {
    const cantidad = Number(detalle.cantidad || 0);
    const precioUnitario = Number(detalle.precio_unitario || 0);
    return acumulador + cantidad * precioUnitario;
  }, 0);

  const descuento = 0;
  const total = subtotal - descuento;

  return {
    subtotal: Number(subtotal.toFixed(2)),
    descuento: Number(descuento.toFixed(2)),
    total: Number(total.toFixed(2)),
  };
}

module.exports = {
  calcularTotalesCompra,
  calcularTotalesVenta,
};
