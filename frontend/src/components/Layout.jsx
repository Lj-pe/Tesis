import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import apiClient from "../api/client";

function Layout() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("alanis_user") || "null");
  const [darkMode, setDarkMode] = useState(localStorage.getItem("tema") === "dark");
  const [passwordOpen, setPasswordOpen] = useState(Boolean(user?.debe_cambiar_clave));
  const [claveActual, setClaveActual] = useState("");
  const [claveNueva, setClaveNueva] = useState("");
  const [modalError, setModalError] = useState("");
  const [modalSuccess, setModalSuccess] = useState("");

  useEffect(() => {
    document.body.classList.toggle("dark", darkMode);
    localStorage.setItem("tema", darkMode ? "dark" : "light");
  }, [darkMode]);

  const cerrarSesion = () => {
    localStorage.removeItem("alanis_token");
    localStorage.removeItem("alanis_user");
    navigate("/login");
  };

  const cambiarClave = async (event) => {
    event.preventDefault();
    setModalError("");
    setModalSuccess("");
    try {
      await apiClient.put("/auth/clave", {
        clave_actual: claveActual,
        clave_nueva: claveNueva,
      });
      const updatedUser = { ...user, debe_cambiar_clave: false };
      localStorage.setItem("alanis_user", JSON.stringify(updatedUser));
      setClaveActual("");
      setClaveNueva("");
      setModalSuccess("La clave se actualizó.");
      setPasswordOpen(false);
    } catch (error) {
      setModalError(error.message || "No se pudo actualizar la clave.");
    }
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-brand-mark" aria-hidden="true">M</div>
          <div className="sidebar-brand-copy">
            <strong>MINIMARKET</strong>
            <small>Gestión Comercial</small>
          </div>
        </div>
        <nav className="sidebar-nav">
          <span className="menu-title">RESUMEN</span>
          <NavLink to="/dashboard">Dashboard</NavLink>
          <span className="menu-title">GESTIÓN DE INVENTARIO</span>
          <NavLink to="/productos">Productos</NavLink>
          <NavLink to="/categorias">Categorías</NavLink>
          <NavLink to="/inventario">Inventario</NavLink>
          <NavLink to="/movimientos">Movimientos</NavLink>
          <span className="menu-title">OPERACIONES</span>
          <NavLink to="/ventas">Ventas</NavLink>
          <NavLink to="/compras">Compras</NavLink>
          <NavLink to="/proveedores">Proveedores</NavLink>
          <span className="menu-title">ANÁLISIS</span>
          <NavLink to="/reportes">Reportes</NavLink>
          <NavLink to="/predicciones">Predicciones</NavLink>
        </nav>
        <div className="sidebar-bottom">
          <img className="sidebar-decoration" src="/sidebar-alanis-illustration.png" alt="" aria-hidden="true" />
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="system-title">
            <h3>Sistema de Gestión Comercial</h3>
            <span>Panel administrativo</span>
          </div>
          <div className="topbar-account">
            <div className="user-profile">
              <div className="avatar">{user?.nombre?.slice(0, 1) || "U"}</div>
              <div>
                <strong>{user?.nombre || user?.nombre_usuario || "Usuario"}</strong>
                <span>{user?.nombre_usuario || ""}</span>
              </div>
            </div>
            <button
              className="theme-button"
              type="button"
              aria-label={darkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              onClick={() => setDarkMode((value) => !value)}
            >
              <span aria-hidden="true">{darkMode ? "☀️" : "🌙"}</span>
            </button>
            <button className="action-button" type="button" onClick={() => setPasswordOpen(true)}>Cambiar clave</button>
            <button className="action-button" type="button" onClick={cerrarSesion}>Cerrar sesión</button>
          </div>
        </header>
        <section className="page-content"><Outlet /></section>
      </main>

      {passwordOpen && (
        <div className="account-modal-backdrop">
          <section className="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-modal-title">
            <div className="account-modal-header">
              <div>
                <h2 id="account-modal-title">Cambiar clave</h2>
                <p>{user?.debe_cambiar_clave ? "Debes cambiar tu clave para continuar." : "Actualiza la clave de tu cuenta."}</p>
              </div>
              {!user?.debe_cambiar_clave && (
                <button className="account-modal-close" type="button" aria-label="Cerrar" onClick={() => setPasswordOpen(false)}>×</button>
              )}
            </div>
            {modalError && <div className="error-message account-modal-message" role="alert">{modalError}</div>}
            {modalSuccess && <div className="account-modal-success" role="status">{modalSuccess}</div>}
            <form onSubmit={cambiarClave}>
              <div className="account-modal-fields">
                <div>
                  <label className="form-label" htmlFor="clave-actual">Clave actual</label>
                  <input id="clave-actual" className="form-control" type="password" autoComplete="current-password" value={claveActual} onChange={(event) => setClaveActual(event.target.value)} required />
                </div>
                <div>
                  <label className="form-label" htmlFor="clave-nueva">Nueva clave</label>
                  <input id="clave-nueva" className="form-control" type="password" autoComplete="new-password" minLength={8} value={claveNueva} onChange={(event) => setClaveNueva(event.target.value)} required />
                </div>
              </div>
              <div className="account-modal-actions">
                <button className="primary-button" type="submit">Guardar clave</button>
                {!user?.debe_cambiar_clave && <button className="action-button" type="button" onClick={() => setPasswordOpen(false)}>Cancelar</button>}
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default Layout;
