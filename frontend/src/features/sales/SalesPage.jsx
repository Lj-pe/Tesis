import { useEffect, useMemo, useState } from 'react'
import apiClient from '../../api/client'
import SaleTransactionForm from './SaleTransactionForm'

const initialData = {
  sales: [],
  details: [],
  products: [],
  inventories: [],
}

const saleStatuses = [
  ['', 'Todos los estados'],
  ['pendiente', 'Pendiente'],
  ['pagada', 'Pagada'],
  ['anulada', 'Anulada'],
  ['cancelada', 'Cancelada'],
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
  return [...items].sort((first, second) => Number(second.id_venta || 0) - Number(first.id_venta || 0))
}

export default function SalesPage() {
  const [data, setData] = useState(initialData)
  const [selectedSale, setSelectedSale] = useState(null)
  const [saleDetail, setSaleDetail] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [detailError, setDetailError] = useState('')

  async function refreshSaleData() {
    const results = await Promise.allSettled([
      apiClient.get('/ventas'),
      apiClient.get('/detalle-ventas'),
      apiClient.get('/inventarios'),
    ])

    setData((currentData) => ({
      ...currentData,
      sales: results[0].status === 'fulfilled' && Array.isArray(results[0].value.data) ? results[0].value.data : currentData.sales,
      details: results[1].status === 'fulfilled' && Array.isArray(results[1].value.data) ? results[1].value.data : currentData.details,
      inventories: results[2].status === 'fulfilled' && Array.isArray(results[2].value.data) ? results[2].value.data : currentData.inventories,
    }))
  }

  useEffect(() => {
    let isMounted = true

    Promise.allSettled([
      apiClient.get('/ventas'),
      apiClient.get('/detalle-ventas'),
      apiClient.get('/productos'),
      apiClient.get('/inventarios'),
    ]).then((results) => {
      if (!isMounted) return

      const keys = ['sales', 'details', 'products', 'inventories']
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

  const productNames = useMemo(
    () => Object.fromEntries(data.products.map((product) => [product.id_producto, product.nombre])),
    [data.products]
  )

  const filteredSales = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return sortByIdDesc(data.sales).filter((sale) => {
      const matchesSearch = !normalizedSearch
        || String(sale.id_venta).includes(normalizedSearch)
        || String(sale.numero_factura || '').toLowerCase().includes(normalizedSearch)
      const matchesStatus = !statusFilter || sale.estado === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [data.sales, search, statusFilter])

  const selectedDetails = useMemo(() => {
    if (!selectedSale) return []
    return data.details.filter((detail) => detail.venta_id === selectedSale.id_venta)
  }, [data.details, selectedSale])

  async function selectSale(sale) {
    setSelectedSale(sale)
    setSaleDetail(null)
    setDetailError('')
    setIsDetailLoading(true)

    try {
      const { data: detail } = await apiClient.get(`/ventas/${sale.id_venta}`)
      setSaleDetail(detail)
    } catch (error) {
      setDetailError(getErrorMessage(error, 'No se pudo cargar el detalle de la venta.'))
    } finally {
      setIsDetailLoading(false)
    }
  }

  function clearFilters() {
    setSearch('')
    setStatusFilter('')
  }

  if (isLoading) {
    return <section className="sales-page"><div className="dashboard-loading" role="status">Cargando ventas y productos...</div></section>
  }

  return (
    <section className="sales-page">
      <div className="sales-heading">
        <div>
          <p className="eyebrow">Actividad comercial</p>
          <h2 className="page-title">Ventas</h2>
          <p className="muted-text">Consulta las ventas registradas y sus productos relacionados.</p>
        </div>
        <div className="sale-count"><strong>{filteredSales.length}</strong><span>venta(s) mostrada(s)</span></div>
      </div>

      {Object.keys(errors).length > 0 && <div className="error-message" role="alert">{Object.values(errors).join(' ')}</div>}

      <SaleTransactionForm
        products={data.products}
        inventories={data.inventories}
        onSuccess={refreshSaleData}
      />

      <div className="sales-layout">
        <section className="dashboard-panel sales-list-panel">
          <div className="sales-toolbar">
            <label className="sr-only" htmlFor="sale-search">Buscar ventas</label>
            <input id="sale-search" className="form-control" placeholder="Buscar por ID o número de factura" value={search} onChange={(event) => setSearch(event.target.value)} />
            <label className="sr-only" htmlFor="sale-status">Filtrar por estado</label>
            <select id="sale-status" className="form-control sale-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{saleStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <button className="button button-secondary button-small" type="button" onClick={clearFilters}>Limpiar</button>
          </div>

          {errors.sales && <p className="dashboard-message dashboard-message-error">{errors.sales}</p>}
          {!errors.sales && filteredSales.length === 0 && <p className="dashboard-message">{data.sales.length === 0 ? 'No hay ventas registradas.' : 'No hay ventas que coincidan con los filtros.'}</p>}
          {!errors.sales && filteredSales.length > 0 && (
            <div className="table-wrapper">
              <table className="dashboard-table sales-table">
                <thead><tr><th>Venta</th><th>Factura</th><th>Fecha</th><th>Estado</th><th>Subtotal</th><th>Descuento</th><th>Impuesto</th><th>Total</th><th>Forma de pago</th></tr></thead>
                <tbody>{filteredSales.map((sale) => <tr key={sale.id_venta} className={selectedSale?.id_venta === sale.id_venta ? 'selected-row' : ''}><td><button className="table-link" type="button" onClick={() => selectSale(sale)}>Venta #{sale.id_venta}</button></td><td>{sale.numero_factura || 'Sin factura'}</td><td>{formatDate(sale.fecha_venta)}</td><td><span className={`status status-${sale.estado}`}>{sale.estado || 'Sin estado'}</span></td><td>{formatCurrency(sale.subtotal)}</td><td>{formatCurrency(sale.descuento)}</td><td>{formatCurrency(sale.impuesto)}</td><td><strong>{formatCurrency(sale.total)}</strong></td><td>{sale.forma_pago || 'No registrada'}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="sales-side-column">
          <section className="dashboard-panel sale-detail-panel">
            <div className="panel-heading"><div><p className="eyebrow">Consulta</p><h3>Detalle de venta</h3></div></div>
            {!selectedSale && <p className="dashboard-message">Selecciona una venta para consultar sus datos.</p>}
            {isDetailLoading && <p className="dashboard-message">Cargando detalle...</p>}
            {detailError && <p className="dashboard-message dashboard-message-error">{detailError}</p>}
            {saleDetail && !isDetailLoading && !detailError && <dl className="product-details"><div><dt>Venta</dt><dd>#{saleDetail.id_venta}</dd></div><div><dt>Fecha</dt><dd>{formatDate(saleDetail.fecha_venta)}</dd></div><div><dt>Número de factura</dt><dd>{saleDetail.numero_factura || 'Sin factura'}</dd></div><div><dt>Estado</dt><dd><span className={`status status-${saleDetail.estado}`}>{saleDetail.estado || 'Sin estado'}</span></dd></div><div><dt>Forma de pago</dt><dd>{saleDetail.forma_pago || 'No registrada'}</dd></div><div><dt>Subtotal</dt><dd>{formatCurrency(saleDetail.subtotal)}</dd></div><div><dt>Descuento</dt><dd>{formatCurrency(saleDetail.descuento)}</dd></div><div><dt>Impuesto</dt><dd>{formatCurrency(saleDetail.impuesto)}</dd></div><div><dt>Total</dt><dd><strong>{formatCurrency(saleDetail.total)}</strong></dd></div><div><dt>Observaciones</dt><dd>{saleDetail.observaciones || 'Sin observaciones'}</dd></div></dl>}
          </section>
        </aside>
      </div>

      <section className="dashboard-panel sale-lines-panel">
        <div className="panel-heading"><div><p className="eyebrow">Productos vendidos</p><h3>{selectedSale ? `Detalle de venta #${selectedSale.id_venta}` : 'Detalle disponible'}</h3></div><span className="small-text muted-text">{selectedDetails.length} línea(s)</span></div>
        {errors.details && <p className="dashboard-message dashboard-message-error">{errors.details}</p>}
        {!errors.details && !selectedSale && <p className="dashboard-message">Selecciona una venta para consultar sus productos.</p>}
        {!errors.details && selectedSale && selectedDetails.length === 0 && <p className="dashboard-message">No hay detalles registrados para esta venta.</p>}
        {!errors.details && selectedSale && selectedDetails.length > 0 && <div className="table-wrapper"><table className="dashboard-table sale-lines-table"><thead><tr><th>Producto</th><th>SKU</th><th>Cantidad</th><th>Precio unitario</th></tr></thead><tbody>{selectedDetails.map((detail) => { const product = data.products.find((item) => item.id_producto === detail.producto_id); return <tr key={detail.id_detalle_venta}><td>{product?.nombre || 'Producto no disponible'}</td><td>{product?.codigo_sku || 'No disponible'}</td><td>{detail.cantidad}</td><td>{formatCurrency(detail.precio_unitario)}</td></tr> })}</tbody></table></div>}
      </section>
    </section>
  )
}
