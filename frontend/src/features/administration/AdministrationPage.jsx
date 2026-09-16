import { Link } from 'react-router-dom'

const sections = [
  ['/administracion/usuarios', 'Usuarios', 'Consulta y gestiona las cuentas de acceso al sistema.'],
  ['/administracion/roles', 'Roles', 'Define los roles disponibles y su estado.'],
]

export default function AdministrationPage() {
  return (
    <section className="administration-page">
      <div>
        <p className="eyebrow">Gestión interna</p>
        <h2 className="page-title section-spacing-small">Administración</h2>
        <p className="muted-text">Desde aquí se gestionan los usuarios del sistema y los roles que definen sus permisos.</p>
      </div>

      <div className="administration-grid">
        {sections.map(([to, title, description]) => (
          <Link key={to} to={to} className="dashboard-panel administration-card">
            <h3>{title}</h3>
            <p className="muted-text">{description}</p>
            <span className="administration-card-action">Ir a {title}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
