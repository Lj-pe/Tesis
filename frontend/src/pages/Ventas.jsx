import { useEffect, useMemo, useState } from "react";
import apiClient from "../api/client";

const today = () => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const newLine = () => ({ producto_id: "", cantidad: "", precio_unitario: "" });
const nextSaleNumber = (sales) => {
  const lastSequence = sales.reduce((maximum, sale) => {
    const match = /^VTA-SIM-(\d+)$/.exec(String(sale.numero));
    if (!match) return maximum;
    const sequence = BigInt(match[1]);
    return sequence > maximum ? sequence : maximum;
  }, 0n);
  return `VTA-SIM-${(lastSequence + 1n).toString().padStart(7, "0")}`;
};
const paymentLabels = {
  efectivo: "Efectivo",
  electronico: "Electrónico",
  yape: "Yape",
  plin: "Plin",
};
const saleIcons = {
  sales: <path d="M4 18.5 9 13l3.5 3.5L20 8 M14.5 8H20v5.5" />,
  number: <path d="M4 9h16M4 15h16M10 3 8 21m8-18-2 18" />,
  date: <path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1Z" />,
  payment: <path d="M3 6h18v12H3zM3 10h18m-14 4h3" />,
  total: <path d="M12 3v18m5-14.5c-1-1-2.5-1.5-5-1.5-2.2 0-4 1.1-4 3s1.6 2.8 4 3.5 5 1.2 5 3.5-1.8 4-5 4c-2.3 0-4-.7-5-1.8" />,
  status: <path d="M12 3v9l6.4 3.7M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  actions: <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
  product: <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm-8 4.5 8 4.5 8-4.5M12 12v9" />,
  quantity: <path d="M5 12h14m-7-7v14" />,
  price: <path d="M12 3v18m5-14.5c-1-1-2.5-1.5-5-1.5-2.2 0-4 1.1-4 3s1.6 2.8 4 3.5 5 1.2 5 3.5-1.8 4-5 4c-2.3 0-4-.7-5-1.8" />,
  reason: <path d="M12 3v18m5-14.5c-1-1-2.5-1.5-5-1.5-2.2 0-4 1.1-4 3s1.6 2.8 4 3.5 5 1.2 5 3.5-1.8 4-5 4c-2.3 0-4-.7-5-1.8" />,
};

function SaleIcon({ type, className = "" }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {saleIcons[type]}
  </svg>;
}

function SaleHeading({ icon, children }) {
  return <span className="category-table-heading"><SaleIcon type={icon} className="category-display-icon" />{children}</span>;
}

function SaleFieldLabel({ icon, children }) {
  return <span className="form-label sale-field-label"><SaleIcon type={icon} />{children}</span>;
}

function formatDate(value) {
  const text = value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
    : String(value ?? "").slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
}

function toCents(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? ""));
  if (!match) return 0n;
  return BigInt(match[1]) * 100n + BigInt((match[2] || "").padEnd(2, "0"));
}

function formatCurrency(cents) {
  const whole = (cents / 100n).toLocaleString("es-PE");
  const fraction = (cents % 100n).toString().padStart(2, "0");
  return `S/ ${whole}.${fraction}`;
}

function lineAmount(detail) {
  if (!/^\d+$/.test(detail.cantidad) || !detail.precio_unitario) return 0n;
  return toCents(detail.precio_unitario) * BigInt(detail.cantidad);
}

