import { useEffect, useMemo, useState } from 'react'
import apiClient from '../../api/client'
import PurchaseTransactionForm from './PurchaseTransactionForm'

const initialData = {
  purchases: [],
  details: [],
  suppliers: [],
  products: [],
}

const purchaseStatuses = [
  ['', 'Todos los estados'],
  ['pendiente', 'Pendiente'],
  ['recibida', 'Recibida'],
  ['parcial', 'Parcial'],
  ['anulada', 'Anulada'],
]

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || fallback
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(value || 0))
}

function formatDate(value) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(value))
}

function sortByIdDesc(items) {
  return [...items].sort((first, second) => Number(second.id_compra || 0) - Number(first.id_compra || 0))
}

export default function PurchasesPage() {
  const [data, setData] = useState(initialData)
  const [selectedPurchase, setSelectedPurchase] = useState(null)
  const [purchaseDetail, setPurchaseDetail] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [detailError, setDetailError] = useState('')

  async function refreshPurchaseData() {
    const results = await Promise.allSettled([
      apiClient.get('/compras'),
      apiClient.get('/detalle-compras'),
    ])

    setData((currentData) => ({
      ...currentData,
      purchases: results[0].status === 'fulfilled' && Array.isArray(results[0].value.data) ? results[0].value.data : currentData.purchases,
      details: results[1].status === 'fulfilled' && Array.isArray(results[1].value.data) ? results[1].value.data : currentData.details,
    }))
  }

  useEffect(() => {
    let isMounted = true

    Promise.allSettled([
      apiClient.get('/compras'),
      apiClient.get('/detalle-compras'),
      apiClient.get('/proveedores'),
      apiClient.get('/productos'),
    ]).then((results) => {
      if (!isMounted) return

      const keys = ['purchases', 'details', 'suppliers', 'products']
      const nextData = { ...initialData }
      const nextErrors = {}

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

  const supplierNames = useMemo(
    () => Object.fromEntries(data.suppliers.map((supplier) => [supplier.id_proveedor, supplier.nombre])),
    [data.suppliers]
  )

  const productNames = useMemo(
    () => Object.fromEntries(data.products.map((product) => [product.id_producto, product.nombre])),
    [data.products]
  )

  const filteredPurchases = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return sortByIdDesc(data.purchases).filter((purchase) => {
      const supplierName = supplierNames[purchase.proveedor_id] || ''
      const matchesSearch = !normalizedSearch
        || String(purchase.id_compra).includes(normalizedSearch)
        || String(purchase.numero_factura || '').toLowerCase().includes(normalizedSearch)
        || supplierName.toLowerCase().includes(normalizedSearch)
      const matchesStatus = !statusFilter || purchase.estado === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [data.purchases, supplierNames, search, statusFilter])

  const selectedDetails = useMemo(() => {
    if (!selectedPurchase) return []
    return data.details.filter((detail) => detail.compra_id === selectedPurchase.id_compra)
  }, [data.details, selectedPurchase])

  async function selectPurchase(purchase) {
    setSelectedPurchase(purchase)
    setPurchaseDetail(null)
    setDetailError('')
    setIsDetailLoading(true)

    try {
      const { data: detail } = await apiClient.get(`/compras/${purchase.id_compra}`)
      setPurchaseDetail(detail)
    } catch (error) {
      setDetailError(getErrorMessage(error, 'No se pudo cargar el detalle de la compra.'))
    } finally {
      setIsDetailLoading(false)
    }
  }

  function clearFilters() {
    setSearch('')
    setStatusFilter('')
  }

  if (isLoading) {
    return <section className="purchases-page"><div className="dashboard-loading" role="status">Cargando compras y relaciones del catálogo...</div></section>
  }

  return (
    <section className="purchases-page">
      <div className="purchases-heading">
        <div>
          <p className="eyebrow">Abastecimiento</p>
          <h2 className="page-title">Compras</h2>
          <p className="muted-text">Consulta las compras registradas, sus proveedores y el detalle disponible.</p>
        </div>
        <div className="purchase-count"><strong>{filteredPurchases.length}</strong><span>compra(s) mostrada(s)</span></div>
      </div>

      {Object.keys(errors).length > 0 && <div className="error-message" role="alert">{Object.values(errors).join(' ')}</div>}

      <PurchaseTransactionForm
        suppliers={data.suppliers}
        products={data.products}
        onSuccess={refreshPurchaseData}
      />

      <div className="purchases-layout">
        <section className="dashboard-panel purchases-list-panel">
          <div className="purchases-toolbar">
            <label className="sr-only" htmlFor="purchase-search">Buscar compras</label>
            <input id="purchase-search" className="form-control" placeholder="Buscar por factura, proveedor o ID" value={search} onChange={(event) => setSearch(event.target.value)} />
            <label className="sr-only" htmlFor="purchase-status">Filtrar por estado</label>
            <select id="purchase-status" className="form-control purchase-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{purchaseStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <button className="button button-secondary button-small" type="button" onClick={clearFilters}>Limpiar</button>
          </div>

          {errors.purchases && <p className="dashboard-message dashboard-message-error">{errors.purchases}</p>}
          {!errors.purchases && filteredPurchases.length === 0 && <p className="dashboard-message">{data.purchases.length === 0 ? 'No hay compras registradas.' : 'No hay compras que coincidan con los filtros.'}</p>}
          {!errors.purchases && filteredPurchases.length > 0 && (
            <div className="table-wrapper">
              <table className="dashboard-table purchases-table">
                <thead><tr><th>Compra</th><th>Proveedor</th><th>Fecha</th><th>Factura</th><th>Total</th><th>Estado</th></tr></thead>
                <tbody>{filteredPurchases.map((purchase) => <tr key={purchase.id_compra} className={selectedPurchase?.id_compra === purchase.id_compra ? 'selected-row' : ''}><td><button className="table-link" type="button" onClick={() => selectPurchase(purchase)}>Compra #{purchase.id_compra}</button></td><td>{supplierNames[purchase.proveedor_id] || `Proveedor #${purchase.proveedor_id}`}</td><td>{formatDate(purchase.fecha_compra)}</td><td>{purchase.numero_factura || 'Sin factura'}</td><td>{formatCurrency(purchase.total)}</td><td><span className={`status status-${purchase.estado}`}>{purchase.estado}</span></td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="purchases-side-column">
          <section className="dashboard-panel purchase-detail-panel">
            <div className="panel-heading"><div><p className="eyebrow">Consulta</p><h3>Detalle de compra</h3></div></div>
            {!selectedPurchase && <p className="dashboard-message">Selecciona una compra para consultar sus datos.</p>}
            {isDetailLoading && <p className="dashboard-message">Cargando detalle...</p>}
            {detailError && <p className="dashboard-message dashboard-message-error">{detailError}</p>}
            {purchaseDetail && !isDetailLoading && !detailError && <dl className="product-details"><div><dt>Compra</dt><dd>#{purchaseDetail.id_compra}</dd></div><div><dt>Proveedor</dt><dd>{supplierNames[purchaseDetail.proveedor_id] || `Proveedor #${purchaseDetail.proveedor_id}`}</dd></div><div><dt>Fecha de compra</dt><dd>{formatDate(purchaseDetail.fecha_compra)}</dd></div><div><dt>Recepción</dt><dd>{formatDate(purchaseDetail.fecha_recepcion)}</dd></div><div><dt>Subtotal</dt><dd>{formatCurrency(purchaseDetail.subtotal)}</dd></div><div><dt>Impuesto</dt><dd>{formatCurrency(purchaseDetail.impuesto)}</dd></div><div><dt>Total</dt><dd><strong>{formatCurrency(purchaseDetail.total)}</strong></dd></div><div><dt>Estado</dt><dd><span className={`status status-${purchaseDetail.estado}`}>{purchaseDetail.estado}</span></dd></div><div><dt>Observaciones</dt><dd>{purchaseDetail.observaciones || 'Sin observaciones'}</dd></div></dl>}
          </section>
        </aside>
      </div>

      <section className="dashboard-panel purchase-lines-panel">
        <div className="panel-heading"><div><p className="eyebrow">Productos adquiridos</p><h3>{selectedPurchase ? `Detalle de compra #${selectedPurchase.id_compra}` : 'Detalle disponible'}</h3></div><span className="small-text muted-text">{selectedDetails.length} línea(s)</span></div>
        {errors.details && <p className="dashboard-message dashboard-message-error">{errors.details}</p>}
        {!errors.details && !selectedPurchase && <p className="dashboard-message">Selecciona una compra para consultar sus productos.</p>}
        {!errors.details && selectedPurchase && selectedDetails.length === 0 && <p className="dashboard-message">No hay detalles registrados para esta compra.</p>}
        {!errors.details && selectedPurchase && selectedDetails.length > 0 && <div className="table-wrapper"><table className="dashboard-table purchase-lines-table"><thead><tr><th>Producto</th><th>Cantidad</th><th>Costo unitario</th><th>Subtotal</th><th>Total de línea</th></tr></thead><tbody>{selectedDetails.map((detail) => <tr key={detail.id_detalle_compra}><td>{productNames[detail.producto_id] || `Producto #${detail.producto_id}`}</td><td>{detail.cantidad}</td><td>{formatCurrency(detail.costo_unitario)}</td><td>{formatCurrency(detail.subtotal)}</td><td>{formatCurrency(detail.total_linea)}</td></tr>)}</tbody></table></div>}
      </section>
    </section>
  )
}
