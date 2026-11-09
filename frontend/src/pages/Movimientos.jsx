import { useEffect, useState } from "react";
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
const adjustmentReasons = ["saldo_inicial", "conteo_fisico", "dano", "perdida", "correccion"];
const adjustmentReasonLabels = {
  saldo_inicial: "Saldo inicial",
  conteo_fisico: "Conteo físico",
  dano: "Daño",
  perdida: "Pérdida",
  correccion: "Corrección",
};
const movementLabels = {
  venta: "Venta",
  recepcion: "Recepción",
  anulacion_venta: "Anulación de venta",
  ajuste: "Ajuste",
};
const movementIcons = {
  date: <path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1Z M8 13h2m4 0h2m-8 3h2" />,
  product: <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm-8 4.5 8 4.5 8-4.5M12 12v9" />,
  type: <path d="M4 6h16M4 12h16M4 18h16" />,
  variation: <path d="M12 5v14m-7-7 7-7 7 7" />,
  reason: <path d="M12 3 3 7.5 12 12l9-4.5L12 3Zm-9 9 9 4.5 9-4.5m-18 4.5L12 21l9-4.5" />,
  user: <path d="M20 21a8 8 0 0 0-16 0m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />,
  exchange: <path d="M7 7h13l-4-4m4 14H4l4 4" />,
};

function MovementIcon({ type, className = "" }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {movementIcons[type]}
  </svg>;
}

function MovementHeading({ icon, children }) {
  return <span className="inventory-table-heading"><MovementIcon type={icon} />{children}</span>;
}

function MovementFieldLabel({ htmlFor, icon, children }) {
  return <label className="form-label movement-form-label" htmlFor={htmlFor}>
    <MovementIcon type={icon} />
    {children}
  </label>;
}

function formatMovementDate(commercialDate, occurredAt) {
  const dateText = commercialDate instanceof Date
    ? commercialDate.toISOString().slice(0, 10)
    : String(commercialDate ?? "").slice(0, 10);
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!dateMatch) return "—";

  let time = "";
  if (occurredAt instanceof Date || /(?:Z|[+-]\d{2}:\d{2})$/i.test(String(occurredAt))) {
    const instant = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);
    if (!Number.isNaN(instant.getTime())) {
      const parts = new Intl.DateTimeFormat("en", {
        timeZone: "America/Lima",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(instant);
      const part = (type) => parts.find((item) => item.type === type)?.value || "";
      time = `${part("hour")}:${part("minute")}`;
    }
  } else {
    time = /(?:T|\s)(\d{2}):(\d{2})/.exec(String(occurredAt ?? ""))?.slice(1).join(":") || "";
  }

  const [, year, month, day] = dateMatch;
  return `${day}/${month}/${year} · ${time || "—"}`;
}

function formatVariation(value) {
  try {
    const units = BigInt(value);
    return `${units < 0n ? "−" : units > 0n ? "+" : ""}${units < 0n ? -units : units} unidades`;
  } catch {
    return "—";
  }
}

function variationClass(value) {
  try {
    const units = BigInt(value);
    return units < 0n ? "is-outgoing" : units > 0n ? "is-incoming" : "is-neutral";
  } catch {
    return "is-neutral";
  }
}

