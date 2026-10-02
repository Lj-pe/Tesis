import { useEffect, useState } from "react";
import apiClient from "../api/client";

const emptyForm = {
  stock_actual: "",
  stock_minimo: "",
  stock_maximo: "",
  estado_inventario: "normal",
};

const estadoClases = {
  normal: "success-badge",
  bajo: "warning-badge",
  agotado: "danger-badge",
  bloqueado: "inactive-badge",
};

function calcularEstadoInventario(stockActual, stockMinimo, estadoActual) {
  if (estadoActual === "bloqueado") return "bloqueado";

  const actual = Number(stockActual) || 0;
  const minimo = Number(stockMinimo) || 0;

  if (actual === 0) return "agotado";
  if (actual <= minimo) return "bajo";
  return "normal";
}

function Inventario() {
  const [inventarios, setInventarios] = useState([]);
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("todos");
  const [editingInventory, setEditingInventory] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const cargarDatos = async () => {
    try {
      setLoadError("");
      const [inventariosData, productosData, categoriasData] = await Promise.all([
        apiClient.get("/inventarios"),
        apiClient.get("/productos"),
        apiClient.get("/categorias"),
      ]);

      setInventarios(Array.isArray(inventariosData) ? inventariosData : []);
      setProductos(Array.isArray(productosData) ? productosData : []);
      setCategorias(Array.isArray(categoriasData) ? categoriasData : []);
    } catch (error) {
      setLoadError(error.message || "No se pudieron cargar los datos de inventario.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const obtenerProducto = (productoId) =>
    productos.find((producto) => producto.id_producto === productoId);

  const obtenerCategoria = (categoriaId) => {
    const categoria = categorias.find((item) => item.id_categoria === categoriaId);
    return categoria ? categoria.nombre : "Sin categoría";
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return "No disponible";
    return new Date(fecha).toLocaleString("es-PE");
  };

  const abrirEditar = (inventario) => {
    setEditingInventory(inventario);
    setForm({
      stock_actual: String(inventario.stock_actual ?? 0),
      stock_minimo: String(inventario.stock_minimo ?? 0),
      stock_maximo: inventario.stock_maximo === null ? "" : String(inventario.stock_maximo ?? ""),
      estado_inventario: calcularEstadoInventario(
        inventario.stock_actual,
        inventario.stock_minimo,
        inventario.estado_inventario
      ),
    });
    setFormError("");
  };

  const cerrarEditar = () => {
    setEditingInventory(null);
    setForm(emptyForm);
    setFormError("");
  };

  const manejarCambio = (event) => {
    const { name, value } = event.target;
    setForm((estadoActual) => {
      const siguiente = { ...estadoActual, [name]: value };

      if (name === "estado_inventario") {
        siguiente.estado_inventario = value === "bloqueado"
          ? "bloqueado"
          : calcularEstadoInventario(siguiente.stock_actual, siguiente.stock_minimo, value);
      } else if (name === "stock_actual" || name === "stock_minimo") {
        siguiente.estado_inventario = calcularEstadoInventario(
          siguiente.stock_actual,
          siguiente.stock_minimo,
          estadoActual.estado_inventario
        );
      }

      return siguiente;
    });
    setFormError("");
  };

  const validarFormulario = () => {
    const stocks = [form.stock_actual, form.stock_minimo];
    const valores = stocks.map(Number);
    const stockMaximo = form.stock_maximo === "" ? null : Number(form.stock_maximo);

    if (!valores.every(Number.isInteger) || valores.some((valor) => valor < 0)) {
      return "Los stocks deben ser enteros mayores o iguales a 0.";
    }

    if (stockMaximo !== null && (!Number.isInteger(stockMaximo) || stockMaximo < 0)) {
      return "El stock máximo debe ser un entero mayor o igual a 0.";
    }

    if (stockMaximo !== null && stockMaximo < valores[1]) {
      return "El stock máximo debe ser mayor o igual que el stock mínimo.";
    }

    return null;
  };

  const guardarInventario = async (event) => {
    event.preventDefault();
    const errorValidacion = validarFormulario();

    if (errorValidacion) {
      setFormError(errorValidacion);
      return;
    }

    try {
      setIsSaving(true);
      await apiClient.put(`/inventarios/${editingInventory.id_inventario}`, {
        stock_actual: Number(form.stock_actual),
        stock_minimo: Number(form.stock_minimo),
        stock_maximo: form.stock_maximo === "" ? null : Number(form.stock_maximo),
        estado_inventario: calcularEstadoInventario(
          form.stock_actual,
          form.stock_minimo,
          form.estado_inventario
        ),
      });
      await cargarDatos();
      cerrarEditar();
    } catch (error) {
      setFormError(error.message || "No se pudo actualizar el inventario.");
    } finally {
      setIsSaving(false);
    }
  };

  const inventariosVisibles = inventarios.filter((inventario) => {
    const producto = obtenerProducto(inventario.producto_id);
    const texto = busqueda.trim().toLowerCase();
    const coincideBusqueda =
      !texto ||
      producto?.nombre?.toLowerCase().includes(texto) ||
      producto?.codigo_sku?.toLowerCase().includes(texto);
    const estadoCalculado = calcularEstadoInventario(
      inventario.stock_actual,
      inventario.stock_minimo,
      inventario.estado_inventario
    );
    const coincideEstado = estadoFiltro === "todos" || estadoCalculado === estadoFiltro;

    return coincideBusqueda && coincideEstado;
  });

  const stockTotal = inventarios.reduce(
    (total, inventario) => total + Number(inventario.stock_actual || 0),
    0
  );
  const stockBajo = inventarios.filter((item) => calcularEstadoInventario(item.stock_actual, item.stock_minimo, item.estado_inventario) === "bajo").length;
  const sinStock = inventarios.filter((item) => calcularEstadoInventario(item.stock_actual, item.stock_minimo, item.estado_inventario) === "agotado").length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Inventario</h1>
          <p>Control del stock actual de los productos.</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Stock total</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--primary)" }}>
              <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" />
              <path d="m3.5 7.8 8.5 4.3 8.5-4.3M12 12v9" />
            </svg>
          </div>
          <strong>{stockTotal.toLocaleString("es-PE")}</strong>
          <small>Unidades registradas</small>
        </div>
        <div className="stat-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Productos</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--info)" }}>
              <path d="M4 5h16v14H4z" />
              <path d="M8 9h8M8 13h8M8 17h5" />
            </svg>
          </div>
          <strong>{inventarios.length}</strong>
          <small>Productos en inventario</small>
        </div>
        <div className="stat-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Stock bajo</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--warning)" }}>
              <path d="M12 3 2.8 19h18.4L12 3Z" />
              <path d="M12 9v4M12 16.5h.01" />
            </svg>
          </div>
          <strong>{stockBajo}</strong>
          <small>Requieren atención</small>
        </div>
        <div className="stat-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Sin stock</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--danger)" }}>
              <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
              <path d="m9 10 6 6m0-6-6 6" />
            </svg>
          </div>
          <strong>{sinStock}</strong>
          <small>Productos agotados</small>
        </div>
      </div>

      <div className="panel">
        <div className="table-toolbar">
          <input
            className="search-input"
            placeholder="Buscar producto..."
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
          />
          <select
            className="filter-select"
            value={estadoFiltro}
            onChange={(event) => setEstadoFiltro(event.target.value)}
          >
            <option value="todos">Todos</option>
            <option value="normal">Normal</option>
            <option value="bajo">Bajo</option>
            <option value="agotado">Agotado</option>
            <option value="bloqueado">Bloqueado</option>
          </select>
        </div>

        {loadError && (
          <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>
            {loadError}
          </div>
        )}

        <div className="table-responsive inventario-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Stock actual</th>
                <th>Estado</th>
                <th>Actualización</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="7">Cargando inventario...</td></tr>
              ) : inventariosVisibles.length === 0 ? (
                <tr><td colSpan="7">No se encontraron inventarios con los filtros actuales.</td></tr>
              ) : inventariosVisibles.map((inventario) => {
                const producto = obtenerProducto(inventario.producto_id);
                const estado = calcularEstadoInventario(
                  inventario.stock_actual,
                  inventario.stock_minimo,
                  inventario.estado_inventario
                );

                return (
                  <tr key={inventario.id_inventario}>
                    <td>{producto?.codigo_sku || "Sin código"}</td>
                    <td><strong>{producto?.nombre || "Producto no encontrado"}</strong></td>
                    <td>{obtenerCategoria(producto?.categoria_id)}</td>
                    <td>{inventario.stock_actual}</td>
                    <td>
                      <span className={`badge ${estadoClases[estado] || "inactive-badge"}`}>
                        {estado.charAt(0).toUpperCase() + estado.slice(1)}
                      </span>
                    </td>
                    <td>{formatearFecha(inventario.fecha_actualizacion || inventario.fecha_ultima_actualizacion)}</td>
                    <td>
                      <button className="action-button" onClick={() => abrirEditar(inventario)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editingInventory && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            zIndex: 1000,
          }}
        >
          <div className="panel" style={{ width: "min(520px, 100%)", padding: "1.5rem" }}>
            <div className="page-header" style={{ marginBottom: "1rem" }}>
              <div>
                <h1>Editar inventario</h1>
                <p>Actualiza los valores de stock del producto.</p>
              </div>
            </div>

            {formError && (
              <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>
                {formError}
              </div>
            )}

            <form onSubmit={guardarInventario}>
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {[
                  ["stock_actual", "Stock actual"],
                  ["stock_minimo", "Stock mínimo"],
                  ["stock_maximo", "Stock máximo"],
                ].map(([name, label]) => (
                  <div key={name}>
                    <label className="form-label" htmlFor={`inventario-${name}`}>{label}</label>
                    <input
                      id={`inventario-${name}`}
                      name={name}
                      type="number"
                      min="0"
                      step="1"
                      className="form-control"
                      value={form[name]}
                      onChange={manejarCambio}
                    />
                  </div>
                ))}

                <div>
                  <label className="form-label" htmlFor="inventario-estado">Estado</label>
                  <select
                    id="inventario-estado"
                    name="estado_inventario"
                    className="form-control"
                    value={form.estado_inventario}
                    disabled={form.estado_inventario === "bloqueado"}
                    onChange={manejarCambio}
                  >
                    <option value="normal">Normal</option>
                    <option value="bajo">Bajo</option>
                    <option value="agotado">Agotado</option>
                    <option value="bloqueado">Bloqueado</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
                <button type="submit" className="primary-button" disabled={isSaving}>
                  {isSaving ? "Guardando..." : "Guardar cambios"}
                </button>
                <button type="button" className="action-button" onClick={cerrarEditar}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default Inventario;
