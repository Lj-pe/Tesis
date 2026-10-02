import { useEffect, useMemo, useState } from "react";
import apiClient from "../api/client";
import "./Reportes.css";

const formatoMes = new Intl.DateTimeFormat("es-PE", { month: "short", year: "numeric" });
const formatoMesLargo = new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric" });

function obtenerFechaISO(fecha) {
  if (!fecha) return "";
  const valor = String(fecha);
  return /^\d{4}-\d{2}-\d{2}/.test(valor) ? valor.slice(0, 10) : "";
}

function obtenerClaveMes(fecha) {
  return obtenerFechaISO(fecha).slice(0, 7);
}

function dinero(valor) {
  return `S/ ${Number(valor || 0).toFixed(2)}`;
}

function Reportes() {
  const [datos, setDatos] = useState({
    ventas: [],
    compras: [],
    productos: [],
    inventarios: [],
    movimientos: [],
    detallesCompras: [],
  });
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [rangoAplicado, setRangoAplicado] = useState({ desde: "", hasta: "" });
  const [errorRango, setErrorRango] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        const [ventas, compras, productos, inventarios, movimientos, detallesCompras] = await Promise.all([
          apiClient.get("/ventas"),
          apiClient.get("/compras"),
          apiClient.get("/productos"),
          apiClient.get("/inventarios"),
          apiClient.get("/movimientos-inventario"),
          apiClient.get("/detalle-compras"),
        ]);
        setDatos({
          ventas: Array.isArray(ventas) ? ventas : [],
          compras: Array.isArray(compras) ? compras : [],
          productos: Array.isArray(productos) ? productos : [],
          inventarios: Array.isArray(inventarios) ? inventarios : [],
          movimientos: Array.isArray(movimientos) ? movimientos : [],
          detallesCompras: Array.isArray(detallesCompras) ? detallesCompras : [],
        });
      } catch (error) {
        setLoadError(error.message || "No se pudieron cargar los reportes.");
      } finally {
        setIsLoading(false);
      }
    };

    cargarDatos();
  }, []);

  const aplicarFiltro = (event) => {
    event.preventDefault();
    if (desde && hasta && desde > hasta) {
      setErrorRango("La fecha Desde no puede ser posterior a Hasta.");
      return;
    }
    setErrorRango("");
    setRangoAplicado({ desde, hasta });
  };

  const reporte = useMemo(() => {
    const estaEnRango = (fecha) => {
      const fechaISO = obtenerFechaISO(fecha);
      if (!fechaISO) return false;
      return (!rangoAplicado.desde || fechaISO >= rangoAplicado.desde)
        && (!rangoAplicado.hasta || fechaISO <= rangoAplicado.hasta);
    };
    const inventariosPorId = new Map(datos.inventarios.map((inventario) => [inventario.id_inventario, inventario]));
    const ventas = datos.ventas.filter((venta) => venta.estado === "pagada" && estaEnRango(venta.fecha_venta));
    const compras = datos.compras.filter((compra) => compra.estado === "recibida" && estaEnRango(compra.fecha_compra));
    const movimientosVenta = datos.movimientos.filter((movimiento) => (
      movimiento.tipo_movimiento === "salida"
      && movimiento.estado === "confirmado"
      && estaEnRango(movimiento.fecha_movimiento)
    ));
    const comprasPorId = new Map(compras.map((compra) => [compra.id_compra, compra]));
    const unidadesCompradas = datos.detallesCompras.reduce((total, detalle) => (
      comprasPorId.has(detalle.compra_id) ? total + Number(detalle.cantidad || 0) : total
    ), 0);
    const unidadesVendidas = movimientosVenta.reduce((total, movimiento) => total + Number(movimiento.cantidad || 0), 0);
    const totalVentas = ventas.reduce((total, venta) => total + Number(venta.total || 0), 0);
    const totalCompras = compras.reduce((total, compra) => total + Number(compra.total || 0), 0);
    const salidasPorProducto = new Map();

    movimientosVenta.forEach((movimiento) => {
      const inventario = inventariosPorId.get(movimiento.inventario_id);
      if (!inventario) return;
      const productoId = inventario.producto_id;
      salidasPorProducto.set(
        productoId,
        (salidasPorProducto.get(productoId) || 0) + Number(movimiento.cantidad || 0)
      );
    });

    const rotacion = datos.productos
      .map((producto) => ({ producto, cantidad: salidasPorProducto.get(producto.id_producto) || 0 }))
      .sort((a, b) => b.cantidad - a.cantidad || String(a.producto.nombre || "").localeCompare(String(b.producto.nombre || "")));
    const productosConSalidas = rotacion.filter(({ cantidad }) => cantidad > 0);
    const productosMayorRotacion = productosConSalidas.slice(0, 5);
    const productosMenorRotacionOrdenados = [...rotacion]
      .sort((a, b) => a.cantidad - b.cantidad || String(a.producto.nombre || "").localeCompare(String(b.producto.nombre || "")))
    const productosMenorRotacion = productosMenorRotacionOrdenados.slice(0, 5);
    const mayorCantidadSalidas = productosConSalidas[0]?.cantidad || 0;
    const clasificarRotacion = (cantidad) => {
      if (cantidad === 0 || mayorCantidadSalidas === 0) return "Baja";
      if (cantidad >= mayorCantidadSalidas * 0.66) return "Alta";
      if (cantidad >= mayorCantidadSalidas * 0.33) return "Media";
      return "Baja";
    };
    const ventasPorMes = new Map();
    const comprasPorMes = new Map();

    ventas.forEach((venta) => {
      const mes = obtenerClaveMes(venta.fecha_venta);
      if (mes) ventasPorMes.set(mes, (ventasPorMes.get(mes) || 0) + Number(venta.total || 0));
    });
    compras.forEach((compra) => {
      const mes = obtenerClaveMes(compra.fecha_compra);
      if (mes) comprasPorMes.set(mes, (comprasPorMes.get(mes) || 0) + Number(compra.total || 0));
    });
    const meses = [...new Set([...ventasPorMes.keys(), ...comprasPorMes.keys()])]
      .sort()
      .map((clave) => ({
        clave,
        etiqueta: formatoMes.format(new Date(`${clave}-01T12:00:00`)),
        ventas: ventasPorMes.get(clave) || 0,
        compras: comprasPorMes.get(clave) || 0,
      }));
    const tieneDatos = ventas.length > 0 || compras.length > 0 || movimientosVenta.length > 0;
    const hayRotacion = movimientosVenta.length > 0;
    const observaciones = [];
    const unSoloMesSeleccionado = rangoAplicado.desde
      && rangoAplicado.hasta
      && rangoAplicado.desde.slice(0, 7) === rangoAplicado.hasta.slice(0, 7);
    const ventasOrdenadas = [...ventasPorMes.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
    const comprasOrdenadas = [...comprasPorMes.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));

    if (ventasOrdenadas.length > 0) {
      const [mesMenorVenta, montoMenorVenta] = ventasOrdenadas[0];
      const [mesMayorVenta, montoMayorVenta] = ventasOrdenadas[ventasOrdenadas.length - 1];
      if (unSoloMesSeleccionado) {
        observaciones.push(`El monto de ventas del período seleccionado fue ${dinero(montoMayorVenta)}.`);
      } else {
        observaciones.push(`El mayor monto de ventas se registró en ${formatoMesLargo.format(new Date(`${mesMayorVenta}-01T12:00:00`))} (${dinero(montoMayorVenta)}).`);
        observaciones.push(`El menor monto de ventas se registró en ${formatoMesLargo.format(new Date(`${mesMenorVenta}-01T12:00:00`))} (${dinero(montoMenorVenta)}).`);
      }
    }
    if (hayRotacion && productosConSalidas[0]) {
      observaciones.push(`${productosConSalidas[0].producto.nombre} tuvo la mayor rotación, con ${productosConSalidas[0].cantidad} unidades vendidas.`);
    }
    if (hayRotacion && rotacion.length > 0) {
      const menor = productosMenorRotacionOrdenados[0];
      observaciones.push(`${menor.producto.nombre} tuvo la menor rotación, con ${menor.cantidad} ${menor.cantidad === 1 ? "unidad" : "unidades"}.`);
    }
    if (tieneDatos && rotacion.length > 0) {
      const productosSinVentas = rotacion.filter(({ cantidad }) => cantidad === 0).length;
      observaciones.push(`${productosSinVentas} ${productosSinVentas === 1 ? "producto no registró" : "productos no registraron"} ventas en el período seleccionado.`);
    }
    if (comprasOrdenadas.length > 0) {
      const [mesMayorCompra, montoMayorCompra] = comprasOrdenadas[comprasOrdenadas.length - 1];
      observaciones.push(unSoloMesSeleccionado
        ? `El monto de compras del período seleccionado fue ${dinero(montoMayorCompra)}.`
        : `El mayor monto de compras se registró en ${formatoMesLargo.format(new Date(`${mesMayorCompra}-01T12:00:00`))} (${dinero(montoMayorCompra)}).`);
    }

    return {
      ventas,
      compras,
      unidadesVendidas,
      unidadesCompradas,
      totalVentas,
      totalCompras,
      productosMayorRotacion,
      productosMenorRotacion,
      productoMayorRotacion: hayRotacion ? productosConSalidas[0] : null,
      productoMenorRotacion: hayRotacion ? productosMenorRotacionOrdenados[0] : null,
      clasificarRotacion,
      meses,
      observaciones: observaciones.slice(0, 6),
      tieneDatos,
      hayRotacion,
    };
  }, [datos, rangoAplicado]);

  return (
    <div className="reportes-page">
      <div className="page-header">
        <div>
          <h1>Reportes</h1>
          <p>Indicadores para el análisis operativo del negocio.</p>
        </div>
      </div>

      {loadError && <div className="error-message" role="alert">{loadError}</div>}

      <form className="reportes-filter" onSubmit={aplicarFiltro}>
        <label>
          <span>Desde</span>
          <input type="date" value={desde} onChange={(event) => setDesde(event.target.value)} />
        </label>
        <label>
          <span>Hasta</span>
          <input type="date" value={hasta} onChange={(event) => setHasta(event.target.value)} />
        </label>
        <button type="submit">Aplicar</button>
        <p className="reportes-filter-hint">Si no seleccionas fechas, se mostrará todo el historial disponible.</p>
        {errorRango && <p className="reportes-range-error" role="alert">{errorRango}</p>}
      </form>

      <div className="reportes-cards">
        <article className="reportes-card">
          <span className="reportes-card-icon reportes-icon-sales" aria-hidden="true">↗</span>
          <div><span>Ventas del mes</span><strong>{isLoading ? "-" : dinero(reporte.totalVentas)}</strong><small>{isLoading ? "Cargando..." : `${reporte.unidadesVendidas} unidades vendidas`}</small></div>
        </article>
        <article className="reportes-card">
          <span className="reportes-card-icon reportes-icon-purchases" aria-hidden="true">▱</span>
          <div><span>Compras del mes</span><strong>{isLoading ? "-" : dinero(reporte.totalCompras)}</strong><small>{isLoading ? "Cargando..." : `${reporte.unidadesCompradas} unidades adquiridas`}</small></div>
        </article>
        <article className="reportes-card">
          <span className="reportes-card-icon reportes-icon-top" aria-hidden="true">◆</span>
          <div><span>Producto más vendido</span><strong>{isLoading ? "-" : reporte.productoMayorRotacion?.producto.nombre || "Sin datos"}</strong><small>{isLoading ? "Cargando..." : `${reporte.productoMayorRotacion?.cantidad || 0} unidades`}</small></div>
        </article>
        <article className="reportes-card">
          <span className="reportes-card-icon reportes-icon-low" aria-hidden="true">⊘</span>
          <div><span>Menor rotación</span><strong>{isLoading ? "-" : reporte.productoMenorRotacion?.producto.nombre || "Sin datos"}</strong><small>{isLoading ? "Cargando..." : `${reporte.productoMenorRotacion?.cantidad || 0} unidades`}</small></div>
        </article>
      </div>

      <div className="reportes-panels reportes-tables">
        <section className="reportes-panel">
          <header><span className="reportes-panel-icon">🏆</span><div><h2>Productos con mayor rotación</h2><p>Productos con más unidades vendidas en el período seleccionado.</p></div></header>
          <div className="reportes-table-wrap">
            <table>
              <thead><tr><th>#</th><th>Producto</th><th>Unidades vendidas</th><th>Clasificación</th></tr></thead>
              <tbody>
                {isLoading ? <tr><td colSpan="4" className="reportes-empty">Cargando rotación...</td></tr>
                  : !reporte.hayRotacion || reporte.productosMayorRotacion.length === 0 ? <tr><td colSpan="4" className="reportes-empty">No hay ventas registradas en el período seleccionado.</td></tr>
                    : reporte.productosMayorRotacion.map(({ producto, cantidad }, index) => {
                      const clasificacion = reporte.clasificarRotacion(cantidad);
                      return <tr key={producto.id_producto}>
                        <td>{index + 1}</td><td>{producto.nombre}</td><td>{cantidad}</td>
                        <td><span className={`reportes-badge ${clasificacion.toLowerCase()}`}>{clasificacion}</span></td>
                      </tr>;
                    })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="reportes-panel">
          <header><span className="reportes-panel-icon reportes-panel-icon-blue">⌁</span><div><h2>Productos con menor rotación</h2><p>Productos con menos unidades vendidas en el período seleccionado.</p></div></header>
          <div className="reportes-table-wrap">
            <table className="reportes-low-table">
              <thead><tr><th>#</th><th>Producto</th><th>Unidades vendidas</th></tr></thead>
              <tbody>
                {isLoading ? <tr><td colSpan="3" className="reportes-empty">Cargando rotación...</td></tr>
                  : !reporte.hayRotacion || reporte.productosMenorRotacion.length === 0 ? <tr><td colSpan="3" className="reportes-empty">No hay ventas registradas en el período seleccionado.</td></tr>
                    : reporte.productosMenorRotacion.map(({ producto, cantidad }, index) => (
                      <tr key={producto.id_producto}><td>{index + 1}</td><td>{producto.nombre}</td><td>{cantidad}</td></tr>
                    ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="reportes-panel reportes-bottom">
        <div className="reportes-chart-panel">
          <header><span className="reportes-panel-icon reportes-panel-icon-blue">▥</span><div><h2>Ventas y compras por mes</h2><p>Comparación del monto total en el período seleccionado.</p></div></header>
          {isLoading ? <p className="reportes-empty">Cargando gráfico...</p> : reporte.meses.length === 0 ? (
            <p className="reportes-empty reportes-chart-empty">No hay ventas ni compras en el período seleccionado.</p>
          ) : <div className="reportes-chart-scroll">
            <div className="reportes-legend"><span><i className="ventas-dot" />Ventas</span><span><i className="compras-dot" />Compras</span></div>
            <svg
              className="reportes-chart"
              style={{ width: `${Math.max(760, reporte.meses.length * 100 + 72)}px` }}
              viewBox={`0 0 ${Math.max(760, reporte.meses.length * 100 + 72)} 250`}
              role="img"
              aria-label="Gráfico de ventas y compras agrupadas por mes"
            >
              {(() => {
                const width = Math.max(760, reporte.meses.length * 100 + 72);
                const left = 58;
                const right = width - 12;
                const top = 12;
                const bottom = 200;
                const maxValue = Math.max(1, ...reporte.meses.flatMap((mes) => [mes.ventas, mes.compras]));
                const step = 10 ** Math.floor(Math.log10(maxValue));
                const axisMax = Math.ceil(maxValue / step) * step;
                const y = (value) => bottom - (value / axisMax) * (bottom - top);
                const groupWidth = (right - left) / reporte.meses.length;
                const barWidth = Math.min(28, groupWidth * 0.28);
                return <>
                  {[0, 1, 2, 3, 4].map((tick) => {
                    const value = (axisMax * tick) / 4;
                    const tickY = y(value);
                    return <g key={tick}>
                      <line x1={left} x2={right} y1={tickY} y2={tickY} className="reportes-gridline" />
                      <text x={left - 8} y={tickY + 4} textAnchor="end" className="reportes-axis-label">{dinero(value)}</text>
                    </g>;
                  })}
                  {reporte.meses.map((mes, index) => {
                    const center = left + groupWidth * (index + 0.5);
                    const ventasY = y(mes.ventas);
                    const comprasY = y(mes.compras);
                    return <g key={mes.clave}>
                      <rect x={center - barWidth - 2} y={ventasY} width={barWidth} height={Math.max(0, bottom - ventasY)} rx="2" className="reportes-bar-ventas"><title>{`Ventas ${mes.etiqueta}: ${dinero(mes.ventas)}`}</title></rect>
                      <rect x={center + 2} y={comprasY} width={barWidth} height={Math.max(0, bottom - comprasY)} rx="2" className="reportes-bar-compras"><title>{`Compras ${mes.etiqueta}: ${dinero(mes.compras)}`}</title></rect>
                      <text x={center} y={bottom + 24} textAnchor="middle" className="reportes-axis-label">{mes.etiqueta}</text>
                    </g>;
                  })}
                </>;
              })()}
            </svg>
          </div>}
        </div>

        <aside className="reportes-observations">
          <header><span className="reportes-panel-icon reportes-observation-icon">✦</span><div><h2>Observaciones del período</h2><p>Información relevante según los datos seleccionados.</p></div></header>
          {isLoading ? <p className="reportes-empty">Cargando observaciones...</p>
            : !reporte.tieneDatos ? <p className="reportes-empty">Sin datos para el período seleccionado.</p>
              : reporte.observaciones.length === 0 ? <p className="reportes-empty">No hay observaciones disponibles para el período seleccionado.</p>
                : <ul>{reporte.observaciones.map((observacion) => <li key={observacion}><span aria-hidden="true" />{observacion}</li>)}</ul>}
        </aside>
      </section>
    </div>
  );
}

export default Reportes;
