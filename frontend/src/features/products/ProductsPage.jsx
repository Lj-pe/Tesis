import { useEffect, useMemo, useState } from 'react'
import apiClient from '../../api/client'

const emptyForm = {
  categoria_id: '',
  codigo_sku: '',
  nombre: '',
  descripcion: '',
  estado: 'activo',
  unidad_medida: '',
  precio_venta_actual: '',
  costo_promedio_actual: '',
}

const statusOptions = [
  ['activo', 'Activo'],
  ['inactivo', 'Inactivo'],
  ['suspendido', 'Suspendido'],
]

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || fallback
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(value || 0))
}

function productToForm(product) {
  return {
    categoria_id: String(product.categoria_id ?? ''),
    codigo_sku: product.codigo_sku ?? '',
    nombre: product.nombre ?? '',
    descripcion: product.descripcion ?? '',
    estado: product.estado ?? 'activo',
    unidad_medida: product.unidad_medida ?? '',
    precio_venta_actual: product.precio_venta_actual ?? '',
    costo_promedio_actual: product.costo_promedio_actual ?? '',
  }
}

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [errors, setErrors] = useState({})
  const [pageError, setPageError] = useState('')
  const [notice, setNotice] = useState('')

  async function loadProducts() {
    const { data } = await apiClient.get('/productos')
    setProducts(Array.isArray(data) ? data : [])
  }

  async function loadCategories() {
    const { data } = await apiClient.get('/categorias')
    setCategories(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    let isMounted = true

    Promise.allSettled([loadProducts(), loadCategories()]).then((results) => {
      if (!isMounted) return
      const failedResult = results.find((result) => result.status === 'rejected')
      if (failedResult) setPageError(getErrorMessage(failedResult.reason, 'No se pudo cargar toda la información del catálogo.'))
      setIsLoading(false)
    })

    return () => {
      isMounted = false
    }
  }, [])

  const categoryNames = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id_categoria, category.nombre])),
    [categories]
  )

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    if (!normalizedSearch) return products

    return products.filter((product) => [
      product.nombre,
      product.codigo_sku,
      categoryNames[product.categoria_id],
      product.estado,
    ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch)))
  }, [products, search, categoryNames])

  function clearFeedback() {
    setErrors({})
    setPageError('')
    setNotice('')
  }

  function startCreate() {
    clearFeedback()
    setEditingId(null)
    setSelectedProduct(null)
    setForm(emptyForm)
  }

  function startEdit(product) {
    clearFeedback()
    setEditingId(product.id_producto)
    setSelectedProduct(product)
    setForm(productToForm(product))
  }

  function handleFieldChange(event) {
    const { name, value } = event.target
    setForm((currentForm) => ({ ...currentForm, [name]: value }))
    setErrors((currentErrors) => ({ ...currentErrors, [name]: '' }))
  }

  function validateForm() {
    const nextErrors = {}
    if (!form.categoria_id) nextErrors.categoria_id = 'Selecciona una categoría.'
    if (!form.codigo_sku.trim()) nextErrors.codigo_sku = 'El SKU es obligatorio.'
    if (!form.nombre.trim()) nextErrors.nombre = 'El nombre es obligatorio.'
    if (!form.unidad_medida.trim()) nextErrors.unidad_medida = 'La unidad de medida es obligatoria.'
    if (form.precio_venta_actual === '' || Number(form.precio_venta_actual) < 0) nextErrors.precio_venta_actual = 'Ingresa un precio válido.'
    if (form.costo_promedio_actual !== '' && Number(form.costo_promedio_actual) < 0) nextErrors.costo_promedio_actual = 'Ingresa un costo válido.'
    return nextErrors
  }

  async function handleSubmit(event) {
    event.preventDefault()
    clearFeedback()
    const validationErrors = validateForm()
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    const payload = {
      categoria_id: Number(form.categoria_id),
      codigo_sku: form.codigo_sku.trim(),
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      estado: form.estado,
      unidad_medida: form.unidad_medida.trim(),
      precio_venta_actual: Number(form.precio_venta_actual),
      costo_promedio_actual: form.costo_promedio_actual === '' ? null : Number(form.costo_promedio_actual),
    }

    setIsSaving(true)
    try {
      if (editingId) {
        const { data } = await apiClient.put(`/productos/${editingId}`, payload)
        setProducts((currentProducts) => currentProducts.map((product) => product.id_producto === editingId ? data : product))
        setSelectedProduct(data)
        setNotice('Producto actualizado correctamente.')
      } else {
        const { data } = await apiClient.post('/productos', payload)
        setProducts((currentProducts) => [...currentProducts, data])
        setSelectedProduct(data)
        setNotice('Producto creado correctamente.')
      }
      setEditingId(null)
      setForm(emptyForm)
    } catch (error) {
      setPageError(getErrorMessage(error, 'No se pudo guardar el producto.'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(product) {
    if (!window.confirm(`¿Deseas eliminar el producto "${product.nombre}"?`)) return

    clearFeedback()
    setIsDeleting(true)
    try {
      await apiClient.delete(`/productos/${product.id_producto}`)
      setProducts((currentProducts) => currentProducts.filter((item) => item.id_producto !== product.id_producto))
      if (selectedProduct?.id_producto === product.id_producto) setSelectedProduct(null)
      if (editingId === product.id_producto) startCreate()
      setNotice('Producto eliminado correctamente.')
    } catch (error) {
      setPageError(getErrorMessage(error, 'No se pudo eliminar el producto. Puede tener información relacionada.'))
    } finally {
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return <section className="products-page"><div className="dashboard-loading" role="status">Cargando productos y categorías...</div></section>
  }

  return (
    <section className="products-page">
      <div className="products-heading">
        <div>
          <p className="eyebrow">Catálogo</p>
          <h2 className="page-title">Productos</h2>
          <p className="muted-text">Administra los productos que utiliza la operación de Alanis.</p>
        </div>
        <button className="button button-primary products-new-button" type="button" onClick={startCreate}>Nuevo producto</button>
      </div>

      {pageError && <div className="error-message" role="alert">{pageError}</div>}
      {notice && <div className="success-message" role="status">{notice}</div>}

      <div className="products-layout">
        <section className="dashboard-panel products-list-panel">
          <div className="products-toolbar">
            <label className="sr-only" htmlFor="product-search">Buscar productos</label>
            <input id="product-search" className="form-control" placeholder="Buscar por nombre, SKU, categoría o estado" value={search} onChange={(event) => setSearch(event.target.value)} />
            <span className="small-text muted-text">{filteredProducts.length} producto(s)</span>
          </div>

          {filteredProducts.length === 0 ? (
            <p className="dashboard-message">{products.length === 0 ? 'No hay productos registrados.' : 'No hay productos que coincidan con la búsqueda.'}</p>
          ) : (
            <div className="table-wrapper">
              <table className="dashboard-table products-table">
                <thead><tr><th>Producto</th><th>SKU</th><th>Categoría</th><th>Precio</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>
                  {filteredProducts.map((product) => (
                    <tr key={product.id_producto} className={selectedProduct?.id_producto === product.id_producto ? 'selected-row' : ''}>
                      <td><button className="table-link" type="button" onClick={() => setSelectedProduct(product)}>{product.nombre}</button></td>
                      <td>{product.codigo_sku}</td>
                      <td>{categoryNames[product.categoria_id] || `Categoría #${product.categoria_id}`}</td>
                      <td>{formatCurrency(product.precio_venta_actual)}</td>
                      <td><span className={`status status-${product.estado}`}>{product.estado}</span></td>
                      <td><div className="table-actions"><button className="button button-secondary button-small" type="button" onClick={() => startEdit(product)}>Editar</button><button className="button button-danger button-small" type="button" onClick={() => handleDelete(product)} disabled={isDeleting}>Eliminar</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="products-side-column">
          <section className="dashboard-panel product-detail-panel">
            <div className="panel-heading"><div><p className="eyebrow">Consulta</p><h3>Detalle del producto</h3></div></div>
            {!selectedProduct ? <p className="dashboard-message">Selecciona un producto para consultar sus datos.</p> : <dl className="product-details"><div><dt>Nombre</dt><dd>{selectedProduct.nombre}</dd></div><div><dt>SKU</dt><dd>{selectedProduct.codigo_sku}</dd></div><div><dt>Categoría</dt><dd>{categoryNames[selectedProduct.categoria_id] || `Categoría #${selectedProduct.categoria_id}`}</dd></div><div><dt>Descripción</dt><dd>{selectedProduct.descripcion || 'Sin descripción'}</dd></div><div><dt>Unidad de medida</dt><dd>{selectedProduct.unidad_medida}</dd></div><div><dt>Precio de venta</dt><dd>{formatCurrency(selectedProduct.precio_venta_actual)}</dd></div><div><dt>Costo promedio</dt><dd>{selectedProduct.costo_promedio_actual === null ? 'No registrado' : formatCurrency(selectedProduct.costo_promedio_actual)}</dd></div></dl>}
          </section>

          <section className="dashboard-panel product-form-panel">
            <div className="panel-heading"><div><p className="eyebrow">{editingId ? 'Edición' : 'Registro'}</p><h3>{editingId ? 'Editar producto' : 'Nuevo producto'}</h3></div></div>
            {categories.length === 0 && <p className="dashboard-message dashboard-message-error">No hay categorías disponibles. Debes registrar una categoría antes de crear productos.</p>}
            <form className="product-form" onSubmit={handleSubmit}>
              <label className="form-label" htmlFor="categoria_id">Categoría</label>
              <select id="categoria_id" name="categoria_id" className="form-control" value={form.categoria_id} onChange={handleFieldChange} disabled={categories.length === 0}><option value="">Selecciona una categoría</option>{categories.map((category) => <option key={category.id_categoria} value={category.id_categoria}>{category.nombre}</option>)}</select>
              {errors.categoria_id && <span className="field-error">{errors.categoria_id}</span>}
              <label className="form-label" htmlFor="codigo_sku">SKU</label>
              <input id="codigo_sku" name="codigo_sku" className="form-control" value={form.codigo_sku} onChange={handleFieldChange} />
              {errors.codigo_sku && <span className="field-error">{errors.codigo_sku}</span>}
              <label className="form-label" htmlFor="nombre">Nombre</label>
              <input id="nombre" name="nombre" className="form-control" value={form.nombre} onChange={handleFieldChange} />
              {errors.nombre && <span className="field-error">{errors.nombre}</span>}
              <label className="form-label" htmlFor="descripcion">Descripción</label>
              <textarea id="descripcion" name="descripcion" className="form-control" rows="3" value={form.descripcion} onChange={handleFieldChange} />
              <label className="form-label" htmlFor="unidad_medida">Unidad de medida</label>
              <input id="unidad_medida" name="unidad_medida" className="form-control" value={form.unidad_medida} onChange={handleFieldChange} placeholder="Ej. unidad" />
              {errors.unidad_medida && <span className="field-error">{errors.unidad_medida}</span>}
              <div className="form-grid-two"><div><label className="form-label" htmlFor="precio_venta_actual">Precio de venta</label><input id="precio_venta_actual" name="precio_venta_actual" type="number" min="0" step="0.01" className="form-control" value={form.precio_venta_actual} onChange={handleFieldChange} />{errors.precio_venta_actual && <span className="field-error">{errors.precio_venta_actual}</span>}</div><div><label className="form-label" htmlFor="costo_promedio_actual">Costo promedio</label><input id="costo_promedio_actual" name="costo_promedio_actual" type="number" min="0" step="0.01" className="form-control" value={form.costo_promedio_actual} onChange={handleFieldChange} />{errors.costo_promedio_actual && <span className="field-error">{errors.costo_promedio_actual}</span>}</div></div>
              <label className="form-label" htmlFor="estado">Estado</label>
              <select id="estado" name="estado" className="form-control" value={form.estado} onChange={handleFieldChange}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <div className="form-actions"><button className="button button-primary" type="submit" disabled={isSaving || categories.length === 0}>{isSaving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear producto'}</button>{editingId && <button className="button button-secondary" type="button" onClick={startCreate}>Cancelar edición</button>}</div>
            </form>
          </section>
        </aside>
      </div>
    </section>
  )
}
