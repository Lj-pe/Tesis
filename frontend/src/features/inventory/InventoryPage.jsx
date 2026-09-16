import { useEffect, useMemo, useState } from 'react'
import apiClient from '../../api/client'

const initialState = {
  inventories: [],
  products: [],
  movements: [],
}

const statusOptions = [
  ['', 'Todos los estados'],
  ['normal', 'Normal'],
  ['bajo', 'Bajo'],
  ['agotado', 'Agotado'],
  ['bloqueado', 'Bloqueado'],
]

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || fallback
}

function formatNumber(value) {
  return new Intl.NumberFormat('es-PE').format(Number(value || 0))
}

function formatDate(value) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(value))
}

function isCritical(inventory) {
  return ['bajo', 'agotado', 'bloqueado'].includes(inventory.estado_inventario)
    || Number(inventory.stock_actual) <= Number(inventory.stock_minimo)
}

function InventoryStatus({ status }) {
  return <span className={`status status-${status}`}>{status || 'Sin estado'}</span>
}

export default function InventoryPage() {
  const [data, setData] = useState(initialState)
  const [selectedInventory, setSelectedInventory] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailError, setDetailError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [criticalOnly, setCriticalOnly] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    let isMounted = true

    Promise.allSettled([
      apiClient.get('/inventarios'),
      apiClient.get('/productos'),
      apiClient.get('/movimientos-inventario'),
    ]).then((results) => {
      if (!isMounted) return

      const nextData = { ...initialState }
      const nextErrors = {}
      const keys = ['inventories', 'products', 'movements']

      results.forEach((result, index) => {
        const key = keys[index]
        if (result.status === 'fulfilled') {
          nextData[key] = Array.isArray(result.value.data) ? result.value.data : []
        } else {
          nextErrors[key] = getErrorMessage(result.reason, 'No se pudo cargar esta información.')
        }
      })

      setData(nextData)
      setErrors(nextErrors)
      setIsLoading(false)
    })

    return () => {
      isMounted = false
    }
  }, [])

  const productNames = useMemo(
    () => Object.fromEntries(data.products.map((product) => [product.id_producto, product.nombre])),
    [data.products]
  )

  const filteredInventories = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return data.inventories.filter((inventory) => {
      const productName = productNames[inventory.producto_id] || ''
      const matchesSearch = !normalizedSearch
        || productName.toLowerCase().includes(normalizedSearch)
        || String(inventory.producto_id).includes(normalizedSearch)
        || String(inventory.id_inventario).includes(normalizedSearch)
      const matchesStatus = !statusFilter || inventory.estado_inventario === statusFilter
      const matchesCritical = !criticalOnly || isCritical(inventory)
      return matchesSearch && matchesStatus && matchesCritical
    })
  }, [data.inventories, productNames, search, statusFilter, criticalOnly])

  const visibleMovements = useMemo(() => {
    const movements = selectedInventory
      ? data.movements.filter((movement) => movement.inventario_id === selectedInventory.id_inventario)
      : data.movements

    return [...movements]
      .sort((first, second) => Number(second.id_movimiento || 0) - Number(first.id_movimiento || 0))
      .slice(0, 12)
  }, [data.movements, selectedInventory])

  async function selectInventory(inventory) {
    setSelectedInventory(inventory)
    setDetail(null)
    setDetailError('')
    setIsDetailLoading(true)

    try {
      const { data: inventoryDetail } = await apiClient.get(`/inventarios/${inventory.id_inventario}`)
      setDetail(inventoryDetail)
    } catch (error) {
      setDetailError(getErrorMessage(error, 'No se pudo cargar el detalle del inventario.'))
    } finally {
      setIsDetailLoading(false)
    }
  }

  function clearFilters() {
    setSearch('')
    setStatusFilter('')
    setCriticalOnly(false)
  }

  if (isLoading) {
    return <section className="inventory-page"><div className="dashboard-loading" role="status">Cargando inventario, productos y movimientos...</div></section>
  }

  return (
    <section className="inventory-page">
      <div className="inventory-heading">
        <div>
          <p className="eyebrow">Control de existencias</p>
          <h2 className="page-title">Inventario</h2>
          <p className="muted-text">Consulta el stock disponible y detecta productos que requieren atención.</p>
        </div>
        <div className="inventory-summary">
          <strong>{formatNumber(data.inventories.filter(isCritical).length)}</strong>
          <span>con atención prioritaria</span>
        </div>
      </div>

      <div className="inventory-layout">
        <section className="dashboard-panel inventory-list-panel">
          <div className="inventory-toolbar">
            <label className="sr-only" htmlFor="inventory-search">Buscar inventario</label>
            <input id="inventory-search" className="form-control" placeholder="Buscar por producto o ID" value={search} onChange={(event) => setSearch(event.target.value)} />
            <label className="sr-only" htmlFor="inventory-status">Filtrar por estado</label>
            <select id="inventory-status" className="form-control inventory-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <label className="checkbox-control"><input type="checkbox" checked={criticalOnly} onChange={(event) => setCriticalOnly(event.target.checked)} /> Solo atención</label>
            <button className="button button-secondary button-small" type="button" onClick={clearFilters}>Limpiar</button>
          </div>

          {errors.inventories && <p className="dashboard-message dashboard-message-error">{errors.inventories}</p>}
          {!errors.inventories && filteredInventories.length === 0 && <p className="dashboard-message">{data.inventories.length === 0 ? 'No hay inventarios registrados.' : 'No hay inventarios que coincidan con los filtros.'}</p>}
          {!errors.inventories && filteredInventories.length > 0 && (
            <div className="table-wrapper">
              <table className="dashboard-table inventory-table">
                <thead><tr><th>Producto</th><th>Stock actual</th><th>Mínimo</th><th>Seguridad</th><th>Máximo</th><th>Estado</th></tr></thead>
                <tbody>
                  {filteredInventories.map((inventory) => (
                    <tr key={inventory.id_inventario} className={selectedInventory?.id_inventario === inventory.id_inventario ? 'selected-row' : ''}>
                      <td><button className="table-link" type="button" onClick={() => selectInventory(inventory)}>{productNames[inventory.producto_id] || `Producto #${inventory.producto_id}`}</button><small className="table-subtext">Inventario #{inventory.id_inventario}</small></td>
                      <td className={isCritical(inventory) ? 'stock-critical' : ''}>{formatNumber(inventory.stock_actual)}</td>
                      <td>{formatNumber(inventory.stock_minimo)}</td>
                      <td>{inventory.stock_seguridad === null ? 'No definido' : formatNumber(inventory.stock_seguridad)}</td>
                      <td>{inventory.stock_maximo === null ? 'No definido' : formatNumber(inventory.stock_maximo)}</td>
                      <td><InventoryStatus status={inventory.estado_inventario} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="inventory-side-column">
          <section className="dashboard-panel inventory-detail-panel">
            <div className="panel-heading"><div><p className="eyebrow">Consulta</p><h3>Detalle del inventario</h3></div></div>
            {!selectedInventory && <p className="dashboard-message">Selecciona un producto para consultar su inventario.</p>}
            {isDetailLoading && <p className="dashboard-message">Cargando detalle...</p>}
            {detailError && <p className="dashboard-message dashboard-message-error">{detailError}</p>}
            {detail && !isDetailLoading && !detailError && (
              <dl className="product-details"><div><dt>Producto</dt><dd>{productNames[detail.producto_id] || `Producto #${detail.producto_id}`}</dd></div><div><dt>Stock actual</dt><dd className={isCritical(detail) ? 'stock-critical' : ''}>{formatNumber(detail.stock_actual)}</dd></div><div><dt>Stock mínimo</dt><dd>{formatNumber(detail.stock_minimo)}</dd></div><div><dt>Stock de seguridad</dt><dd>{detail.stock_seguridad === null ? 'No definido' : formatNumber(detail.stock_seguridad)}</dd></div><div><dt>Stock máximo</dt><dd>{detail.stock_maximo === null ? 'No definido' : formatNumber(detail.stock_maximo)}</dd></div><div><dt>Estado</dt><dd><InventoryStatus status={detail.estado_inventario} /></dd></div><div><dt>Última actualización</dt><dd>{formatDate(detail.fecha_ultima_actualizacion || detail.fecha_actualizacion)}</dd></div></dl>
            )}
          </section>
        </aside>
      </div>

      <section className="dashboard-panel inventory-movements-panel">
        <div className="panel-heading"><div><p className="eyebrow">Trazabilidad</p><h3>{selectedInventory ? `Movimientos de ${productNames[selectedInventory.producto_id] || `Producto #${selectedInventory.producto_id}`}` : 'Movimientos recientes'}</h3></div><span className="small-text muted-text">{visibleMovements.length} mostrado(s)</span></div>
        {errors.movements && <p className="dashboard-message dashboard-message-error">{errors.movements}</p>}
        {!errors.movements && visibleMovements.length === 0 && <p className="dashboard-message">No hay movimientos registrados.</p>}
        {!errors.movements && visibleMovements.length > 0 && (
          <div className="table-wrapper">
            <table className="dashboard-table movements-table">
              <thead><tr><th>Tipo</th><th>Producto</th><th>Cantidad</th><th>Motivo</th><th>Fecha</th><th>Estado</th></tr></thead>
              <tbody>{visibleMovements.map((movement) => <tr key={movement.id_movimiento}><td><span className={`movement-type movement-${movement.tipo_movimiento}`}>{movement.tipo_movimiento}</span></td><td>{productNames[data.inventories.find((inventory) => inventory.id_inventario === movement.inventario_id)?.producto_id] || `Inventario #${movement.inventario_id}`}</td><td>{formatNumber(movement.cantidad)}</td><td>{movement.motivo || 'Sin motivo'}</td><td>{formatDate(movement.fecha_movimiento)}</td><td>{movement.estado || 'Sin estado'}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}
