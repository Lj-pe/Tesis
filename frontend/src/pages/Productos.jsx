import { useEffect, useState } from "react";
import apiClient from "../api/client";

const emptyForm = {
  categoria_id: "",
  codigo: "",
  codigo_barras: "",
  nombre: "",
  marca: "",
  presentacion: "",
  precio_venta: "",
  dias_seguridad: "",
  activo: true,
};

const FIELD_ICONS = {
  category: <path d="M4 5h16M4 12h16M4 19h16" />,
  code: <path d="M8 8 5 12l3 4m8-8 3 4-3 4m-3-9-2 10" />,
  barcode: <path d="M4 5v14m3-14v14m3-14v14m5-14v14m3-14v14m2-14v14" />,
  product: <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm-8 4.5 8 4.5 8-4.5M12 12v9" />,
  brand: <path d="M12 3 4 7v5c0 5 3.4 8 8 9 4.6-1 8-4 8-9V7l-8-4Zm-3 9 2 2 4-4" />,
  presentation: <path d="M4 7h16M6 4h12v16H6zM9 11h6m-6 3h6" />,
  price: <path d="M12 3v18m5-14.5c-1-1-2.5-1.5-5-1.5-2.2 0-4 1.1-4 3s1.6 2.8 4 3.5 5 1.2 5 3.5-1.8 4-5 4c-2.3 0-4-.7-5-1.8" />,
  days: <path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1Z M8 13h2m4 0h2m-8 3h2" />,
  status: <path d="M12 3v9l6.4 3.7M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
};

function ProductFieldLabel({ htmlFor, icon, children }) {
  return <label className="form-label product-form-label" htmlFor={htmlFor}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {FIELD_ICONS[icon]}
    </svg>
    {children}
  </label>;
}

