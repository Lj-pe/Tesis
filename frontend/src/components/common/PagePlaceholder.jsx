export default function PagePlaceholder({ title, description }) {
  return (
    <section>
      <div className="section-spacing">
        <p className="eyebrow section-spacing-small">Módulo preparado</p>
        <h2 className="page-title section-spacing-small">{title}</h2>
        <p className="muted-text">{description}</p>
      </div>
      <div className="page-surface">
        <p className="muted-text">Esta vista se implementará en la siguiente etapa aprobada.</p>
      </div>
    </section>
  )
}
