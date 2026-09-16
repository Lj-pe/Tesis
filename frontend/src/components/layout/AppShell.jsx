import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const mainLinks = [
  ['/dashboard', 'Dashboard'],
  ['/productos', 'Productos'],
  ['/inventario', 'Inventario'],
  ['/compras', 'Compras'],
  ['/ventas', 'Ventas'],
  ['/proveedores', 'Proveedores'],
  ['/predicciones', 'Predicciones / IA'],
]

export default function AppShell() {
  const { user, isAdmin, logout } = useAuth()

  return (
    <div className="app-shell">
      <div className="layout-frame">
          <aside className="app-sidebar">
            <div className="section-spacing">
              <div className="brand-mark">Boutique Libreria Bazar</div>
              <h1 className="heading-small title-white title-offset">Alanis</h1>
            </div>
            <nav className="sidebar-navigation">
              {mainLinks.map(([to, label]) => (
                <NavLink key={to} to={to} className="sidebar-link">
                  {label}
                </NavLink>
              ))}
              {isAdmin && (
                <NavLink to="/administracion" className="sidebar-link">
                  Administración
                </NavLink>
              )}
            </nav>
          </aside>
          <main className="content-area">
            <header className="topbar">
              <span className="small-text muted-text">Gestión interna</span>
              <div className="topbar-actions">
                <span className="small-text">{user?.nombre || user?.username}</span>
                <button className="button button-secondary" type="button" onClick={logout}>
                  Cerrar sesión
                </button>
              </div>
            </header>
            <div className="content-padding">
              <Outlet />
            </div>
          </main>
      </div>
    </div>
  )
}
