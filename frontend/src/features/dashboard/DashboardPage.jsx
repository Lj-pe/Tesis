import { useEffect, useMemo, useState } from 'react'
import apiClient from '../../api/client'

const initialData = {
  productos: [],
  inventarios: [],
  compras: [],
  ventas: [],
  movimientos: [],
  predicciones: [],
}

const endpointConfig = [
  ['productos', '/productos'],
  ['inventarios', '/inventarios'],
  ['compras', '/compras'],
  ['ventas', '/ventas'],
  ['movimientos', '/movimientos-inventario'],
  ['predicciones', '/predicciones'],
]

function getErrorMessage(error) {
  return error.response?.data?.message || 'No se pudo obtener esta información.'
}

function sortByIdDesc(items, field) {
  return [...items].sort((first, second) => Number(second[field] || 0) - Number(first[field] || 0))
}

function formatDate(value) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(value))
}

function formatNumber(value) {
  return new Intl.NumberFormat('es-PE').format(Number(value || 0))
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(value || 0))
}

function SectionState({ error, emptyMessage }) {
  if (error) return <p className="dashboard-message dashboard-message-error">{error}</p>
  return <p className="dashboard-message">{emptyMessage}</p>
}

function MetricCard({ label, value, detail }) {
  return (
    <article className="metric-card">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-detail">{detail}</span>
    </article>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState(initialData)
  const [errors, setErrors] = useState({})
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function loadDashboard() {
      const results = await Promise.allSettled(
        endpointConfig.map(async ([key, endpoint]) => [key, (await apiClient.get(endpoint)).data])
      )

      if (!isMounted) return

      const nextData = { ...initialData }
      const nextErrors = {}

      results.forEach((result, index) => {
        const key = endpointConfig[index][0]
        if (result.status === 'fulfilled') {
          nextData[result.value[0]] = Array.isArray(result.value[1]) ? result.value[1] : []
        } else {
          nextErrors[key] = getErrorMessage(result.reason)
        }
      })

      setData(nextData)
      setErrors(nextErrors)
      setIsLoading(false)
    }

    loadDashboard()

    return () => {
      isMounted = false
    }
  }, [])

  const productNames = useMemo(
    () => Object.fromEntries(data.productos.map((product) => [product.id_producto, product.nombre])),
    [data.productos]
  )

  const criticalInventory = useMemo(
    () => data.inventarios.filter((inventory) => (
      ['bajo', 'agotado', 'bloqueado'].includes(inventory.estado_inventario)
      || Number(inventory.stock_actual) <= Number(inventory.stock_minimo)
    )),
    [data.inventarios]
  )

  const recentSales = useMemo(() => sortByIdDesc(data.ventas, 'id_venta').slice(0, 5), [data.ventas])
  const recentPurchases = useMemo(() => sortByIdDesc(data.compras, 'id_compra').slice(0, 5), [data.compras])
  const recentMovements = useMemo(() => sortByIdDesc(data.movimientos, 'id_movimiento').slice(0, 5), [data.movimientos])
  const recentPredictions = useMemo(() => sortByIdDesc(data.predicciones, 'id_prediccion').slice(0, 5), [data.predicciones])
  const totalStock = data.inventarios.reduce((total, inventory) => total + Number(inventory.stock_actual || 0), 0)
  const totalSales = data.ventas.reduce((total, sale) => total + Number(sale.total || 0), 0)

  if (isLoading) {
    return (
      <section className="dashboard-page">
        <div className="dashboard-heading">
          <p className="eyebrow">Resumen operativo</p>
          <h2 className="page-title">Dashboard</h2>
        </div>
        <div className="dashboard-loading" role="status">Cargando información del negocio...</div>
      </section>
    )
  }

  return (
    <section className="dashboard-page">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">Resumen operativo</p>
          <h2 className="page-title">Dashboard</h2>
          <p className="muted-text">Una lectura rápida del catálogo, inventario y operaciones registradas.</p>
        </div>
      </div>

      <div className="metrics-grid">
        <MetricCard label="Productos" value={formatNumber(data.productos.length)} detail={errors.productos || 'Productos registrados'} />
        <MetricCard label="Stock actual" value={formatNumber(totalStock)} detail={errors.inventarios || `${formatNumber(data.inventarios.length)} inventarios registrados`} />
        <MetricCard label="Stock crítico" value={formatNumber(criticalInventory.length)} detail="Inventarios bajo, agotados o bloqueados" />
        <MetricCard label="Ventas registradas" value={formatNumber(data.ventas.length)} detail={errors.ventas || formatCurrency(totalSales)} />
      </div>

      <div className="dashboard-grid dashboard-grid-main">
        <section className="dashboard-panel dashboard-panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Control de existencias</p>
              <h3>Stock crítico</h3>
            </div>
          </div>
          {errors.inventarios && <SectionState error={errors.inventarios} />}
          {!errors.inventarios && criticalInventory.length === 0 && <SectionState emptyMessage="No hay productos con stock crítico." />}
          {!errors.inventarios && criticalInventory.length > 0 && (
            <div className="table-wrapper">
              <table className="dashboard-table">
                <thead>
                  <tr><th>Producto</th><th>Stock actual</th><th>Mínimo</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {criticalInventory.slice(0, 8).map((inventory) => (
                    <tr key={inventory.id_inventario}>
                      <td>{productNames[inventory.producto_id] || `Producto #${inventory.producto_id}`}</td>
                      <td>{formatNumber(inventory.stock_actual)}</td>
                      <td>{formatNumber(inventory.stock_minimo)}</td>
                      <td><span className={`status status-${inventory.estado_inventario}`}>{inventory.estado_inventario}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="dashboard-panel">
          <div className="panel-heading"><div><p className="eyebrow">Actividad comercial</p><h3>Ventas recientes</h3></div></div>
          {errors.ventas && <SectionState error={errors.ventas} />}
          {!errors.ventas && recentSales.length === 0 && <SectionState emptyMessage="No hay ventas recientes." />}
          {!errors.ventas && recentSales.length > 0 && (
            <div className="compact-list">
              {recentSales.map((sale) => <div className="compact-list-item" key={sale.id_venta}><span>Venta #{sale.id_venta}<small>{formatDate(sale.fecha_venta)}</small></span><strong>{formatCurrency(sale.total)}</strong></div>)}
            </div>
          )}
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid-secondary">
        <section className="dashboard-panel">
          <div className="panel-heading"><div><p className="eyebrow">Abastecimiento</p><h3>Compras recientes</h3></div></div>
          {errors.compras && <SectionState error={errors.compras} />}
          {!errors.compras && recentPurchases.length === 0 && <SectionState emptyMessage="No hay compras recientes." />}
          {!errors.compras && recentPurchases.length > 0 && (
            <div className="compact-list">
              {recentPurchases.map((purchase) => <div className="compact-list-item" key={purchase.id_compra}><span>Compra #{purchase.id_compra}<small>{formatDate(purchase.fecha_compra)}</small></span><strong>{formatCurrency(purchase.total)}</strong></div>)}
            </div>
          )}
        </section>

        <section className="dashboard-panel">
          <div className="panel-heading"><div><p className="eyebrow">Trazabilidad</p><h3>Movimientos recientes</h3></div></div>
          {errors.movimientos && <SectionState error={errors.movimientos} />}
          {!errors.movimientos && recentMovements.length === 0 && <SectionState emptyMessage="No hay movimientos registrados." />}
          {!errors.movimientos && recentMovements.length > 0 && (
            <div className="compact-list">
              {recentMovements.map((movement) => <div className="compact-list-item" key={movement.id_movimiento}><span>{movement.tipo_movimiento}<small>{formatDate(movement.fecha_movimiento)}</small></span><strong>{formatNumber(movement.cantidad)}</strong></div>)}
            </div>
          )}
        </section>

        <section className="dashboard-panel">
          <div className="panel-heading"><div><p className="eyebrow">Apoyo a decisiones</p><h3>Predicciones recientes</h3></div></div>
          {errors.predicciones && <SectionState error={errors.predicciones} />}
          {!errors.predicciones && recentPredictions.length === 0 && <SectionState emptyMessage="No hay predicciones disponibles." />}
          {!errors.predicciones && recentPredictions.length > 0 && (
            <div className="compact-list">
              {recentPredictions.map((prediction) => <div className="compact-list-item" key={prediction.id_prediccion}><span>{productNames[prediction.producto_id] || `Producto #${prediction.producto_id}`}<small>{prediction.metodo_prediccion}</small></span><strong>{formatNumber(prediction.valor_predicho)}</strong></div>)}
            </div>
          )}
        </section>
      </div>
    </section>
  )
}
