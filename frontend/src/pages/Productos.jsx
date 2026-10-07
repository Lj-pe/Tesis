import { useEffect, useState } from "react";
import apiClient from "../api/client";

const emptyForm = {
  categoria_id: "",
  codigo_sku: "",
  nombre: "",
  descripcion: "",
  estado: "activo",
  unidad_medida: "",
  precio_venta_actual: "",
  costo_promedio_actual: "",
};

function Productos() {
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("todos");

  const cargarCategorias = async () => {
    const data = await apiClient.get("/categorias");
    setCategorias(Array.isArray(data) ? data : []);
  };

  const cargarProductos = async () => {
    try {
      const data = await apiClient.get("/productos");
      setProductos(Array.isArray(data) ? data : []);
    } catch (error) {
      setProductos([]);
      setSubmitError(error.message || "No se pudieron cargar los productos.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        await cargarCategorias();
        await cargarProductos();
      } catch (error) {
        setSubmitError(error.message || "No se pudieron cargar los datos.");
      } finally {
        setIsLoading(false);
      }
    };

    cargarDatos();
  }, []);

  const obtenerCategoria = (categoriaId) => {
    const categoria = categorias.find((item) => item.id_categoria === categoriaId);
    return categoria ? categoria.nombre : "Sin categoría";
  };

  const resetFormulario = () => {
    setForm(emptyForm);
    setErrors({});
    setSubmitError("");
    setEditingProduct(null);
  };

  const abrirCrear = () => {
    resetFormulario();
    setShowForm(true);
  };

  const abrirEditar = (producto) => {
    setEditingProduct(producto);
    setForm({
      categoria_id: String(producto.categoria_id ?? ""),
      codigo_sku: producto.codigo_sku ?? "",
      nombre: producto.nombre ?? "",
      descripcion: producto.descripcion ?? "",
      estado: producto.estado ?? "activo",
      unidad_medida: producto.unidad_medida ?? "",
      precio_venta_actual: producto.precio_venta_actual ?? "",
      costo_promedio_actual: producto.costo_promedio_actual ?? "",
    });
    setErrors({});
    setSubmitError("");
    setShowForm(true);
  };

  const cerrarFormulario = () => {
    setShowForm(false);
    resetFormulario();
  };

  const manejarCambio = (event) => {
    const { name, value } = event.target;
    setForm((estadoActual) => ({ ...estadoActual, [name]: value }));
    setErrors((erroresActuales) => ({ ...erroresActuales, [name]: "" }));
  };

  const validarFormulario = () => {
    const nuevosErrores = {};

    if (!form.categoria_id) nuevosErrores.categoria_id = "Selecciona una categoría.";
    if (!form.codigo_sku.trim()) nuevosErrores.codigo_sku = "El SKU es obligatorio.";
    if (!form.nombre.trim()) nuevosErrores.nombre = "El nombre es obligatorio.";
    if (!form.unidad_medida.trim()) nuevosErrores.unidad_medida = "La unidad de medida es obligatoria.";
    if (form.precio_venta_actual === "" || Number(form.precio_venta_actual) < 0) {
      nuevosErrores.precio_venta_actual = "Ingresa un precio válido.";
    }
    if (
      form.costo_promedio_actual !== "" &&
      Number(form.costo_promedio_actual) < 0
    ) {
      nuevosErrores.costo_promedio_actual = "Ingresa un costo válido.";
    }
    return nuevosErrores;
  };

  const enviarFormulario = async (event) => {
    event.preventDefault();

    const validacion = validarFormulario();
    if (Object.keys(validacion).length > 0) {
      setErrors(validacion);
      return;
    }

    const payload = {
      categoria_id: Number(form.categoria_id),
      codigo_sku: form.codigo_sku.trim(),
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      estado: form.estado,
      unidad_medida: form.unidad_medida.trim(),
      precio_venta_actual: Number(form.precio_venta_actual),
      costo_promedio_actual:
        form.costo_promedio_actual === "" ? null : Number(form.costo_promedio_actual),
    };

    try {
      if (editingProduct) {
        await apiClient.put(`/productos/${editingProduct.id_producto}`, payload);
      } else {
        await apiClient.post("/productos", payload);
      }

      await cargarProductos();
      cerrarFormulario();
    } catch (error) {
      setSubmitError(error.message || "No se pudo guardar el producto.");
    }
  };

  const confirmarEliminacion = async () => {
    if (!deleteTarget) return;

    try {
      await apiClient.delete(`/productos/${deleteTarget.id_producto}`);
      await cargarProductos();
      setDeleteTarget(null);
      setDeleteError("");
    } catch (error) {
      const mensajeError = error.message || "";
      const esRestriccionRelacionada = /foreign key|constraint|referenced|associated|er_row_is_referenced/i.test(
        mensajeError
      );

      setDeleteError(
        esRestriccionRelacionada
          ? "No se puede eliminar este producto porque tiene registros asociados, como inventario."
          : mensajeError || "No se pudo eliminar el producto."
      );
    }
  };

  const productosFiltrados = productos.filter((producto) => {
    const textoBusqueda = busqueda.trim().toLowerCase();
    const coincideBusqueda =
      !textoBusqueda ||
      (producto.nombre && producto.nombre.toLowerCase().includes(textoBusqueda)) ||
      (producto.codigo_sku && producto.codigo_sku.toLowerCase().includes(textoBusqueda));

    const coincideEstado =
      estadoFiltro === "todos" || producto.estado === estadoFiltro;

    return coincideBusqueda && coincideEstado;
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Productos</h1>
          <p>Administración del catálogo de productos.</p>
        </div>

        <button className="primary-button" onClick={abrirCrear}>
          + Nuevo producto
        </button>
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
            <option value="todos">Todos los estados</option>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
          </select>
        </div>

        {submitError && (
          <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>
            {submitError}
          </div>
        )}

        <div className="table-responsive productos-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Precio</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="6">Cargando productos...</td>
                </tr>
              ) : productosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="6">No se encontraron productos con los filtros actuales.</td>
                </tr>
              ) : (
                productosFiltrados.map((producto) => (
                  <tr key={producto.id_producto}>
                    <td>{producto.codigo_sku}</td>

                    <td>
                      <strong>{producto.nombre}</strong>
                    </td>

                    <td>{obtenerCategoria(producto.categoria_id)}</td>

                    <td>S/ {Number(producto.precio_venta_actual || 0).toFixed(2)}</td>

                    <td>
                      <span
                        className={
                          producto.estado === "activo"
                            ? "badge success-badge"
                            : "badge inactive-badge"
                        }
                      >
                        {producto.estado === "activo" ? "Activo" : "Inactivo"}
                        {producto.estado === "inactivo" && producto.fecha_inactivacion && (
                          <small style={{ display: "block", marginTop: "0.2rem" }}>
                            Desde {new Date(producto.fecha_inactivacion).toLocaleDateString("es-PE")}
                          </small>
                        )}
                      </span>
                    </td>

                    <td>
                      <button
                        className="action-button"
                        onClick={() => abrirEditar(producto)}
                      >
                        Editar
                      </button>

                      <button
                        className="action-button"
                        onClick={() => setDeleteTarget(producto)}
                        style={{ marginLeft: "0.5rem" }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
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
          <div
            className="panel"
            style={{
              width: "min(640px, 100%)",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "1.5rem",
            }}
          >
            <div className="page-header" style={{ marginBottom: "1rem" }}>
              <div>
                <h1>{editingProduct ? "Editar producto" : "Nuevo producto"}</h1>
                <p>
                  {editingProduct
                    ? "Actualiza los datos del producto."
                    : "Registra un nuevo producto."}
                </p>
              </div>
            </div>

            {submitError && (
              <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>
                {submitError}
              </div>
            )}

            <form onSubmit={enviarFormulario}>
              <div style={{ display: "grid", gap: "0.75rem" }}>
                <div>
                  <label className="form-label" htmlFor="categoria_id">Categoría</label>
                  <select
                    id="categoria_id"
                    name="categoria_id"
                    className="form-control"
                    value={form.categoria_id}
                    onChange={manejarCambio}
                  >
                    <option value="">Selecciona una categoría</option>
                    {categorias.map((categoria) => (
                      <option key={categoria.id_categoria} value={categoria.id_categoria}>
                        {categoria.nombre}
                      </option>
                    ))}
                  </select>
                  {errors.categoria_id && (
                    <span className="error-message" style={{ display: "block", marginTop: "0.25rem" }}>
                      {errors.categoria_id}
                    </span>
                  )}
                </div>

                <div>
                  <label className="form-label" htmlFor="codigo_sku">Código</label>
                  <input
                    id="codigo_sku"
                    name="codigo_sku"
                    className="form-control"
                    value={form.codigo_sku}
                    onChange={manejarCambio}
                  />
                  {errors.codigo_sku && (
                    <span className="error-message" style={{ display: "block", marginTop: "0.25rem" }}>
                      {errors.codigo_sku}
                    </span>
                  )}
                </div>

                <div>
                  <label className="form-label" htmlFor="nombre">Producto</label>
                  <input
                    id="nombre"
                    name="nombre"
                    className="form-control"
                    value={form.nombre}
                    onChange={manejarCambio}
                  />
                  {errors.nombre && (
                    <span className="error-message" style={{ display: "block", marginTop: "0.25rem" }}>
                      {errors.nombre}
                    </span>
                  )}
                </div>

                <div>
                  <label className="form-label" htmlFor="descripcion">Descripción</label>
                  <textarea
                    id="descripcion"
                    name="descripcion"
                    className="form-control"
                    rows="3"
                    value={form.descripcion}
                    onChange={manejarCambio}
                  />
                </div>

                <div>
                  <label className="form-label" htmlFor="unidad_medida">Unidad de medida</label>
                  <input
                    id="unidad_medida"
                    name="unidad_medida"
                    className="form-control"
                    value={form.unidad_medida}
                    onChange={manejarCambio}
                  />
                  {errors.unidad_medida && (
                    <span className="error-message" style={{ display: "block", marginTop: "0.25rem" }}>
                      {errors.unidad_medida}
                    </span>
                  )}
                </div>

                <div>
                  <label className="form-label" htmlFor="precio_venta_actual">Precio de venta</label>
                  <input
                    id="precio_venta_actual"
                    name="precio_venta_actual"
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-control"
                    value={form.precio_venta_actual}
                    onChange={manejarCambio}
                  />
                  {errors.precio_venta_actual && (
                    <span className="error-message" style={{ display: "block", marginTop: "0.25rem" }}>
                      {errors.precio_venta_actual}
                    </span>
                  )}
                </div>

                <div>
                  <label className="form-label" htmlFor="costo_promedio_actual">Costo promedio</label>
                  <input
                    id="costo_promedio_actual"
                    name="costo_promedio_actual"
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-control"
                    value={form.costo_promedio_actual}
                    onChange={manejarCambio}
                  />
                  {errors.costo_promedio_actual && (
                    <span className="error-message" style={{ display: "block", marginTop: "0.25rem" }}>
                      {errors.costo_promedio_actual}
                    </span>
                  )}
                </div>

                <div>
                  <label className="form-label" htmlFor="estado">Estado</label>
                  <select
                    id="estado"
                    name="estado"
                    className="form-control"
                    value={form.estado}
                    onChange={manejarCambio}
                  >
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                    {editingProduct?.estado === "suspendido" && (
                      <option value="suspendido">Suspendido</option>
                    )}
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
                <button type="submit" className="primary-button">
                  {editingProduct ? "Guardar cambios" : "Guardar producto"}
                </button>
                <button
                  type="button"
                  className="action-button"
                  onClick={cerrarFormulario}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
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
          <div
            className="panel"
            style={{
              width: "min(420px, 100%)",
              padding: "1.5rem",
            }}
          >
            <div className="page-header" style={{ marginBottom: "1rem" }}>
              <div>
                <h1>Eliminar producto</h1>
                <p>¿Desea eliminar este producto?</p>
              </div>
            </div>

            <p style={{ marginBottom: "1rem" }}>
              <strong>{deleteTarget.nombre}</strong>
            </p>

            {deleteError && (
              <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>
                {deleteError}
              </div>
            )}

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button className="primary-button" type="button" onClick={confirmarEliminacion}>
                Eliminar
              </button>
              <button
                className="action-button"
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError("");
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Productos;