import { useEffect, useState } from "react";
import apiClient from "../api/client";

const emptyForm = {
  nombre: "",
  descripcion: "",
  estado: "activo",
};

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
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [reactivationTarget, setReactivationTarget] = useState(null);
  const [reactivationError, setReactivationError] = useState("");

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
      descripcion: categoria.descripcion || "",
      estado: categoria.estado || "activo",
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

    const payload = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim(),
      estado: form.estado || "activo",
    };

    try {
      if (editingCategory) {
        await apiClient.put(`/categorias/${editingCategory.id_categoria}`, payload);
      } else {
        await apiClient.post("/categorias", payload);
      }

      await cargarCategorias();
      cerrarFormulario();
    } catch (error) {
      const coincidencia = error.message?.match(
        /La categoría tiene (\d+) productos inactivos asociados/
      );

      if (editingCategory && form.estado === "activo" && coincidencia) {
        setShowForm(false);
        setReactivationError("");
        setReactivationTarget({
          categoria: editingCategory,
          payload,
          productosInactivos: Number(coincidencia[1]),
        });
        return;
      }

      setFormError(error.message || "No se pudo guardar la categoría.");
    }
  };

  const cerrarReactivacion = () => {
    setReactivationTarget(null);
    setReactivationError("");
  };

  const confirmarReactivacion = async (activarProductos) => {
    if (!reactivationTarget) return;

    try {
      await apiClient.put(
        `/categorias/${reactivationTarget.categoria.id_categoria}`,
        { ...reactivationTarget.payload, activar_productos: activarProductos }
      );
      await cargarCategorias();
      cerrarReactivacion();
      resetFormulario();
    } catch (error) {
      setReactivationError(error.message || "No se pudo reactivar la categoría.");
    }
  };

  const confirmarEliminacion = async () => {
    if (!deleteTarget) return;

    try {
      await apiClient.delete(`/categorias/${deleteTarget.id_categoria}`);
      await cargarCategorias();
      setDeleteTarget(null);
      setDeleteError("");
    } catch (error) {
      const mensajeError = error.message || "";
      const esRestriccionRelacionada = /foreign key|constraint|referenced|associated|er_row_is_referenced/i.test(
        mensajeError
      );

      setDeleteError(
        esRestriccionRelacionada
          ? "No se puede eliminar esta categoría porque tiene productos asociados. Puedes desactivarla en lugar de eliminarla."
          : mensajeError || "No se pudo eliminar la categoría."
      );
    }
  };

  const crearCategoria = async () => {
    abrirCrear();
  };

  const editarCategoria = async (categoria) => {
    abrirEditar(categoria);
  };

  const eliminarCategoria = async (categoria) => {
    setDeleteTarget(categoria);
    setDeleteError("");
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Categorías</h1>
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
        <table>
          <thead>
            <tr>
              <th>Categoría</th>
              <th>Descripción</th>
              <th>Productos</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan="5">Cargando categorías...</td>
              </tr>
            ) : (
              categorias.map((categoria) => (
                <tr key={categoria.id_categoria}>
                  <td>
                    <strong>{categoria.nombre}</strong>
                  </td>

                  <td>{categoria.descripcion || "Sin descripción"}</td>

                  <td>
                    {productos === null
                      ? "..."
                      : productos.filter((producto) => producto.categoria_id === categoria.id_categoria).length}
                  </td>

                  <td>
                    <span
                      className={
                        categoria.estado === "activo"
                          ? "badge success-badge"
                          : "badge inactive-badge"
                      }
                    >
                      {categoria.estado === "activo" ? "Activo" : "Inactivo"}
                    </span>
                  </td>

                  <td>
                    <button
                      className="action-button"
                      onClick={() => editarCategoria(categoria)}
                    >
                      Editar
                    </button>

                    <button
                      className="action-button"
                      onClick={() => eliminarCategoria(categoria)}
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
                width: "min(520px, 100%)",
                padding: "1.5rem",
              }}
            >
              <div className="page-header" style={{ marginBottom: "1rem" }}>
                <div>
                  <h1>{editingCategory ? "Editar categoría" : "Nueva categoría"}</h1>
                  <p>
                    {editingCategory
                      ? "Actualiza la información de la categoría."
                      : "Registra una nueva categoría del sistema."}
                  </p>
                </div>
              </div>

              {formError && (
                <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>
                  {formError}
                </div>
              )}

              <form onSubmit={enviarFormulario}>
                <div style={{ display: "grid", gap: "0.75rem" }}>
                  <div>
                    <label className="form-label" htmlFor="categoria-nombre">Nombre</label>
                    <input
                      id="categoria-nombre"
                      name="nombre"
                      className="form-control"
                      value={form.nombre}
                      onChange={manejarCambio}
                    />
                  </div>

                  <div>
                    <label className="form-label" htmlFor="categoria-descripcion">Descripción</label>
                    <textarea
                      id="categoria-descripcion"
                      name="descripcion"
                      className="form-control"
                      rows="3"
                      value={form.descripcion}
                      onChange={manejarCambio}
                    />
                  </div>

                  <div>
                    <label className="form-label" htmlFor="categoria-estado">Estado</label>
                    <select
                      id="categoria-estado"
                      name="estado"
                      className="form-control"
                      value={form.estado}
                      onChange={manejarCambio}
                    >
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
                  <button type="submit" className="primary-button">
                    {editingCategory ? "Guardar cambios" : "Guardar categoría"}
                  </button>
                  <button type="button" className="action-button" onClick={cerrarFormulario}>
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
                  <h1>Eliminar categoría</h1>
                  <p>¿Desea eliminar esta categoría?</p>
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

        {reactivationTarget && (
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
                width: "min(520px, 100%)",
                padding: "1.5rem",
              }}
            >
              <div className="page-header" style={{ marginBottom: "1rem" }}>
                <div>
                  <h1>Reactivar categoría</h1>
                  <p>
                    La categoría tiene {reactivationTarget.productosInactivos} productos
                    inactivos asociados. ¿Deseas activar también los productos asociados?
                  </p>
                </div>
              </div>

              {reactivationError && (
                <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>
                  {reactivationError}
                </div>
              )}

              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => confirmarReactivacion(true)}
                >
                  Activar categoría y productos
                </button>
                <button
                  className="action-button"
                  type="button"
                  onClick={() => confirmarReactivacion(false)}
                >
                  Solo activar categoría
                </button>
                <button className="action-button" type="button" onClick={cerrarReactivacion}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
    </>
  );
}

export default Categorias;