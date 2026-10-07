import { useEffect, useState } from "react";
import apiClient from "../api/client";

const emptyForm = {
  nombre: "",
  apellido: "",
  username: "",
  email: "",
  password: "",
  rol_id: "",
  estado: "activo",
};

function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const usuarioAutenticado = JSON.parse(localStorage.getItem("alanis_user") || "null");
  const [roles, setRoles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");

  const cargarDatos = async () => {
    try {
      setLoadError("");
      const [usuariosData, rolesData] = await Promise.all([
        apiClient.get("/usuarios"),
        apiClient.get("/roles"),
      ]);
      setUsuarios(Array.isArray(usuariosData) ? usuariosData : []);
      setRoles(Array.isArray(rolesData) ? rolesData : []);
    } catch (error) {
      setLoadError(error.message || "No se pudieron cargar los usuarios.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(cargarDatos);
  }, []);

  const abrirCrear = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setFormError("");
    setShowForm(true);
  };

  const abrirEditar = (usuario) => {
    setEditingUser(usuario);
    setForm({
      nombre: usuario.nombre || "",
      apellido: usuario.apellido || "",
      username: usuario.username || "",
      email: usuario.email || "",
      password: "",
      rol_id: String(usuario.rol_id ?? ""),
      estado: usuario.estado || "activo",
    });
    setFormError("");
    setShowForm(true);
  };

  const cerrarFormulario = () => {
    setShowForm(false);
    setEditingUser(null);
    setForm(emptyForm);
    setFormError("");
  };

  const manejarCambio = (event) => {
    const { name, value } = event.target;
    setForm((estadoActual) => ({ ...estadoActual, [name]: value }));
    setFormError("");
  };

  const guardarUsuario = async (event) => {
    event.preventDefault();

    if (!form.nombre.trim() || !form.apellido.trim() || !form.username.trim() || !form.email.trim() || !form.rol_id) {
      setFormError("Completa los campos obligatorios del usuario.");
      return;
    }

    if (!editingUser && !form.password) {
      setFormError("La contraseña es obligatoria para crear un usuario.");
      return;
    }

    const payload = {
      nombre: form.nombre.trim(),
      apellido: form.apellido.trim(),
      username: form.username.trim(),
      email: form.email.trim(),
      rol_id: Number(form.rol_id),
      estado: form.estado,
    };

    if (form.password) {
      payload.password = form.password;
    }

    try {
      if (editingUser) {
        await apiClient.put(`/usuarios/${editingUser.id_usuario}`, payload);
      } else {
        await apiClient.post("/usuarios", payload);
      }
      await cargarDatos();
      cerrarFormulario();
    } catch (error) {
      setFormError(error.message || "No se pudo guardar el usuario.");
    }
  };

  const esCuentaPropia = (usuario) => Number(usuario?.id_usuario) === Number(usuarioAutenticado?.id_usuario);

  const obtenerRol = (rolId) => roles.find((rol) => rol.id_rol === rolId);
  const formatearFecha = (fecha) => fecha ? new Date(fecha).toLocaleDateString("es-PE") : "No disponible";
  const usuariosVisibles = usuarios.filter((usuario) => {
    const texto = search.trim().toLowerCase();
    const rol = obtenerRol(usuario.rol_id);
    return !texto ||
      `${usuario.nombre} ${usuario.apellido}`.toLowerCase().includes(texto) ||
      usuario.email?.toLowerCase().includes(texto) ||
      usuario.username?.toLowerCase().includes(texto) ||
      rol?.nombre?.toLowerCase().includes(texto);
  });

  return (
    <>
      <div className="page-header">
        <div><h1>Usuarios</h1><p>Administración de usuarios con acceso al sistema.</p></div>
        <button className="primary-button" onClick={abrirCrear}>+ Nuevo usuario</button>
      </div>

      <div className="panel">
        <div className="table-toolbar">
          <input className="search-input" placeholder="Buscar usuario..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        {loadError && <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>{loadError}</div>}
        <table>
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Fecha creación</th><th>Acciones</th></tr></thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan="6">Cargando usuarios...</td></tr>
            ) : !loadError && usuariosVisibles.length === 0 ? (
              <tr><td colSpan="6">No se encontraron usuarios.</td></tr>
            ) : usuariosVisibles.map((usuario) => (
              <tr key={usuario.id_usuario}>
                <td><strong>{usuario.nombre} {usuario.apellido}</strong></td>
                <td>{usuario.email}</td>
                <td><span className="badge role-badge">{obtenerRol(usuario.rol_id)?.nombre || "Rol no encontrado"}</span></td>
                <td><span className={usuario.estado === "activo" ? "badge success-badge" : "badge inactive-badge"}>{usuario.estado === "bloqueado" ? "Bloqueado" : usuario.estado === "activo" ? "Activo" : "Inactivo"}</span></td>
                <td>{formatearFecha(usuario.fecha_creacion)}</td>
                <td>
                  <button className="action-button" onClick={() => abrirEditar(usuario)}>Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", zIndex: 1000 }}>
          <div className="panel" style={{ width: "min(560px, 100%)", maxHeight: "90vh", overflowY: "auto", padding: "1.5rem" }}>
            <div className="page-header" style={{ marginBottom: "1rem" }}><div><h1>{editingUser ? "Editar usuario" : "Nuevo usuario"}</h1><p>{editingUser ? "Actualiza los datos del usuario." : "Registra un nuevo usuario."}</p></div></div>
            {formError && <div className="error-message" role="alert" style={{ marginBottom: "1rem" }}>{formError}</div>}
            <form onSubmit={guardarUsuario}>
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {[["nombre", "Nombre"], ["apellido", "Apellido"], ["username", "Usuario"], ["email", "Correo"]].map(([name, label]) => <div key={name}><label className="form-label" htmlFor={`usuario-${name}`}>{label}</label><input id={`usuario-${name}`} name={name} className="form-control" value={form[name]} onChange={manejarCambio} /></div>)}
                <div><label className="form-label" htmlFor="usuario-password">Contraseña {editingUser && "(opcional)"}</label><input id="usuario-password" name="password" type="password" className="form-control" value={form.password} onChange={manejarCambio} /></div>
                {!esCuentaPropia(editingUser) && (
                  <>
                    <div><label className="form-label" htmlFor="usuario-rol">Rol</label><select id="usuario-rol" name="rol_id" className="form-control" value={form.rol_id} onChange={manejarCambio}><option value="">Selecciona un rol</option>{roles.map((rol) => <option key={rol.id_rol} value={rol.id_rol}>{rol.nombre}</option>)}</select></div>
                    <div><label className="form-label" htmlFor="usuario-estado">Estado</label><select id="usuario-estado" name="estado" className="form-control" value={form.estado} onChange={manejarCambio}><option value="activo">Activo</option><option value="inactivo">Inactivo</option><option value="bloqueado">Bloqueado</option></select></div>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}><button type="submit" className="primary-button">Guardar cambios</button><button type="button" className="action-button" onClick={cerrarFormulario}>Cancelar</button></div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default Usuarios;
