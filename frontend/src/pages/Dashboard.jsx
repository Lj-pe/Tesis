import { useEffect, useState } from "react";
import apiClient from "../api/client";

function calcularEstadoInventario(inventario) {
  if (inventario.estado_inventario === "bloqueado") return "bloqueado";

  const stockActual = Number(inventario.stock_actual) || 0;
  const stockMinimo = Number(inventario.stock_minimo) || 0;

  if (stockActual === 0) return "agotado";
  if (stockActual <= stockMinimo) return "bajo";
  return "normal";
}

function Dashboard() {
  const [dashboard, setDashboard] = useState({
    productos: [],
    inventarios: [],
    ventas: [],
    compras: [],
    movimientos: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const cargarDashboard = async () => {
      try {
        const [productos, inventarios, ventas, compras, movimientos] = await Promise.all([
          apiClient.get("/productos"),
          apiClient.get("/inventarios"),
          apiClient.get("/ventas"),
          apiClient.get("/compras"),
          apiClient.get("/movimientos-inventario"),
        ]);

        setDashboard({
          productos: Array.isArray(productos) ? productos : [],
          inventarios: Array.isArray(inventarios) ? inventarios : [],
          ventas: Array.isArray(ventas) ? ventas : [],
          compras: Array.isArray(compras) ? compras : [],
          movimientos: Array.isArray(movimientos) ? movimientos : [],
        });
      } catch (error) {
        setLoadError(error.message || "No se pudieron cargar los datos del dashboard.");
      } finally {
        setIsLoading(false);
      }
    };

    cargarDashboard();
  }, []);

  const ahora = new Date();
  const inicioMesActual = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const esVentaPagada = (venta) => venta.estado === "pagada";
  const obtenerFecha = (fecha) => {
    if (!fecha) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return new Date(`${fecha}T00:00:00`);
    }
    return new Date(fecha);
  };
  const ventasMesActual = dashboard.ventas.filter((venta) => {
    const fecha = obtenerFecha(venta.fecha_venta);
    return esVentaPagada(venta) && fecha >= inicioMesActual && fecha < ahora;
  });
  const totalVentasActual = ventasMesActual.reduce((total, venta) => total + Number(venta.total || 0), 0);
  const stockTotal = dashboard.inventarios.reduce((total, inventario) => total + Number(inventario.stock_actual || 0), 0);
  const inventariosConEstadoCalculado = dashboard.inventarios.map((inventario) => ({
    ...inventario,
    estado_calculado: calcularEstadoInventario(inventario),
  }));
  const inventariosBajos = inventariosConEstadoCalculado.filter((inventario) => inventario.estado_calculado === "bajo");
  const inventariosAlerta = inventariosConEstadoCalculado.filter((inventario) => ["bajo", "agotado"].includes(inventario.estado_calculado));
  const inventariosPorId = new Map(dashboard.inventarios.map((inventario) => [inventario.id_inventario, inventario]));
  const productosPorId = new Map(dashboard.productos.map((producto) => [producto.id_producto, producto]));
  const demandaPorProducto = dashboard.movimientos
    .filter((movimiento) => movimiento.tipo_movimiento === "salida" && movimiento.estado === "confirmado")
    .reduce((acumulado, movimiento) => {
      const inventario = inventariosPorId.get(movimiento.inventario_id);
      if (!inventario) return acumulado;
      const productoId = inventario.producto_id;
      acumulado.set(productoId, (acumulado.get(productoId) || 0) + Number(movimiento.cantidad || 0));
      return acumulado;
    }, new Map());
  const productosDemanda = Array.from(demandaPorProducto.entries())
    .map(([productoId, cantidad]) => ({ producto: productosPorId.get(productoId), cantidad }))
    .filter((item) => item.producto)
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 5);
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Resumen general del negocio.</p>
        </div>
      </div>

      {loadError && <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>{loadError}</div>}

      <div className="stats-grid">

        <div className="stat-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Productos registrados</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--primary)" }}>
              <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
              <path d="m4.5 7.8 7.5 4.3 7.5-4.3M12 12v9" />
            </svg>
          </div>
          <strong>{isLoading ? "-" : dashboard.productos.length}</strong>
          <small>Productos registrados</small>
        </div>

        <div className="stat-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Stock total</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--info)" }}>
              <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" />
              <path d="m3.5 7.8 8.5 4.3 8.5-4.3M12 12v9" />
              <path d="m7.5 5.3 9 4.6" />
            </svg>
          </div>
          <strong>{isLoading ? "-" : stockTotal.toLocaleString("es-PE")}</strong>
          <small>Unidades disponibles</small>
        </div>

        <div className="stat-card warning">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Stock bajo</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--warning)" }}>
              <path d="M12 3 2.8 19h18.4L12 3Z" />
              <path d="M12 9v4M12 16.5h.01" />
            </svg>
          </div>
          <strong>{isLoading ? "-" : inventariosBajos.length}</strong>
          <small>Necesitan reposición</small>
        </div>

        <div className="stat-card success">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Ventas del mes</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--success)" }}>
              <path d="M4 19V5M4 19h17" />
              <path d="m7 15 4-4 3 2 6-7" />
              <path d="M16 6h4v4" />
            </svg>
          </div>
          <strong>{isLoading ? "-" : `S/ ${totalVentasActual.toFixed(2)}`}</strong>
          <small>Ventas pagadas del mes</small>
        </div>

      </div>

      <div className="dashboard-grid">

        <div className="panel">
          <div className="panel-header">
            <h3>Productos con mayor demanda</h3>
          </div>

          <div className="dashboard-table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Producto</th>
                <th>Unidades vendidas</th>
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <tr><td colSpan="3">Cargando demanda...</td></tr>
              ) : productosDemanda.length === 0 ? (
                <tr><td colSpan="3">No hay salidas confirmadas.</td></tr>
              ) : productosDemanda.map(({ producto, cantidad }, index) => (
                <tr key={producto.id_producto}>
                  <td>{index + 1}</td>
                  <td>{producto.nombre}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span>{cantidad}</span>
                      <span aria-hidden="true" style={{ display: "block", flex: "1", height: "7px", minWidth: "48px", overflow: "hidden", borderRadius: "4px", background: "var(--surface-secondary)" }}>
                        <span style={{ display: "block", width: `${productosDemanda[0]?.cantidad ? (cantidad / productosDemanda[0].cantidad) * 100 : 0}%`, height: "100%", borderRadius: "inherit", background: "var(--primary)" }} />
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        <div className="panel">

          <div className="panel-header">
            <h3>Alertas de inventario</h3>
          </div>

          <div className="dashboard-table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Producto</th>
                <th>Stock actual</th>
                <th>Stock mínimo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="5">Cargando alertas...</td></tr>
              ) : inventariosAlerta.length === 0 ? (
                <tr><td colSpan="5">No hay alertas de inventario.</td></tr>
              ) : inventariosAlerta.map((inventario, index) => {
                const producto = productosPorId.get(inventario.producto_id);
                return (
                  <tr key={inventario.id_inventario}>
                    <td>{index + 1}</td>
                    <td>{producto?.nombre || "Producto no encontrado"}</td>
                    <td>{inventario.stock_actual}</td>
                    <td>{inventario.stock_minimo ?? "No definido"}</td>
                    <td><span className="badge danger-badge">{inventario.estado_calculado === "agotado" ? "Sin stock" : "Stock bajo"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>

        </div>

      </div>
    </>
  );
}

export default Dashboard;