function Movimientos() {
  const [movimientos, setMovimientos] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [operationKey, setOperationKey] = useState(null);
  const [dateFilter, setDateFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [form, setForm] = useState({
    producto_id: "", variacion_unidades: "", fecha_comercial: today(),
    motivo_ajuste: "", descripcion_ajuste: "",
  });

  const cargarDatos = async () => {
    try {
      setError("");
      const [movementRows, productRows] = await Promise.all([
        apiClient.get("/movimientos-inventario"), apiClient.get("/productos"),
      ]);
      setMovimientos(Array.isArray(movementRows) ? movementRows : []);
      setProductos(Array.isArray(productRows) ? productRows : []);
    } catch (requestError) {
      setError(requestError.message || "No se pudieron cargar los movimientos.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { Promise.resolve().then(cargarDatos); }, []);

  const productById = new Map(productos.map((item) => [String(item.id), item]));
  const visibleMovements = movimientos.filter((movement) => {
    const dateMatches = !dateFilter || String(movement.fecha_comercial ?? "").slice(0, 10) === dateFilter;
    const productMatches = !productFilter || String(movement.producto_id) === productFilter;
    const typeMatches = !typeFilter || movement.tipo === typeFilter;
    return dateMatches && productMatches && typeMatches;
  });

  const guardarAjuste = async (event) => {
    event.preventDefault();
    if (!form.producto_id || !/^-?[1-9]\d*$/.test(form.variacion_unidades) ||
        !form.fecha_comercial || !form.motivo_ajuste.trim()) {
      setFormError("Completa producto, variación, fecha y motivo.");
      return;
    }
    try {
      setSaving(true);
      setFormError("");
      await apiClient.post("/movimientos-inventario/ajustes", {
        ...form,
        clave_operacion: operationKey,
        variacion_unidades: form.variacion_unidades,
      });
      setShowForm(false);
      setOperationKey(null);
      setForm({ producto_id: "", variacion_unidades: "", fecha_comercial: today(), motivo_ajuste: "", descripcion_ajuste: "" });
      await cargarDatos();
    } catch (requestError) {
      setFormError(requestError.message || "No se pudo registrar el ajuste.");
    } finally {
      setSaving(false);
    }
  };

  return <>
    <div className="page-header">
      <div>
        <h1 className="category-page-title"><MovementIcon type="exchange" className="category-display-icon" />Movimientos de inventario</h1>
        <p>Historial de movimientos y ajustes trazables.</p>
      </div>
      <button className="primary-button" type="button" onClick={() => { setOperationKey(crypto.randomUUID()); setShowForm(true); }}>+ Registrar ajuste</button>
    </div>
    <div className="panel">
      {error && <div className="error-message" role="alert">{error}</div>}
      <div className="table-toolbar movements-toolbar">
        <label className="movement-filter">
          <span>Fecha</span>
          <input className="form-control" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
        </label>
        <label className="movement-filter">
          <span>Producto</span>
          <select className="filter-select" value={productFilter} onChange={(event) => setProductFilter(event.target.value)}>
            <option value="">Todos los productos</option>
            {productos.map((item) => <option key={item.id} value={item.id}>{item.codigo} — {item.nombre}</option>)}
          </select>
        </label>
        <label className="movement-filter">
          <span>Tipo de movimiento</span>
          <select className="filter-select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="">Todos los tipos</option>
            {Object.entries(movementLabels).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
          </select>
        </label>
      </div>
      <div className="table-responsive movimientos-table-scroll movements-page-scroll">
        <table className="movimientos-page-table">
          <thead><tr>
            <th><MovementHeading icon="date">Fecha y hora</MovementHeading></th>
            <th><MovementHeading icon="product">Producto</MovementHeading></th>
            <th><MovementHeading icon="type">Tipo</MovementHeading></th>
            <th><MovementHeading icon="variation">Variación</MovementHeading></th>
            <th><MovementHeading icon="reason">Motivo</MovementHeading></th>
            <th><MovementHeading icon="user">Usuario</MovementHeading></th>
          </tr></thead>
          <tbody>{loading ? <tr><td colSpan="6">Cargando movimientos...</td></tr>
            : visibleMovements.length === 0 ? <tr><td colSpan="6">No hay movimientos que coincidan con los filtros.</td></tr>
              : visibleMovements.map((movement) => (
                <tr key={movement.id}>
                  <td className="movement-date">{formatMovementDate(movement.fecha_comercial, movement.ocurrido_en)}</td>
                  <td>{movement.nombre_producto || productById.get(String(movement.producto_id))?.nombre || "Producto"}</td>
                  <td><span className={`dashboard-movement-badge is-${movement.tipo}`}>{movementLabels[movement.tipo] || movement.tipo}</span></td>
                  <td><span className={`dashboard-movement-variation ${variationClass(movement.variacion_unidades)}`}>{formatVariation(movement.variacion_unidades)}</span></td>
                  <td>{adjustmentReasonLabels[movement.motivo_ajuste] || movement.motivo_ajuste || "—"}</td>
                  <td>{movement.nombre_usuario || "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
    {showForm && <div className="account-modal-backdrop"><section className="account-modal adjustment-modal" role="dialog" aria-modal="true" aria-labelledby="adjustment-title">
      <div className="account-modal-header adjustment-modal-header">
        <span className="dashboard-section-icon dashboard-section-icon-chart" aria-hidden="true"><MovementIcon type="variation" /></span>
        <div><h2 id="adjustment-title">Ajuste de inventario</h2><p>El ajuste se registra como movimiento; no edita existencias directamente.</p></div>
      </div>
      {formError && <div className="error-message" role="alert">{formError}</div>}
      <form onSubmit={guardarAjuste}>
        <div className="account-modal-fields adjustment-modal-fields">
          <div><MovementFieldLabel htmlFor="adjustment-product" icon="product">Producto</MovementFieldLabel><select id="adjustment-product" className="form-control" value={form.producto_id} onChange={(event) => setForm((current) => ({ ...current, producto_id: event.target.value }))} required><option value="">Selecciona producto</option>{productos.filter((item) => item.activo).map((item) => <option key={item.id} value={item.id}>{item.codigo} — {item.nombre}</option>)}</select></div>
          <div><MovementFieldLabel htmlFor="adjustment-variation" icon="variation">Variación (+/- unidades)</MovementFieldLabel><input id="adjustment-variation" className="form-control" type="number" step="1" value={form.variacion_unidades} onChange={(event) => setForm((current) => ({ ...current, variacion_unidades: event.target.value }))} required /></div>
          <div><MovementFieldLabel htmlFor="adjustment-date" icon="date">Fecha comercial</MovementFieldLabel><input id="adjustment-date" className="form-control" type="date" value={form.fecha_comercial} onChange={(event) => setForm((current) => ({ ...current, fecha_comercial: event.target.value }))} required /></div>
          <div><MovementFieldLabel htmlFor="adjustment-reason" icon="reason">Motivo de ajuste</MovementFieldLabel><select id="adjustment-reason" className="form-control" value={form.motivo_ajuste} onChange={(event) => setForm((current) => ({ ...current, motivo_ajuste: event.target.value }))} required><option value="">Selecciona un motivo</option>{adjustmentReasons.map((reason) => <option key={reason} value={reason}>{adjustmentReasonLabels[reason]}</option>)}</select></div>
          <div className="adjustment-description-field"><MovementFieldLabel htmlFor="adjustment-description" icon="reason">Descripción</MovementFieldLabel><textarea id="adjustment-description" className="form-control" value={form.descripcion_ajuste} onChange={(event) => setForm((current) => ({ ...current, descripcion_ajuste: event.target.value }))} /></div>
        </div>
        <div className="account-modal-actions"><button className="primary-button" disabled={saving}>{saving ? "Guardando..." : "Registrar ajuste"}</button><button className="action-button" type="button" onClick={() => { setShowForm(false); setOperationKey(null); }}>Cancelar</button></div>
      </form>
    </section></div>}
  </>;
}

export default Movimientos;
