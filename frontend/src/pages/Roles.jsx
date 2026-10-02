import { useEffect, useState } from "react";
import apiClient from "../api/client";

const emptyForm = {
  nombre: "",
  descripcion: "",
  estado: "activo",
};

const modulosRol = [
  "Dashboard",
  "Productos",
  "Compras",
  "Inventario",
  "Usuarios",
  "Ventas",
  "Proveedores",
  "Roles",
  "Reportes",
  "Predicción",
];

const esRolAdministrador = (rol) => rol.nombre?.trim().toLowerCase() === "administrador";

const permisosIniciales = (rol) => (esRolAdministrador(rol) ? modulosRol : []);

function Roles() {
  const [roles, setRoles] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [permisosBorrador, setPermisosBorrador] = useState({});
  const [permisosConfirmados, setPermisosConfirmados] = useState({});
  const [confirmacionesLocales, setConfirmacionesLocales] = useState({});

  const cargarRoles = async () => {
    try {
      setLoadError("");
      const [rolesData, usuariosData] = await Promise.all([
        apiClient.get("/roles"),
        apiClient.get("/usuarios"),
      ]);
      setRoles(Array.isArray(rolesData) ? rolesData : []);
      setUsuarios(Array.isArray(usuariosData) ? usuariosData : []);
    } catch (error) {
      setLoadError(error.message || "No se pudieron cargar los roles.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargarRoles();
  }, []);

  const abrirCrear = () => {
    setEditingRole(null);
    setForm(emptyForm);
    setFormError("");
    setShowForm(true);
  };

  const abrirEditar = (rol) => {
    setEditingRole(rol);
    setForm({
      nombre: rol.nombre || "",
      descripcion: rol.descripcion || "",
      estado: rol.estado || "activo",
    });
    setFormError("");
    setShowForm(true);
  };

  const cerrarFormulario = () => {
    setShowForm(false);
    setEditingRole(null);
    setForm(emptyForm);
    setFormError("");
  };

  const manejarCambio = (event) => {
    const { name, value } = event.target;
    setForm((estadoActual) => ({ ...estadoActual, [name]: value }));
    setFormError("");
  };

  const guardarRol = async (event) => {
    event.preventDefault();

    if (!form.nombre.trim()) {
      setFormError("El nombre del rol es obligatorio.");
      return;
    }

    const payload = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      estado: form.estado,
    };

    try {
      if (editingRole) {
        await apiClient.put(`/roles/${editingRole.id_rol}`, payload);
      } else {
        await apiClient.post("/roles", payload);
      }
      await cargarRoles();
      cerrarFormulario();
    } catch (error) {
      setFormError(error.message || "No se pudo guardar el rol.");
    }
  };

  const cambiarEstado = async (rol) => {
    try {
      await apiClient.put(`/roles/${rol.id_rol}`, {
        estado: rol.estado === "activo" ? "inactivo" : "activo",
      });
      await cargarRoles();
    } catch (error) {
      setLoadError(error.message || "No se pudo cambiar el estado del rol.");
    }
  };

  const cambiarPermisoLocal = (rol, modulo) => {
    setPermisosBorrador((actuales) => {
      const seleccionados = actuales[rol.id_rol] ?? permisosIniciales(rol);
      const siguiente = seleccionados.includes(modulo)
        ? seleccionados.filter((permiso) => permiso !== modulo)
        : [...seleccionados, modulo];
      return { ...actuales, [rol.id_rol]: siguiente };
    });
    setConfirmacionesLocales((actuales) => ({ ...actuales, [rol.id_rol]: false }));
  };

  const confirmarPermisosLocales = (rol) => {
    const seleccionados = permisosBorrador[rol.id_rol] ?? permisosIniciales(rol);
    setPermisosConfirmados((actuales) => ({ ...actuales, [rol.id_rol]: [...seleccionados] }));
    setConfirmacionesLocales((actuales) => ({ ...actuales, [rol.id_rol]: true }));
  };

  return (
    <div className="roles-view">
      <div className="page-header">
        <div>
          <h1>Roles</h1>
          <p>
            Roles disponibles para los usuarios del sistema.
          </p>
        </div>
        <button className="primary-button" onClick={abrirCrear}>
          + Nuevo rol
        </button>
      </div>

      {loadError && (
        <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>
          {loadError}
        </div>
      )}

      <div className="roles-grid">
        {isLoading ? (
          <div className="role-card"><p>Cargando roles...</p></div>
        ) : roles.length === 0 ? (
          <div className="role-card"><p>No hay roles registrados.</p></div>
        ) : roles.map((rol) => {
          const esAdministrador = esRolAdministrador(rol);
          const seleccionados = permisosBorrador[rol.id_rol] ?? permisosIniciales(rol);
          const confirmados = permisosConfirmados[rol.id_rol] ?? permisosIniciales(rol);
          const hayCambios = modulosRol.some((modulo) => seleccionados.includes(modulo) !== confirmados.includes(modulo));

          return (
            <div className="role-card" key={rol.id_rol}>
              <header className="role-card-header">
                <span className={`role-icon ${esAdministrador ? "role-icon-admin" : "role-icon-member"}`} aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {esAdministrador ? (
                      <>
                        <path d="M12 3 19 6v5c0 4.5-2.7 8-7 10-4.3-2-7-5.5-7-10V6l7-3Z" />
                        <path d="m9 12 2 2 4-4" />
                      </>
                    ) : (
                      <>
                        <circle cx="9" cy="8" r="3" />
                        <path d="M3.5 19c0-3.2 2.3-5 5.5-5s5.5 1.8 5.5 5M16 11a3 3 0 0 1 0 5.8M17 19h4" />
                      </>
                    )}
                  </svg>
                </span>
                <div className="role-heading">
                  <span className="role-title">{rol.nombre}</span>
                  <span className={`badge ${rol.estado === "activo" ? "success-badge" : "inactive-badge"}`}>
                    {rol.estado === "activo" ? "Activo" : "Inactivo"}
                  </span>
                </div>
              </header>
              <div className="role-information">
                <div className="role-info-stack">
                  <div className="role-info-row">
                    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="9" cy="8" r="3" />
                      <path d="M3.5 19c0-3.2 2.3-5 5.5-5s5.5 1.8 5.5 5M16 11a3 3 0 0 1 0 5.8M17 19h4" />
                    </svg>
                    <span>Usuarios asignados</span>
                    <strong>{usuarios.filter((usuario) => Number(usuario.rol_id) === Number(rol.id_rol)).length}</strong>
                  </div>
                  <div className="role-info-row">
                    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="5" width="18" height="16" rx="2" />
                      <path d="M16 3v4M8 3v4M3 10h18" />
                    </svg>
                    <span>Fecha de creación</span>
                    <strong>{rol.fecha_creacion ? new Date(rol.fecha_creacion).toLocaleDateString("es-PE") : "No disponible"}</strong>
                  </div>
                </div>
                <div className="role-info-description">
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                    <path d="M14 2v6h6M8 13h8M8 17h8" />
                  </svg>
                  <div>
                    <strong>Descripción</strong>
                    <p>{rol.descripcion || "Sin descripción"}</p>
                  </div>
                </div>
              </div>
              <section className="role-permission-section" aria-label={`Permisos del rol ${rol.nombre}`}>
                <div className="role-permission-heading">
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3 20 6v5c0 4.5-3.2 8-8 10-4.8-2-8-5.5-8-10V6l8-3Z" />
                    <path d="M12 8v5M12 16h.01" />
                  </svg>
                  <div>
                    <h3>Permisos del rol</h3>
                    <p>{esAdministrador ? "Todos los módulos están habilitados para este rol." : "Selecciona los módulos a los que tendrá acceso este rol."}</p>
                  </div>
                </div>
                <div className="role-module-grid">
                  {modulosRol.map((modulo) => (
                    <label className="role-module-option" key={modulo}>
                      <input
                        type="checkbox"
                        checked={esAdministrador || seleccionados.includes(modulo)}
                        disabled={esAdministrador}
                        onChange={() => cambiarPermisoLocal(rol, modulo)}
                      />
                      <span>{modulo}</span>
                    </label>
                  ))}
                </div>
              </section>
              <div className={`role-permission-callout ${esAdministrador ? "role-permission-callout-admin" : ""}`}>
                <span className="role-callout-icon" aria-hidden="true">i</span>
                <div>
                  <strong>
                    {esAdministrador
                      ? "Los permisos del Administrador no pueden modificarse."
                      : confirmacionesLocales[rol.id_rol]
                        ? "Selección confirmada localmente."
                        : "Los cambios se aplicarán solo cuando confirmes."}
                  </strong>
                  <p>
                    {esAdministrador
                      ? "Este rol tiene acceso completo al sistema y está protegido."
                      : "Marca o desmarca módulos y confirma para actualizar la selección local. No se guarda en la base de datos."}
                  </p>
                </div>
              </div>
              <div className="role-card-actions">
                {!esAdministrador && (
                  <button
                    type="button"
                    className="primary-button"
                    disabled={!hayCambios}
                    onClick={() => confirmarPermisosLocales(rol)}
                  >
                    Confirmar cambios
                  </button>
                )}
                {!esAdministrador && (
                  <>
                    <button className="action-button" onClick={() => abrirEditar(rol)}>Editar</button>
                    <button className="action-button" onClick={() => cambiarEstado(rol)}>
                      {rol.estado === "activo" ? "Desactivar" : "Activar"}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", zIndex: 1000 }}>
          <div className="panel" style={{ width: "min(520px, 100%)", padding: "1.5rem" }}>
            <div className="page-header" style={{ marginBottom: "1rem" }}>
              <div>
                <h1>{editingRole ? "Editar rol" : "Nuevo rol"}</h1>
                <p>{editingRole ? "Actualiza los datos del rol." : "Registra un nuevo rol."}</p>
              </div>
            </div>
            {formError && <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>{formError}</div>}
            <form onSubmit={guardarRol}>
              <div style={{ display: "grid", gap: "0.75rem" }}>
                <div><label className="form-label" htmlFor="rol-nombre">Nombre</label><input id="rol-nombre" name="nombre" className="form-control" value={form.nombre} onChange={manejarCambio} /></div>
                <div><label className="form-label" htmlFor="rol-descripcion">Descripción</label><textarea id="rol-descripcion" name="descripcion" rows="3" className="form-control" value={form.descripcion} onChange={manejarCambio} /></div>
                <div><label className="form-label" htmlFor="rol-estado">Estado</label><select id="rol-estado" name="estado" className="form-control" value={form.estado} onChange={manejarCambio}><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select></div>
              </div>
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}><button type="submit" className="primary-button">Guardar cambios</button><button type="button" className="action-button" onClick={cerrarFormulario}>Cancelar</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Roles;