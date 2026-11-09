import { useEffect, useMemo, useRef, useState } from "react";
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

const emptyPurchase = { numero: "", proveedor_id: "", fecha_pedido: today(), fecha_entrega_prevista: "" };
const newLine = () => ({ producto_proveedor_id: "", cantidad_presentaciones: "" });
const purchaseIcons = {
  purchase: <path d="M4 5h16v15H4zM8 3v4m8-4v4M4 10h16m-11 4h6" />,
  number: <path d="M4 9h16M4 15h16M10 3 8 21m8-18-2 18" />,
  supplier: <path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h.01M15 10h.01M9 14h.01M15 14h.01M10 21v-4h4v4" />,
  date: <path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1Z" />,
  state: <path d="m5 12 4 4L19 6" />,
  receipt: <path d="M4 19V5m0 14h16M7 15l4-4 3 2 5-6" />,
  actions: <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
  product: <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm-8 4.5 8 4.5 8-4.5M12 12v9" />,
  quantity: <path d="M5 12h14m-7-7v14" />,
  cost: <path d="M12 3v18m5-14.5c-1-1-2.5-1.5-5-1.5-2.2 0-4 1.1-4 3s1.6 2.8 4 3.5 5 1.2 5 3.5-1.8 4-5 4c-2.3 0-4-.7-5-1.8" />,
  amount: <path d="M4 7h16M4 12h16M4 17h10" />,
  presentation: <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12l-8-4.5m8 4.5v9" />,
};

const stateLabels = {
  pendiente: "Pendiente",
  recibida_parcial: "Recepción parcial",
  recibida: "Recibida",
  cancelada: "Cancelada",
  cerrada_parcial: "Cerrada parcial",
};

function PurchaseIcon({ type, className = "" }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {purchaseIcons[type]}
  </svg>;
}

function PurchaseHeading({ icon, children }) {
  return <span className="category-table-heading"><PurchaseIcon type={icon} className="category-display-icon" />{children}</span>;
}

function PurchaseFieldLabel({ icon, children }) {
  return <span className="purchase-field-label"><PurchaseIcon type={icon} />{children}</span>;
}

function asBigInt(value) {
  try {
    return BigInt(String(value ?? 0));
  } catch {
    return 0n;
  }
}

function formatCount(value) {
  return asBigInt(value).toLocaleString("es-PE");
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
  return match ? BigInt(match[1]) * 100n + BigInt((match[2] || "").padEnd(2, "0")) : 0n;
}

function formatCurrency(cents) {
  return `S/ ${(cents / 100n).toLocaleString("es-PE")}.${(cents % 100n).toString().padStart(2, "0")}`;
}

function presentationName(value, plural = false) {
  const names = {
    unidad: plural ? "unidades" : "unidad",
    paquete: plural ? "paquetes" : "paquete",
    caja: plural ? "cajas" : "caja",
  };
  return names[value] || value || "presentaciones";
}

function getPurchaseState(compra) {
  if (["cancelada", "cerrada_parcial"].includes(compra.estado)) return compra.estado;
  const ordered = asBigInt(compra.unidades_pedidas);
  const received = asBigInt(compra.unidades_recibidas);
  if (received === 0n) return "pendiente";
  if (ordered > received) return "recibida_parcial";
  return "recibida";
}

function getProgress(compra) {
  const ordered = asBigInt(compra.unidades_pedidas);
  const received = asBigInt(compra.unidades_recibidas);
  return ordered > 0n ? Math.min(100, Number((received * 100n) / ordered)) : 0;
}