function Ventas() {
  const [ventas, setVentas] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ numero: "", fecha_comercial: today(), medio_pago: "efectivo" });
  const [detalles, setDetalles] = useState([newLine()]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [selected, setSelected] = useState(null);
  const [detailError, setDetailError] = useState("");
  const [annulReason, setAnnulReason] = useState("");
  const [annulDate, setAnnulDate] = useState(today());
  const [confirmAnnul, setConfirmAnnul] = useState(false);
  const [confirmSale, setConfirmSale] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [operationKey, setOperationKey] = useState(null);
  const [salesNotice, setSalesNotice] = useState("");
  const [numberSearch, setNumberSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const cargarDatos = async () => {
    try {
      setLoadError("");
      const [sales, items] = await Promise.all([apiClient.get("/ventas"), apiClient.get("/productos")]);
      setVentas(Array.isArray(sales) ? sales : []);
      setProductos(Array.isArray(items) ? items : []);
    } catch (error) {
      setLoadError(error.message || "No se pudieron cargar las ventas.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { Promise.resolve().then(cargarDatos); }, []);

  const filteredSales = useMemo(() => {
    const query = numberSearch.trim().toLowerCase();
    return ventas.filter((sale) => {
      const saleDate = String(sale.fecha_comercial ?? "").slice(0, 10);
      return (!query || String(sale.numero).toLowerCase().includes(query)) &&
        (!dateFrom || saleDate >= dateFrom) &&
        (!dateTo || saleDate <= dateTo) &&
        (!paymentFilter || sale.medio_pago === paymentFilter) &&
        (!statusFilter || sale.estado === statusFilter);
    });
  }, [ventas, numberSearch, dateFrom, dateTo, paymentFilter, statusFilter]);

  const changeDetail = (index, name, value) => {
    setDetalles((current) => current.map((detail, i) => {
      if (i !== index) return detail;
      if (name === "producto_id") {
        const product = productos.find((item) => String(item.id) === String(value));
        return { ...detail, producto_id: value, precio_unitario: product?.precio_venta ?? "" };
      }
      return { ...detail, [name]: value };
    }));
    setConfirmSale(false);
    setFormError("");
  };

  const abrirNuevaVenta = () => {
    setOperationKey(crypto.randomUUID());
    setForm({ numero: nextSaleNumber(ventas), fecha_comercial: today(), medio_pago: "efectivo" });
    setDetalles([newLine()]);
    setFormError("");
    setConfirmSale(false);
    setConfirmCancel(false);
    setShowForm(true);
  };

  const guardarVenta = async (event) => {
    event.preventDefault();
    const productIds = detalles.map((item) => item.producto_id);
    if (!form.numero.trim() || !form.fecha_comercial || !form.medio_pago ||
        !detalles.length || detalles.some((item) => !item.producto_id ||
          !/^\d+$/.test(item.cantidad) || BigInt(item.cantidad || 0) < 1n ||
          !/^\d+(?:\.\d{1,2})?$/.test(String(item.precio_unitario)) ||
          toCents(item.precio_unitario) <= 0n) ||
        new Set(productIds).size !== productIds.length) {
      setFormError("Completa los datos de venta; cada producto debe ser único y tener cantidad y precio válidos.");
      return;
    }
    setConfirmSale(true);
  };

  const confirmarVenta = async () => {
    try {
      setSaving(true);
      setFormError("");
      const result = await apiClient.post("/ventas/transaccional", {
        numero: form.numero.trim(),
        clave_operacion: operationKey,
        fecha_comercial: form.fecha_comercial,
        medio_pago: form.medio_pago,
        detalles: detalles.map((detail) => ({
          producto_id: detail.producto_id,
          cantidad: Number(detail.cantidad),
          precio_unitario: detail.precio_unitario,
        })),
      });
      setSalesNotice(`Venta ${result?.venta?.numero || form.numero} registrada correctamente.`);
      setShowForm(false);
      setOperationKey(null);
      setConfirmSale(false);
      setForm({ numero: "", fecha_comercial: today(), medio_pago: "efectivo" });
      setDetalles([newLine()]);
      await cargarDatos();
    } catch (error) {
      setFormError(error.message || "No se pudo registrar la venta.");
    } finally {
      setSaving(false);
    }
  };

  const hasSaleData = detalles.length > 1 ||
    detalles.some((detail) => detail.producto_id || detail.cantidad) ||
    form.fecha_comercial !== today() ||
    form.medio_pago !== "efectivo";

  const cancelarNuevaVenta = () => {
    if (hasSaleData) {
      setConfirmCancel(true);
      setConfirmSale(false);
      return;
    }
    descartarNuevaVenta();
  };

  const descartarNuevaVenta = () => {
    setShowForm(false);
    setOperationKey(null);
    setConfirmSale(false);
    setConfirmCancel(false);
  };

  const abrirDetalle = async (id) => {
    setDetailError("");
    setConfirmAnnul(false);
    try {
      setSelected(await apiClient.get(`/ventas/${id}`));
      setAnnulDate(today());
      setAnnulReason("");
    } catch (error) {
      setDetailError(error.message || "No se pudo cargar el detalle de venta.");
    }
  };

  const anularVenta = async () => {
    if (!selected || selected.estado !== "realizada") return;
    try {
      setSaving(true);
      setDetailError("");
      await apiClient.post(`/ventas/${selected.id}/anulacion`, {
        fecha_comercial: annulDate,
        motivo_anulacion: annulReason.trim() || null,
      });
      setConfirmAnnul(false);
      setSelected(await apiClient.get(`/ventas/${selected.id}`));
      await cargarDatos();
    } catch (error) {
      setDetailError(error.message || "No se pudo anular la venta.");
    } finally {
      setSaving(false);
    }
  };

  const saleTotalCents = detalles.reduce((sum, detail) => sum + lineAmount(detail), 0n);

  return <>
    <div className="page-header">
      <div>
        <h1 className="category-page-title"><SaleIcon type="sales" className="category-display-icon" />Ventas</h1>
        <p>Registro y consulta de ventas realizadas.</p>
      </div>
      <button className="primary-button" type="button" onClick={abrirNuevaVenta}>+ Nueva venta</button>
    </div>
    <div className="panel">
      {salesNotice && <div className="sales-notice" role="status">{salesNotice}<button type="button" aria-label="Cerrar notificación" onClick={() => setSalesNotice("")}>×</button></div>}
      {loadError && <div className="error-message" role="alert">{loadError}</div>}
      <div className="table-toolbar sales-toolbar">
        <label className="sales-filter sales-search-filter">
          <span>Buscar número</span>
          <input className="search-input" placeholder="Número de venta..." value={numberSearch} onChange={(event) => setNumberSearch(event.target.value)} />
        </label>
        <label className="sales-filter"><span>Desde</span><input className="form-control" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label className="sales-filter"><span>Hasta</span><input className="form-control" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
        <label className="sales-filter">
          <span>Medio de pago</span>
          <select className="filter-select" value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}>
            <option value="">Todos</option>
            {Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="sales-filter">
          <span>Estado</span>
          <select className="filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Todos</option><option value="realizada">Realizada</option><option value="anulada">Anulada</option>
          </select>
        </label>
      </div>
      <div className="table-responsive ventas-table-scroll sales-page-scroll">
        <table className="sales-page-table">
          <thead><tr>
            <th><SaleHeading icon="number">Número</SaleHeading></th>
            <th><SaleHeading icon="date">Fecha</SaleHeading></th>
            <th><SaleHeading icon="payment">Medio de pago</SaleHeading></th>
            <th><SaleHeading icon="total">Total</SaleHeading></th>
            <th><SaleHeading icon="status">Estado</SaleHeading></th>
            <th><SaleHeading icon="actions">Acciones</SaleHeading></th>
          </tr></thead>
          <tbody>{loading ? <tr><td colSpan="6">Cargando ventas...</td></tr>
            : filteredSales.length === 0 ? <tr><td colSpan="6">No hay ventas que coincidan con los filtros.</td></tr>
              : filteredSales.map((sale) => <tr key={sale.id}>
                <td><strong>{sale.numero}</strong></td>
                <td>{formatDate(sale.fecha_comercial)}</td>
                <td>{paymentLabels[sale.medio_pago] || sale.medio_pago}</td>
                <td className="sales-table-total">{formatCurrency(toCents(sale.importe_total ?? "0"))}</td>
                <td><span className={`badge sales-status-badge ${sale.estado === "realizada" ? "is-completed" : "is-annulled"}`}>{sale.estado === "realizada" ? "Realizada" : "Anulada"}</span></td>
                <td><button className="action-button product-action-button" type="button" onClick={() => abrirDetalle(sale.id)}><SaleIcon type="actions" />Ver</button></td>
              </tr>)}
          </tbody>
        </table>
      </div>
    </div>

    {showForm && <div className="account-modal-backdrop"><section className="account-modal sales-modal" role="dialog" aria-modal="true" aria-labelledby="sale-title">
      <div className="account-modal-header sales-modal-header">
        <span className="dashboard-section-icon dashboard-section-icon-chart"><SaleIcon type="sales" /></span>
        <div><h2 id="sale-title">Nueva venta</h2><p>El registro de venta y sus movimientos se guardan juntos.</p></div>
      </div>
      {formError && <div className="error-message" role="alert">{formError}</div>}
      <form onSubmit={guardarVenta}>
        <div className="sales-form-meta">
          <label><SaleFieldLabel icon="number">Número</SaleFieldLabel><input className="form-control" value={form.numero} readOnly /></label>
          <label><SaleFieldLabel icon="date">Fecha comercial</SaleFieldLabel><input className="form-control" type="date" value={form.fecha_comercial} onChange={(event) => { setConfirmSale(false); setConfirmCancel(false); setForm((current) => ({ ...current, fecha_comercial: event.target.value })); }} required /></label>
          <label><SaleFieldLabel icon="payment">Medio de pago</SaleFieldLabel><select className="form-control" value={form.medio_pago} onChange={(event) => { setConfirmSale(false); setConfirmCancel(false); setForm((current) => ({ ...current, medio_pago: event.target.value })); }}><option value="efectivo">Efectivo</option><option value="electronico">Electrónico</option><option value="yape">Yape</option><option value="plin">Plin</option></select></label>
        </div>
        <div className="sales-lines-heading"><h3>Productos</h3><span>{detalles.length} {detalles.length === 1 ? "producto" : "productos"}</span></div>
        <p className="sales-number-note">El correlativo se asigna de forma segura al registrar la venta.</p>
        <div className="sales-lines">
          {detalles.map((detail, index) => <div className="sales-line" key={index}>
            <label className="sales-line-product"><SaleFieldLabel icon="product">Producto</SaleFieldLabel><select className="form-control" value={detail.producto_id} onChange={(event) => changeDetail(index, "producto_id", event.target.value)} required><option value="">Selecciona producto</option>{productos.filter((item) => item.activo).map((item) => <option key={item.id} value={item.id}>{item.codigo} — {item.nombre}</option>)}</select></label>
            <div className="sales-line-fields">
              <label><SaleFieldLabel icon="quantity">Cantidad</SaleFieldLabel><input className="form-control" type="number" min="1" step="1" value={detail.cantidad} onChange={(event) => changeDetail(index, "cantidad", event.target.value)} required /></label>
              <label><SaleFieldLabel icon="price">Precio unitario</SaleFieldLabel><input className="form-control" type="text" value={detail.precio_unitario ? formatCurrency(toCents(detail.precio_unitario)) : ""} readOnly placeholder="Automático" /></label>
              <div className="sales-line-amount"><SaleFieldLabel icon="total">Importe</SaleFieldLabel><strong>{formatCurrency(lineAmount(detail))}</strong></div>
            </div>
            <div className="sales-line-actions">
              <button className="action-button sales-remove-line" type="button" disabled={detalles.length === 1} onClick={() => { setConfirmSale(false); setConfirmCancel(false); setDetalles((current) => current.filter((_, i) => i !== index)); }}>Quitar</button>
            </div>
          </div>)}
        </div>
        <button className="action-button sales-add-line" type="button" onClick={() => { setConfirmSale(false); setConfirmCancel(false); setDetalles((current) => [...current, newLine()]); }}>+ Agregar producto</button>
        <div className="sales-grand-total"><span>Total de la venta</span><strong>{formatCurrency(saleTotalCents)}</strong></div>
        {confirmSale && <div className="sales-confirmation" role="alert">
          <p>¿Confirmas que deseas registrar esta venta? Total: {formatCurrency(saleTotalCents)}. El correlativo definitivo se asignará al confirmar; el sugerido es <strong>{form.numero}</strong>.</p>
          <div><button className="primary-button" type="button" disabled={saving} onClick={confirmarVenta}>{saving ? "Registrando..." : "Confirmar venta"}</button><button className="action-button" type="button" disabled={saving} onClick={() => setConfirmSale(false)}>Volver</button></div>
        </div>}
        {confirmCancel && <div className="sales-confirmation is-cancel" role="alert">
          <p>Hay datos o productos ingresados. ¿Descartar esta venta?</p>
          <div><button className="category-danger-button" type="button" onClick={descartarNuevaVenta}>Descartar venta</button><button className="action-button" type="button" onClick={() => setConfirmCancel(false)}>Seguir editando</button></div>
        </div>}
        <div className="account-modal-actions"><button className="primary-button" type="submit" disabled={saving || confirmSale}>{saving ? "Guardando..." : "Registrar venta"}</button><button className="action-button" type="button" disabled={saving} onClick={cancelarNuevaVenta}>Cancelar</button></div>
      </form>
    </section></div>}

    {selected && <div className="account-modal-backdrop"><section className="account-modal sales-modal sale-detail-modal" role="dialog" aria-modal="true" aria-labelledby="sale-detail-title">
      <div className="account-modal-header sales-modal-header">
        <span className="dashboard-section-icon dashboard-section-icon-chart"><SaleIcon type="sales" /></span>
        <div><h2 id="sale-detail-title">Venta {selected.numero}</h2><p>{formatDate(selected.fecha_comercial)} · {paymentLabels[selected.medio_pago] || selected.medio_pago}</p></div>
        <span className={`badge sales-status-badge ${selected.estado === "realizada" ? "is-completed" : "is-annulled"}`}>{selected.estado === "realizada" ? "Realizada" : "Anulada"}</span>
        <button className="account-modal-close" type="button" onClick={() => { setSelected(null); setConfirmAnnul(false); }}>×</button>
      </div>
      {detailError && <div className="error-message" role="alert">{detailError}</div>}
      <section className="sale-detail-information">
        <h3>Detalle de productos</h3>
        <div className="table-responsive"><table><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio unitario</th><th>Importe</th></tr></thead><tbody>
          {(selected.detalles || []).map((detail) => <tr key={detail.id}><td>{detail.nombre_producto}</td><td>{detail.cantidad}</td><td>{formatCurrency(toCents(detail.precio_unitario))}</td><td>{formatCurrency(toCents(detail.importe))}</td></tr>)}
        </tbody></table></div>
        <div className="sales-grand-total"><span>Total</span><strong>{formatCurrency(toCents(selected.importe_total ?? "0"))}</strong></div>
      </section>
      {selected.estado === "realizada" && <section className="sale-annul-section">
        <div className="sale-section-heading"><h3>Anulación</h3><p>Esta acción devolverá las unidades al inventario.</p></div>
        <div className="sales-annul-fields">
          <label><SaleFieldLabel icon="date">Fecha comercial de anulación</SaleFieldLabel><input className="form-control" type="date" value={annulDate} onChange={(event) => setAnnulDate(event.target.value)} /></label>
          <label><SaleFieldLabel icon="reason">Motivo de anulación</SaleFieldLabel><input className="form-control" maxLength={250} value={annulReason} onChange={(event) => setAnnulReason(event.target.value)} /></label>
        </div>
        {!confirmAnnul
          ? <button className="category-danger-button sale-annul-button" type="button" disabled={saving} onClick={() => setConfirmAnnul(true)}>Anular venta</button>
          : <div className="sale-annul-confirmation" role="alert">
            <p>¿Confirmas la anulación de la venta {selected.numero}? La operación no se puede deshacer.</p>
            <div><button className="category-danger-button" type="button" disabled={saving} onClick={anularVenta}>{saving ? "Anulando..." : "Confirmar anulación"}</button><button className="category-cancel-button" type="button" disabled={saving} onClick={() => setConfirmAnnul(false)}>Cancelar</button></div>
          </div>}
      </section>}
    </section></div>}
  </>;
}

export default Ventas;
