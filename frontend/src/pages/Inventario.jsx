import { useEffect, useMemo, useState } from "react";
import apiClient from "../api/client";

const INVENTORY_ICONS = {
  stock: <path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z M4 12l8 4.5 8-4.5 M4 16.5 12 21l8-4.5 M12 12v4.5" />,
  products: <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z M4.5 7.7 12 12l7.5-4.3 M12 12v9" />,
  code: <path d="M8 8 5 12l3 4m8-8 3 4-3 4m-3-9-2 10" />,
  product: <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm-8 4.5 8 4.5 8-4.5M12 12v9" />,
  category: <path d="M3 6h7l2 2h9v10H3z M3 9h18" />,
  presentation: <path d="M4 7h16M6 4h12v16H6zM9 11h6m-6 3h6" />,
  status: <path d="M12 3v9l6.4 3.7M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
};

function InventoryIcon({ type, className = "" }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {INVENTORY_ICONS[type]}
  </svg>;
}

function InventoryColumnHeading({ icon, children }) {
  return <span className="inventory-table-heading">
    <InventoryIcon type={icon} />
    {children}
  </span>;
}

function Inventario() {
  const [existencias, setExistencias] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([apiClient.get("/existencias"), apiClient.get("/categorias")])
      .then(([stocks, categories]) => {
        setExistencias(Array.isArray(stocks) ? stocks : []);
        setCategorias(Array.isArray(categories) ? categories : []);
      })
      .catch((requestError) => setError(requestError.message || "No se pudieron cargar las existencias."))
      .finally(() => setLoading(false));
  }, []);

  const categoryNames = useMemo(() => new Map(
    categorias.map((category) => [String(category.id), category.nombre])
  ), [categorias]);
  const visible = existencias.filter((row) => {
    const text = search.trim().toLowerCase();
    return !text || row.nombre?.toLowerCase().includes(text) || row.codigo?.toLowerCase().includes(text);
  });
  const stockTotal = existencias.reduce((sum, item) => sum + BigInt(item.unidades_disponibles || 0), 0n);

  return <>
    <div className="page-header"><div><h1 className="category-page-title"><InventoryIcon type="stock" className="category-display-icon" />Inventario</h1><p>Existencias calculadas a partir de los movimientos.</p></div></div>
    <div className="stats-grid inventory-stats-grid">
      <article className="stat-card dashboard-stat-card dashboard-stat-stock">
        <div className="dashboard-stat-heading"><span className="dashboard-stat-icon"><InventoryIcon type="stock" /></span><span>Unidades en stock</span></div>
        <strong>{stockTotal.toString()}</strong>
        <small>Según la vista de existencias</small>
      </article>
      <article className="stat-card dashboard-stat-card dashboard-stat-products">
        <div className="dashboard-stat-heading"><span className="dashboard-stat-icon"><InventoryIcon type="products" /></span><span>Productos con stock disponible</span></div>
        <strong>{existencias.length}</strong>
        <small>Productos con movimiento de inventario</small>
      </article>
    </div>
    <div className="panel">
      <div className="table-toolbar"><input className="search-input" placeholder="Buscar por nombre o código..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      {error && <div className="error-message" role="alert">{error}</div>}
      <div className="table-responsive inventario-table-scroll">
        <table className="inventory-table">
        <thead><tr>
          <th><InventoryColumnHeading icon="code">Código</InventoryColumnHeading></th>
          <th><InventoryColumnHeading icon="product">Producto</InventoryColumnHeading></th>
          <th><InventoryColumnHeading icon="category">Categoría</InventoryColumnHeading></th>
          <th><InventoryColumnHeading icon="presentation">Presentación</InventoryColumnHeading></th>
          <th><InventoryColumnHeading icon="stock">Existencia</InventoryColumnHeading></th>
          <th><InventoryColumnHeading icon="status">Estado</InventoryColumnHeading></th>
        </tr></thead>
        <tbody>{loading ? <tr><td colSpan="6">Cargando existencias...</td></tr>
          : visible.length === 0 ? <tr><td colSpan="6">No hay existencias para mostrar.</td></tr>
            : visible.map((item) => <tr key={item.producto_id}>
              <td>{item.codigo}</td><td><strong>{item.nombre}</strong></td>
              <td>{categoryNames.get(String(item.categoria_id)) || "—"}</td>
              <td>{item.presentacion || "—"}</td><td className="inventory-units">{String(item.unidades_disponibles)}</td>
              <td><span className={`badge product-status-badge ${item.activo ? "success-badge is-active" : "inactive-badge"}`}>
                <span className="product-status-dot" aria-hidden="true" />
                {item.activo ? "Activo" : "Inactivo"}
              </span></td>
            </tr>)}
        </tbody>
        </table>
      </div>
    </div>
  </>;
}

export default Inventario;