function Compras() {
  const [compras, setCompras] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [detailNotice, setDetailNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyPurchase);
  const [detalles, setDetalles] = useState([newLine()]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmCreate, setConfirmCreate] = useState(false);
  const [confirmReceipt, setConfirmReceipt] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(null);
  const [compraDetalle, setCompraDetalle] = useState(null);
  const [detalleError, setDetalleError] = useState("");
  const [receiptForm, setReceiptForm] = useState(null);
  const [purchaseKey, setPurchaseKey] = useState(null);
  const catalogRequest = useRef(0);

  const cargarDatos = async () => {
    try {
      setLoadError("");
      const [comprasData, proveedoresData] = await Promise.all([
        apiClient.get("/compras"),
        apiClient.get("/proveedores"),
      ]);
      setCompras(Array.isArray(comprasData) ? comprasData : []);
      setProveedores(Array.isArray(proveedoresData) ? proveedoresData : []);
    } catch (error) {
      setLoadError(error.message || "No se pudieron cargar las compras.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { Promise.resolve().then(cargarDatos); }, []);

  const nextPurchaseNumber = useMemo(() => {
    const lastSequence = compras.reduce((maximum, compra) => {
      const match = /^OC-SIM-(\d+)$/.exec(String(compra.numero));
      if (!match) return maximum;
      const sequence = BigInt(match[1]);
      return sequence > maximum ? sequence : maximum;
    }, 0n);
    return `OC-SIM-${(lastSequence + 1n).toString().padStart(6, "0")}`;
  }, [compras]);

  const abrirDetalle = async (id) => {
    setDetalleError("");
    try {
      setCompraDetalle(await apiClient.get(`/compras/${id}`));
      setReceiptForm(null);
      setConfirmReceipt(false);
      setDetailNotice("");
    } catch (error) {
      setDetalleError(error.message || "No se pudo cargar el detalle.");
    }
  };

  const proveedorNombre = (id) =>
    proveedores.find((item) => String(item.id) === String(id))?.nombre || "Proveedor";

  const cambiarCampo = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFormError("");
  };

  const cambiarProveedor = async (event) => {
    const proveedorId = event.target.value;
    const requestId = catalogRequest.current + 1;
    catalogRequest.current = requestId;
    setForm((current) => ({ ...current, proveedor_id: proveedorId }));
    setDetalles([newLine()]);
    setCatalogo([]);
    setFormError("");
    if (!proveedorId) return;
    try {
      const data = await apiClient.get(`/proveedores/catalogo?proveedor_id=${encodeURIComponent(proveedorId)}`);
      if (catalogRequest.current === requestId) setCatalogo(Array.isArray(data) ? data : []);
    } catch (error) {
      if (catalogRequest.current === requestId) {
        setFormError(error.message || "No se pudo cargar el catálogo del proveedor.");
      }
    }
  };

  const cambiarDetalle = (index, changes) => {
    setDetalles((current) => current.map((item, position) =>
      position === index ? { ...item, ...changes } : item));
    setFormError("");
  };

  const abrirNuevoPedido = () => {
    setPurchaseKey(crypto.randomUUID());
    setForm({ ...emptyPurchase, numero: nextPurchaseNumber, fecha_pedido: today() });
    setDetalles([newLine()]);
    setCatalogo([]);
    setFormError("");
    setConfirmCreate(false);
    setConfirmDiscard(null);
    setShowForm(true);
  };

  const pedidoTieneDatos = form.proveedor_id ||
    (form.fecha_pedido && form.fecha_pedido !== today()) ||
    Boolean(form.fecha_entrega_prevista) ||
    detalles.some((detail) => detail.producto_proveedor_id || detail.cantidad_presentaciones);

  const cerrarFormularioPedido = () => {
    setShowForm(false);
    setPurchaseKey(null);
    setConfirmCreate(false);
    setConfirmDiscard(null);
    setCatalogo([]);
  };

  const cancelarPedido = () => {
    if (pedidoTieneDatos) {
      setConfirmCreate(false);
      setConfirmDiscard("purchase");
    }
    else cerrarFormularioPedido();
  };

  const guardarCompra = (event) => {
    event.preventDefault();
    if (!form.numero.trim() || !form.proveedor_id || !form.fecha_pedido ||
        !form.fecha_entrega_prevista || detalles.length === 0 ||
        detalles.some((detail) => !detail.producto_proveedor_id ||
          !/^\d+$/.test(detail.cantidad_presentaciones) ||
          BigInt(detail.cantidad_presentaciones || 0) < 1n)) {
      setFormError("Completa los datos del pedido y agrega cantidades válidas.");
      return;
    }
    setConfirmCreate(true);
  };

  const confirmarCrearCompra = async () => {
    try {
      setSaving(true);
      setFormError("");
      await apiClient.post("/compras/transaccional", {
        numero: form.numero.trim(),
        clave_operacion: purchaseKey,
        proveedor_id: form.proveedor_id,
        fecha_pedido: form.fecha_pedido,
        fecha_entrega_prevista: form.fecha_entrega_prevista,
        detalles: detalles.map((detail) => ({
          producto_proveedor_id: detail.producto_proveedor_id,
          cantidad_presentaciones: Number(detail.cantidad_presentaciones),
        })),
      });
      cerrarFormularioPedido();
      setForm({ ...emptyPurchase, fecha_pedido: today() });
      setDetalles([newLine()]);
      setNotice("Pedido registrado correctamente.");
      await cargarDatos();
    } catch (error) {
      setFormError(error.message || "No se pudo registrar el pedido.");
      setConfirmCreate(false);
    } finally {
      setSaving(false);
    }
  };

  const iniciarRecepcion = () => {
    setReceiptForm({
      numero: "",
      fecha_comercial: today(),
      observacion: "",
      cantidades: Object.fromEntries((compraDetalle.detalles || [])
        .map((detail) => [String(detail.id), ""])),
      clave_operacion: crypto.randomUUID(),
    });
    setConfirmReceipt(false);
    setDetalleError("");
  };

  const recepcionTieneDatos = receiptForm && (
    receiptForm.numero || receiptForm.observacion ||
    receiptForm.fecha_comercial !== today() ||
    Object.values(receiptForm.cantidades).some(Boolean)
  );

  const cancelarRecepcion = () => {
    if (recepcionTieneDatos) setConfirmDiscard("receipt");
    else setReceiptForm(null);
    setConfirmReceipt(false);
  };

  const guardarRecepcion = (event) => {
    event.preventDefault();
    const entradas = Object.entries(receiptForm.cantidades)
      .filter(([, quantity]) => quantity !== "")
      .map(([detalle_compra_id, unidades_recibidas]) => ({ detalle_compra_id, unidades_recibidas }));
    if (!receiptForm.numero.trim() || !receiptForm.fecha_comercial || !entradas.length ||
        entradas.some(({ unidades_recibidas }) => !/^\d+$/.test(unidades_recibidas) ||
          BigInt(unidades_recibidas) < 1n)) {
      setDetalleError("Indica el número, fecha y al menos una cantidad recibida válida.");
      return;
    }
    setConfirmReceipt(true);
  };

  const confirmarGuardarRecepcion = async () => {
    const entradas = Object.entries(receiptForm.cantidades)
      .filter(([, quantity]) => quantity !== "")
      .map(([detalle_compra_id, unidades_recibidas]) => ({ detalle_compra_id, unidades_recibidas }));
    try {
      setSaving(true);
      setDetalleError("");
      await apiClient.post(`/compras/${compraDetalle.id}/recepciones`, {
        numero: receiptForm.numero.trim(),
        clave_operacion: receiptForm.clave_operacion,
        fecha_comercial: receiptForm.fecha_comercial,
        observacion: receiptForm.observacion.trim() || null,
        detalles: entradas,
      });
      const updated = await apiClient.get(`/compras/${compraDetalle.id}`);
      setCompraDetalle(updated);
      setReceiptForm(null);
      setConfirmReceipt(false);
      setDetailNotice("Recepción registrada correctamente.");
      await cargarDatos();
    } catch (error) {
      setDetalleError(error.message || "No se pudo registrar la recepción.");
      setConfirmReceipt(false);
    } finally {
      setSaving(false);
    }
  };

  const comprasVisibles = [...compras].sort((a, b) =>
    String(b.fecha_pedido).localeCompare(String(a.fecha_pedido)));
  const totalPedido = detalles.reduce((sum, detail) => {
    const selected = catalogo.find((item) =>
      String(item.id) === String(detail.producto_proveedor_id));
    return sum + toCents(selected?.costo_presentacion) *
      ( /^\d+$/.test(detail.cantidad_presentaciones) ? BigInt(detail.cantidad_presentaciones) : 0n);
  }, 0n);
  const totalDetalle = (compraDetalle?.detalles || []).reduce((sum, detail) =>
    sum + toCents(detail.importe), 0n);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="category-page-title"><PurchaseIcon type="purchase" className="category-display-icon" />Compras</h1>
          <p>Pedidos a proveedores y recepciones parciales.</p>
        </div>
        <button className="primary-button" type="button" onClick={abrirNuevoPedido}>+ Nuevo pedido</button>
      </div>
      {notice && <div className="success-message purchase-notice" role="status">{notice}<button type="button" onClick={() => setNotice("")}>Cerrar</button></div>}
      <div className="panel">
        {loadError && <div className="error-message" role="alert">{loadError}</div>}
        <div className="compras-table-scroll">
          <table className="purchases-table">
            <thead><tr>
              <th><PurchaseHeading icon="number">Número</PurchaseHeading></th>
              <th><PurchaseHeading icon="supplier">Proveedor</PurchaseHeading></th>
              <th><PurchaseHeading icon="date">Fecha pedido</PurchaseHeading></th>
              <th><PurchaseHeading icon="date">Entrega prevista</PurchaseHeading></th>
              <th><PurchaseHeading icon="state">Estado</PurchaseHeading></th>
              <th><PurchaseHeading icon="receipt">Recepción</PurchaseHeading></th>
              <th><PurchaseHeading icon="actions">Acciones</PurchaseHeading></th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="7">Cargando pedidos...</td></tr>
                : comprasVisibles.length === 0 ? <tr><td colSpan="7">No hay pedidos registrados.</td></tr>
                  : comprasVisibles.map((compra) => {
                    const state = getPurchaseState(compra);
                    const progress = getProgress(compra);
                    return <tr key={compra.id}>
                      <td className="purchase-number">{compra.numero}</td>
                      <td>{compra.nombre_proveedor || proveedorNombre(compra.proveedor_id)}</td>
                      <td>{formatDate(compra.fecha_pedido)}</td>
                      <td>{formatDate(compra.fecha_entrega_prevista)}</td>
                      <td><span className={`purchase-state purchase-state-${state}`}>{stateLabels[state] || state}</span></td>
                      <td>
                        <div className="purchase-progress-label">
                          <span>{formatCount(compra.unidades_recibidas)} / {formatCount(compra.unidades_pedidas)} unidades</span>
                          <strong>{progress}%</strong>
                        </div>
                        <div className="purchase-progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100">
                          <span style={{ width: `${progress}%` }} />
                        </div>
                      </td>
                      <td><button className="action-button" type="button" onClick={() => abrirDetalle(compra.id)}>Ver</button></td>
                    </tr>;
                  })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="account-modal-backdrop">
          <section className="account-modal purchases-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-title">
            <div className="account-modal-header"><div><h2 id="purchase-title">Nuevo pedido</h2><p>Productos, presentación y costos del catálogo seleccionado.</p></div></div>
            {formError && <div className="error-message" role="alert">{formError}</div>}
            <form onSubmit={guardarCompra}>
              <div className="purchase-form-fields">
                <div>
                  <label className="form-label"><PurchaseFieldLabel icon="number">Número</PurchaseFieldLabel></label>
                  <input className="form-control" value={form.numero} readOnly aria-describedby="purchase-number-note" />
                  <small id="purchase-number-note">Sugerido; el correlativo definitivo se asigna al registrar.</small>
                </div>
                <div>
                  <label className="form-label"><PurchaseFieldLabel icon="supplier">Proveedor</PurchaseFieldLabel></label>
                  <select className="form-control" name="proveedor_id" value={form.proveedor_id} onChange={cambiarProveedor} required>
                    <option value="">Selecciona proveedor</option>
                    {proveedores.filter((item) => item.activo).map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label"><PurchaseFieldLabel icon="date">Fecha de pedido</PurchaseFieldLabel></label>
                  <input className="form-control" type="date" name="fecha_pedido" value={form.fecha_pedido} onChange={cambiarCampo} required />
                </div>
                <div>
                  <label className="form-label"><PurchaseFieldLabel icon="date">Entrega prevista</PurchaseFieldLabel></label>
                  <input className="form-control" type="date" name="fecha_entrega_prevista" value={form.fecha_entrega_prevista} onChange={cambiarCampo} required />
                </div>
              </div>
              <h3 className="purchase-section-title"><PurchaseIcon type="product" />Productos</h3>
              {!form.proveedor_id && <p className="purchase-empty-catalog">Selecciona un proveedor para cargar su catálogo.</p>}
              {detalles.map((detail, index) => {
                const selected = catalogo.find((item) =>
                  String(item.id) === String(detail.producto_proveedor_id));
                const unitName = presentationName(selected?.presentacion_compra, true);
                const lineAmount = toCents(selected?.costo_presentacion) *
                  (/^\d+$/.test(detail.cantidad_presentaciones) ? BigInt(detail.cantidad_presentaciones) : 0n);
                return <div key={index} className="purchase-product-card">
                  <div className="purchase-product-name">
                    <label className="form-label"><PurchaseFieldLabel icon="product">Producto</PurchaseFieldLabel></label>
                    <select className="form-control" value={detail.producto_proveedor_id} onChange={(event) =>
                      cambiarDetalle(index, { producto_proveedor_id: event.target.value, cantidad_presentaciones: "" })} required>
                      <option value="">Selecciona producto</option>
                      {catalogo.map((item) => <option key={item.id} value={item.id}>{item.codigo} — {item.nombre_producto}</option>)}
                      {form.proveedor_id && catalogo.length === 0 && <option value="" disabled>No hay productos activos disponibles</option>}
                    </select>
                  </div>
                  <div className="purchase-product-values">
                    <div>
                      <label className="form-label"><PurchaseFieldLabel icon="quantity">Cantidad de {unitName}</PurchaseFieldLabel></label>
                      <input className="form-control" type="number" min={selected?.minimo_presentaciones || 1} step="1" value={detail.cantidad_presentaciones}
                        onChange={(event) => cambiarDetalle(index, { cantidad_presentaciones: event.target.value })}
                        required aria-label={`Cantidad de ${unitName}`} />
                      {selected && <small>Mínimo: {selected.minimo_presentaciones} {presentationName(selected.presentacion_compra, Number(selected.minimo_presentaciones) !== 1)}</small>}
                    </div>
                    <div>
                      <label className="form-label"><PurchaseFieldLabel icon="presentation">Presentación</PurchaseFieldLabel></label>
                      <input className="form-control" value={selected ? `${presentationName(selected.presentacion_compra)} (${selected.unidades_por_presentacion} unidades)` : "—"} readOnly />
                    </div>
                    <div className="purchase-product-cost">
                      <label className="form-label"><PurchaseFieldLabel icon="cost">Costo / presentación</PurchaseFieldLabel></label>
                      <input className="form-control" value={selected ? formatCurrency(toCents(selected.costo_presentacion)) : "—"} readOnly />
                    </div>
                    <div className="purchase-product-amount">
                      <label className="form-label"><PurchaseFieldLabel icon="amount">Importe</PurchaseFieldLabel></label>
                      <output className="purchase-line-amount">{formatCurrency(lineAmount)}</output>
                    </div>
                    <button className="purchase-remove-button" type="button" disabled={detalles.length === 1}
                      onClick={() => setDetalles((current) => current.filter((_, position) => position !== index))}>Quitar</button>
                  </div>
                </div>;
              })}
              <button className="action-button purchase-add-button" type="button" disabled={!form.proveedor_id || catalogo.length === 0}
                onClick={() => setDetalles((current) => [...current, newLine()])}>+ Agregar producto</button>
              <div className="purchase-total-row"><span>Total del pedido</span><strong>{formatCurrency(totalPedido)}</strong></div>
              {confirmCreate && <div className="purchase-confirmation" role="alert">
                <p>¿Confirmas que deseas crear este pedido?</p>
                <div><button className="primary-button" type="button" disabled={saving} onClick={confirmarCrearCompra}>{saving ? "Registrando..." : "Confirmar pedido"}</button>
                  <button className="action-button" type="button" disabled={saving} onClick={() => setConfirmCreate(false)}>Volver</button></div>
              </div>}
              {confirmDiscard === "purchase" && <div className="purchase-confirmation" role="alert">
                <p>¿Descartar el pedido y los datos ingresados?</p>
                <div><button className="category-danger-button" type="button" onClick={cerrarFormularioPedido}>Descartar</button>
                  <button className="action-button" type="button" onClick={() => setConfirmDiscard(null)}>Continuar editando</button></div>
              </div>}
              <div className="account-modal-actions">
                {!confirmCreate && <button className="primary-button" disabled={saving}>{saving ? "Guardando..." : "Crear pedido"}</button>}
                <button className="action-button" type="button" disabled={saving} onClick={cancelarPedido}>Cancelar</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {compraDetalle && (
        <div className="account-modal-backdrop">
          <section className="account-modal purchases-modal purchase-detail-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-detail-title">
            <div className="account-modal-header">
              <div><h2 id="purchase-detail-title">Ver pedido</h2><p>{compraDetalle.nombre_proveedor}</p></div>
              <button className="account-modal-close" type="button" aria-label="Cerrar" onClick={() => {
                if (receiptForm && recepcionTieneDatos) setConfirmDiscard("receipt-close");
                else { setCompraDetalle(null); setReceiptForm(null); }
              }}>×</button>
            </div>
            {detalleError && <div className="error-message" role="alert">{detalleError}</div>}
            {detailNotice && <div className="account-modal-success" role="status">{detailNotice}</div>}
            <div className="purchase-info-cards">
              <div><span>Número</span><strong>{compraDetalle.numero}</strong></div>
              <div><span>Proveedor</span><strong>{compraDetalle.nombre_proveedor}</strong></div>
              <div><span>Fecha pedido</span><strong>{formatDate(compraDetalle.fecha_pedido)}</strong></div>
              <div><span>Entrega prevista</span><strong>{formatDate(compraDetalle.fecha_entrega_prevista)}</strong></div>
              <div><span>Estado</span><strong className={`purchase-state purchase-state-${getPurchaseState(compraDetalle)}`}>
                {stateLabels[getPurchaseState(compraDetalle)] || compraDetalle.estado}
              </strong></div>
              <div><span>Total pedido</span><strong>{formatCurrency(totalDetalle)}</strong></div>
            </div>
            <div className="purchase-detail-products">
              {(compraDetalle.detalles || []).map((detail) => (
                <article className="purchase-detail-product" key={detail.id}>
                  <div className="purchase-detail-product-top">
                    <div><span><PurchaseIcon type="product" />Producto</span><strong>{detail.nombre_producto}</strong></div>
                    <div><span><PurchaseIcon type="presentation" />Presentación</span>
                      <strong>{detail.cantidad_presentaciones} {presentationName(detail.presentacion_compra, Number(detail.cantidad_presentaciones) !== 1)} · {detail.unidades_por_presentacion} unid. c/u</strong>
                    </div>
                  </div>
                  <div className="purchase-detail-product-quantities">
                    <div><span><PurchaseIcon type="quantity" />Pedidas</span><strong>{formatCount(detail.unidades_pedidas)} unidades</strong></div>
                    <div><span><PurchaseIcon type="receipt" />Recibidas</span><strong>{formatCount(detail.unidades_recibidas)} unidades</strong></div>
                    <div><span><PurchaseIcon type="state" />Pendientes</span><strong>{formatCount(detail.unidades_por_llegar)} unidades</strong></div>
                  </div>
                </article>
              ))}
            </div>
            {!receiptForm && ["pendiente", "recibida_parcial"].includes(compraDetalle.estado) &&
              <button className="primary-button" type="button" onClick={iniciarRecepcion}>Registrar recepción</button>}
            {receiptForm && <form className="purchase-receipt-form" onSubmit={guardarRecepcion}>
              <h3 className="purchase-section-title"><PurchaseIcon type="receipt" />Registrar recepción</h3>
              <div className="purchase-form-fields">
                <div>
                  <label className="form-label"><PurchaseFieldLabel icon="number">Número de recepción</PurchaseFieldLabel></label>
                  <input className="form-control" value={receiptForm.numero} onChange={(event) => setReceiptForm((current) => ({ ...current, numero: event.target.value }))} maxLength={30} required />
                </div>
                <div>
                  <label className="form-label"><PurchaseFieldLabel icon="date">Fecha comercial</PurchaseFieldLabel></label>
                  <input className="form-control" type="date" value={receiptForm.fecha_comercial} onChange={(event) => setReceiptForm((current) => ({ ...current, fecha_comercial: event.target.value }))} required />
                </div>
                <div className="purchase-observation-field">
                  <label className="form-label"><PurchaseFieldLabel icon="amount">Observación (opcional)</PurchaseFieldLabel></label>
                  <input className="form-control" value={receiptForm.observacion} onChange={(event) => setReceiptForm((current) => ({ ...current, observacion: event.target.value }))} />
                </div>
              </div>
              <div className="purchase-pending-lines">
                {(compraDetalle.detalles || []).filter((detail) => asBigInt(detail.unidades_por_llegar) > 0n).map((detail) => (
                  <div key={detail.id}>
                    <label className="form-label" htmlFor={`receipt-${detail.id}`}>
                      {detail.nombre_producto} <span>· pendiente: {formatCount(detail.unidades_por_llegar)} unidades</span>
                    </label>
                    <input id={`receipt-${detail.id}`} className="form-control" type="number" min="0"
                      max={detail.unidades_por_llegar} step="1" value={receiptForm.cantidades[String(detail.id)] || ""}
                      onChange={(event) => setReceiptForm((current) => ({ ...current, cantidades: { ...current.cantidades, [String(detail.id)]: event.target.value } }))} />
                  </div>
                ))}
              </div>
              {confirmReceipt && <div className="purchase-confirmation" role="alert">
                <p>¿Confirmas que deseas registrar esta recepción?</p>
                <div><button className="primary-button" type="button" disabled={saving} onClick={confirmarGuardarRecepcion}>{saving ? "Registrando..." : "Confirmar recepción"}</button>
                  <button className="action-button" type="button" disabled={saving} onClick={() => setConfirmReceipt(false)}>Volver</button></div>
              </div>}
              {["receipt", "receipt-close"].includes(confirmDiscard) && <div className="purchase-confirmation" role="alert">
                <p>¿Descartar los datos de esta recepción?</p>
                <div><button className="category-danger-button" type="button" onClick={() => {
                  setReceiptForm(null);
                  setConfirmReceipt(false);
                  setConfirmDiscard(null);
                  if (confirmDiscard === "receipt-close") setCompraDetalle(null);
                }}>Descartar</button>
                  <button className="action-button" type="button" onClick={() => setConfirmDiscard(null)}>Continuar editando</button></div>
              </div>}
              <div className="account-modal-actions">
                {!confirmReceipt && <button className="primary-button" disabled={saving}>Registrar recepción</button>}
                <button className="action-button" type="button" disabled={saving} onClick={cancelarRecepcion}>Cancelar</button>
              </div>
            </form>}
          </section>
        </div>
      )}
    </>
  );
}

export default Compras;
