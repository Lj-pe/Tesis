import { useEffect, useState } from "react";
import apiClient from "../api/client";

const emptyForm = {
  proveedor_id: "",
  numero_factura: "",
  fecha_compra: "",
  fecha_recepcion: "",
  estado: "pendiente",
  observaciones: "",
};

const nuevaLinea = () => ({ producto_id: "", cantidad: "", costo_unitario: "" });

function Compras() {
  const [compras, setCompras] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("todos");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [detalles, setDetalles] = useState([nuevaLinea()]);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [compraDetalle, setCompraDetalle] = useState(null);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [detalleError, setDetalleError] = useState("");
  const [transicionandoEstado, setTransicionandoEstado] = useState(false);
  const [estadoDetalle, setEstadoDetalle] = useState("");

  const cargarDatos = async () => {
    try {
      setLoadError("");
      const [comprasData, proveedoresData, productosData] = await Promise.all([
        apiClient.get("/compras"),
        apiClient.get("/proveedores"),
        apiClient.get("/productos"),
      ]);
      setCompras(Array.isArray(comprasData) ? comprasData : []);
      setProveedores(Array.isArray(proveedoresData) ? proveedoresData : []);
      setProductos(Array.isArray(productosData) ? productosData : []);
    } catch (error) {
      setLoadError(error.message || "No se pudieron cargar las compras.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const abrirFormulario = () => {
    setForm({ ...emptyForm, fecha_compra: new Date().toISOString().slice(0, 10) });
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

  const abrirDetalle = async (compraId) => {
    setDetalleLoading(true);
    setDetalleError("");
    setCompraDetalle(null);

    try {
      const data = await apiClient.get(`/compras/${compraId}`);
      setCompraDetalle(data);
      setEstadoDetalle(data.estado || "");
    } catch (error) {
      setDetalleError(error.message || "No se pudo cargar el detalle de la compra.");
    } finally {
      setDetalleLoading(false);
    }
  };

  const cerrarDetalle = () => {
    setCompraDetalle(null);
    setDetalleError("");
    setEstadoDetalle("");
  };

  const cambiarEstadoCompra = async (estado) => {
    if (!compraDetalle) return;

    try {
      setTransicionandoEstado(true);
      await apiClient.post(`/compras/${compraDetalle.id_compra}/estado`, { estado });
      const detalleActualizado = await apiClient.get(`/compras/${compraDetalle.id_compra}`);
      setCompraDetalle(detalleActualizado);
      setEstadoDetalle(detalleActualizado.estado || "");
      await cargarDatos();
    } catch (error) {
      setDetalleError(error.message || "No se pudo cambiar el estado de la compra.");
    } finally {
      setTransicionandoEstado(false);
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

  const agregarDetalle = () => setDetalles((lineas) => [...lineas, nuevaLinea()]);

  const quitarDetalle = (index) => {
    setDetalles((lineas) => lineas.filter((_, lineaIndex) => lineaIndex !== index));
  };

  const guardarCompra = async (event) => {
    event.preventDefault();

    if (!form.proveedor_id || !form.fecha_compra || detalles.length === 0) {
      setFormError("Selecciona un proveedor, una fecha y al menos un producto.");
      return;
    }

    const detallesPayload = detalles.map((detalle) => ({
      producto_id: Number(detalle.producto_id),
      cantidad: Number(detalle.cantidad),
      costo_unitario: Number(detalle.costo_unitario),
    }));

    if (detallesPayload.some((detalle) => !detalle.producto_id || detalle.cantidad <= 0 || detalle.costo_unitario <= 0)) {
      setFormError("Cada producto debe tener cantidad y costo unitario mayores que 0.");
      return;
    }

    try {
      setIsSaving(true);
      await apiClient.post("/compras/transaccional", {
        proveedor_id: Number(form.proveedor_id),
        numero_factura: form.numero_factura.trim() || null,
        fecha_compra: form.fecha_compra,
        fecha_recepcion: form.fecha_recepcion || null,
        estado: form.estado,
        observaciones: form.observaciones.trim() || null,
        detalles: detallesPayload,
      });
      await cargarDatos();
      cerrarFormulario();
    } catch (error) {
      setFormError(error.message || "No se pudo registrar la compra.");
    } finally {
      setIsSaving(false);
    }
  };

  const obtenerProveedor = (proveedorId) =>
    proveedores.find((proveedor) => proveedor.id_proveedor === proveedorId);

  const comprasVisibles = compras
    .filter((compra) => {
      const proveedor = obtenerProveedor(compra.proveedor_id);
      const texto = search.trim().toLowerCase();
      const coincideBusqueda = !texto ||
        String(compra.id_compra).includes(texto) ||
        compra.numero_factura?.toLowerCase().includes(texto) ||
        proveedor?.nombre?.toLowerCase().includes(texto);
      const coincideEstado = estadoFiltro === "todos" || compra.estado === estadoFiltro;
      return coincideBusqueda && coincideEstado;
    })
    .sort((a, b) => new Date(b.fecha_compra) - new Date(a.fecha_compra) || b.id_compra - a.id_compra);

  const formatearFecha = (fecha) => fecha ? new Date(fecha).toLocaleDateString("es-PE") : "No disponible";

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Compras</h1>
          <p>Registro de compras realizadas a proveedores.</p>
        </div>
        <button className="primary-button" onClick={abrirFormulario}>+ Nueva compra</button>
      </div>

      <div className="panel">
        <div className="table-toolbar">
          <input className="search-input" placeholder="Buscar compra..." value={search} onChange={(event) => setSearch(event.target.value)} />
          <select className="filter-select" value={estadoFiltro} onChange={(event) => setEstadoFiltro(event.target.value)}>
            <option value="todos">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="recibida">Recibida</option>
            <option value="anulada">Anulada</option>
          </select>
        </div>

        {loadError && <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>{loadError}</div>}

        <div className="table-responsive compras-table-scroll">
          <table>
            <thead>
              <tr>
                <th>N° compra</th><th>Proveedor</th><th>Fecha</th><th>Comprobante</th><th>Total</th><th>Estado</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="7">Cargando compras...</td></tr>
              ) : comprasVisibles.length === 0 ? (
                <tr><td colSpan="7">No se encontraron compras.</td></tr>
              ) : comprasVisibles.map((compra) => (
                <tr key={compra.id_compra}>
                  <td>#{compra.id_compra}</td>
                  <td><strong>{obtenerProveedor(compra.proveedor_id)?.nombre || "Proveedor no encontrado"}</strong></td>
                  <td>{formatearFecha(compra.fecha_compra)}</td>
                  <td>{compra.numero_factura || "Sin comprobante"}</td>
                  <td>S/ {Number(compra.total || 0).toFixed(2)}</td>
                  <td><span className={`badge ${compra.estado === "recibida" ? "success-badge" : compra.estado === "anulada" ? "inactive-badge" : "warning-badge"}`}>{compra.estado}</span></td>
                  <td><button className="action-button" type="button" onClick={() => abrirDetalle(compra.id_compra)}>Ver</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", zIndex: 1000 }}>
          <div className="panel" style={{ width: "min(720px, 100%)", maxHeight: "90vh", overflowY: "auto", padding: "1.5rem" }}>
            <div className="page-header" style={{ marginBottom: "1rem" }}>
              <div><h1>Nueva compra</h1><p>Registra la compra y sus productos.</p></div>
            </div>
            {formError && <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>{formError}</div>}
            <form onSubmit={guardarCompra}>
              <div style={{ display: "grid", gap: "0.75rem" }}>
                <div>
                  <label className="form-label" htmlFor="compra-proveedor">Proveedor</label>
                  <select id="compra-proveedor" name="proveedor_id" className="form-control" value={form.proveedor_id} onChange={cambiarCampo}>
                    <option value="">Selecciona un proveedor</option>
                    {proveedores.filter((proveedor) => proveedor.estado === "activo").map((proveedor) => <option key={proveedor.id_proveedor} value={proveedor.id_proveedor}>{proveedor.nombre}</option>)}
                  </select>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.75rem" }}>
                  <div><label className="form-label" htmlFor="compra-fecha">Fecha de compra</label><input id="compra-fecha" name="fecha_compra" type="date" className="form-control" value={form.fecha_compra} onChange={cambiarCampo} /></div>
                  <div><label className="form-label" htmlFor="compra-recepcion">Fecha de recepción</label><input id="compra-recepcion" name="fecha_recepcion" type="date" className="form-control" value={form.fecha_recepcion} onChange={cambiarCampo} /></div>
                </div>
                <div><label className="form-label" htmlFor="compra-factura">Comprobante</label><input id="compra-factura" name="numero_factura" className="form-control" value={form.numero_factura} onChange={cambiarCampo} /></div>
                <div><label className="form-label" htmlFor="compra-estado">Estado</label><select id="compra-estado" name="estado" className="form-control" value={form.estado} onChange={cambiarCampo}><option value="pendiente">Pendiente</option><option value="recibida">Recibida</option></select></div>
                <div><label className="form-label" htmlFor="compra-observaciones">Observaciones</label><textarea id="compra-observaciones" name="observaciones" rows="2" className="form-control" value={form.observaciones} onChange={cambiarCampo} /></div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}><label className="form-label">Productos</label><button type="button" className="action-button" onClick={agregarDetalle}>+ Agregar producto</button></div>
                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    {detalles.map((detalle, index) => (
                      <div key={index} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: "0.5rem", alignItems: "end" }}>
                        <div><label className="form-label" htmlFor={`producto-${index}`}>Producto</label><select id={`producto-${index}`} name="producto_id" className="form-control" value={detalle.producto_id} onChange={(event) => cambiarDetalle(index, event)}><option value="">Selecciona</option>{productos.filter((producto) => producto.estado === "activo").map((producto) => <option key={producto.id_producto} value={producto.id_producto}>{producto.codigo_sku} - {producto.nombre}</option>)}</select></div>
                        <div><label className="form-label" htmlFor={`cantidad-${index}`}>Cantidad</label><input id={`cantidad-${index}`} name="cantidad" type="number" min="1" step="1" className="form-control" value={detalle.cantidad} onChange={(event) => cambiarDetalle(index, event)} /></div>
                        <div><label className="form-label" htmlFor={`costo-${index}`}>Costo unitario</label><input id={`costo-${index}`} name="costo_unitario" type="number" min="0.01" step="0.01" className="form-control" value={detalle.costo_unitario} onChange={(event) => cambiarDetalle(index, event)} /></div>
                        <button type="button" className="action-button" onClick={() => quitarDetalle(index)} disabled={detalles.length === 1}>Quitar</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}><button type="submit" className="primary-button" disabled={isSaving}>{isSaving ? "Guardando..." : "Guardar compra"}</button><button type="button" className="action-button" onClick={cerrarFormulario}>Cancelar</button></div>
            </form>
          </div>
        </div>
      )}

      {(detalleLoading || compraDetalle || detalleError) && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", zIndex: 1000 }}>
          <div className="panel" style={{ width: "min(760px, 100%)", maxHeight: "90vh", overflowY: "auto", padding: "1.75rem" }}>
            {detalleLoading ? (
              <p>Cargando detalle de compra...</p>
            ) : detalleError && !compraDetalle ? (
              <>
                <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>{detalleError}</div>
                <button type="button" className="action-button" onClick={cerrarDetalle}>Cerrar</button>
              </>
            ) : (
              <>
                <div className="page-header" style={{ marginBottom: "1.5rem" }}>
                  <div>
                    <h1>Detalle de compra #{compraDetalle.id_compra}</h1>
                    <p>{obtenerProveedor(compraDetalle.proveedor_id)?.nombre || "Proveedor no encontrado"}</p>
                  </div>
                </div>

                {detalleError && <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>{detalleError}</div>}

                <section style={{ marginBottom: "1.5rem" }}>
                  <h3 style={{ marginBottom: "0.75rem" }}>Información</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.75rem 1.5rem" }}>
                    <div><small>Proveedor</small><strong style={{ display: "block" }}>{obtenerProveedor(compraDetalle.proveedor_id)?.nombre || "Proveedor no encontrado"}</strong></div>
                    <div><small>Comprobante</small><strong style={{ display: "block" }}>{compraDetalle.numero_factura || "Sin comprobante"}</strong></div>
                    <div><small>Fecha de compra</small><strong style={{ display: "block" }}>{formatearFecha(compraDetalle.fecha_compra)}</strong></div>
                    <div><small>Fecha de recepción</small><strong style={{ display: "block" }}>{formatearFecha(compraDetalle.fecha_recepcion)}</strong></div>
                  </div>
                  <div style={{ marginTop: "0.75rem" }}><small>Observaciones</small><div>{compraDetalle.observaciones || "Sin observaciones"}</div></div>
                </section>

                <section style={{ marginBottom: "1.25rem" }}>
                  <h3 style={{ marginBottom: "0.75rem" }}>Productos</h3>

                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr><th>Producto</th><th>Cantidad</th><th>Costo unitario</th><th>Importe</th></tr>
                    </thead>
                    <tbody>
                      {(compraDetalle.detalles || []).map((detalle) => (
                        <tr key={detalle.id_detalle_compra}>
                          <td>{detalle.nombre_producto || "Producto no encontrado"}</td>
                          <td>{detalle.cantidad}</td>
                          <td>S/ {Number(detalle.costo_unitario || 0).toFixed(2)}</td>
                          <td>S/ {Number(detalle.importe || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: "grid", gap: "0.25rem", marginTop: "1rem", textAlign: "right" }}>
                  <div>Subtotal: <strong>S/ {Number(compraDetalle.subtotal || 0).toFixed(2)}</strong></div>
                  <div>Total: <strong>S/ {Number(compraDetalle.total || 0).toFixed(2)}</strong></div>
                </div>
                </section>

                <section style={{ marginBottom: "1.5rem" }}>
                  <h3 style={{ marginBottom: "0.75rem" }}>Estado</h3>
                  <select
                    className="form-control"
                    value={estadoDetalle}
                    disabled={compraDetalle.estado !== "pendiente" || transicionandoEstado}
                    onChange={(event) => setEstadoDetalle(event.target.value)}
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="recibida">Recibida</option>
                    <option value="anulada">Anulada</option>
                  </select>
                </section>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem" }}>
                  {compraDetalle.estado === "pendiente" && (
                    <button
                      type="button"
                      className="primary-button"
                      disabled={transicionandoEstado || estadoDetalle === "pendiente"}
                      onClick={() => cambiarEstadoCompra(estadoDetalle)}
                    >
                      {transicionandoEstado ? "Guardando..." : "Guardar cambio"}
                    </button>
                  )}
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

export default Compras;
