import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import "./Reportes.css";

const LIMA_TIME_ZONE = "America/Lima";
const REPORT_TABS = [
  { id: "resumen", label: "Resumen", icon: "summary" },
  { id: "ventas", label: "Ventas", icon: "sales" },
  { id: "inventario", label: "Inventario", icon: "inventory" },
  { id: "compras", label: "Compras", icon: "purchases" },
  { id: "movimientos", label: "Movimientos", icon: "movements" },
];
const STATE_LABELS = {
  realizada: "Realizada",
  anulada: "Anulada",
  pendiente: "Pendiente",
  recibida_parcial: "Recepción parcial",
  recibida: "Recibida",
  cancelada: "Cancelada",
  cerrada_parcial: "Cerrada parcial",
};
const TYPE_LABELS = {
  recepcion: "Recepción",
  venta: "Venta",
  anulacion_venta: "Anulación de venta",
  ajuste: "Ajuste",
  entrada: "Entrada",
  salida: "Salida",
};
const MOVEMENT_TYPES = ["venta", "anulacion_venta", "recepcion", "ajuste"];
const PAYMENT_LABELS = {
  efectivo: "Efectivo",
  electronico: "Electrónico",
  yape: "Yape",
  plin: "Plin",
};
const PAYMENT_ICONS = {
  efectivo: "money",
  electronico: "card",
  yape: "phone",
  plin: "transfer",
};
const PAYMENT_METHODS = Object.keys(PAYMENT_LABELS);
const EMPTY_DATA = {
  ventas: [],
  compras: [],
  productos: [],
  existencias: [],
  movimientos: [],
  detallesCompras: [],
  detallesVentas: [],
  categorias: [],
  proveedores: [],
};
const ICON_PATHS = {
  reports: <><path d="M4 19V5m0 14h16" /><path d="m7 15 4-4 3 2 5-7" /></>,
  summary: <><path d="M4 19V5m0 14h16" /><path d="m7 15 4-4 3 2 5-7" /></>,
  sales: <><path d="M4 18.5 9 13l3.5 3.5L20 8" /><path d="M14.5 8H20v5.5" /></>,
  inventory: <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm-8 4.5 8 4.5 8-4.5M12 12v9" />,
  purchases: <path d="M4 5h16v15H4zM8 3v4m8-4v4M4 10h16m-11 4h6" />,
  movements: <path d="M7 7h13l-3-3m3 3-3 3M17 17H4l3 3m-3-3 3-3" />,
  money: <path d="M12 3v18m5-14.5c-1-1-2.5-1.5-5-1.5-2.2 0-4 1.1-4 3s1.6 2.8 4 3.5 5 1.2 5 3.5-1.8 4-5 4c-2.3 0-4-.7-5-1.8" />,
  count: <path d="M4 9h16M4 15h16M10 3 8 21m8-18-2 18" />,
  units: <path d="M5 12h14m-7-7v14" />,
  average: <><path d="M3 12h18" /><path d="M12 3v18m5-14.5c-1-1-2.5-1.5-5-1.5-2.2 0-4 1.1-4 3s1.6 2.8 4 3.5 5 1.2 5 3.5-1.8 4-5 4c-2.3 0-4-.7-5-1.8" /></>,
  products: <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm-8 4.5 8 4.5 8-4.5M12 12v9" />,
  category: <path d="M3 6h7l2 2h9v10H3zM3 9h18" />,
  supplier: <path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h.01M15 10h.01M10 21v-4h4v4" />,
  calendar: <path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1Z" />,
  filter: <path d="M4 6h16M7 12h10m-7 6h4" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  status: <path d="M12 3v9l6.4 3.7M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  reference: <path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" />,
  alert: <path d="m12 3 10 18H2L12 3Zm0 6v5m0 3h.01" />,
  stock: <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Zm0 0 8 4.5 8-4.5M12 12v9" />,
  pie: <><path d="M11 3a9 9 0 1 0 10 10H11V3Z" /><path d="M14 3.5V9h5.5A9 9 0 0 0 14 3.5Z" /></>,
  phone: <path d="M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm4 15h2" />,
  transfer: <><path d="M4 8h13l-3-3m3 3-3 3" /><path d="M20 16H7l3 3m-3-3 3-3" /></>,
  card: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18m-14 5h4" /></>,
};

function ReportIcon({ type, className = "" }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICON_PATHS[type] || ICON_PATHS.reports}
  </svg>;
}

function getLimaDate() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: LIMA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type) => parts.find((entry) => entry.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getInitialRange() {
  const until = getLimaDate();
  return { desde: shiftDate(until, -6), hasta: until };
}

function formatDate(value) {
  const text = value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
    : String(value ?? "").slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
}

function dateValue(value) {
  if (!value) return "";
  if (value instanceof Date) return formatDate(value);
  return String(value).slice(0, 10);
}

function toCents(value) {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? ""));
  if (!match) return 0n;
  const cents = BigInt(match[2]) * 100n + BigInt((match[3] || "").padEnd(2, "0"));
  return match[1] ? -cents : cents;
}

function formatCurrency(cents) {
  const absolute = cents < 0n ? -cents : cents;
  const amount = `S/ ${(absolute / 100n).toLocaleString("es-PE")}.${(absolute % 100n).toString().padStart(2, "0")}`;
  return cents < 0n ? `-${amount}` : amount;
}

function sumCents(rows, field) {
  return rows.reduce((total, row) => total + toCents(row[field]), 0n);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("es-PE", { maximumFractionDigits: 0 });
}

function formatQuantity(value) {
  try {
    return BigInt(String(value ?? 0)).toLocaleString("es-PE");
  } catch {
    return formatNumber(value);
  }
}

function labelForState(state) {
  return STATE_LABELS[state] || String(state || "—");
}

function labelForType(type) {
  return TYPE_LABELS[type] || String(type || "—");
}

function dateIsInRange(value, range) {
  const date = dateValue(value);
  return Boolean(date && date >= range.desde && date <= range.hasta);
}

