import { useEffect, useMemo, useState } from 'react'
import apiClient from '../../api/client'

const initialData = {
  predictions: [],
  products: [],
}

const predictionStatuses = [
  ['', 'Todos los estados'],
  ['generada', 'Generada'],
  ['aprobada', 'Aprobada'],
  ['descartada', 'Descartada'],
]

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || fallback
}

function formatDate(value) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(value))
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return 'No registrado'
  return new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(value))
}

function emptyValue(value, fallback = 'No registrado') {
  return value || fallback
}

function sortByIdDesc(items) {
  return [...items].sort((first, second) => Number(second.id_prediccion || 0) - Number(first.id_prediccion || 0))
}

export default function PredictionsPage() {
  const [data, setData] = useState(initialData)
  const [selectedPrediction, setSelectedPrediction] = useState(null)
  const [predictionDetail, setPredictionDetail] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [detailError, setDetailError] = useState('')

  useEffect(() => {
    let isMounted = true

    Promise.allSettled([
      apiClient.get('/predicciones'),
      apiClient.get('/productos'),
    ]).then((results) => {
      if (!isMounted) return

      const keys = ['predictions', 'products']
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

  const filteredPredictions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return sortByIdDesc(data.predictions).filter((prediction) => {
      const matchesSearch = !normalizedSearch
        || String(prediction.producto_id || '').includes(normalizedSearch)
        || String(productNames[prediction.producto_id] || '').toLowerCase().includes(normalizedSearch)
        || String(prediction.metodo_prediccion || '').toLowerCase().includes(normalizedSearch)
        || String(prediction.estado || '').toLowerCase().includes(normalizedSearch)
        || String(prediction.observaciones || '').toLowerCase().includes(normalizedSearch)
      const matchesStatus = !statusFilter || prediction.estado === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [data.predictions, productNames, search, statusFilter])

  async function selectPrediction(prediction) {
    setSelectedPrediction(prediction)
    setPredictionDetail(null)
    setDetailError('')
    setIsDetailLoading(true)

    try {
      const { data: detail } = await apiClient.get(`/predicciones/${prediction.id_prediccion}`)
      setPredictionDetail(detail)
    } catch (error) {
      setDetailError(getErrorMessage(error, 'No se pudo cargar el detalle de la predicción.'))
    } finally {
      setIsDetailLoading(false)
    }
  }

  function clearFilters() {
    setSearch('')
    setStatusFilter('')
  }

  if (isLoading) {
    return <section className="predictions-page"><div className="dashboard-loading" role="status">Cargando predicciones...</div></section>
  }

  return (
    <section className="predictions-page">
      <div className="predictions-heading">
        <div>
          <p className="eyebrow">Apoyo a decisiones</p>
          <h2 className="page-title">Predicciones</h2>
          <p className="muted-text">Consulta las predicciones registradas para productos del negocio.</p>
        </div>
        <div className="prediction-count"><strong>{filteredPredictions.length}</strong><span>predicción(es) mostrada(s)</span></div>
      </div>

      {Object.keys(errors).length > 0 && <div className="error-message" role="alert">{Object.values(errors).join(' ')}</div>}

      <div className="predictions-layout">
        <section className="dashboard-panel predictions-list-panel">
          <div className="predictions-toolbar">
            <label className="sr-only" htmlFor="prediction-search">Buscar predicciones</label>
            <input id="prediction-search" className="form-control" placeholder="Buscar por producto, método, estado u observación" value={search} onChange={(event) => setSearch(event.target.value)} />
            <label className="sr-only" htmlFor="prediction-status">Filtrar por estado</label>
            <select id="prediction-status" className="form-control prediction-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{predictionStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <button className="button button-secondary button-small" type="button" onClick={clearFilters}>Limpiar</button>
          </div>

          {errors.predictions && <p className="dashboard-message dashboard-message-error">{errors.predictions}</p>}
          {!errors.predictions && filteredPredictions.length === 0 && <p className="dashboard-message">{data.predictions.length === 0 ? 'No hay predicciones disponibles.' : 'No hay predicciones que coincidan con los filtros.'}</p>}
          {!errors.predictions && filteredPredictions.length > 0 && (
            <div className="table-wrapper">
              <table className="dashboard-table predictions-table">
                <thead><tr><th>Predicción</th><th>Producto</th><th>Periodo</th><th>Método</th><th>Valor predicho</th><th>Estado</th><th>Generación</th></tr></thead>
                <tbody>{filteredPredictions.map((prediction) => <tr key={prediction.id_prediccion} className={selectedPrediction?.id_prediccion === prediction.id_prediccion ? 'selected-row' : ''}><td><button className="table-link" type="button" onClick={() => selectPrediction(prediction)}>#{prediction.id_prediccion}</button></td><td>{productNames[prediction.producto_id] || `Producto #${prediction.producto_id}`}</td><td>{formatDate(prediction.periodo_inicio)} - {formatDate(prediction.periodo_fin)}</td><td>{emptyValue(prediction.metodo_prediccion)}</td><td>{formatNumber(prediction.valor_predicho)}</td><td><span className={`status status-${prediction.estado}`}>{prediction.estado || 'Sin estado'}</span></td><td>{formatDate(prediction.fecha_generacion)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="predictions-side-column">
          <section className="dashboard-panel prediction-detail-panel">
            <div className="panel-heading"><div><p className="eyebrow">Consulta</p><h3>Detalle de predicción</h3></div></div>
            {!selectedPrediction && <p className="dashboard-message">Selecciona una predicción para consultar sus datos.</p>}
            {isDetailLoading && <p className="dashboard-message">Cargando detalle...</p>}
            {detailError && <p className="dashboard-message dashboard-message-error">{detailError}</p>}
            {predictionDetail && !isDetailLoading && !detailError && <dl className="product-details"><div><dt>Predicción</dt><dd>#{predictionDetail.id_prediccion}</dd></div><div><dt>Producto</dt><dd>{productNames[predictionDetail.producto_id] || `Producto #${predictionDetail.producto_id}`}</dd></div><div><dt>Periodo inicio</dt><dd>{formatDate(predictionDetail.periodo_inicio)}</dd></div><div><dt>Periodo fin</dt><dd>{formatDate(predictionDetail.periodo_fin)}</dd></div><div><dt>Método</dt><dd>{emptyValue(predictionDetail.metodo_prediccion)}</dd></div><div><dt>Valor predicho</dt><dd>{formatNumber(predictionDetail.valor_predicho)}</dd></div><div><dt>Intervalo de confianza</dt><dd>{formatNumber(predictionDetail.intervalo_confianza)}</dd></div><div><dt>Estado</dt><dd><span className={`status status-${predictionDetail.estado}`}>{predictionDetail.estado || 'Sin estado'}</span></dd></div><div><dt>Fecha de generación</dt><dd>{formatDate(predictionDetail.fecha_generacion)}</dd></div><div><dt>Fecha de aplicación</dt><dd>{formatDate(predictionDetail.fecha_aplicacion)}</dd></div><div><dt>Observaciones</dt><dd>{emptyValue(predictionDetail.observaciones, 'Sin observaciones')}</dd></div></dl>}
          </section>
        </aside>
      </div>
    </section>
  )
}
