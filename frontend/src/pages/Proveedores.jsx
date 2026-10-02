import { useEffect, useState } from "react";
import apiClient from "../api/client";

const emptyForm = {
  nombre: "",
  contacto: "",
  telefono: "",
  email: "",
  direccion: "",
  documento_identidad: "",
  estado: "activo",
};

function Proveedores() {
  const [proveedores, setProveedores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");

  const cargarProveedores = async () => {
    try {
      setLoadError("");
      const data = await apiClient.get("/proveedores");
      setProveedores(Array.isArray(data) ? data : []);
    } catch (error) {
      setLoadError(error.message || "No se pudieron cargar los proveedores.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargarProveedores();
  }, []);

  const abrirCrear = () => {
    setEditingProvider(null);
    setForm(emptyForm);
    setFormError("");
    setShowForm(true);
  };

  const abrirEditar = (proveedor) => {
    setEditingProvider(proveedor);
    setForm({
      nombre: proveedor.nombre || "",
      contacto: proveedor.contacto || "",
      telefono: proveedor.telefono || "",
      email: proveedor.email || "",
      direccion: proveedor.direccion || "",
      documento_identidad: proveedor.documento_identidad || "",
      estado: proveedor.estado || "activo",
    });
    setFormError("");
    setShowForm(true);
  };

  const cerrarFormulario = () => {
    setShowForm(false);
    setEditingProvider(null);
    setForm(emptyForm);
    setFormError("");
  };

  const manejarCambio = (event) => {
    const { name, value } = event.target;
    setForm((estadoActual) => ({ ...estadoActual, [name]: value }));
    setFormError("");
  };

  const guardarProveedor = async (event) => {
    event.preventDefault();

    if (!form.nombre.trim()) {
      setFormError("El nombre del proveedor es obligatorio.");
      return;
    }

    const payload = {
      nombre: form.nombre.trim(),
      contacto: form.contacto.trim() || null,
      telefono: form.telefono.trim() || null,
      email: form.email.trim() || null,
      direccion: form.direccion.trim() || null,
      documento_identidad: form.documento_identidad.trim() || null,
      estado: form.estado,
    };

    try {
      if (editingProvider) {
        await apiClient.put(`/proveedores/${editingProvider.id_proveedor}`, payload);
      } else {
        await apiClient.post("/proveedores", payload);
      }
      await cargarProveedores();
      cerrarFormulario();
    } catch (error) {
      setFormError(error.message || "No se pudo guardar el proveedor.");
    }
  };

  const cambiarEstado = async (proveedor) => {
    try {
      await apiClient.put(`/proveedores/${proveedor.id_proveedor}`, {
        estado: proveedor.estado === "activo" ? "inactivo" : "activo",
      });
      await cargarProveedores();
    } catch (error) {
      setLoadError(error.message || "No se pudo cambiar el estado del proveedor.");
    }
  };

  const proveedoresVisibles = proveedores.filter((proveedor) => {
    const texto = search.trim().toLowerCase();
    return !texto ||
      proveedor.nombre?.toLowerCase().includes(texto) ||
      proveedor.documento_identidad?.toLowerCase().includes(texto) ||
      proveedor.email?.toLowerCase().includes(texto);
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Proveedores</h1>
          <p>Gestión de proveedores del negocio.</p>
        </div>
        <button className="primary-button" onClick={abrirCrear}>
          + Nuevo proveedor
        </button>
      </div>

      <div className="panel">
        <div className="table-toolbar">
          <input
            className="search-input"
            placeholder="Buscar proveedor..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {loadError && (
          <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>
            {loadError}
          </div>
        )}

        <table>
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Documento</th>
              <th>Teléfono</th>
              <th>Correo</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan="6">Cargando proveedores...</td></tr>
            ) : proveedoresVisibles.length === 0 ? (
              <tr><td colSpan="6">No se encontraron proveedores.</td></tr>
            ) : proveedoresVisibles.map((proveedor) => (
              <tr key={proveedor.id_proveedor}>
                <td><strong>{proveedor.nombre}</strong></td>
                <td>{proveedor.documento_identidad || "Sin documento"}</td>
                <td>{proveedor.telefono || "Sin teléfono"}</td>
                <td>{proveedor.email || "Sin correo"}</td>
                <td>
                  <span className={proveedor.estado === "activo" ? "badge success-badge" : "badge inactive-badge"}>
                    {proveedor.estado === "activo" ? "Activo" : proveedor.estado === "suspendido" ? "Suspendido" : "Inactivo"}
                  </span>
                </td>
                <td>
                  <button className="action-button" onClick={() => abrirEditar(proveedor)}>
                    Editar
                  </button>
                  {proveedor.estado !== "suspendido" && (
                    <button className="action-button" onClick={() => cambiarEstado(proveedor)} style={{ marginLeft: "0.5rem" }}>
                      {proveedor.estado === "activo" ? "Desactivar" : "Activar"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", zIndex: 1000 }}>
          <div className="panel" style={{ width: "min(560px, 100%)", maxHeight: "90vh", overflowY: "auto", padding: "1.5rem" }}>
            <div className="page-header" style={{ marginBottom: "1rem" }}>
              <div>
                <h1>{editingProvider ? "Editar proveedor" : "Nuevo proveedor"}</h1>
                <p>{editingProvider ? "Actualiza los datos del proveedor." : "Registra un nuevo proveedor."}</p>
              </div>
            </div>

            {formError && <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>{formError}</div>}

            <form onSubmit={guardarProveedor}>
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {[
                  ["nombre", "Nombre"],
                  ["contacto", "Contacto"],
                  ["telefono", "Teléfono"],
                  ["email", "Correo"],
                  ["documento_identidad", "Documento"],
                  ["direccion", "Dirección"],
                ].map(([name, label]) => (
                  <div key={name}>
                    <label className="form-label" htmlFor={`proveedor-${name}`}>{label}</label>
                    <input id={`proveedor-${name}`} name={name} className="form-control" value={form[name]} onChange={manejarCambio} />
                  </div>
                ))}
                <div>
                  <label className="form-label" htmlFor="proveedor-estado">Estado</label>
                  <select id="proveedor-estado" name="estado" className="form-control" value={form.estado} onChange={manejarCambio}>
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                    {editingProvider && <option value="suspendido">Suspendido</option>}
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
                <button type="submit" className="primary-button">Guardar cambios</button>
                <button type="button" className="action-button" onClick={cerrarFormulario}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default Proveedores;
