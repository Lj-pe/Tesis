import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import apiClient from "../api/client";

function Layout() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("alanis_user") || "null");
  const accountMenuRef = useRef(null);

  const [darkMode, setDarkMode] = useState(
    localStorage.getItem("tema") === "dark"
  );
  const [permisos, setPermisos] = useState(null);
  const [errorPermisos, setErrorPermisos] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const [profileForm, setProfileForm] = useState({
    nombre: "",
    apellido: "",
    username: "",
    email: "",
  });
  const [newPassword, setNewPassword] = useState("");
  const [modalError, setModalError] = useState("");
  const [modalSuccess, setModalSuccess] = useState("");

  useEffect(() => {
    let mounted = true;

    apiClient.get("/auth/me")
      .then((perfil) => {
        if (mounted) {
          setPermisos(Array.isArray(perfil.permisos) ? perfil.permisos : []);
        }
      })
      .catch((error) => {
        if (mounted) {
          setErrorPermisos(error.message || "No se pudieron cargar los permisos del menú.");
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add("dark");
      localStorage.setItem("tema", "dark");
    } else {
      document.body.classList.remove("dark");
      localStorage.setItem("tema", "light");
    }
  }, [darkMode]);

  useEffect(() => {
    if (!accountMenuOpen && !activeModal) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (accountMenuOpen && !accountMenuRef.current?.contains(event.target)) {
        setAccountMenuOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
        setActiveModal(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen, activeModal]);

  const cerrarSesion = () => {
    localStorage.removeItem("alanis_token");
    localStorage.removeItem("alanis_user");
    navigate("/login");
  };

  const puedeVerModulo = (modulo) => permisos?.some(
    (permiso) => permiso.modulo === modulo && permiso.acceso === true
  ) ?? false;

  const abrirModal = (modal) => {
    setAccountMenuOpen(false);
    setModalError("");
    setModalSuccess("");

    if (modal === "profile") {
      setProfileForm({
        nombre: user?.nombre || "",
        apellido: user?.apellido || "",
        username: user?.username || "",
        email: user?.email || "",
      });
    } else {
      setNewPassword("");
    }

    setActiveModal(modal);
  };

  const cerrarModal = () => {
    setActiveModal(null);
    setModalError("");
    setModalSuccess("");
  };

  const guardarPerfil = async (event) => {
    event.preventDefault();
    setModalError("");
    setModalSuccess("");

    if (!user?.id_usuario) {
      setModalError("No se pudo identificar al usuario actual.");
      return;
    }

    try {
      const perfilActualizado = await apiClient.put(`/usuarios/${user.id_usuario}`, {
        nombre: profileForm.nombre.trim(),
        apellido: profileForm.apellido.trim(),
        email: profileForm.email.trim(),
      });
      localStorage.setItem(
        "alanis_user",
        JSON.stringify({ ...user, ...perfilActualizado })
      );
      setModalSuccess("Los datos del perfil se actualizaron.");
    } catch (error) {
      setModalError(error.message || "No se pudo actualizar el perfil.");
    }
  };

  const cambiarPassword = async (event) => {
    event.preventDefault();
    setModalError("");
    setModalSuccess("");

    if (!user?.id_usuario) {
      setModalError("No se pudo identificar al usuario actual.");
      return;
    }

    try {
      await apiClient.put(`/usuarios/${user.id_usuario}`, { password: newPassword });
      setNewPassword("");
      setModalSuccess("La contraseña se actualizó.");
    } catch (error) {
      setModalError(error.message || "No se pudo actualizar la contraseña.");
    }
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-brand-mark" aria-hidden="true">A</div>

          <div className="sidebar-brand-copy">
            <strong>ALANIS</strong>
            <small>Gestión Comercial</small>
          </div>
        </div>

        <nav className="sidebar-nav">
          {errorPermisos && <span className="error-message" role="alert">{errorPermisos}</span>}
          {puedeVerModulo("Dashboard") && (
            <>
              <span className="menu-title">RESUMEN</span>
              <NavLink to="/dashboard">Dashboard</NavLink>
            </>
          )}
          {(puedeVerModulo("Productos") || puedeVerModulo("Categorías") || puedeVerModulo("Inventario") || puedeVerModulo("Movimientos")) && (
            <>
              <span className="menu-title">GESTIÓN DE INVENTARIO</span>
              {puedeVerModulo("Productos") && <NavLink to="/productos">Productos</NavLink>}
              {puedeVerModulo("Categorías") && <NavLink to="/categorias">Categorías</NavLink>}
              {puedeVerModulo("Inventario") && <NavLink to="/inventario">Inventario</NavLink>}
              {puedeVerModulo("Movimientos") && <NavLink to="/movimientos">Movimientos</NavLink>}
            </>
          )}
          {(puedeVerModulo("Ventas") || puedeVerModulo("Compras") || puedeVerModulo("Proveedores")) && (
            <>
              <span className="menu-title">OPERACIONES</span>
              {puedeVerModulo("Ventas") && <NavLink to="/ventas">Ventas</NavLink>}
              {puedeVerModulo("Compras") && <NavLink to="/compras">Compras</NavLink>}
              {puedeVerModulo("Proveedores") && <NavLink to="/proveedores">Proveedores</NavLink>}
            </>
          )}
          {(puedeVerModulo("Reportes") || puedeVerModulo("Predicción")) && (
            <>
              <span className="menu-title">ANÁLISIS</span>
              {puedeVerModulo("Reportes") && <NavLink to="/reportes">Reportes</NavLink>}
              {puedeVerModulo("Predicción") && <NavLink to="/predicciones">Predicciones</NavLink>}
            </>
          )}
        </nav>

        <div className="sidebar-bottom">
          <img
            className="sidebar-decoration"
            src="/sidebar-alanis-illustration.png"
            alt=""
            aria-hidden="true"
          />
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="system-title">
            <h3>Sistema de Gestión y Predicción de Demanda</h3>
            <span>Panel administrativo</span>
          </div>

          <div className="topbar-account">
            <div className="user-profile">
              <div className="avatar">A</div>
              <div>
                <strong>{user?.nombre || "Administrador"}</strong>
                <span>{user?.email || user?.username || "Sin correo"}</span>
              </div>
            </div>

            <button
              className="theme-button"
              type="button"
              aria-label={darkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              title={darkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              onClick={() => setDarkMode(!darkMode)}
            >
              <span aria-hidden="true">{darkMode ? "☀️" : "🌙"}</span>
            </button>

            <div className="account-menu" ref={accountMenuRef}>
              <button
                className="account-menu-trigger"
                type="button"
                aria-label="Abrir menú de cuenta"
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                onClick={() => setAccountMenuOpen((isOpen) => !isOpen)}
              >
                <span aria-hidden="true">⋮</span>
              </button>
              {accountMenuOpen && (
                <div className="account-menu-popover" role="menu">
                  <button type="button" role="menuitem" onClick={() => abrirModal("profile")}>Mi perfil</button>
                  <button type="button" role="menuitem" onClick={() => abrirModal("password")}>Cambiar contraseña</button>
                  <button type="button" role="menuitem" onClick={cerrarSesion}>Cerrar sesión</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <section className="page-content">
          <Outlet />
        </section>
      </main>

      {activeModal && (
        <div className="account-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) cerrarModal();
        }}>
          <section
            className="account-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-modal-title"
          >
            <div className="account-modal-header">
              <div>
                <h2 id="account-modal-title">
                  {activeModal === "profile" ? "Mi perfil" : "Cambiar contraseña"}
                </h2>
                <p>
                  {activeModal === "profile"
                    ? "Actualiza tus datos personales."
                    : "Establece una nueva contraseña para tu cuenta."}
                </p>
              </div>
              <button className="account-modal-close" type="button" aria-label="Cerrar" onClick={cerrarModal}>×</button>
            </div>

            {modalError && <div className="error-message account-modal-message" role="alert">{modalError}</div>}
            {modalSuccess && <div className="account-modal-success" role="status">{modalSuccess}</div>}

            {activeModal === "profile" ? (
              <form onSubmit={guardarPerfil}>
                <div className="account-modal-fields">
                  <div>
                    <label className="form-label" htmlFor="account-profile-name">Nombre</label>
                    <input
                      className="form-control"
                      id="account-profile-name"
                      value={profileForm.nombre}
                      onChange={(event) => setProfileForm((form) => ({ ...form, nombre: event.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="account-profile-surname">Apellido</label>
                    <input
                      className="form-control"
                      id="account-profile-surname"
                      value={profileForm.apellido}
                      onChange={(event) => setProfileForm((form) => ({ ...form, apellido: event.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="account-profile-email">Correo</label>
                    <input
                      className="form-control"
                      id="account-profile-email"
                      type="email"
                      value={profileForm.email}
                      onChange={(event) => setProfileForm((form) => ({ ...form, email: event.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="account-profile-username">Usuario</label>
                    <input
                      className="form-control"
                      id="account-profile-username"
                      value={profileForm.username}
                      readOnly
                    />
                  </div>
                </div>
                <div className="account-modal-actions">
                  <button className="primary-button" type="submit">Guardar cambios</button>
                  <button className="action-button" type="button" onClick={cerrarModal}>Cerrar</button>
                </div>
              </form>
            ) : (
              <form onSubmit={cambiarPassword}>
                <div className="account-modal-fields">
                  <div>
                    <label className="form-label" htmlFor="account-new-password">Nueva contraseña</label>
                    <input
                      className="form-control"
                      id="account-new-password"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="account-modal-actions">
                  <button className="primary-button" type="submit">Actualizar contraseña</button>
                  <button className="action-button" type="button" onClick={cerrarModal}>Cerrar</button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default Layout;