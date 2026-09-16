import { useMemo, useState } from 'react'
import apiClient from '../../api/client'

const allowedStatuses = ['pendiente', 'pagada', 'anulada', 'cancelada']

function createLine() {
  return {
    key: `${Date.now()}-${Math.random()}`,
    producto_id: '',
    cantidad: '',
    precio_unitario: '',
  }
}

const initialForm = {
  numero_factura: '',
  fecha_venta: '',
  estado: 'pendiente',
  observaciones: '',
  forma_pago: '',
}

function getErrorMessage(error) {
  return error.response?.data?.message || 'No se pudo registrar la venta.'
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(value || 0))
}

function formatNumber(value) {
  return new Intl.NumberFormat('es-PE').format(Number(value || 0))
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime())
}

export default function SaleTransactionForm({ products, inventories, onSuccess }) {
  const [form, setForm] = useState(initialForm)
  const [lines, setLines] = useState([createLine()])
  const [errors, setErrors] = useState({})
  const [requestError, setRequestError] = useState('')
  const [success, setSuccess] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const inventoryByProduct = useMemo(
    () => Object.fromEntries(inventories.map((inventory) => [inventory.producto_id, inventory])),
    [inventories]
  )

  const preliminarySubtotal = useMemo(() => lines.reduce((total, line) => {
    const quantity = Number(line.cantidad)
    const unitPrice = Number(line.precio_unitario)
    if (!Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) return total
    return total + quantity * unitPrice
  }, 0), [lines])

  const hasProducts = products.length > 0

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
    if (!form.fecha_venta) nextErrors.fecha_venta = 'La fecha de venta es obligatoria.'
    else if (!isValidDate(form.fecha_venta)) nextErrors.fecha_venta = 'La fecha de venta no es válida.'
    if (!allowedStatuses.includes(form.estado)) nextErrors.estado = 'Selecciona un estado válido.'
    if (lines.length === 0) nextErrors.lines = 'Agrega al menos una línea de venta.'

    lines.forEach((line) => {
      if (!line.producto_id) nextErrors[`line-${line.key}-producto_id`] = 'Selecciona un producto.'
      const quantity = Number(line.cantidad)
      if (line.cantidad === '' || !Number.isInteger(quantity) || quantity <= 0) nextErrors[`line-${line.key}-cantidad`] = 'La cantidad debe ser un entero mayor que cero.'
      const unitPrice = Number(line.precio_unitario)
      if (line.precio_unitario === '' || !Number.isFinite(unitPrice) || unitPrice <= 0) nextErrors[`line-${line.key}-precio_unitario`] = 'El precio debe ser un número mayor que cero.'

      if (form.estado === 'pagada' && line.producto_id && Number.isInteger(quantity) && quantity > 0) {
        const inventory = inventoryByProduct[Number(line.producto_id)]
        if (!inventory) nextErrors[`line-${line.key}-stock`] = 'No hay inventario registrado para este producto.'
        else if (quantity > Number(inventory.stock_actual)) nextErrors[`line-${line.key}-stock`] = `Stock insuficiente. Disponible: ${formatNumber(inventory.stock_actual)}.`
      }
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
      numero_factura: form.numero_factura.trim() || null,
      fecha_venta: form.fecha_venta,
      estado: form.estado,
      observaciones: form.observaciones.trim() || null,
      forma_pago: form.forma_pago.trim() || null,
      detalles: lines.map((line) => ({
        producto_id: Number(line.producto_id),
        cantidad: Number(line.cantidad),
        precio_unitario: Number(line.precio_unitario),
      })),
    }

    setIsSubmitting(true)
    try {
      const { data } = await apiClient.post('/ventas/transaccional', payload)
      await onSuccess()
      setSuccess({ id: data.id_venta, totales: data.totales })
      resetForm()
    } catch (error) {
      setRequestError(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="dashboard-panel sale-transaction-panel">
      <div className="panel-heading"><div><p className="eyebrow">Registro transaccional</p><h3>Nueva venta</h3></div></div>
      <p className="muted-text transaction-intro">Registra una venta y sus productos en una sola operación.</p>

      {!hasProducts && <p className="dashboard-message dashboard-message-error">No hay productos disponibles. Registra productos antes de crear una venta.</p>}
      {requestError && <div className="error-message" role="alert">{requestError}</div>}
      {success && <div className="success-message" role="status">Venta #{success.id} registrada correctamente. Total calculado por el backend: {formatCurrency(success.totales?.total)}.</div>}
      {form.estado === 'pagada' && <div className="transaction-warning" role="status">Esta venta será registrada como pagada; el backend descontará el stock y generará el movimiento de salida.</div>}

      <form className="transaction-form" onSubmit={handleSubmit}>
        <div className="transaction-header-grid">
          <div><label className="form-label" htmlFor="sale-invoice">Número de factura</label><input id="sale-invoice" name="numero_factura" className="form-control" value={form.numero_factura} onChange={updateFormField} disabled={isSubmitting} /></div>
          <div><label className="form-label" htmlFor="sale-date">Fecha de venta</label><input id="sale-date" name="fecha_venta" type="date" className="form-control" value={form.fecha_venta} onChange={updateFormField} disabled={isSubmitting} />{errors.fecha_venta && <span className="field-error">{errors.fecha_venta}</span>}</div>
          <div><label className="form-label" htmlFor="sale-status">Estado</label><select id="sale-status" name="estado" className="form-control" value={form.estado} onChange={updateFormField} disabled={isSubmitting}>{allowedStatuses.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select>{errors.estado && <span className="field-error">{errors.estado}</span>}</div>
          <div><label className="form-label" htmlFor="sale-payment">Forma de pago</label><input id="sale-payment" name="forma_pago" className="form-control" value={form.forma_pago} onChange={updateFormField} disabled={isSubmitting} placeholder="Ej. efectivo" /></div>
          <div className="transaction-observations"><label className="form-label" htmlFor="sale-observations">Observaciones</label><textarea id="sale-observations" name="observaciones" className="form-control" rows="2" value={form.observaciones} onChange={updateFormField} disabled={isSubmitting} /></div>
        </div>

        <div className="transaction-lines-heading"><div><p className="eyebrow">Detalle</p><h4>Productos de la venta</h4></div><button className="button button-secondary button-small" type="button" onClick={addLine} disabled={isSubmitting}>Agregar línea</button></div>
        {errors.lines && <span className="field-error">{errors.lines}</span>}
        <div className="transaction-lines">
          {lines.map((line, index) => {
            const selectedProduct = products.find((product) => product.id_producto === Number(line.producto_id))
            const inventory = inventoryByProduct[Number(line.producto_id)]

            return (
              <div className="transaction-line sale-transaction-line" key={line.key}>
                <div className="line-number">{index + 1}</div>
                <div><label className="form-label" htmlFor={`sale-product-${line.key}`}>Producto</label><select id={`sale-product-${line.key}`} className="form-control" value={line.producto_id} onChange={(event) => updateLine(line.key, 'producto_id', event.target.value)} disabled={isSubmitting || products.length === 0}><option value="">Selecciona un producto</option>{products.map((product) => <option key={product.id_producto} value={product.id_producto}>{product.nombre} · {product.codigo_sku}</option>)}</select>{selectedProduct && <small className="table-subtext">{selectedProduct.unidad_medida || 'Sin unidad'} · Stock: {inventory ? formatNumber(inventory.stock_actual) : 'no disponible'}</small>}{errors[`line-${line.key}-producto_id`] && <span className="field-error">{errors[`line-${line.key}-producto_id`]}</span>}</div>
                <div><label className="form-label" htmlFor={`sale-quantity-${line.key}`}>Cantidad</label><input id={`sale-quantity-${line.key}`} type="number" min="1" step="1" className="form-control" value={line.cantidad} onChange={(event) => updateLine(line.key, 'cantidad', event.target.value)} disabled={isSubmitting} />{errors[`line-${line.key}-cantidad`] && <span className="field-error">{errors[`line-${line.key}-cantidad`]}</span>}{errors[`line-${line.key}-stock`] && <span className="field-error">{errors[`line-${line.key}-stock`]}</span>}</div>
                <div><label className="form-label" htmlFor={`sale-price-${line.key}`}>Precio unitario</label><input id={`sale-price-${line.key}`} type="number" min="0.01" step="0.01" className="form-control" value={line.precio_unitario} onChange={(event) => updateLine(line.key, 'precio_unitario', event.target.value)} disabled={isSubmitting} placeholder={selectedProduct?.precio_venta_actual ?? ''} />{errors[`line-${line.key}-precio_unitario`] && <span className="field-error">{errors[`line-${line.key}-precio_unitario`]}</span>}</div>
                <button className="button button-danger button-small line-remove-button" type="button" onClick={() => removeLine(line.key)} disabled={isSubmitting || lines.length === 1}>Eliminar</button>
              </div>
            )
          })}
        </div>

        <div className="transaction-footer"><div className="transaction-total"><span>Subtotal preliminar</span><strong>{formatCurrency(preliminarySubtotal)}</strong><small>El descuento, impuesto y total definitivo serán calculados por el backend.</small></div><button className="button button-primary transaction-submit" type="submit" disabled={isSubmitting || !hasProducts}>{isSubmitting ? 'Registrando venta...' : 'Registrar venta'}</button></div>
      </form>
    </section>
  )
}
