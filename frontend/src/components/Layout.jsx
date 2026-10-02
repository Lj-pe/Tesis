import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

function Layout() {
  const navigate = useNavigate();

  const [darkMode, setDarkMode] = useState(
    localStorage.getItem("tema") === "dark"
  );

  const user = JSON.parse(localStorage.getItem("alanis_user") || "null");

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add("dark");
      localStorage.setItem("tema", "dark");
    } else {
      document.body.classList.remove("dark");
      localStorage.setItem("tema", "light");
    }
  }, [darkMode]);

  const cerrarSesion = () => {
    localStorage.removeItem("alanis_token");
    localStorage.removeItem("alanis_user");
    navigate("/login");
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="brand-icon">SG</div>

          <div>
            <strong>SGI</strong>
            <small>Gestión de Inventario</small>
          </div>
        </div>

        <nav className="sidebar-nav">
          <span className="menu-title">RESUMEN</span>

          <NavLink to="/dashboard">
            Dashboard
          </NavLink>

          <span className="menu-title">GESTIÓN DE INVENTARIO</span>

          <NavLink to="/productos">
            Productos
          </NavLink>

          <NavLink to="/categorias">
            Categorías
          </NavLink>

          <NavLink to="/inventario">
            Inventario
          </NavLink>

          <NavLink to="/movimientos">
            Movimientos
          </NavLink>

          <span className="menu-title">OPERACIONES</span>

          <NavLink to="/ventas">
            Ventas
          </NavLink>

          <NavLink to="/compras">
            Compras
          </NavLink>

          <NavLink to="/proveedores">
            Proveedores
          </NavLink>

          <span className="menu-title">ADMINISTRACIÓN</span>

          <NavLink to="/usuarios">
            Usuarios
          </NavLink>

          <NavLink to="/roles">
            Roles
          </NavLink>

          <span className="menu-title">ANÁLISIS</span>

          <NavLink to="/reportes">
            Reportes
          </NavLink>

          <NavLink to="/predicciones">
            Predicciones
          </NavLink>
        </nav>

        <div className="sidebar-bottom">
          <button
            className="theme-button"
            onClick={() => setDarkMode(!darkMode)}
          >
            {darkMode ? "Modo claro" : "Modo oscuro"}
          </button>

          <button
            className="logout-button"
            onClick={cerrarSesion}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="system-title">
            <h3>Sistema de Gestión y Predicción de Demanda</h3>
            <span>Panel administrativo</span>
          </div>

          <div className="user-profile">
            <div className="avatar">A</div>

            <div>
              <strong>{user?.nombre || "Administrador"}</strong>
              <span>{user?.email || user?.username || "usuario@dominio.com"}</span>
            </div>
          </div>
        </header>

        <section className="page-content">
          <Outlet />
        </section>
      </main>
    </div>
  );
}

export default Layout;