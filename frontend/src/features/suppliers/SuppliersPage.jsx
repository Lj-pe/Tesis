import { useEffect, useMemo, useState } from 'react'
import apiClient from '../../api/client'

const supplierStatuses = [
  ['', 'Todos los estados'],
  ['activo', 'Activo'],
  ['inactivo', 'Inactivo'],
  ['suspendido', 'Suspendido'],
]

const createStatuses = [
  ['activo', 'Activo'],
  ['inactivo', 'Inactivo'],
  ['suspendido', 'Suspendido'],
]

const emptyForm = {
  nombre: '',
  contacto: '',
  telefono: '',
  email: '',
  direccion: '',
  documento_identidad: '',
  estado: 'activo',
}

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || fallback
}

function formatDate(value) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(value))
}

function emptyValue(value, fallback = 'No registrado') {
  return value || fallback
}

function getDeleteErrorMessage(error) {
  const backendMessage = error.response?.data?.message
  const backendDetail = error.response?.data?.error || ''

  if (/foreign key|constraint|referenced|restrict/i.test(backendDetail)) {
    return 'No se puede eliminar este proveedor porque tiene registros relacionados.'
  }

  return backendMessage || 'No se pudo eliminar el proveedor.'
}

function supplierToForm(supplier) {
  return {
    nombre: supplier.nombre ?? '',
    contacto: supplier.contacto ?? '',
    telefono: supplier.telefono ?? '',
    email: supplier.email ?? '',
    direccion: supplier.direccion ?? '',
    documento_identidad: supplier.documento_identidad ?? '',
    estado: supplier.estado ?? 'activo',
  }
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([])
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [supplierDetail, setSupplierDetail] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [editingSupplierId, setEditingSupplierId] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [pageError, setPageError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')

  async function loadSuppliers() {
    const { data } = await apiClient.get('/proveedores')
    setSuppliers(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    let isMounted = true

    loadSuppliers()
      .catch((error) => {
        if (isMounted) setPageError(getErrorMessage(error, 'No se pudo cargar la lista de proveedores.'))
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const filteredSuppliers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return suppliers.filter((supplier) => {
      const matchesSearch = !normalizedSearch
        || String(supplier.nombre || '').toLowerCase().includes(normalizedSearch)
        || String(supplier.documento_identidad || '').toLowerCase().includes(normalizedSearch)
        || String(supplier.contacto || '').toLowerCase().includes(normalizedSearch)
        || String(supplier.email || '').toLowerCase().includes(normalizedSearch)
      const matchesStatus = !statusFilter || supplier.estado === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [suppliers, search, statusFilter])

  async function selectSupplier(supplier) {
    setSelectedSupplier(supplier)
    setSupplierDetail(null)
    setDetailError('')
    setIsDetailLoading(true)

    try {
      const { data } = await apiClient.get(`/proveedores/${supplier.id_proveedor}`)
      setSupplierDetail(data)
    } catch (error) {
      setDetailError(getErrorMessage(error, 'No se pudo cargar el detalle del proveedor.'))
    } finally {
      setIsDetailLoading(false)
    }
  }

  function clearFilters() {
    setSearch('')
    setStatusFilter('')
  }

  function startCreate() {
    setEditingSupplierId(null)
    setForm(emptyForm)
    setFormErrors({})
    setFormError('')
    setNotice('')
  }

  function startEdit() {
    const supplier = supplierDetail || selectedSupplier
    if (!supplier) return

    setEditingSupplierId(supplier.id_proveedor)
    setForm(supplierToForm(supplier))
    setFormErrors({})
    setFormError('')
    setNotice('')
  }

  function handleFieldChange(event) {
    const { name, value } = event.target
    setForm((currentForm) => ({ ...currentForm, [name]: value }))
    setFormErrors((currentErrors) => ({ ...currentErrors, [name]: '' }))
    setFormError('')
    setNotice('')
  }

  function validateForm() {
    const nextErrors = {}
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!form.nombre.trim()) nextErrors.nombre = 'El nombre es obligatorio.'
    if (form.email.trim() && !emailPattern.test(form.email.trim())) nextErrors.email = 'Ingresa un email válido.'
    if (!createStatuses.some(([status]) => status === form.estado)) nextErrors.estado = 'Selecciona un estado válido.'

    return nextErrors
  }

  async function selectCreatedSupplier(id) {
    try {
      const { data } = await apiClient.get(`/proveedores/${id}`)
      setSelectedSupplier(data)
      setSupplierDetail(data)
    } catch (error) {
      setDetailError(getErrorMessage(error, 'El proveedor fue creado, pero no se pudo cargar su detalle.'))
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormErrors({})
    setFormError('')
    setNotice('')

    const validationErrors = validateForm()
    if (Object.keys(validationErrors).length > 0) {
      setFormErrors(validationErrors)
      return
    }

    const payload = {
      nombre: form.nombre.trim(),
      contacto: form.contacto.trim() || null,
      telefono: form.telefono.trim() || null,
      email: form.email.trim() || null,
      direccion: form.direccion.trim() || null,
      documento_identidad: form.documento_identidad.trim() || null,
      estado: form.estado,
    }

    setIsSaving(true)
    try {
      const { data } = editingSupplierId
        ? await apiClient.put(`/proveedores/${editingSupplierId}`, payload)
        : await apiClient.post('/proveedores', payload)

      await loadSuppliers()
      setForm(emptyForm)
      setEditingSupplierId(null)
      setNotice(`Proveedor #${data.id_proveedor} ${editingSupplierId ? 'actualizado' : 'creado'} correctamente.`)
      if (data.id_proveedor) await selectCreatedSupplier(data.id_proveedor)
    } catch (error) {
      setFormError(getErrorMessage(error, editingSupplierId ? 'No se pudo actualizar el proveedor.' : 'No se pudo crear el proveedor.'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    const supplier = supplierDetail || selectedSupplier
    if (!supplier) return

    const confirmed = window.confirm(`¿Deseas eliminar el proveedor "${supplier.nombre}"? Esta acción no se puede deshacer.`)
    if (!confirmed) return

    setFormError('')
    setDetailError('')
    setNotice('')
    setIsDeleting(true)

    try {
      await apiClient.delete(`/proveedores/${supplier.id_proveedor}`)
      await loadSuppliers()
      setSelectedSupplier(null)
      setSupplierDetail(null)
      setEditingSupplierId(null)
      setForm(emptyForm)
      setFormErrors({})
      setNotice(`Proveedor #${supplier.id_proveedor} eliminado correctamente.`)
    } catch (error) {
      setDetailError(getDeleteErrorMessage(error))
    } finally {
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return <section className="suppliers-page"><div className="dashboard-loading" role="status">Cargando proveedores...</div></section>
  }

  return (
    <section className="suppliers-page">
      <div className="suppliers-heading">
        <div>
          <p className="eyebrow">Abastecimiento</p>
          <h2 className="page-title">Proveedores</h2>
          <p className="muted-text">Consulta la información de proveedores registrados para las compras.</p>
        </div>
        <div className="supplier-count"><strong>{filteredSuppliers.length}</strong><span>proveedor(es) mostrado(s)</span></div>
      </div>

      {pageError && <div className="error-message" role="alert">{pageError}</div>}

      <section className="dashboard-panel supplier-form-panel">
        <div className="panel-heading"><div><p className="eyebrow">{editingSupplierId ? 'Edición' : 'Registro'}</p><h3>{editingSupplierId ? 'Editar proveedor' : 'Nuevo proveedor'}</h3></div></div>
        {formError && <div className="error-message" role="alert">{formError}</div>}
        {notice && <div className="success-message" role="status">{notice}</div>}
        <form className="supplier-form" onSubmit={handleSubmit}>
          <div><label className="form-label" htmlFor="supplier-name">Nombre</label><input id="supplier-name" name="nombre" className="form-control" value={form.nombre} onChange={handleFieldChange} disabled={isSaving} />{formErrors.nombre && <span className="field-error">{formErrors.nombre}</span>}</div>
          <div><label className="form-label" htmlFor="supplier-contact">Contacto</label><input id="supplier-contact" name="contacto" className="form-control" value={form.contacto} onChange={handleFieldChange} disabled={isSaving} /></div>
          <div><label className="form-label" htmlFor="supplier-phone">Teléfono</label><input id="supplier-phone" name="telefono" className="form-control" value={form.telefono} onChange={handleFieldChange} disabled={isSaving} /></div>
          <div><label className="form-label" htmlFor="supplier-email">Email</label><input id="supplier-email" name="email" className="form-control" value={form.email} onChange={handleFieldChange} disabled={isSaving} />{formErrors.email && <span className="field-error">{formErrors.email}</span>}</div>
          <div><label className="form-label" htmlFor="supplier-document">Documento</label><input id="supplier-document" name="documento_identidad" className="form-control" value={form.documento_identidad} onChange={handleFieldChange} disabled={isSaving} /></div>
          <div><label className="form-label" htmlFor="supplier-status-new">Estado</label><select id="supplier-status-new" name="estado" className="form-control" value={form.estado} onChange={handleFieldChange} disabled={isSaving}>{createStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{formErrors.estado && <span className="field-error">{formErrors.estado}</span>}</div>
          <div className="supplier-form-address"><label className="form-label" htmlFor="supplier-address">Dirección</label><textarea id="supplier-address" name="direccion" className="form-control" rows="2" value={form.direccion} onChange={handleFieldChange} disabled={isSaving} /></div>
          <div className="supplier-form-actions"><button className="button button-primary transaction-submit" type="submit" disabled={isSaving}>{isSaving ? 'Guardando proveedor...' : editingSupplierId ? 'Guardar cambios' : 'Crear proveedor'}</button>{editingSupplierId && <button className="button button-secondary" type="button" onClick={startCreate} disabled={isSaving}>Cancelar edición</button>}</div>
        </form>
      </section>

      <div className="suppliers-layout">
        <section className="dashboard-panel suppliers-list-panel">
          <div className="suppliers-toolbar">
            <label className="sr-only" htmlFor="supplier-search">Buscar proveedores</label>
            <input id="supplier-search" className="form-control" placeholder="Buscar por nombre, documento, contacto o email" value={search} onChange={(event) => setSearch(event.target.value)} />
            <label className="sr-only" htmlFor="supplier-status">Filtrar por estado</label>
            <select id="supplier-status" className="form-control supplier-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{supplierStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <button className="button button-secondary button-small" type="button" onClick={clearFilters}>Limpiar</button>
          </div>

          {!pageError && filteredSuppliers.length === 0 && <p className="dashboard-message">{suppliers.length === 0 ? 'No hay proveedores registrados.' : 'No hay proveedores que coincidan con los filtros.'}</p>}
          {!pageError && filteredSuppliers.length > 0 && (
            <div className="table-wrapper">
              <table className="dashboard-table suppliers-table">
                <thead><tr><th>Proveedor</th><th>Documento</th><th>Contacto</th><th>Teléfono</th><th>Email</th><th>Estado</th></tr></thead>
                <tbody>{filteredSuppliers.map((supplier) => <tr key={supplier.id_proveedor} className={selectedSupplier?.id_proveedor === supplier.id_proveedor ? 'selected-row' : ''}><td><button className="table-link" type="button" onClick={() => selectSupplier(supplier)}>{supplier.nombre}</button><small className="table-subtext">Proveedor #{supplier.id_proveedor}</small></td><td>{emptyValue(supplier.documento_identidad)}</td><td>{emptyValue(supplier.contacto)}</td><td>{emptyValue(supplier.telefono)}</td><td>{emptyValue(supplier.email)}</td><td><span className={`status status-${supplier.estado}`}>{supplier.estado || 'Sin estado'}</span></td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="suppliers-side-column">
          <section className="dashboard-panel supplier-detail-panel">
            <div className="panel-heading"><div><p className="eyebrow">Consulta</p><h3>Detalle del proveedor</h3></div></div>
            {!selectedSupplier && <p className="dashboard-message">Selecciona un proveedor para consultar sus datos.</p>}
            {isDetailLoading && <p className="dashboard-message">Cargando detalle...</p>}
            {detailError && <p className="dashboard-message dashboard-message-error">{detailError}</p>}
            {supplierDetail && !isDetailLoading && !detailError && <><dl className="product-details"><div><dt>Nombre</dt><dd>{supplierDetail.nombre}</dd></div><div><dt>Documento</dt><dd>{emptyValue(supplierDetail.documento_identidad)}</dd></div><div><dt>Contacto</dt><dd>{emptyValue(supplierDetail.contacto)}</dd></div><div><dt>Teléfono</dt><dd>{emptyValue(supplierDetail.telefono)}</dd></div><div><dt>Email</dt><dd>{emptyValue(supplierDetail.email)}</dd></div><div><dt>Dirección</dt><dd>{emptyValue(supplierDetail.direccion)}</dd></div><div><dt>Estado</dt><dd><span className={`status status-${supplierDetail.estado}`}>{supplierDetail.estado || 'Sin estado'}</span></dd></div><div><dt>Fecha de creación</dt><dd>{formatDate(supplierDetail.fecha_creacion)}</dd></div><div><dt>Última actualización</dt><dd>{formatDate(supplierDetail.fecha_actualizacion)}</dd></div></dl><div className="supplier-detail-actions"><button className="button button-secondary" type="button" onClick={startEdit} disabled={isDeleting}>Editar</button><button className="button button-danger" type="button" onClick={handleDelete} disabled={isDeleting}>{isDeleting ? 'Eliminando...' : 'Eliminar'}</button></div></>}
          </section>
        </aside>
      </div>
    </section>
  )
}