function ActionIcon({ type }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {type === "edit"
      ? <path d="m14 5 5 5M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z M13 6l5 5" />
      : <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-7.1-2.9 14.2-14.2" />}
  </svg>;
}

const PRODUCT_TABLE_ICONS = {
  code: <path d="M8 8 5 12l3 4m8-8 3 4-3 4m-3-9-2 10" />,
  product: <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm-8 4.5 8 4.5 8-4.5M12 12v9" />,
  presentation: <path d="M4 7h16M6 4h12v16H6zM9 11h6m-6 3h6" />,
  category: <path d="M3 6h7l2 2h9v10H3z M3 9h18" />,
  price: <path d="M12 3v18m5-14.5c-1-1-2.5-1.5-5-1.5-2.2 0-4 1.1-4 3s1.6 2.8 4 3.5 5 1.2 5 3.5-1.8 4-5 4c-2.3 0-4-.7-5-1.8" />,
  status: <path d="M12 3v9l6.4 3.7M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  actions: <path d="M4 6h16M4 12h16M4 18h16" />,
};

function ProductTableHeading({ icon, children }) {
  return <span className="category-table-heading">
    <svg className="category-display-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PRODUCT_TABLE_ICONS[icon]}
    </svg>
    {children}
  </span>;
}

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
    const categoria = categorias.find((item) => String(item.id) === String(categoriaId));
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
      codigo: producto.codigo ?? "",
      codigo_barras: producto.codigo_barras ?? "",
      nombre: producto.nombre ?? "",
      marca: producto.marca ?? "",
      presentacion: producto.presentacion ?? "",
      precio_venta: producto.precio_venta ?? "",
      dias_seguridad: producto.dias_seguridad ?? "",
      activo: Boolean(producto.activo),
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
    if (!form.codigo.trim()) nuevosErrores.codigo = "El código es obligatorio.";
    if (!form.nombre.trim()) nuevosErrores.nombre = "El nombre es obligatorio.";
    if (!form.presentacion.trim()) nuevosErrores.presentacion = "La presentación es obligatoria.";
    if (!/^\d+(?:\.\d+)?$/.test(form.precio_venta)) nuevosErrores.precio_venta = "Ingresa un precio válido.";
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
      categoria_id: String(form.categoria_id),
      codigo: form.codigo.trim(),
      codigo_barras: form.codigo_barras.trim() || null,
      nombre: form.nombre.trim(),
      marca: form.marca.trim() || null,
      presentacion: form.presentacion.trim(),
      precio_venta: form.precio_venta,
      dias_seguridad: form.dias_seguridad === "" ? undefined : Number(form.dias_seguridad),
      activo: form.activo,
    };

    try {
      if (editingProduct) {
        await apiClient.put(`/productos/${editingProduct.id}`, payload);
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
      await apiClient.delete(`/productos/${deleteTarget.id}`);
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
      (producto.codigo && producto.codigo.toLowerCase().includes(textoBusqueda));

    const coincideEstado =
      estadoFiltro === "todos" || String(Boolean(producto.activo)) === estadoFiltro;

    return coincideBusqueda && coincideEstado;
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="category-page-title"><svg className="category-display-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm-8 4.5 8 4.5 8-4.5M12 12v9" /></svg>Productos</h1>
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
            placeholder="Buscar por código o nombre..."
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
          />

          <select
            className="filter-select"
            value={estadoFiltro}
            onChange={(event) => setEstadoFiltro(event.target.value)}
          >
            <option value="todos">Todos los estados</option>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
          </select>
        </div>
        <div className="products-total">Productos en total: <strong>{isLoading ? "—" : productos.length}</strong></div>

        {submitError && (
          <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>
            {submitError}
          </div>
        )}

        <div className="table-responsive productos-table-scroll">
          <table>
            <thead>
              <tr>
                <th><ProductTableHeading icon="code">Código</ProductTableHeading></th>
                <th><ProductTableHeading icon="product">Producto</ProductTableHeading></th>
                <th><ProductTableHeading icon="presentation">Presentación</ProductTableHeading></th>
                <th><ProductTableHeading icon="category">Categoría</ProductTableHeading></th>
                <th><ProductTableHeading icon="price">Precio</ProductTableHeading></th>
                <th><ProductTableHeading icon="status">Estado</ProductTableHeading></th>
                <th><ProductTableHeading icon="actions">Acciones</ProductTableHeading></th>
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="7">Cargando productos...</td>
                </tr>
              ) : productosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="7">No se encontraron productos con los filtros actuales.</td>
                </tr>
              ) : (
                productosFiltrados.map((producto) => (
                  <tr key={producto.id}>
                    <td>{producto.codigo}</td>

                    <td>
                      <strong>{producto.nombre}</strong>
                    </td>

                    <td>{producto.presentacion || "—"}</td>
                    <td>{obtenerCategoria(producto.categoria_id)}</td>

                    <td>S/ {String(producto.precio_venta ?? "0.00")}</td>

                    <td>
                      <span
                        className={
                          producto.activo
                            ? "badge success-badge product-status-badge is-active"
                            : "badge inactive-badge product-status-badge"
                        }
                      >
                        <span className="product-status-dot" aria-hidden="true" />
                        {producto.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>

                    <td>
                      <button
                        className="action-button product-action-button"
                        type="button"
                        onClick={() => abrirEditar(producto)}
                      >
                        <ActionIcon type="edit" />
                        Editar
                      </button>

                      <button
                        className="action-button product-action-button is-destructive"
                        type="button"
                        onClick={() => setDeleteTarget(producto)}
                      >
                        <ActionIcon type="deactivate" />
                        Desactivar
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
        <div className="product-modal-backdrop">
          <div className="panel product-form-modal">
            <div className="page-header product-form-header">
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
              <div className="product-form-fields">
                <div className="product-form-field">
                  <ProductFieldLabel htmlFor="categoria_id" icon="category">Categoría</ProductFieldLabel>
                  <select
                    id="categoria_id"
                    name="categoria_id"
                    className="form-control"
                    value={form.categoria_id}
                    onChange={manejarCambio}
                  >
                    <option value="">Selecciona una categoría</option>
                    {categorias.map((categoria) => (
                      <option key={categoria.id} value={categoria.id}>
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

                <div className="product-form-field">
                  <ProductFieldLabel htmlFor="codigo" icon="code">Código</ProductFieldLabel>
                  <input
                    id="codigo"
                    name="codigo"
                    className="form-control"
                    value={form.codigo}
                    onChange={manejarCambio}
                    placeholder={!editingProduct ? "Ej.: BEB-001" : undefined}
                  />
                  {errors.codigo && (
                    <span className="error-message" style={{ display: "block", marginTop: "0.25rem" }}>
                      {errors.codigo}
                    </span>
                  )}
                </div>

                <div className="product-form-field">
                  <ProductFieldLabel htmlFor="codigo_barras" icon="barcode">Código de barras</ProductFieldLabel>
                  <input id="codigo_barras" name="codigo_barras" className="form-control" value={form.codigo_barras} onChange={manejarCambio} placeholder={!editingProduct ? "Ej.: 7750123456789" : undefined} />
                </div>

                <div className="product-form-field">
                  <ProductFieldLabel htmlFor="nombre" icon="product">Producto</ProductFieldLabel>
                  <input
                    id="nombre"
                    name="nombre"
                    className="form-control"
                    value={form.nombre}
                    onChange={manejarCambio}
                    placeholder={!editingProduct ? "Ej.: Arroz extra 1 kg" : undefined}
                  />
                  {errors.nombre && (
                    <span className="error-message" style={{ display: "block", marginTop: "0.25rem" }}>
                      {errors.nombre}
                    </span>
                  )}
                </div>

                <div className="product-form-field">
                  <ProductFieldLabel htmlFor="marca" icon="brand">Marca</ProductFieldLabel>
                  <input id="marca" name="marca" className="form-control" value={form.marca} onChange={manejarCambio} placeholder={!editingProduct ? "Ej.: Marca del producto" : undefined} />
                </div>
                <div className="product-form-field">
                  <ProductFieldLabel htmlFor="presentacion" icon="presentation">Presentación</ProductFieldLabel>
                  <input id="presentacion" name="presentacion" className="form-control" value={form.presentacion} onChange={manejarCambio} placeholder={!editingProduct ? "Ej.: Bolsa de 1 kg" : undefined} />
                  {errors.presentacion && <span className="error-message">{errors.presentacion}</span>}
                </div>

                <div className="product-form-field">
                  <ProductFieldLabel htmlFor="precio_venta" icon="price">Precio de venta</ProductFieldLabel>
                  <input
                    id="precio_venta"
                    name="precio_venta"
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-control"
                    value={form.precio_venta}
                    onChange={manejarCambio}
                    placeholder={!editingProduct ? "Ej.: 4.50" : undefined}
                  />
                  {errors.precio_venta && (
                    <span className="error-message" style={{ display: "block", marginTop: "0.25rem" }}>
                      {errors.precio_venta}
                    </span>
                  )}
                </div>

                <div className="product-form-field">
                  <ProductFieldLabel htmlFor="dias_seguridad" icon="days">Días de seguridad</ProductFieldLabel>
                  <input
                    id="dias_seguridad"
                    name="dias_seguridad"
                    type="number"
                    min="0"
                    step="1"
                    className="form-control"
                    value={form.dias_seguridad}
                    onChange={manejarCambio}
                    placeholder={!editingProduct ? "Ej.: 7" : undefined}
                  />
                </div>

                <div className="product-form-field">
                  <ProductFieldLabel htmlFor="activo" icon="status">Estado</ProductFieldLabel>
                  <select
                    id="activo"
                    name="activo"
                    className="form-control"
                    value={String(form.activo)}
                    onChange={(event) => setForm((current) => ({ ...current, activo: event.target.value === "true" }))}
                  >
                    <option value="true">Activo</option>
                    <option value="false">Inactivo</option>
                  </select>
                </div>
              </div>

              <div className="product-form-actions">
                <button type="submit" className="primary-button">
                  {editingProduct ? "Guardar cambios" : "Guardar producto"}
                </button>
                <button
                  type="button"
                  className="action-button product-cancel-button"
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
        <div className="product-modal-backdrop">
          <section className="panel category-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="product-delete-title">
            <div className="category-confirm-heading">
              <span className="category-confirm-icon" aria-hidden="true"><ActionIcon type="deactivate" /></span>
              <div>
                <h2 id="product-delete-title">Desactivar producto</h2>
                <p>¿Desea desactivar este producto?</p>
              </div>
            </div>
            <p className="category-confirm-name">{deleteTarget.nombre}</p>
            {deleteError && <div className="error-message" role="alert">{deleteError}</div>}
            <div className="category-confirm-actions">
              <button className="category-danger-button" type="button" onClick={confirmarEliminacion}>Desactivar</button>
              <button
                className="category-cancel-button"
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError("");
                }}
              >
                Cancelar
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export default Productos;