import { useEffect, useState } from "react";
import apiClient from "../api/client";

const emptyForm = {
  numero_factura: "",
  fecha_venta: "",
  estado: "pendiente",
  observaciones: "",
  forma_pago: "",
};

const nuevaLinea = () => ({ producto_id: "", cantidad: "", precio_unitario: "" });

function Ventas() {
  const [ventas, setVentas] = useState([]);
  const [productos, setProductos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("todos");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [detalles, setDetalles] = useState([nuevaLinea()]);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [ventaDetalle, setVentaDetalle] = useState(null);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [detalleError, setDetalleError] = useState("");
  const [estadoDetalle, setEstadoDetalle] = useState("");
  const [guardandoEstado, setGuardandoEstado] = useState(false);

  const cargarDatos = async () => {
    try {
      setLoadError("");
      const [ventasData, productosData, usuariosData] = await Promise.all([
        apiClient.get("/ventas"),
        apiClient.get("/productos"),
        apiClient.get("/usuarios"),
      ]);
      setVentas(Array.isArray(ventasData) ? ventasData : []);
      setProductos(Array.isArray(productosData) ? productosData : []);
      setUsuarios(Array.isArray(usuariosData) ? usuariosData : []);
    } catch (error) {
      setLoadError(error.message || "No se pudieron cargar las ventas.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const abrirFormulario = () => {
    setForm({ ...emptyForm, fecha_venta: new Date().toISOString().slice(0, 10) });
    setDetalles([nuevaLinea()]);
    setFormError("");
    setShowForm(true);
  };

  const cerrarFormulario = () => {
    setShowForm(false);
    setForm(emptyForm);
    setDetalles([nuevaLinea()]);
    setFormError("");
  };

  const abrirDetalle = async (ventaId) => {
    setDetalleLoading(true);
    setDetalleError("");
    setVentaDetalle(null);

    try {
      const data = await apiClient.get(`/ventas/${ventaId}`);
      setVentaDetalle(data);
      setEstadoDetalle(data.estado || "");
    } catch (error) {
      setDetalleError(error.message || "No se pudo cargar el detalle de la venta.");
    } finally {
      setDetalleLoading(false);
    }
  };

  const cerrarDetalle = () => {
    setVentaDetalle(null);
    setDetalleError("");
    setEstadoDetalle("");
  };

  const guardarCambioEstado = async () => {
    if (!ventaDetalle || guardandoEstado || estadoDetalle === ventaDetalle.estado) return;

    const estadosPermitidos = ventaDetalle.estado === "pendiente"
      ? ["pagada", "anulada"]
      : ventaDetalle.estado === "pagada"
        ? ["anulada"]
        : [];

    if (!estadosPermitidos.includes(estadoDetalle)) {
      return;
    }

    try {
      setGuardandoEstado(true);
      await apiClient.post(`/ventas/${ventaDetalle.id_venta}/estado`, {
        estado: estadoDetalle,
      });
      const detalleActualizado = await apiClient.get(`/ventas/${ventaDetalle.id_venta}`);
      setVentaDetalle(detalleActualizado);
      setEstadoDetalle(detalleActualizado.estado || "");
      await cargarDatos();
    } catch (error) {
      setDetalleError(error.message || "No se pudo cambiar el estado de la venta.");
      setEstadoDetalle(ventaDetalle.estado);
    } finally {
      setGuardandoEstado(false);
    }
  };

  const cambiarCampo = (event) => {
    const { name, value } = event.target;
    setForm((estadoActual) => ({ ...estadoActual, [name]: value }));
    setFormError("");
  };

  const cambiarDetalle = (index, event) => {
    const { name, value } = event.target;
    setDetalles((lineas) => lineas.map((linea, lineaIndex) => (
      lineaIndex === index ? { ...linea, [name]: value } : linea
    )));
    setFormError("");
  };

  const guardarVenta = async (event) => {
    event.preventDefault();

    if (!form.fecha_venta || detalles.length === 0) {
      setFormError("Selecciona una fecha y agrega al menos un producto.");
      return;
    }

    const detallesPayload = detalles.map((detalle) => ({
      producto_id: Number(detalle.producto_id),
      cantidad: Number(detalle.cantidad),
      precio_unitario: Number(detalle.precio_unitario),
    }));

    if (detallesPayload.some((detalle) => !detalle.producto_id || detalle.cantidad <= 0 || detalle.precio_unitario <= 0)) {
      setFormError("Cada producto debe tener cantidad y precio unitario mayores que 0.");
      return;
    }

    try {
      setIsSaving(true);
      await apiClient.post("/ventas/transaccional", {
        numero_factura: form.numero_factura.trim() || null,
        fecha_venta: form.fecha_venta,
        estado: form.estado,
        observaciones: form.observaciones.trim() || null,
        forma_pago: form.forma_pago.trim() || null,
        detalles: detallesPayload,
      });
      await cargarDatos();
      cerrarFormulario();
    } catch (error) {
      setFormError(error.message || "No se pudo registrar la venta.");
    } finally {
      setIsSaving(false);
    }
  };

  const obtenerUsuario = (usuarioId) => {
    const usuario = usuarios.find((item) => item.id_usuario === usuarioId);
    return usuario ? `${usuario.nombre} ${usuario.apellido || ""}`.trim() : "Usuario no encontrado";
  };

  const ventasVisibles = ventas
    .filter((venta) => {
      const usuario = obtenerUsuario(venta.usuario_id).toLowerCase();
      const texto = search.trim().toLowerCase();
      const coincideBusqueda = !texto ||
        String(venta.id_venta).includes(texto) ||
        venta.numero_factura?.toLowerCase().includes(texto) ||
        usuario.includes(texto);
      const coincideEstado = estadoFiltro === "todos" || venta.estado === estadoFiltro;
      return coincideBusqueda && coincideEstado;
    })
    .sort((a, b) => new Date(b.fecha_venta) - new Date(a.fecha_venta) || b.id_venta - a.id_venta);

  const formatearFecha = (fecha) => fecha ? new Date(fecha).toLocaleDateString("es-PE") : "No disponible";

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Ventas</h1>
          <p>Registro y consulta de ventas realizadas.</p>
        </div>
        <button className="primary-button" onClick={abrirFormulario}>+ Nueva venta</button>
      </div>

      <div className="panel">
        <div className="table-toolbar">
          <input className="search-input" placeholder="Buscar venta..." value={search} onChange={(event) => setSearch(event.target.value)} />
          <select className="filter-select" value={estadoFiltro} onChange={(event) => setEstadoFiltro(event.target.value)}>
            <option value="todos">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="pagada">Pagada</option>
            <option value="anulada">Anulada</option>
          </select>
        </div>

        {loadError && <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>{loadError}</div>}

        <div className="table-responsive ventas-table-scroll">
          <table>
            <thead><tr><th>N° venta</th><th>Fecha</th><th>Usuario</th><th>Comprobante</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="7">Cargando ventas...</td></tr>
              ) : ventasVisibles.length === 0 ? (
                <tr><td colSpan="7">No se encontraron ventas.</td></tr>
              ) : ventasVisibles.map((venta) => (
                <tr key={venta.id_venta}>
                  <td>#{venta.id_venta}</td>
                  <td>{formatearFecha(venta.fecha_venta)}</td>
                  <td>{obtenerUsuario(venta.usuario_id)}</td>
                  <td>{venta.numero_factura || "Sin comprobante"}</td>
                  <td>S/ {Number(venta.total || 0).toFixed(2)}</td>
                  <td><span className={`badge ${venta.estado === "pagada" ? "success-badge" : venta.estado === "anulada" || venta.estado === "cancelada" ? "inactive-badge" : "warning-badge"}`}>{venta.estado}</span></td>
                  <td><button className="action-button" type="button" onClick={() => abrirDetalle(venta.id_venta)}>Ver</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", zIndex: 1000 }}>
          <div className="panel" style={{ width: "min(720px, 100%)", maxHeight: "90vh", overflowY: "auto", padding: "1.5rem" }}>
            <div className="page-header" style={{ marginBottom: "1rem" }}><div><h1>Nueva venta</h1><p>Registra la venta y sus productos.</p></div></div>
            {formError && <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>{formError}</div>}
            <form onSubmit={guardarVenta}>
              <div style={{ display: "grid", gap: "0.75rem" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.75rem" }}>
                  <div><label className="form-label" htmlFor="venta-fecha">Fecha de venta</label><input id="venta-fecha" name="fecha_venta" type="date" className="form-control" value={form.fecha_venta} onChange={cambiarCampo} /></div>
                  <div><label className="form-label" htmlFor="venta-factura">Comprobante</label><input id="venta-factura" name="numero_factura" className="form-control" value={form.numero_factura} onChange={cambiarCampo} /></div>
                </div>
                <div><label className="form-label" htmlFor="venta-estado">Estado</label><select id="venta-estado" name="estado" className="form-control" value={form.estado} onChange={cambiarCampo}><option value="pendiente">Pendiente</option><option value="pagada">Pagada</option></select></div>
                <div><label className="form-label" htmlFor="venta-forma-pago">Forma de pago</label><select id="venta-forma-pago" name="forma_pago" className="form-control" value={form.forma_pago} onChange={cambiarCampo}><option value="">Selecciona una forma de pago</option><option value="Efectivo">Efectivo</option><option value="Yape/Plin">Yape / Plin</option><option value="Tarjeta">Tarjeta</option></select></div>
                <div><label className="form-label" htmlFor="venta-observaciones">Observaciones</label><textarea id="venta-observaciones" name="observaciones" rows="2" className="form-control" value={form.observaciones} onChange={cambiarCampo} /></div>
                <div>
                  <div style={{ marginBottom: "0.5rem" }}><label className="form-label">Productos</label></div>
                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    {detalles.map((detalle, index) => (
                      <div key={index} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: "0.5rem", alignItems: "end" }}>
                        <div><label className="form-label" htmlFor={`venta-producto-${index}`}>Producto</label><select id={`venta-producto-${index}`} name="producto_id" className="form-control" value={detalle.producto_id} onChange={(event) => cambiarDetalle(index, event)}><option value="">Selecciona</option>{productos.filter((producto) => producto.estado === "activo").map((producto) => <option key={producto.id_producto} value={producto.id_producto}>{producto.codigo_sku} - {producto.nombre}</option>)}</select></div>
                        <div><label className="form-label" htmlFor={`venta-cantidad-${index}`}>Cantidad</label><input id={`venta-cantidad-${index}`} name="cantidad" type="number" min="1" step="1" className="form-control" value={detalle.cantidad} onChange={(event) => cambiarDetalle(index, event)} /></div>
                        <div><label className="form-label" htmlFor={`venta-precio-${index}`}>Precio unitario</label><input id={`venta-precio-${index}`} name="precio_unitario" type="number" min="0.01" step="0.01" className="form-control" value={detalle.precio_unitario} onChange={(event) => cambiarDetalle(index, event)} /></div>
                        <button type="button" className="action-button" onClick={() => setDetalles((lineas) => lineas.filter((_, lineaIndex) => lineaIndex !== index))} disabled={detalles.length === 1}>Quitar</button>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="action-button" style={{ marginTop: "0.75rem" }} onClick={() => setDetalles((lineas) => [...lineas, nuevaLinea()])}>+ Agregar producto</button>
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}><button type="submit" className="primary-button" disabled={isSaving}>{isSaving ? "Guardando..." : "Guardar venta"}</button><button type="button" className="action-button" onClick={cerrarFormulario}>Cancelar</button></div>
            </form>
          </div>
        </div>
      )}

      {(detalleLoading || ventaDetalle || detalleError) && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", zIndex: 1000 }}>
          <div className="panel" style={{ width: "min(760px, 100%)", maxHeight: "90vh", overflowY: "auto", padding: "1.75rem" }}>
            {detalleLoading ? (
              <p>Cargando detalle de venta...</p>
            ) : detalleError && !ventaDetalle ? (
              <>
                <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>{detalleError}</div>
                <button type="button" className="action-button" onClick={cerrarDetalle}>Cerrar</button>
              </>
            ) : (
              <>
                <div className="page-header" style={{ marginBottom: "1.5rem" }}>
                  <div>
                    <h1>Detalle de venta #{ventaDetalle.id_venta}</h1>
                    <p>{obtenerUsuario(ventaDetalle.usuario_id)}</p>
                  </div>
                </div>

                {detalleError && <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>{detalleError}</div>}

                <section style={{ marginBottom: "1.5rem" }}>
                  <h3 style={{ marginBottom: "0.75rem" }}>Información</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.75rem 1.5rem" }}>
                    <div><small>N° de venta</small><strong style={{ display: "block" }}>#{ventaDetalle.id_venta}</strong></div>
                    <div><small>Usuario</small><strong style={{ display: "block" }}>{obtenerUsuario(ventaDetalle.usuario_id)}</strong></div>
                    <div><small>Fecha</small><strong style={{ display: "block" }}>{formatearFecha(ventaDetalle.fecha_venta)}</strong></div>
                    <div><small>Comprobante</small><strong style={{ display: "block" }}>{ventaDetalle.numero_factura || "Sin comprobante"}</strong></div>
                    <div><small>Forma de pago</small><select className="form-control" value={ventaDetalle.forma_pago || ""} onChange={(event) => setVentaDetalle((ventaActual) => ({ ...ventaActual, forma_pago: event.target.value }))}><option value="">No especificada</option><option value="Efectivo">Efectivo</option><option value="Yape/Plin">Yape / Plin</option><option value="Tarjeta">Tarjeta</option></select></div>
                    <div><small>Estado</small><select className="form-control" value={estadoDetalle} disabled={ventaDetalle.estado === "anulada" || guardandoEstado} onChange={(event) => setEstadoDetalle(event.target.value)}>{ventaDetalle.estado === "pendiente" && <option value="pendiente">Pendiente</option>}{ventaDetalle.estado === "pagada" && <option value="pagada">Pagada</option>}{ventaDetalle.estado === "pendiente" && <option value="pagada">Pagada</option>}<option value="anulada">Anulada</option></select></div>
                  </div>
                  <div style={{ marginTop: "0.75rem" }}><small>Observaciones</small><div>{ventaDetalle.observaciones || "Sin observaciones"}</div></div>
                </section>

                <section style={{ marginBottom: "1.25rem" }}>
                  <h3 style={{ marginBottom: "0.75rem" }}>Productos</h3>
                  <div className="table-responsive">
                    <table>
                      <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio unitario</th><th>Descuento</th><th>Total de línea</th></tr></thead>
                      <tbody>
                        {(ventaDetalle.detalles || []).map((detalle) => (
                          <tr key={detalle.id_detalle_venta}>
                            <td>{detalle.nombre_producto || "Producto no encontrado"}</td>
                            <td>{detalle.cantidad}</td>
                            <td>S/ {Number(detalle.precio_unitario || 0).toFixed(2)}</td>
                            <td>S/ {Number(detalle.descuento || 0).toFixed(2)}</td>
                            <td>S/ {Number(detalle.total_linea || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section style={{ marginTop: "0.75rem", marginBottom: "1rem" }}>
                  <h3 style={{ marginBottom: "0.5rem" }}>Totales</h3>
                  <div style={{ display: "grid", gap: "0.3rem", maxWidth: "360px", marginLeft: "auto" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1.5rem" }}>
                      <span>Subtotal</span>
                      <strong>S/ {Number(ventaDetalle.subtotal || 0).toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1.5rem" }}>
                      <span>Descuento</span>
                      <strong>S/ {Number(ventaDetalle.descuento || 0).toFixed(2)}</strong>
                    </div>
                    <div style={{ borderTop: "1px solid rgba(148, 163, 184, 0.35)", marginTop: "0.35rem", paddingTop: "0.55rem", display: "flex", justifyContent: "space-between", gap: "1.5rem", fontSize: "1.05rem" }}>
                      <strong>TOTAL</strong>
                      <strong>S/ {Number(ventaDetalle.total || 0).toFixed(2)}</strong>
                    </div>
                  </div>
                </section>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                  <button type="button" className="primary-button" disabled={guardandoEstado || estadoDetalle === ventaDetalle.estado || ventaDetalle.estado === "anulada"} onClick={guardarCambioEstado}>{guardandoEstado ? "Guardando..." : "Guardar cambio"}</button>
                  <button type="button" className="action-button" onClick={cerrarDetalle}>Cerrar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default Ventas;
