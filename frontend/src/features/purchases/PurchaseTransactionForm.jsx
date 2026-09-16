import { useMemo, useState } from 'react'
import apiClient from '../../api/client'

const allowedStatuses = ['pendiente', 'recibida', 'anulada', 'parcial']

function createLine() {
  return {
    key: `${Date.now()}-${Math.random()}`,
    producto_id: '',
    cantidad: '',
    costo_unitario: '',
    observaciones: '',
  }
}

const initialForm = {
  proveedor_id: '',
  numero_factura: '',
  fecha_compra: '',
  fecha_recepcion: '',
  estado: 'pendiente',
  observaciones: '',
}

function getErrorMessage(error) {
  return error.response?.data?.message || 'No se pudo registrar la compra.'
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(value || 0))
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime())
}

export default function PurchaseTransactionForm({ suppliers, products, onSuccess }) {
  const [form, setForm] = useState(initialForm)
  const [lines, setLines] = useState([createLine()])
  const [errors, setErrors] = useState({})
  const [requestError, setRequestError] = useState('')
  const [success, setSuccess] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const preliminarySubtotal = useMemo(() => lines.reduce((total, line) => {
    const quantity = Number(line.cantidad)
    const unitCost = Number(line.costo_unitario)
    if (!Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost <= 0) return total
    return total + quantity * unitCost
  }, 0), [lines])

  const hasResources = suppliers.length > 0 && products.length > 0

  function updateFormField(event) {
    const { name, value } = event.target
    setForm((currentForm) => ({ ...currentForm, [name]: value }))
    setErrors((currentErrors) => ({ ...currentErrors, [name]: '' }))
    setSuccess(null)
    setRequestError('')
  }

  function updateLine(lineKey, field, value) {
    setLines((currentLines) => currentLines.map((line) => line.key === lineKey ? { ...line, [field]: value } : line))
    setErrors((currentErrors) => ({ ...currentErrors, [`line-${lineKey}-${field}`]: '' }))
    setSuccess(null)
    setRequestError('')
  }

  function addLine() {
    setLines((currentLines) => [...currentLines, createLine()])
  }

  function removeLine(lineKey) {
    setLines((currentLines) => currentLines.length === 1 ? currentLines : currentLines.filter((line) => line.key !== lineKey))
  }

  function validate() {
    const nextErrors = {}
    if (!form.proveedor_id) nextErrors.proveedor_id = 'Selecciona un proveedor.'
    if (!form.fecha_compra) nextErrors.fecha_compra = 'La fecha de compra es obligatoria.'
    else if (!isValidDate(form.fecha_compra)) nextErrors.fecha_compra = 'La fecha de compra no es válida.'
    if (form.fecha_recepcion && !isValidDate(form.fecha_recepcion)) nextErrors.fecha_recepcion = 'La fecha de recepción no es válida.'
    if (!allowedStatuses.includes(form.estado)) nextErrors.estado = 'Selecciona un estado válido.'
    if (lines.length === 0) nextErrors.lines = 'Agrega al menos una línea de compra.'

    lines.forEach((line) => {
      if (!line.producto_id) nextErrors[`line-${line.key}-producto_id`] = 'Selecciona un producto.'
      const quantity = Number(line.cantidad)
      if (line.cantidad === '' || !Number.isInteger(quantity) || quantity <= 0) nextErrors[`line-${line.key}-cantidad`] = 'La cantidad debe ser un entero mayor que cero.'
      const unitCost = Number(line.costo_unitario)
      if (line.costo_unitario === '' || !Number.isFinite(unitCost) || unitCost <= 0) nextErrors[`line-${line.key}-costo_unitario`] = 'El costo debe ser un número mayor que cero.'
    })

    return nextErrors
  }

  function resetForm() {
    setForm(initialForm)
    setLines([createLine()])
    setErrors({})
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setErrors({})
    setRequestError('')
    setSuccess(null)

    const validationErrors = validate()
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    const payload = {
      proveedor_id: Number(form.proveedor_id),
      numero_factura: form.numero_factura.trim() || null,
      fecha_compra: form.fecha_compra,
      fecha_recepcion: form.fecha_recepcion || null,
      estado: form.estado,
      observaciones: form.observaciones.trim() || null,
      detalles: lines.map((line) => ({
        producto_id: Number(line.producto_id),
        cantidad: Number(line.cantidad),
        costo_unitario: Number(line.costo_unitario),
        observaciones: line.observaciones.trim() || null,
      })),
    }

    setIsSubmitting(true)
    try {
      const { data } = await apiClient.post('/compras/transaccional', payload)
      await onSuccess()
      setSuccess({ id: data.id_compra, totales: data.totales })
      resetForm()
    } catch (error) {
      setRequestError(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="dashboard-panel purchase-transaction-panel">
      <div className="panel-heading"><div><p className="eyebrow">Registro transaccional</p><h3>Nueva compra</h3></div></div>
      <p className="muted-text transaction-intro">Registra la cabecera y los productos de una compra en una sola operación.</p>

      {!hasResources && <p className="dashboard-message dashboard-message-error">{suppliers.length === 0 ? 'No hay proveedores disponibles.' : 'No hay productos disponibles.'} Registra los datos necesarios antes de crear una compra.</p>}
      {requestError && <div className="error-message" role="alert">{requestError}</div>}
      {success && <div className="success-message" role="status">Compra #{success.id} registrada correctamente. Total calculado por el backend: {formatCurrency(success.totales?.total)}.</div>}
      {form.estado === 'recibida' && <div className="transaction-warning" role="status">Esta compra será registrada como recibida y actualizará el stock de los productos.</div>}

      <form className="transaction-form" onSubmit={handleSubmit}>
        <div className="transaction-header-grid">
          <div><label className="form-label" htmlFor="transaction-proveedor">Proveedor</label><select id="transaction-proveedor" name="proveedor_id" className="form-control" value={form.proveedor_id} onChange={updateFormField} disabled={isSubmitting || suppliers.length === 0}><option value="">Selecciona un proveedor</option>{suppliers.map((supplier) => <option key={supplier.id_proveedor} value={supplier.id_proveedor}>{supplier.nombre}{supplier.estado !== 'activo' ? ` (${supplier.estado})` : ''}</option>)}</select>{errors.proveedor_id && <span className="field-error">{errors.proveedor_id}</span>}</div>
          <div><label className="form-label" htmlFor="transaction-invoice">Número de factura</label><input id="transaction-invoice" name="numero_factura" className="form-control" value={form.numero_factura} onChange={updateFormField} disabled={isSubmitting} /></div>
          <div><label className="form-label" htmlFor="transaction-purchase-date">Fecha de compra</label><input id="transaction-purchase-date" name="fecha_compra" type="date" className="form-control" value={form.fecha_compra} onChange={updateFormField} disabled={isSubmitting} />{errors.fecha_compra && <span className="field-error">{errors.fecha_compra}</span>}</div>
          <div><label className="form-label" htmlFor="transaction-reception-date">Fecha de recepción</label><input id="transaction-reception-date" name="fecha_recepcion" type="date" className="form-control" value={form.fecha_recepcion} onChange={updateFormField} disabled={isSubmitting} />{errors.fecha_recepcion && <span className="field-error">{errors.fecha_recepcion}</span>}</div>
          <div><label className="form-label" htmlFor="transaction-status">Estado</label><select id="transaction-status" name="estado" className="form-control" value={form.estado} onChange={updateFormField} disabled={isSubmitting}>{allowedStatuses.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select>{errors.estado && <span className="field-error">{errors.estado}</span>}</div>
          <div className="transaction-observations"><label className="form-label" htmlFor="transaction-observations-field">Observaciones</label><textarea id="transaction-observations-field" name="observaciones" className="form-control" rows="2" value={form.observaciones} onChange={updateFormField} disabled={isSubmitting} /></div>
        </div>

        <div className="transaction-lines-heading"><div><p className="eyebrow">Detalle</p><h4>Productos de la compra</h4></div><button className="button button-secondary button-small" type="button" onClick={addLine} disabled={isSubmitting}>Agregar línea</button></div>
        {errors.lines && <span className="field-error">{errors.lines}</span>}
        <div className="transaction-lines">
          {lines.map((line, index) => (
            <div className="transaction-line" key={line.key}>
              <div className="line-number">{index + 1}</div>
              <div><label className="form-label" htmlFor={`product-${line.key}`}>Producto</label><select id={`product-${line.key}`} className="form-control" value={line.producto_id} onChange={(event) => updateLine(line.key, 'producto_id', event.target.value)} disabled={isSubmitting || products.length === 0}><option value="">Selecciona un producto</option>{products.map((product) => <option key={product.id_producto} value={product.id_producto}>{product.nombre} · {product.codigo_sku}</option>)}</select>{errors[`line-${line.key}-producto_id`] && <span className="field-error">{errors[`line-${line.key}-producto_id`]}</span>}</div>
              <div><label className="form-label" htmlFor={`quantity-${line.key}`}>Cantidad</label><input id={`quantity-${line.key}`} type="number" min="1" step="1" className="form-control" value={line.cantidad} onChange={(event) => updateLine(line.key, 'cantidad', event.target.value)} disabled={isSubmitting} />{errors[`line-${line.key}-cantidad`] && <span className="field-error">{errors[`line-${line.key}-cantidad`]}</span>}</div>
              <div><label className="form-label" htmlFor={`cost-${line.key}`}>Costo unitario</label><input id={`cost-${line.key}`} type="number" min="0.01" step="0.01" className="form-control" value={line.costo_unitario} onChange={(event) => updateLine(line.key, 'costo_unitario', event.target.value)} disabled={isSubmitting} />{errors[`line-${line.key}-costo_unitario`] && <span className="field-error">{errors[`line-${line.key}-costo_unitario`]}</span>}</div>
              <div><label className="form-label" htmlFor={`line-note-${line.key}`}>Observación</label><input id={`line-note-${line.key}`} className="form-control" value={line.observaciones} onChange={(event) => updateLine(line.key, 'observaciones', event.target.value)} disabled={isSubmitting} /></div>
              <button className="button button-danger button-small line-remove-button" type="button" onClick={() => removeLine(line.key)} disabled={isSubmitting || lines.length === 1}>Eliminar</button>
            </div>
          ))}
        </div>

        <div className="transaction-footer"><div className="transaction-total"><span>Subtotal preliminar</span><strong>{formatCurrency(preliminarySubtotal)}</strong><small>El impuesto y el total definitivo serán calculados por el backend.</small></div><button className="button button-primary transaction-submit" type="submit" disabled={isSubmitting || !hasResources}>{isSubmitting ? 'Registrando compra...' : 'Registrar compra'}</button></div>
      </form>
    </section>
  )
}