function generateBuckets(from, to, intervalOverride) {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const dayCount = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const interval = intervalOverride || (dayCount > 180 ? "month" : dayCount > 45 ? "week" : "day");
  const buckets = [];

  if (interval === "month") {
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    while (cursor <= end) {
      const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
      const bucketStart = cursor.toISOString().slice(0, 10);
      const bucketEnd = (monthEnd < end ? monthEnd : end).toISOString().slice(0, 10);
      buckets.push({
        from: bucketStart < from ? from : bucketStart,
        to: bucketEnd,
        label: new Intl.DateTimeFormat("es-PE", { month: "short", year: "2-digit", timeZone: "UTC" }).format(cursor),
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return buckets;
  }

  if (interval === "week") {
    let cursor = start;
    while (cursor <= end) {
      const bucketEndDate = new Date(cursor);
      bucketEndDate.setUTCDate(bucketEndDate.getUTCDate() + 6);
      const bucketEnd = bucketEndDate < end ? bucketEndDate : end;
      buckets.push({
        from: cursor.toISOString().slice(0, 10),
        to: bucketEnd.toISOString().slice(0, 10),
        label: `${formatDate(cursor).slice(0, 5)}–${formatDate(bucketEnd).slice(0, 5)}`,
      });
      cursor = new Date(bucketEnd);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return buckets;
  }

  let cursor = start;
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    buckets.push({ from: key, to: key, label: formatDate(key).slice(0, 5) });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return buckets;
}

function timelineData(records, dateField, range, series, intervalOverride) {
  return generateBuckets(range.desde, range.hasta, intervalOverride).map((bucket) => {
    const matching = records.filter((record) => {
      const date = dateValue(record[dateField]);
      return date >= bucket.from && date <= bucket.to;
    });
    const values = {};
    for (const item of series) {
      values[item.key] = matching.reduce((total, record) => total + item.value(record), 0);
    }
    return { label: bucket.label, from: bucket.from, values };
  });
}

function ReportMetric({ icon, label, value, note, tone = "turquoise" }) {
  return <article className={`report-metric dashboard-stat-card report-metric-${tone}`}>
    <div className="dashboard-stat-heading">
      <span className="dashboard-stat-icon"><ReportIcon type={icon} /></span>
      <span>{label}</span>
    </div>
    <strong>{value}</strong>
    <small className="dashboard-stat-description">{note}</small>
  </article>;
}

function TrendChart({ title, subtitle, icon, data, series, currency = false, quantityAxis = false, showValueAxis = false, detailedTooltip = false, axisTitle = "Importe de ventas (S/)" }) {
  const [activePoint, setActivePoint] = useState(null);
  const width = showValueAxis ? 760 : 720;
  const height = showValueAxis ? 270 : 190;
  const padX = showValueAxis ? 92 : 28;
  const padY = showValueAxis ? 46 : 18;
  const bottom = showValueAxis ? 34 : padY;
  const allValues = data.flatMap((item) => series.map((entry) => item.values[entry.key] || 0));
  const maxValue = Math.max(0, ...allValues);
  const rawStep = maxValue > 0 ? maxValue / 4 : 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalizedStep = rawStep / magnitude;
  const step = quantityAxis
    ? Math.max(1, Math.ceil(rawStep))
    : (normalizedStep <= 1 ? 1 : normalizedStep <= 2 ? 2 : normalizedStep <= 2.5 ? 2.5 : normalizedStep <= 5 ? 5 : 10) * magnitude;
  const axisMax = showValueAxis ? step * 4 : Math.max(1, maxValue);
  const plotBottom = height - bottom;
  const plotHeight = plotBottom - padY;
  const plotRight = showValueAxis ? width - 18 : width - padX;
  const xFor = (index) => data.length <= 1 ? (padX + plotRight) / 2 : padX + index * ((plotRight - padX) / (data.length - 1));
  const yFor = (value) => padY + plotHeight - (value / axisMax) * plotHeight;
  const pointsFor = (key) => data.map((item, index) => `${xFor(index)},${yFor(item.values[key] || 0)}`).join(" ");
  const active = activePoint ? data[activePoint.index] : null;
  const activeValue = active ? (active.values[activePoint.key] || 0) : 0;
  const activeSeries = activePoint ? series.find((entry) => entry.key === activePoint.key) : null;
  const tooltipX = active ? Math.min(Math.max(xFor(activePoint.index) - 94, 8), width - 196) : 0;
  const tooltipY = active ? Math.max(8, yFor(activeValue) - (quantityAxis ? 70 : 58)) : 0;
  const formatAxisValue = (value) => currency
    ? `S/ ${Number(value).toLocaleString("es-PE", { maximumFractionDigits: 2 })}`
    : formatNumber(value);
  const formatTooltipValue = (value) => currency
    ? `S/ ${Number(value).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : quantityAxis ? `${formatQuantity(value)} unidades` : formatNumber(value);

  return <section className="report-panel">
    <header className="report-panel-heading"><span className="report-panel-icon"><ReportIcon type={icon} /></span>
      <div><h2>{title}</h2><p>{subtitle}</p></div></header>
    {data.length ? <>
      <div className="report-chart-legend">{series.map((entry) =>
        <span key={entry.key}><i style={{ backgroundColor: entry.color }} />{entry.label}</span>)}</div>
      <div className="report-chart-wrap">
        <svg className={`report-trend-chart ${showValueAxis ? "has-value-axis" : ""}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
          {Array.from({ length: showValueAxis ? 5 : 4 }, (_, tick) => {
            const value = showValueAxis ? step * (4 - tick) : axisMax * (3 - tick) / 3;
            const y = showValueAxis ? yFor(value) : padY + tick * ((height - padY * 2) / 3);
            return <g key={tick}>
              <line className="report-chart-gridline" x1={padX} x2={width - 18} y1={y} y2={y} />
              {showValueAxis && <text className="report-chart-axis-value" x={padX - 12} y={y + 4} textAnchor="end">{formatAxisValue(value)}</text>}
            </g>;
          })}
          {showValueAxis && <text className="report-chart-axis-title" transform={`translate(20 ${padY + plotHeight / 2}) rotate(-90)`} textAnchor="middle">{axisTitle}</text>}
          {series.map((entry) => <g key={entry.key}>
            <polyline className="report-chart-line" points={pointsFor(entry.key)} style={{ stroke: entry.color }} />
            {data.map((item, index) => {
              const value = item.values[entry.key] || 0;
              return <circle
                key={`${entry.key}-${item.label}-${index}`}
                className={detailedTooltip ? "report-chart-point is-interactive" : "report-chart-point"}
                cx={xFor(index)}
                cy={yFor(value)}
                r={detailedTooltip ? "5" : "3"}
                style={{ fill: entry.color }}
                tabIndex={detailedTooltip ? 0 : undefined}
                aria-label={detailedTooltip ? `${formatDate(item.from)}${quantityAxis ? `, ${entry.label}` : ""}: ${formatTooltipValue(value)}` : undefined}
                onMouseEnter={detailedTooltip ? () => setActivePoint({ index, key: entry.key }) : undefined}
                onMouseLeave={detailedTooltip ? () => setActivePoint(null) : undefined}
                onFocus={detailedTooltip ? () => setActivePoint({ index, key: entry.key }) : undefined}
                onBlur={detailedTooltip ? () => setActivePoint(null) : undefined}
              >
                {detailedTooltip && <title>{`${formatDate(item.from)}${quantityAxis ? `, ${entry.label}` : ""}: ${formatTooltipValue(value)}`}</title>}
              </circle>;
            })}
          </g>)}
          {detailedTooltip && active && <g className="report-chart-tooltip" transform={`translate(${tooltipX} ${tooltipY})`} pointerEvents="none">
            <rect width="188" height={quantityAxis ? "62" : "48"} rx="7" />
            <text className="report-chart-tooltip-date" x="11" y="19">{formatDate(active.from)}</text>
            {quantityAxis && <text className="report-chart-tooltip-date" x="11" y="36">{activeSeries?.label}</text>}
            <text className="report-chart-tooltip-value" x="11" y={quantityAxis ? "53" : "37"}>{formatTooltipValue(activeValue)}</text>
          </g>}
        </svg>
      </div>
      <div className="report-chart-labels">{data.map((item, index) =>
        <span key={`${item.label}-${index}`}>{data.length <= 8 || index === 0 || index === data.length - 1 || index % Math.ceil(data.length / 6) === 0 ? item.label : ""}</span>)}</div>
      {currency && <p className="report-chart-unit">Importes en soles</p>}
      {quantityAxis && <p className="report-chart-unit">Cantidades en unidades</p>}
    </> : <div className="report-empty">No hay datos para el período seleccionado.</div>}
  </section>;
}

function DistributionChart({ title, subtitle, icon, data, valueLabel = "unidades", color = "turquoise", formatter = formatNumber, showAll = false, showValueLabel = true, zeroEmptyBars = false, emptyText = "No hay datos para mostrar." }) {
  const max = Math.max(1, ...data.map((item) => item.value));
  const visibleData = showAll ? data : data.slice(0, 6);
  return <section className="report-panel">
    <header className="report-panel-heading"><span className={`report-panel-icon is-${color}`}><ReportIcon type={icon} /></span>
      <div><h2>{title}</h2><p>{subtitle}</p></div></header>
    {visibleData.length ? <div className="report-distribution-list">
      {visibleData.map((item) => <div className="report-distribution-item" key={item.id ?? item.label}>
        <div className="report-distribution-label"><span title={item.label}>{item.label}</span><strong>{formatter(item.value)}{showValueLabel && <> <small>{valueLabel}</small></>}</strong></div>
        <div className="report-distribution-track"><span className={`is-${color}`} style={{
          width: zeroEmptyBars && Number(item.value) === 0 ? "0%" : `${Math.max(3, (item.value / max) * 100)}%`,
        }} /></div>
      </div>)}
    </div> : <div className="report-empty">{emptyText}</div>}
  </section>;
}

function SupplierSpendChart({ data }) {
  const maxAmount = data.reduce((max, item) => item.totalCents > max ? item.totalCents : max, 0n);
  return <section className="report-panel">
    <header className="report-panel-heading"><span className="report-panel-icon is-blue"><ReportIcon type="supplier" /></span>
      <div><h2>Compras por proveedor</h2><p>Importes de pedidos del período</p></div></header>
    {data.length ? <div className="report-distribution-list">
      {data.map((item) => <div className="report-distribution-item" key={item.providerId}>
        <div className="report-distribution-label">
          <span title={item.providerName}>{item.providerName}</span>
          <strong>{formatCurrency(item.totalCents)}</strong>
        </div>
        <div className="report-distribution-track">
          <span className="is-blue" style={{
            width: maxAmount > 0n && item.totalCents > 0n
              ? `${Number(item.totalCents) / Number(maxAmount) * 100}%`
              : "0%",
          }} />
        </div>
      </div>)}
    </div> : <div className="report-empty">No hay compras por proveedor para los filtros seleccionados.</div>}
  </section>;
}

function InventoryPieChart({ data, byCategory }) {
  const total = data.reduce((sum, item) => sum + BigInt(item.value || 0), 0n);
  const quantityLabel = byCategory ? "productos" : "unidades";
  const segments = [];
  let startAngle = -Math.PI / 2;

  if (total > 0n) {
    data.forEach((item, index) => {
      const units = BigInt(item.value || 0);
      if (units <= 0n) return;
      const angle = Number(units) / Number(total) * Math.PI * 2;
      const endAngle = startAngle + angle;
      const startX = 110 + 94 * Math.cos(startAngle);
      const startY = 110 + 94 * Math.sin(startAngle);
      const endX = 110 + 94 * Math.cos(endAngle);
      const endY = 110 + 94 * Math.sin(endAngle);
      const path = angle >= Math.PI * 2 - 0.000001
        ? `M 110 110 L 110 16 A 94 94 0 1 1 110 204 A 94 94 0 1 1 110 16 Z`
        : `M 110 110 L ${startX} ${startY} A 94 94 0 ${angle > Math.PI ? 1 : 0} 1 ${endX} ${endY} Z`;
      segments.push({ ...item, index, path });
      startAngle = endAngle;
    });
  }

  return <section className="report-panel">
    <header className="report-panel-heading"><span className="report-panel-icon"><ReportIcon type="pie" /></span>
      <div><h2>Distribución de inventario</h2><p>{byCategory ? "Cantidad de productos por categoría" : "Unidades disponibles por producto"}</p></div></header>
    {segments.length ? <div className="report-inventory-pie-layout">
      <svg className="report-inventory-pie" viewBox="0 0 220 220" role="img"
        aria-label={byCategory ? "Cantidad de productos por categoría" : "Distribución de unidades disponibles por producto"}>
        {segments.map((segment) => <path key={segment.id} d={segment.path} className={`report-inventory-pie-segment color-${segment.index % 8}`}>
          <title>{`${segment.label}: ${formatQuantity(segment.value)} ${quantityLabel}`}</title>
        </path>)}
      </svg>
      <div className="report-inventory-pie-legend">
        {data.map((item, index) => <div className="report-inventory-pie-legend-item" key={item.id}>
          <i className={`color-${index % 8}`} />
          <span title={item.label}>{item.label}</span>
          <strong>{formatQuantity(item.value)} <small>{quantityLabel}</small></strong>
        </div>)}
      </div>
    </div> : <div className="report-empty">{byCategory ? "No hay productos para mostrar." : "No hay unidades disponibles para graficar."}</div>}
  </section>;
}

function PaymentRevenueChart({ data }) {
  const max = Math.max(1, ...data.map((item) => Number(item.amount)));
  return <section className="report-panel">
    <header className="report-panel-heading"><span className="report-panel-icon is-blue"><ReportIcon type="card" /></span>
      <div><h2>Ingresos por medio de pago</h2><p>Ventas realizadas dentro del período seleccionado</p></div></header>
    {data.length ? <div className="report-payment-list">
      {data.map((item) => <div className="report-payment-item" key={item.method}>
        <div className="report-payment-heading">
          <span className={`report-payment-icon is-${item.method}`}>
            {["yape", "plin"].includes(item.method)
              ? <svg className="report-payment-mark" viewBox="0 0 36 24" role="img" aria-label={item.label}>
                <rect x="1" y="1" width="34" height="22" rx="6" fill="currentColor" />
                <text x="18" y="16" textAnchor="middle">{item.method.toUpperCase()}</text>
              </svg>
              : <ReportIcon type={item.icon} />}
          </span>
          <span className="report-payment-name">{item.label}</span>
          <strong>{formatCurrency(item.amount)}</strong>
          <small>{item.percentage}%</small>
        </div>
        <div className="report-distribution-track">
          <span className={`is-${item.method}`} style={{ width: `${Number(item.amount) > 0 ? Math.max(3, (Number(item.amount) / max) * 100) : 0}%` }} />
        </div>
      </div>)}
    </div> : <div className="report-empty">No hay ventas realizadas para el período seleccionado.</div>}
  </section>;
}

function ReportTable({ title, subtitle, icon, columns, rows, emptyText, onViewAll }) {
  return <section className="report-panel report-table-panel">
    <header className="report-panel-heading"><span className="report-panel-icon"><ReportIcon type={icon} /></span>
      <div><h2>{title}</h2><p>{subtitle}</p></div>
      {onViewAll && <button className="report-view-all" type="button" onClick={onViewAll}>Ver todos</button>}
    </header>
    <div className="report-table-scroll">
      <table className="report-table">
        <thead><tr>{columns.map((column) => <th key={column.key}><span><ReportIcon type={column.icon} />{column.label}</span></th>)}</tr></thead>
        <tbody>{rows.length ? rows.slice(0, 6).map((row, index) => <tr key={row.id ?? row.key ?? index}>
          {columns.map((column) => <td key={column.key} data-label={column.label}>{row[column.key] ?? "—"}</td>)}
        </tr>) : <tr><td className="report-table-empty" colSpan={columns.length}>{emptyText}</td></tr>}</tbody>
      </table>
    </div>
  </section>;
}

function StatusPill({ state }) {
  return <span className={`report-status report-status-${state || "unknown"}`}>{labelForState(state)}</span>;
}

function Reportes() {
  const navigate = useNavigate();
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("resumen");
  const [period, setPeriod] = useState("7");
  const [rangeInput, setRangeInput] = useState(getInitialRange);
  const [appliedFilters, setAppliedFilters] = useState(() => ({ ...rangeInput, categoria: "", estadoStock: "", proveedor: "", estadoCompra: "", tipoMovimiento: "" }));
  const [rangeError, setRangeError] = useState("");

  useEffect(() => {
    let active = true;
    apiClient.get("/reportes/datos")
      .then((report) => {
        const supplierIds = new Set(
          Array.isArray(report?.proveedores)
            ? report.proveedores
              .filter((supplier) => supplier && supplier.id != null &&
                typeof supplier.nombre === "string" && supplier.nombre.trim())
              .map((supplier) => String(supplier.id))
            : []
        );
        if (!Array.isArray(report?.compras) ||
            !Array.isArray(report?.proveedores) ||
            report.compras?.some((purchase) => !supplierIds.has(String(purchase.proveedor_id)))) {
          throw new Error("Los reportes no incluyen un proveedor válido para cada compra. Actualiza el backend y vuelve a cargar.");
        }
        if (active) setData({ ...EMPTY_DATA, ...report });
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || "No se pudieron cargar los reportes.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const productsById = useMemo(() => new Map(data.productos.map((item) =>
    [String(item.id), item])), [data.productos]);
  const categoriesById = useMemo(() => new Map(data.categorias.map((item) =>
    [String(item.id), item])), [data.categorias]);

  const onPeriodChange = (value) => {
    setPeriod(value);
    setRangeError("");
    if (value === "custom") return;
    const until = getLimaDate();
    let from = until;
    if (value === "7") from = shiftDate(until, -6);
    if (value === "30") from = shiftDate(until, -29);
    if (value === "month") from = `${until.slice(0, 7)}-01`;
    setRangeInput({ desde: from, hasta: until });
  };

  const applyFilters = (event) => {
    event.preventDefault();
    if (!rangeInput.desde || !rangeInput.hasta || rangeInput.desde > rangeInput.hasta) {
      setRangeError("Indica un rango de fechas válido.");
      return;
    }
    setAppliedFilters({
      ...rangeInput,
      categoria: rangeInput.categoria || "",
      estadoStock: rangeInput.estadoStock || "",
      proveedor: rangeInput.proveedor || "",
      estadoCompra: rangeInput.estadoCompra || "",
      tipoMovimiento: rangeInput.tipoMovimiento || "",
    });
    setRangeError("");
  };

  const updateFilter = (name, value) => {
    setRangeInput((current) => ({ ...current, [name]: value }));
  };

  const filteredVentas = useMemo(() => data.ventas.filter((sale) =>
    dateIsInRange(sale.fecha_comercial, appliedFilters)), [data.ventas, appliedFilters]);
  const completedSales = useMemo(() => filteredVentas.filter((sale) => sale.estado === "realizada"), [filteredVentas]);
  const completedSaleIds = useMemo(() => new Set(completedSales.map((sale) => String(sale.id))), [completedSales]);
  const salesDetails = useMemo(() => data.detallesVentas.filter((detail) =>
    completedSaleIds.has(String(detail.venta_id))), [data.detallesVentas, completedSaleIds]);
  const salesTotal = useMemo(() => sumCents(completedSales, "importe_total"), [completedSales]);
  const soldUnits = useMemo(() => salesDetails.reduce((sum, item) => sum + BigInt(item.cantidad || 0), 0n), [salesDetails]);
  const averageTicket = completedSales.length ? salesTotal / BigInt(completedSales.length) : 0n;

  const filteredCompras = useMemo(() => data.compras.filter((purchase) =>
    dateIsInRange(purchase.fecha_pedido, appliedFilters) &&
    (!appliedFilters.proveedor || String(purchase.proveedor_id) === String(appliedFilters.proveedor)) &&
    (!appliedFilters.estadoCompra || purchase.estado === appliedFilters.estadoCompra)), [data.compras, appliedFilters]);
  const countablePurchases = useMemo(() =>
    filteredCompras.filter((purchase) => purchase.estado !== "cancelada"), [filteredCompras]);
  const purchaseTotalById = useMemo(() => {
    const totals = new Map();
    for (const detail of data.detallesCompras) {
      const key = String(detail.compra_id);
      totals.set(key, (totals.get(key) || 0n) + toCents(detail.importe));
    }
    return totals;
  }, [data.detallesCompras]);
  const totalPurchases = countablePurchases.reduce((sum, purchase) =>
    sum + (purchaseTotalById.get(String(purchase.id)) || 0n), 0n);

  const filteredMovements = useMemo(() => data.movimientos.filter((movement) =>
    dateIsInRange(movement.fecha_comercial, appliedFilters) &&
    (!appliedFilters.tipoMovimiento || movement.tipo === appliedFilters.tipoMovimiento)), [data.movimientos, appliedFilters]);

  const inventoryRows = useMemo(() => data.existencias.filter((row) => {
    const units = BigInt(row.unidades_disponibles || 0);
    return (!appliedFilters.categoria || String(row.categoria_id) === String(appliedFilters.categoria)) &&
      (!appliedFilters.estadoStock ||
        (appliedFilters.estadoStock === "disponible" && units > 0n) ||
        (appliedFilters.estadoStock === "sin_stock" && units === 0n));
  }), [data.existencias, appliedFilters]);
  const availableInventoryCount = inventoryRows.filter((row) => BigInt(row.unidades_disponibles || 0) > 0n).length;
  const outOfStockCount = inventoryRows.filter((row) => BigInt(row.unidades_disponibles || 0) === 0n).length;

  const salesTrend = useMemo(() => timelineData(completedSales, "fecha_comercial", appliedFilters, [
    { key: "sales", value: (sale) => Number(toCents(sale.importe_total)) / 100 },
  ]), [completedSales, appliedFilters]);
  const summarySalesTrend = useMemo(() => timelineData(completedSales, "fecha_comercial", appliedFilters, [
    { key: "sales", value: (sale) => Number(toCents(sale.importe_total)) / 100 },
  ], "day"), [completedSales, appliedFilters]);

  const inventoryProductDistribution = useMemo(() => {
    if (appliedFilters.categoria) {
      return inventoryRows.map((row) => ({
        id: String(row.producto_id),
        label: row.presentacion ? `${row.nombre} — ${row.presentacion}` : row.nombre || "Producto",
        value: Number(row.unidades_disponibles || 0),
      }));
    }

    const categoryCounts = new Map();
    for (const row of inventoryRows) {
      const categoryId = String(row.categoria_id ?? "sin-categoria");
      const category = categoriesById.get(categoryId);
      const entry = categoryCounts.get(categoryId) || {
        id: categoryId,
        label: category?.nombre || "Sin categoría",
        value: 0,
        order: categoryCounts.size,
      };
      entry.value += 1;
      categoryCounts.set(categoryId, entry);
    }

    return [...categoryCounts.values()]
      .sort((a, b) => b.value - a.value || a.order - b.order)
      .map(({ id, label, value }) => ({ id, label, value }));
  }, [inventoryRows, appliedFilters.categoria, categoriesById]);
  const topInventoryProducts = useMemo(() => [...inventoryRows]
    .map((row, order) => ({
      id: String(row.producto_id),
      label: row.presentacion ? `${row.nombre} — ${row.presentacion}` : row.nombre || "Producto",
      value: BigInt(row.unidades_disponibles || 0),
      order,
    }))
    .filter((item) => item.value > 0n)
    .sort((a, b) => (a.value === b.value ? a.order - b.order : a.value > b.value ? -1 : 1))
    .slice(0, 5)
    .map(({ label, value }) => ({ label, value: Number(value) })), [inventoryRows]);
  const purchaseTrend = (() => {
    const records = countablePurchases.map((purchase) => ({
      ...purchase,
      report_amount: Number(purchaseTotalById.get(String(purchase.id)) || 0n) / 100,
    }));
    return timelineData(records, "fecha_pedido", appliedFilters, [
      { key: "purchases", value: (purchase) => purchase.report_amount },
    ], "day");
  })();
  const purchasesByProvider = (() => {
    const suppliersById = new Map(data.proveedores.map((supplier) => [
      String(supplier.id),
      supplier.nombre,
    ]));
    const totals = new Map(
      data.proveedores
        .filter((supplier) => !appliedFilters.proveedor ||
          String(supplier.id) === String(appliedFilters.proveedor))
        .map((supplier) => [String(supplier.id), {
          providerId: String(supplier.id),
          providerName: supplier.nombre,
          totalCents: 0n,
        }])
    );
    for (const purchase of countablePurchases) {
      const id = String(purchase.proveedor_id);
      const entry = totals.get(id);
      if (!entry || !suppliersById.has(id)) continue;
      entry.totalCents += purchaseTotalById.get(String(purchase.id)) || 0n;
    }
    return [...totals.values()]
      .sort((a, b) => a.totalCents === b.totalCents
        ? a.providerName.localeCompare(b.providerName, "es")
        : a.totalCents > b.totalCents ? -1 : 1);
  })();

  const movementTrend = useMemo(() => timelineData(filteredMovements, "fecha_comercial", appliedFilters, [
    { key: "entries", value: (movement) => movement.tipo === "recepcion" ? Math.max(0, Number(movement.variacion_unidades || 0)) : 0 },
    { key: "sales", value: (movement) => movement.tipo === "venta" ? Math.abs(Number(movement.variacion_unidades || 0)) : 0 },
    { key: "adjustments", value: (movement) => movement.tipo === "ajuste" ? Math.abs(Number(movement.variacion_unidades || 0)) : 0 },
  ]), [filteredMovements, appliedFilters]);
  const movementTypes = useMemo(() => {
    const totals = new Map(MOVEMENT_TYPES.map((type) => [type, 0]));
    for (const movement of filteredMovements) {
      if (totals.has(movement.tipo)) totals.set(movement.tipo, totals.get(movement.tipo) + 1);
    }
    return [...totals]
      .map(([type, value], order) => ({ id: type, label: labelForType(type), value, order }))
      .sort((a, b) => b.value - a.value || a.order - b.order);
  }, [filteredMovements]);
  const receiptUnits = filteredMovements.filter((item) => item.tipo === "recepcion")
    .reduce((sum, item) => sum + BigInt(item.variacion_unidades || 0), 0n);
  const saleMovementUnits = filteredMovements.filter((item) => item.tipo === "venta")
    .reduce((sum, item) => sum + (BigInt(item.variacion_unidades || 0) < 0n ? -BigInt(item.variacion_unidades) : 0n), 0n);
  const adjustmentCount = filteredMovements.filter((item) => item.tipo === "ajuste").length;

  const unitsBySaleId = useMemo(() => {
    const map = new Map();
    for (const detail of data.detallesVentas) {
      const key = String(detail.venta_id);
      map.set(key, (map.get(key) || 0n) + BigInt(detail.cantidad || 0));
    }
    return map;
  }, [data.detallesVentas]);
  const latestSales = useMemo(() => [...filteredVentas]
    .sort((a, b) => String(b.realizada_en).localeCompare(String(a.realizada_en))).slice(0, 6)
    .map((sale) => ({
      id: sale.id,
      date: formatDate(sale.fecha_comercial),
      number: sale.numero,
      products: `${formatQuantity(unitsBySaleId.get(String(sale.id)) || 0n)} unidades`,
      total: formatCurrency(toCents(sale.importe_total)),
      state: <StatusPill state={sale.estado} />,
    })), [filteredVentas, unitsBySaleId]);
  const latestPurchases = useMemo(() => [...filteredCompras]
    .sort((a, b) => String(b.fecha_pedido).localeCompare(String(a.fecha_pedido))).slice(0, 6)
    .map((purchase) => ({
      id: purchase.id,
      number: purchase.numero,
      date: formatDate(purchase.fecha_pedido),
      supplier: purchase.nombre_proveedor || "—",
      state: <StatusPill state={purchase.estado} />,
      total: formatCurrency(purchaseTotalById.get(String(purchase.id)) || 0n),
    })), [filteredCompras, purchaseTotalById]);
  const latestMovements = useMemo(() => [...filteredMovements]
    .sort((a, b) => String(b.ocurrido_en).localeCompare(String(a.ocurrido_en))).slice(0, 6)
    .map((movement) => {
      const product = productsById.get(String(movement.producto_id));
      const reference = movement.detalle_venta_id
        ? `Venta · detalle ${movement.detalle_venta_id}`
        : movement.detalle_recepcion_id
          ? `Recepción · detalle ${movement.detalle_recepcion_id}`
          : movement.motivo_ajuste
            ? `Ajuste · ${movement.motivo_ajuste}`
            : "—";
      const quantity = BigInt(movement.variacion_unidades || 0);
      return {
        id: movement.id,
        date: formatDate(movement.fecha_comercial),
        type: <span className={`report-movement-type report-movement-${movement.tipo}`}>{labelForType(movement.tipo)}</span>,
        product: movement.nombre_producto || "—",
        category: categoriesById.get(String(product?.categoria_id))?.nombre || "—",
        quantity: <span className={`report-movement-quantity ${
          quantity < 0n ? "is-negative" : quantity > 0n ? "is-positive" : "is-zero"
        }`}>{formatQuantity(quantity)} unidades</span>,
        reference,
      };
    }), [filteredMovements, productsById, categoriesById]);

  const filteredInventory = useMemo(() => inventoryRows.map((row) => ({
    id: row.producto_id,
    code: row.codigo || "—",
    product: row.nombre || "—",
    category: categoriesById.get(String(row.categoria_id))?.nombre || "—",
    stock: <span className={`report-stock-value ${BigInt(row.unidades_disponibles || 0) > 0n ? "is-available" : "is-empty"}`}>
      <strong>{formatQuantity(row.unidades_disponibles)} unid.</strong>
      <small>{BigInt(row.unidades_disponibles || 0) > 0n ? "Disponible" : "Sin stock"}</small>
    </span>,
    presentation: row.presentacion || "—",
    status: <span className={`badge product-status-badge ${row.activo ? "success-badge is-active" : "inactive-badge"}`}>
      <span className="product-status-dot" aria-hidden="true" />
      {row.activo ? "Activo" : "Inactivo"}
    </span>,
  })), [inventoryRows, categoriesById]);

  const recentActivity = useMemo(() => {
    const activity = [
      ...filteredVentas.map((sale) => ({
        key: `sale-${sale.id}`,
        dateValue: String(sale.realizada_en || sale.fecha_comercial),
        date: formatDate(sale.fecha_comercial),
        activity: <span className={`report-activity-pill ${sale.estado === "anulada" ? "is-anulacion" : "is-venta"}`}>
          {sale.estado === "anulada" ? "Anulación de venta" : "Venta"}
        </span>,
        detail: sale.numero,
        amount: formatCurrency(toCents(sale.importe_total)),
      })),
      ...filteredCompras.map((purchase) => ({
        key: `purchase-${purchase.id}`,
        dateValue: String(purchase.fecha_pedido),
        date: formatDate(purchase.fecha_pedido),
        activity: "Pedido de compra",
        detail: `${purchase.numero} · ${purchase.nombre_proveedor || "Proveedor"}`,
        amount: formatCurrency(purchaseTotalById.get(String(purchase.id)) || 0n),
      })),
      ...filteredMovements.map((movement) => ({
        key: `movement-${movement.id}`,
        dateValue: String(movement.ocurrido_en || movement.fecha_comercial),
        date: formatDate(movement.fecha_comercial),
        activity: ["venta", "anulacion_venta"].includes(movement.tipo)
          ? <span className={`report-activity-pill ${movement.tipo === "anulacion_venta" ? "is-anulacion" : "is-venta"}`}>
            {labelForType(movement.tipo)}
          </span>
          : labelForType(movement.tipo),
        detail: movement.nombre_producto || "—",
        amount: `${formatQuantity(movement.variacion_unidades)} unidades`,
      })),
    ];
    return activity.sort((a, b) => b.dateValue.localeCompare(a.dateValue)).slice(0, 6);
  }, [filteredVentas, filteredCompras, filteredMovements, purchaseTotalById]);

  const purchaseStatusCounts = {
    pending: filteredCompras.filter((purchase) => ["pendiente", "recibida_parcial"].includes(purchase.estado)).length,
    received: filteredCompras.filter((purchase) => purchase.estado === "recibida").length,
  };
  const sectionFilterOptions = [...new Set(data.movimientos.map((movement) => movement.tipo).filter(Boolean))].sort();
  const paymentRevenue = useMemo(() => {
    const totals = new Map(PAYMENT_METHODS.map((method, order) => [method, { amount: 0n, order }]));
    for (const sale of completedSales) {
      if (!sale.medio_pago) continue;
      const method = String(sale.medio_pago);
      const entry = totals.get(method);
      if (!entry) continue;
      entry.amount += toCents(sale.importe_total);
    }

    return [...totals.entries()]
      .sort(([, a], [, b]) => (a.amount === b.amount ? a.order - b.order : a.amount > b.amount ? -1 : 1))
      .map(([method, entry]) => {
        const tenths = salesTotal > 0n
          ? (entry.amount * 1000n + salesTotal / 2n) / salesTotal
          : 0n;
        const percentage = tenths === 0n ? "0" : `${tenths / 10n}.${tenths % 10n}`;
        const fallbackLabel = method.replaceAll("_", " ").replace(/^./, (letter) => letter.toLocaleUpperCase("es-PE"));
        return {
          method,
          label: PAYMENT_LABELS[method] || fallbackLabel,
          icon: PAYMENT_ICONS[method] || "card",
          amount: entry.amount,
          percentage,
        };
      });
  }, [completedSales, salesTotal]);
  const topSoldProducts = useMemo(() => {
    const totals = new Map();
    for (const detail of salesDetails) {
      const key = String(detail.producto_id);
      const product = productsById.get(key);
      const productName = product?.nombre || detail.nombre_producto;
      const presentation = product?.presentacion || detail.presentacion_producto;
      const label = presentation ? `${productName} — ${presentation}` : productName;
      const item = totals.get(key) || { label, value: 0n, order: totals.size };
      item.value += BigInt(detail.cantidad || 0);
      totals.set(key, item);
    }
    return [...totals.values()]
      .sort((a, b) => (a.value === b.value ? a.order - b.order : a.value > b.value ? -1 : 1))
      .slice(0, 5)
      .map(({ label, value }) => ({ label, value: Number(value) }));
  }, [salesDetails, productsById]);

  const renderFilters = () => <form className="report-filters" onSubmit={applyFilters}>
    <div className="report-filter-primary">
      <label><span><ReportIcon type="calendar" />Período</span>
        <select className="form-control" value={period} onChange={(event) => onPeriodChange(event.target.value)}>
          <option value="7">Últimos 7 días</option>
          <option value="30">Últimos 30 días</option>
          <option value="month">Mes actual</option>
          <option value="custom">Personalizado</option>
        </select>
      </label>
      <label><span><ReportIcon type="calendar" />Desde</span>
        <input className="form-control" type="date" value={rangeInput.desde} onChange={(event) => updateFilter("desde", event.target.value)} />
      </label>
      <label><span><ReportIcon type="calendar" />Hasta</span>
        <input className="form-control" type="date" value={rangeInput.hasta} onChange={(event) => updateFilter("hasta", event.target.value)} />
      </label>
      <button className="primary-button report-apply-button" type="submit"><ReportIcon type="filter" />Aplicar filtros</button>
    </div>
    {tab !== "resumen" && tab !== "ventas" && <div className="report-filter-contextual">
      {tab === "inventario" && <>
      <label><span><ReportIcon type="category" />Categoría</span>
        <select className="form-control" value={rangeInput.categoria || ""} onChange={(event) => updateFilter("categoria", event.target.value)}>
          <option value="">Todas las categorías</option>
          {data.categorias.map((category) => <option key={category.id} value={category.id}>{category.nombre}</option>)}
        </select>
      </label>
      <label><span><ReportIcon type="inventory" />Estado de stock</span>
        <select className="form-control" value={rangeInput.estadoStock || ""} onChange={(event) => updateFilter("estadoStock", event.target.value)}>
          <option value="">Todos los estados</option>
          <option value="disponible">Disponible</option>
          <option value="bajo" disabled>Bajo (no disponible)</option>
          <option value="sin_stock">Sin stock</option>
        </select>
      </label>
      </>}
      {tab === "compras" && <>
      <label><span><ReportIcon type="supplier" />Proveedor</span>
        <select className="form-control" value={rangeInput.proveedor || ""} onChange={(event) => updateFilter("proveedor", event.target.value)}>
          <option value="">Todos los proveedores</option>
          {data.proveedores.map((supplier) =>
            <option key={supplier.id} value={supplier.id}>{supplier.nombre}</option>)}
        </select>
      </label>
      <label><span><ReportIcon type="status" />Estado</span>
        <select className="form-control" value={rangeInput.estadoCompra || ""} onChange={(event) => updateFilter("estadoCompra", event.target.value)}>
          <option value="">Todos los estados</option>
          {[...new Set(data.compras.map((purchase) => purchase.estado).filter(Boolean))].sort().map((state) =>
            <option key={state} value={state}>{labelForState(state)}</option>)}
        </select>
      </label>
      </>}
      {tab === "movimientos" && <label><span><ReportIcon type="movements" />Tipo de movimiento</span>
        <select className="form-control" value={rangeInput.tipoMovimiento || ""} onChange={(event) => updateFilter("tipoMovimiento", event.target.value)}>
          <option value="">Todos los tipos</option>
          {sectionFilterOptions.map((type) => <option value={type} key={type}>{labelForType(type)}</option>)}
        </select>
      </label>}
    </div>}
    {rangeError && <p className="report-range-error" role="alert">{rangeError}</p>}
  </form>;

  const renderSummary = () => <>
    <div className="report-metrics report-summary-metrics">
      <ReportMetric icon="money" label="Ventas totales" value={formatCurrency(salesTotal)} note="Importe de ventas realizadas en el período" tone="green" />
      <ReportMetric icon="count" label="Cantidad de ventas" value={formatNumber(completedSales.length)} note="Operaciones completadas en el período" tone="blue" />
      <ReportMetric icon="products" label="Productos disponibles" value={formatNumber(data.existencias.filter((row) =>
        Boolean(row.activo) && Number(row.unidades_disponibles || 0) > 0).length)} note="Productos activos con existencias disponibles" tone="turquoise" />
      <ReportMetric icon="purchases" label="Compras pendientes" value={formatNumber(purchaseStatusCounts.pending)} note="Pedidos con unidades aún por recibir" tone="orange" />
    </div>
    <div className="report-grid report-grid-two report-summary-chart-grid">
      <TrendChart title="Evolución de ventas diarias" subtitle="Importe de ventas realizadas por día" icon="sales" data={summarySalesTrend} currency showValueAxis detailedTooltip
        series={[{ key: "sales", label: "Ventas", color: "#51c6b8" }]} />
      <DistributionChart title="Top 5 de productos más vendidos" subtitle="Unidades vendidas en el período" icon="products" data={topSoldProducts.slice(0, 5)} valueLabel="unid." />
    </div>
    <ReportTable title="Actividad reciente" subtitle="Últimos registros dentro del período seleccionado" icon="list"
      columns={[
        { key: "date", label: "Fecha", icon: "calendar" },
        { key: "activity", label: "Actividad", icon: "movements" },
        { key: "detail", label: "Detalle", icon: "reference" },
        { key: "amount", label: "Monto / variación", icon: "money" },
      ]} rows={recentActivity} emptyText="No hay actividad en el período seleccionado." allLabel="Ver movimientos" onViewAll={() => navigate("/movimientos")} />
  </>;

  const renderSales = () => <>
    <div className="report-metrics report-sales-metrics">
      <ReportMetric icon="money" label="Ingresos totales" value={formatCurrency(salesTotal)} note="Importe acumulado de ventas realizadas" tone="green" />
      <ReportMetric icon="count" label="Cantidad de ventas" value={formatNumber(completedSales.length)} note="Número de operaciones completadas" tone="blue" />
      <ReportMetric icon="units" label="Unidades vendidas" value={formatQuantity(soldUnits)} note="Cantidad total de unidades comercializadas" tone="turquoise" />
      <ReportMetric icon="average" label="Promedio por venta" value={formatCurrency(averageTicket)} note="Importe medio de cada operación" tone="purple" />
    </div>
    <div className="report-grid report-grid-two">
      <TrendChart title="Evolución de ventas diarias" subtitle="Importe de ventas realizadas por día" icon="sales" data={salesTrend} currency showValueAxis detailedTooltip
        series={[{ key: "sales", label: "Ventas", color: "#51c6b8" }]} />
      <PaymentRevenueChart data={paymentRevenue} />
    </div>
    <ReportTable title="Últimas ventas" subtitle="Hasta 6 registros del período" icon="sales"
      columns={[
        { key: "date", label: "Fecha", icon: "calendar" },
        { key: "number", label: "Número", icon: "reference" },
        { key: "products", label: "Productos / unidades", icon: "products" },
        { key: "total", label: "Total", icon: "money" },
        { key: "state", label: "Estado", icon: "status" },
      ]} rows={latestSales} emptyText="No hay ventas en el período seleccionado." onViewAll={() => navigate("/ventas")} />
  </>;

  const renderInventory = () => <>
    <div className="report-metrics report-inventory-metrics">
      <ReportMetric icon="products" label="Productos totales" value={formatNumber(inventoryRows.length)} note="Productos según categoría y estado seleccionados" tone="turquoise" />
      <ReportMetric icon="inventory" label="Productos disponibles" value={formatNumber(availableInventoryCount)} note="Productos con más de cero unidades" tone="green" />
      <ReportMetric icon="alert" label="Productos en stock bajo" value="No disponible" note="La consulta no proporciona un umbral mínimo" tone="orange" />
      <ReportMetric icon="stock" label="Productos sin stock" value={formatNumber(outOfStockCount)} note="Productos con cero unidades disponibles" tone="red" />
    </div>
    <div className="report-grid report-grid-two">
      <InventoryPieChart data={inventoryProductDistribution} byCategory={!appliedFilters.categoria} />
      <DistributionChart title="Top 5 de productos con mayor existencia" subtitle="Unidades disponibles, de mayor a menor" icon="inventory" data={topInventoryProducts} valueLabel="unid." color="blue" />
    </div>
    <ReportTable title="Existencias por producto" subtitle="Stock actual y estado del producto" icon="inventory"
      columns={[
        { key: "code", label: "Código", icon: "reference" },
        { key: "product", label: "Producto", icon: "products" },
        { key: "category", label: "Categoría", icon: "category" },
        { key: "presentation", label: "Presentación", icon: "products" },
        { key: "stock", label: "Stock actual", icon: "inventory" },
        { key: "status", label: "Estado", icon: "status" },
      ]} rows={filteredInventory} emptyText="No hay productos para los filtros seleccionados." onViewAll={() => navigate("/inventario")} />
    <p className="report-data-note">La consulta de existencias no proporciona stock mínimo; la clasificación «bajo» no está disponible.</p>
  </>;

  const renderPurchases = () => <>
    <div className="report-metrics report-purchase-metrics">
      <ReportMetric icon="money" label="Monto total comprado" value={formatCurrency(totalPurchases)} note="Importe de pedidos no cancelados" tone="green" />
      <ReportMetric icon="purchases" label="Pedidos realizados" value={formatNumber(countablePurchases.length)} note="Operaciones no canceladas del período" tone="blue" />
      <ReportMetric icon="status" label="Pedidos pendientes" value={formatNumber(purchaseStatusCounts.pending)} note="Pendientes o con recepción parcial" tone="orange" />
      <ReportMetric icon="inventory" label="Pedidos recibidos" value={formatNumber(purchaseStatusCounts.received)} note="Pedidos con recepción completa" tone="turquoise" />
    </div>
    <div className="report-grid report-grid-two">
      <TrendChart title="Evolución de compras" subtitle="Importe de pedidos por fecha de pedido" icon="purchases" data={purchaseTrend} currency
        showValueAxis detailedTooltip axisTitle="Importe de compras (S/)"
        series={[{ key: "purchases", label: "Compras", color: "#6da9e8" }]} />
      <SupplierSpendChart data={purchasesByProvider} />
    </div>
    <ReportTable title="Últimos pedidos" subtitle="Hasta 6 pedidos del período seleccionado" icon="purchases"
      columns={[
        { key: "number", label: "Número", icon: "reference" },
        { key: "date", label: "Fecha", icon: "calendar" },
        { key: "supplier", label: "Proveedor", icon: "supplier" },
        { key: "state", label: "Estado", icon: "status" },
        { key: "total", label: "Total", icon: "money" },
      ]} rows={latestPurchases} emptyText="No hay compras en el período seleccionado." onViewAll={() => navigate("/compras")} />
  </>;

  const renderMovements = () => <>
    <div className="report-metrics report-movement-metrics">
      <ReportMetric icon="purchases" label="Entradas por recepciones" value={`${formatQuantity(receiptUnits)} unid.`} note="Unidades ingresadas en el período" tone="green" />
      <ReportMetric icon="sales" label="Salidas por ventas" value={`${formatQuantity(saleMovementUnits)} unid.`} note="Unidades descontadas por ventas" tone="red" />
      <ReportMetric icon="average" label="Ajustes" value={formatNumber(adjustmentCount)} note="Movimientos de tipo ajuste" tone="orange" />
      <ReportMetric icon="movements" label="Total de movimientos" value={formatNumber(filteredMovements.length)} note="Registros del período seleccionado" tone="blue" />
    </div>
    <div className="report-grid report-grid-two">
      <TrendChart title="Evolución de movimientos" subtitle="Unidades registradas por tipo" icon="movements" data={movementTrend}
        quantityAxis showValueAxis detailedTooltip axisTitle="Unidades (unid.)"
        series={[
          { key: "entries", label: "Entradas", color: "#51c6b8" },
          { key: "sales", label: "Salidas", color: "#e47777" },
          { key: "adjustments", label: "Ajustes", color: "#ad91e8" },
        ]} />
      <DistributionChart title="Movimientos por tipo" subtitle="Cantidad de registros" icon="status" data={movementTypes} valueLabel="movimientos" color="purple" zeroEmptyBars />
    </div>
    <ReportTable title="Últimos movimientos" subtitle="Hasta 6 registros del período" icon="movements"
      columns={[
        { key: "date", label: "Fecha", icon: "calendar" },
        { key: "type", label: "Tipo", icon: "movements" },
        { key: "product", label: "Producto", icon: "products" },
        { key: "category", label: "Categoría", icon: "category" },
        { key: "quantity", label: "Cantidad", icon: "units" },
        { key: "reference", label: "Referencia", icon: "reference" },
      ]} rows={latestMovements} emptyText="No hay movimientos en el período seleccionado." onViewAll={() => navigate("/movimientos")} />
    <p className="report-data-note">La base de datos no almacena saldo anterior ni saldo actual por movimiento; esos valores no se muestran.</p>
  </>;

  const activeTab = REPORT_TABS.find((item) => item.id === tab);
  const content = {
    resumen: renderSummary,
    ventas: renderSales,
    inventario: renderInventory,
    compras: renderPurchases,
    movimientos: renderMovements,
  }[tab];

  return <main className="reportes-page">
    <header className="report-page-heading">
      <div>
        <h1 className="category-page-title"><ReportIcon type="reports" className="category-display-icon" />Reportes</h1>
        <p>Indicadores y actividad del negocio a partir de los datos registrados.</p>
      </div>
    </header>
    {error && <div className="error-message" role="alert">{error}</div>}
    <nav className="report-tabs" role="tablist" aria-label="Secciones de reportes">
      {REPORT_TABS.map((item) => <button key={item.id} id={`report-tab-${item.id}`} className={`report-tab ${tab === item.id ? "is-active" : ""}`}
        type="button" role="tab" aria-selected={tab === item.id} aria-controls="report-tab-content" onClick={() => setTab(item.id)}>
        <ReportIcon type={item.icon} />{item.label}
      </button>)}
    </nav>
    {renderFilters()}
    {tab === "inventario" && <p className="report-filter-note"><ReportIcon type="inventory" />El inventario refleja existencias actuales; el período solo aplica a las secciones con datos fechados.</p>}
    {loading ? <section className="report-panel report-loading">Cargando datos de reportes...</section>
      : <section id="report-tab-content" role="tabpanel" aria-labelledby={`report-tab-${activeTab.id}`} className="report-content">
        {content()}
      </section>}
  </main>;
}

export default Reportes;
