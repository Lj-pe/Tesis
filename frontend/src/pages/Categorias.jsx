import { useEffect, useState } from "react";
import apiClient from "../api/client";

const emptyForm = {
  nombre: "",
  activa: true,
};

function CategoryFieldLabel({ htmlFor, icon, children }) {
  const iconPath = icon === "name"
    ? <path d="M4 7h16M4 12h10M4 17h13" />
    : <path d="M12 3v9l6.4 3.7M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />;
  return <label className="form-label product-form-label" htmlFor={htmlFor}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {iconPath}
    </svg>
    {children}
  </label>;
}

function CategoryActionIcon({ type }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {type === "edit"
      ? <path d="m14 5 5 5M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z M13 6l5 5" />
      : type === "activate"
        ? <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-4.5-10 3 3 6-6" />
        : <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-7.1-2.9 14.2-14.2" />}
  </svg>;
}

function CategoryDisplayIcon({ type }) {
  const paths = {
    category: <path d="M3 6h7l2 2h9v10H3z M3 9h18" />,
    products: <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm-8 4.5 8 4.5 8-4.5M12 12v9" />,
    status: <path d="M12 3v9l6.4 3.7M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
    actions: <path d="M4 6h16M4 12h16M4 18h16" />,
  };
  return <svg className="category-display-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths[type]}
  </svg>;
}

function CategoryColumnHeading({ icon, children }) {
  return <span className="category-table-heading"><CategoryDisplayIcon type={icon} />{children}</span>;
}

function CategoryFormModal({ editing, form, setForm, formError, manejarCambio, enviarFormulario, cerrarFormulario }) {
  const title = editing ? "Editar categoría" : "Nueva categoría";
  return <div className="product-modal-backdrop">
    <section
      className={`panel product-form-modal category-form-modal ${editing ? "is-editing" : ""}`}
      style={editing ? { "--category-name-width": `${Math.max(30, form.nombre.length + 3)}ch` } : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-form-title"
    >
      <div className="page-header product-form-header">
        <div>
          <h1 id="category-form-title">{title}</h1>
          <p>{editing ? "Actualiza la información de la categoría." : "Registra una nueva categoría del sistema."}</p>
        </div>
      </div>

      {formError && <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>{formError}</div>}

      <form onSubmit={enviarFormulario}>
        <div className="product-form-fields category-form-fields">
          <div className="product-form-field">
            <CategoryFieldLabel htmlFor="categoria-nombre" icon="name">Nombre</CategoryFieldLabel>
            <input
              id="categoria-nombre"
              name="nombre"
              className={`form-control ${editing ? "category-edit-name-input" : ""}`}
              value={form.nombre}
              onChange={manejarCambio}
              placeholder={!editing ? "Ej.: Bebidas" : undefined}
            />
          </div>
          {!editing && <div className="product-form-field">
            <CategoryFieldLabel htmlFor="categoria-activa" icon="status">Estado</CategoryFieldLabel>
            <select
              id="categoria-activa"
              className="form-control"
              value={String(form.activa)}
              onChange={(event) => setForm((current) => ({ ...current, activa: event.target.value === "true" }))}
            >
              <option value="true">Activa</option>
              <option value="false">Inactiva</option>
            </select>
          </div>}
        </div>

        <div className="product-form-actions">
          <button type="submit" className="primary-button">{editing ? "Guardar cambios" : "Guardar categoría"}</button>
          <button type="button" className="action-button product-cancel-button" onClick={cerrarFormulario}>Cancelar</button>
        </div>
      </form>
    </section>
  </div>;
}

function Categorias() {
  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorCargaCategorias, setErrorCargaCategorias] = useState("");
  const [errorCargaProductos, setErrorCargaProductos] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [statusTarget, setStatusTarget] = useState(null);
  const [statusError, setStatusError] = useState("");

  const cargarCategorias = async () => {
    try {
      const data = await apiClient.get("/categorias");
      setCategorias(Array.isArray(data) ? data : []);
      setErrorCargaCategorias("");
    } catch (error) {
      setErrorCargaCategorias(error.message || "No se pudieron cargar las categorías.");
    } finally {
      setIsLoading(false);
    }
  };

  const cargarProductos = async () => {
    try {
      const data = await apiClient.get("/productos");
      setProductos(Array.isArray(data) ? data : []);
      setErrorCargaProductos("");
    } catch (error) {
      setErrorCargaProductos(error.message || "No se pudieron cargar los productos asociados.");
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      cargarCategorias();
      cargarProductos();
    });
  }, []);

  const resetFormulario = () => {
    setForm(emptyForm);
    setFormError("");
    setEditingCategory(null);
  };

  const abrirCrear = () => {
    resetFormulario();
    setShowForm(true);
  };

  const abrirEditar = (categoria) => {
    setEditingCategory(categoria);
    setForm({
      nombre: categoria.nombre || "",
      activa: Boolean(categoria.activa),
    });
    setFormError("");
    setShowForm(true);
  };

  const cerrarFormulario = () => {
    setShowForm(false);
    resetFormulario();
  };

  const manejarCambio = (event) => {
    const { name, value } = event.target;
    setForm((estadoActual) => ({ ...estadoActual, [name]: value }));
    setFormError("");
  };

  const validarFormulario = () => {
    if (!form.nombre.trim()) {
      return "El nombre de la categoría es obligatorio.";
    }

    return "";
  };

  const enviarFormulario = async (event) => {
    event.preventDefault();

    const error = validarFormulario();
    if (error) {
      setFormError(error);
      return;
    }

    const payload = editingCategory
      ? { nombre: form.nombre.trim() }
      : { nombre: form.nombre.trim(), activa: form.activa };

    try {
      if (editingCategory) {
        await apiClient.put(`/categorias/${editingCategory.id}`, payload);
      } else {
        await apiClient.post("/categorias", payload);
      }

      await cargarCategorias();
      cerrarFormulario();
    } catch (error) {
      setFormError(error.message || "No se pudo guardar la categoría.");
    }
  };

  const confirmarCambioEstado = async () => {
    if (!statusTarget) return;
    const { categoria, activar } = statusTarget;
    try {
      if (activar) {
        await apiClient.put(`/categorias/${categoria.id}`, { activa: true });
      } else {
        await apiClient.delete(`/categorias/${categoria.id}`);
      }
      setCategorias((current) => current.map((item) => (
        String(item.id) === String(categoria.id) ? { ...item, activa: activar } : item
      )));
      setStatusTarget(null);
      setStatusError("");
    } catch (error) {
      setStatusError(error.message || `No se pudo ${activar ? "activar" : "desactivar"} la categoría.`);
    }
  };

  const crearCategoria = async () => {
    abrirCrear();
  };

  const editarCategoria = async (categoria) => {
    abrirEditar(categoria);
  };

  const confirmarEstado = (categoria, activar) => {
    setStatusTarget({ categoria, activar });
    setStatusError("");
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="category-page-title"><CategoryDisplayIcon type="category" />Categorías</h1>
          <p>Clasificación de productos del sistema.</p>
        </div>

        <button className="primary-button" onClick={crearCategoria}>
          + Nueva categoría
        </button>
      </div>

      <div className="panel">
        {errorCargaCategorias && (
          <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>
            {errorCargaCategorias}
          </div>
        )}
        {errorCargaProductos && (
          <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>
            {errorCargaProductos}
          </div>
        )}
        <table className="category-table">
          <thead>
            <tr>
              <th><CategoryColumnHeading icon="category">Categoría</CategoryColumnHeading></th>
              <th><CategoryColumnHeading icon="products">Productos</CategoryColumnHeading></th>
              <th><CategoryColumnHeading icon="status">Estado</CategoryColumnHeading></th>
              <th><CategoryColumnHeading icon="actions">Acciones</CategoryColumnHeading></th>
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan="4">Cargando categorías...</td>
              </tr>
            ) : (
              categorias.map((categoria) => (
                <tr key={categoria.id}>
                  <td>
                    <strong>{categoria.nombre}</strong>
                  </td>

                  <td>
                    {productos === null
                      ? "..."
                      : productos.filter((producto) => String(producto.categoria_id) === String(categoria.id)).length}
                  </td>

                  <td>
                    <span className={`badge product-status-badge ${categoria.activa ? "success-badge is-active" : "inactive-badge"}`}>
                      <span className="product-status-dot" aria-hidden="true" />
                      {categoria.activa ? "Activo" : "Inactivo"}
                    </span>
                  </td>

                  <td>
                    <button
                      className="action-button product-action-button"
                      type="button"
                      onClick={() => editarCategoria(categoria)}
                    >
                      <CategoryActionIcon type="edit" />
                      Editar
                    </button>

                    {categoria.activa ? (
                      <button
                        className="action-button product-action-button category-status-action is-destructive"
                        type="button"
                        onClick={() => confirmarEstado(categoria, false)}
                      >
                        <CategoryActionIcon type="deactivate" />
                        Desactivar
                      </button>
                    ) : (
                      <button
                        className="action-button product-action-button category-status-action is-activating"
                        type="button"
                        onClick={() => confirmarEstado(categoria, true)}
                      >
                        <CategoryActionIcon type="activate" />
                        Activar
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

        {showForm && !editingCategory && (
          <CategoryFormModal
            editing={false}
            form={form}
            setForm={setForm}
            formError={formError}
            manejarCambio={manejarCambio}
            enviarFormulario={enviarFormulario}
            cerrarFormulario={cerrarFormulario}
          />
        )}

        {showForm && editingCategory && (
          <CategoryFormModal
            editing
            form={form}
            setForm={setForm}
            formError={formError}
            manejarCambio={manejarCambio}
            enviarFormulario={enviarFormulario}
            cerrarFormulario={cerrarFormulario}
          />
        )}

        {statusTarget && (
          <div className="product-modal-backdrop">
            <section className={`panel category-confirm-modal ${statusTarget.activar ? "is-activating" : ""}`} role="dialog" aria-modal="true" aria-labelledby="category-status-title">
              <div className="category-confirm-heading">
                <span className="category-confirm-icon" aria-hidden="true">
                  <CategoryActionIcon type={statusTarget.activar ? "activate" : "deactivate"} />
                </span>
                <div>
                  <h2 id="category-status-title">{statusTarget.activar ? "Activar categoría" : "Desactivar categoría"}</h2>
                  <p>{statusTarget.activar
                    ? "La categoría volverá a estar disponible para asignarla a nuevos productos. Los productos asociados conservarán sus estados actuales"
                    : "Los productos asociados conservarán su estado actual y podrán seguir vendiéndose. Esta categoría dejará de estar disponible para asignarla a nuevos productos"}</p>
                </div>
              </div>
              <p className="category-confirm-name">{statusTarget.categoria.nombre}</p>
              {statusError && <div className="error-message" role="alert">{statusError}</div>}
              <div className="category-confirm-actions">
                <button
                  className={`category-danger-button ${statusTarget.activar ? "category-activate-button" : ""}`}
                  type="button"
                  onClick={confirmarCambioEstado}
                >
                  {statusTarget.activar ? "Activar" : "Desactivar"}
                </button>
                <button
                  className="category-cancel-button"
                  type="button"
                  onClick={() => {
                    setStatusTarget(null);
                    setStatusError("");
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

export default Categorias;